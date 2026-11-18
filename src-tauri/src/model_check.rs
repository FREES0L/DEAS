//! Decisions over inspected facts; no model I/O, hashing, provider calls or execution permission.
use crate::downloads::models::LocalModel;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCheck {
    pub identity: &'static str,
    pub integrity: &'static str,
    pub compatibility: &'static str,
    pub availability: &'static str,
    pub evidence: Vec<String>,
    pub reasons: Vec<Reason>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Reason {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl ModelCheck {
    fn block(&mut self, code: &'static str, detail: Option<String>) {
        self.compatibility = "blocked";
        self.reasons.push(Reason { code, detail });
    }
    /// A selected LoRA's family labels are advisory; file/source validity is not.
    pub(crate) fn blocks_execution(&self, field: &str) -> bool {
        self.compatibility == "blocked"
            && !(field == "loras"
                && self
                    .reasons
                    .iter()
                    .any(|r| matches!(r.code, "family" | "conflict"))
                && self.reasons.iter().all(|r| {
                    matches!(
                        r.code,
                        "family" | "conflict" | "unverified" | "pickleFormat"
                    )
                }))
    }
}

pub(crate) fn describe(
    model: &LocalModel,
    header_family: Option<&str>,
    provider_family: Option<&str>,
    structural_integrity: Option<bool>,
) -> ModelCheck {
    let mut check = ModelCheck {
        identity: if model.info.is_some() {
            "sha256"
        } else {
            "unverified"
        },
        integrity: match structural_integrity {
            Some(true) => "headerChecked",
            Some(false) => "broken",
            None => "unchecked",
        },
        compatibility: "unknown",
        availability: "available",
        evidence: vec![],
        reasons: vec![],
    };
    if model.info.is_some() {
        check.evidence.push("sha256".into());
    }
    if header_family.is_some() {
        check.evidence.push("header".into());
    }
    if provider_family.is_some() {
        check.evidence.push("provider".into());
    }
    if model.component.is_some() {
        check.evidence.push("component".into());
    }
    if model.family_override.is_some() {
        check.evidence.push("declaration".into());
    }
    if let Some(error) = &model.metadata_error {
        check.block("metadata", Some(error.clone()));
    }
    if let Some(error) = &model.integrity {
        check.block("integrity", Some(error.clone()));
    }
    if header_family
        .zip(provider_family)
        .is_some_and(|(h, p)| !crate::model_families::structurally_compatible(h, p))
        || model
            .family_override
            .as_deref()
            .zip(header_family)
            .is_some_and(|(d, h)| !crate::model_families::structurally_compatible(d, h))
        || model
            .family_override
            .as_deref()
            .zip(provider_family)
            .is_some_and(|(d, p)| !crate::model_families::structurally_compatible(d, p))
        || model.family_evidence == Some(crate::model_families::FamilyEvidence::Conflict)
    {
        check.block(
            "conflict",
            Some("Structural, identity or declaration evidence disagree".into()),
        );
    }
    if model.misplaced_all_in_one {
        check.block(
            "component",
            Some("All-in-one checkpoint requires the checkpoints namespace".into()),
        );
    }
    // torch.load in the backend runs arbitrary pickled code from these; saying so beats silence.
    if matches!(
        model
            .name
            .rsplit_once('.')
            .map(|(_, ext)| ext.to_ascii_lowercase())
            .as_deref(),
        Some("pt") | Some("pth") | Some("bin")
    ) {
        check.reasons.push(Reason {
            code: "pickleFormat",
            detail: None,
        });
    }
    // Inspection alone cannot prove a recipe's loaders or companions are available.
    if check.compatibility == "unknown" {
        check.reasons.push(Reason {
            code: "unverified",
            detail: Some("Recipe compatibility requires selected-model and backend checks".into()),
        });
    }
    check
}

/// Registered backend fields only; absent files remain backend authority.
pub(crate) fn categories(field: &str) -> &'static [&'static str] {
    match field {
        "checkpoints" => &["checkpoints"],
        "diffusionModels" | "ggufDiffusionModels" => &["diffusion_models", "unet"],
        "loras" => &["loras"],
        "textEncoders" | "dualTextEncoders" | "ggufTextEncoders" | "ggufDualTextEncoders" => {
            &["text_encoders", "clip"]
        }
        "vaes" | "audioVaes" => &["vae"],
        "textProjections" => &["text_encoders", "clip"],
        "visionModels" => &["clip_vision"],
        "upscaleModels" => &["upscale_models"],
        "latentUpscaleModels" | "h3LatentUpscaleModels" => &["latent_upscale_models"],
        "audioEncoders" => &["audio_encoders"],
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model(name: &str) -> LocalModel {
        LocalModel {
            local_preview: None,
            check: None,
            category: "loras".into(),
            name: name.into(),
            path: format!("/models/loras/{name}"),
            size: 1,
            info: None,
            family: None,
            detected_family: None,
            family_evidence: None,
            family_override: None,
            metadata_error: None,
            component: None,
            integrity: None,
            misplaced_all_in_one: false,
        }
    }

    #[test]
    fn lora_family_advice_does_not_waive_other_execution_failures() {
        let mut check = describe(
            &model("a.safetensors"),
            Some("sdxl"),
            Some("anima"),
            Some(true),
        );
        assert_eq!(check.compatibility, "blocked");
        assert!(!check.blocks_execution("loras"));
        assert!(check.blocks_execution("checkpoints"));
        for code in ["metadata", "integrity", "component", "futureBlocker"] {
            check.reasons.push(Reason { code, detail: None });
            assert!(check.blocks_execution("loras"), "{code}");
            check.reasons.pop();
        }
    }
    #[test]
    fn pickled_extensions_warn_without_blocking() {
        for name in ["a.pt", "B.PTH", "Sub/c.bin"] {
            let check = describe(&model(name), None, None, None);
            assert!(
                check.reasons.iter().any(|r| r.code == "pickleFormat"),
                "{name}"
            );
            assert_ne!(check.compatibility, "blocked");
        }
        let safe = describe(&model("a.safetensors"), None, None, None);
        assert!(!safe.reasons.iter().any(|r| r.code == "pickleFormat"));
    }
}
