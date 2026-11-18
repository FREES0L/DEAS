//! Opens a provider's own token page in the system browser so the user can copy an API key.
//! URLs are a fixed allowlist; nothing from the UI reaches the shell.
use std::process::Command;

fn token_page(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "huggingface" => Some("https://huggingface.co/settings/tokens"),
        "civitai" => Some("https://civitai.com/user/account"),
        "github" => Some("https://github.com/settings/tokens"),
        _ => None,
    }
}

#[tauri::command]
pub fn native_open_token_page(provider_id: String) -> Result<(), String> {
    open_url(token_page(&provider_id).ok_or("Unknown provider")?)
}

pub(crate) fn valid_civitai_creator(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 80
        && !matches!(name, "." | "..")
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
}

/// civitai.com is the SFW front door and shows only a "moved to civitai.red" notice for
/// mature models; civitai.red serves every model, so mature pages open there directly.
fn civitai_site(nsfw: bool) -> &'static str {
    if nsfw {
        "https://civitai.red"
    } else {
        "https://civitai.com"
    }
}

fn civitai_model_url(model_id: u64, version_id: u64, nsfw: bool) -> Result<String, String> {
    if model_id == 0 || version_id == 0 {
        return Err("Invalid CivitAI model or version".into());
    }
    Ok(format!(
        "{}/models/{model_id}?modelVersionId={version_id}",
        civitai_site(nsfw)
    ))
}

fn civitai_creator_url(username: &str, nsfw: bool) -> Result<String, String> {
    if !valid_civitai_creator(username) {
        return Err("Invalid CivitAI username".into());
    }
    Ok(format!("{}/user/{username}", civitai_site(nsfw)))
}

#[tauri::command]
pub fn native_open_civitai_model(
    model_id: u64,
    version_id: u64,
    nsfw: Option<bool>,
) -> Result<(), String> {
    open_url(&civitai_model_url(
        model_id,
        version_id,
        nsfw.unwrap_or(false),
    )?)
}

#[tauri::command]
pub fn native_open_civitai_creator(username: String, nsfw: Option<bool>) -> Result<(), String> {
    open_url(&civitai_creator_url(&username, nsfw.unwrap_or(false))?)
}

/// Opens a compiled-in URL or one constructed from validated identifiers.
pub(crate) fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", url]);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(url);
        c
    };
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open browser: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_allowlisted_providers_have_pages() {
        assert_eq!(
            token_page("civitai"),
            Some("https://civitai.com/user/account")
        );
        assert!(token_page("https://evil.example").is_none());
        assert!(native_open_token_page("nope".into()).is_err());
        assert!(native_open_civitai_model(1, 0, None).is_err());
        assert!(native_open_civitai_creator("x&start.exe".into(), Some(true)).is_err());
        assert_eq!(
            civitai_model_url(7, 9, false).unwrap(),
            "https://civitai.com/models/7?modelVersionId=9"
        );
        assert_eq!(
            civitai_model_url(7, 9, true).unwrap(),
            "https://civitai.red/models/7?modelVersionId=9"
        );
        assert_eq!(
            civitai_creator_url("Creator_123", true).unwrap(),
            "https://civitai.red/user/Creator_123"
        );
        assert!(valid_civitai_creator("Creator_123"));
    }
}
