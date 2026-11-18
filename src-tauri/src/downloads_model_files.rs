//! Explicit mutations of indexed model files and their companion metadata.
use super::*;
use std::collections::HashSet;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub old: String,
    pub path: Option<String>,
    pub name: Option<String>,
    pub local_preview: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelFileReport {
    changes: Vec<FileChange>,
    errors: Vec<String>,
}

fn companions(source: &Source, path: &Path) -> Result<Vec<(String, SourceFingerprint)>, String> {
    let mut names = vec![format!("{}{SIDECAR}", source.name)];
    let stem = path
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or("Invalid model name")?;
    let shared = EXTENSIONS.iter().any(|ext| {
        let sibling = format!("{stem}.{ext}");
        let same = if cfg!(windows) {
            sibling.eq_ignore_ascii_case(&source.name)
        } else {
            sibling == source.name
        };
        !same && source.dir.anchor.absent(&sibling).is_err()
    });
    for ext in index::PREVIEW_EXTENSIONS {
        names.push(format!("{}.preview.{ext}", source.name));
        if !shared {
            names.extend([format!("{stem}.preview.{ext}"), format!("{stem}.{ext}")]);
        }
    }
    if !cfg!(windows) {
        if let Some(cover) = index::find_local_preview(path) {
            if let Some(name) = Path::new(&cover).file_name().and_then(|name| name.to_str()) {
                if (!shared || name.starts_with(&format!("{}.preview.", source.name)))
                    && !names.iter().any(|entry| entry == name)
                {
                    names.push(name.into());
                }
            }
        }
    }
    names
        .into_iter()
        .filter(|name| source.dir.anchor.absent(name).is_err())
        .map(|name| {
            let stamp = fingerprint(&source.dir.regular(&name)?)?;
            Ok((name, stamp))
        })
        .collect()
}

fn move_files(
    source: &Source,
    target: &CacheDir,
    files: &[(String, SourceFingerprint)],
) -> Result<(), String> {
    source.dir.verify()?;
    target.verify()?;
    for (name, _) in files {
        target
            .anchor
            .absent(name)
            .map_err(|_| format!("Destination already contains {name}"))?;
    }
    for (index, (name, stamp)) in files.iter().enumerate() {
        let result = (|| {
            target.verify()?;
            if fingerprint(&source.dir.regular(name)?)? != *stamp {
                return Err("File changed before moving".into());
            }
            source.dir.anchor.move_to(name, &target.anchor)
        })();
        if let Err(error) = result {
            let mut rollback_failed = false;
            for (moved, previous) in files[..index].iter().rev() {
                let verified = target
                    .dir_stamp(moved)
                    .is_ok_and(|stamp| stamp == *previous);
                if !verified || target.anchor.move_to(moved, &source.dir.anchor).is_err() {
                    rollback_failed = true;
                }
            }
            return if rollback_failed {
                Err(format!(
                    "{error}. Some companion files could not be moved back"
                ))
            } else {
                Err(error)
            };
        }
    }
    Ok(())
}

impl CacheDir {
    fn dir_stamp(&self, name: &str) -> Result<SourceFingerprint, String> {
        fingerprint(&self.regular(name)?)
    }
}

fn edit_one(
    root: &Path,
    path: &Path,
    category: &str,
    expected: &SourceFingerprint,
    destination: Option<&CacheDir>,
) -> Result<(FileChange, bool), String> {
    let root_part = path
        .strip_prefix(root)
        .map_err(|_| "Model is outside the selected Library")?
        .components()
        .next()
        .ok_or("Model category folder is missing")?;
    let folder = root_part
        .as_os_str()
        .to_str()
        .ok_or("Invalid model category folder")?;
    if crate::settings::model_folder_category(folder) != Some(category) {
        return Err("Model must belong to its Library category".into());
    }
    let category_root = root.join(folder);
    let category_directory = CacheDir::open(&category_root)?;
    let source = Source::open(path)?;
    if source.stamp != *expected || !source.dir.path.starts_with(&category_directory.path) {
        return Err("Model moved or changed. Refresh models before trying again".into());
    }
    let mut associated = companions(&source, path)?;
    let old = path.to_str().ok_or("Invalid model path")?.to_owned();
    if let Some(target) = destination {
        let relative = target
            .path
            .strip_prefix(&category_directory.path)
            .map_err(|_| format!("Choose a folder inside {}", category_root.display()))?;
        if source.dir.path == target.path {
            return Err("The model is already in that folder".into());
        }
        if relative
            .components()
            .any(|part| part.as_os_str().to_string_lossy().starts_with('.'))
        {
            return Err("Choose a visible model folder".into());
        }
        let name = relative.join(&source.name);
        let new_path = category_root.join(&name);
        let path = new_path
            .to_str()
            .ok_or("Invalid destination path")?
            .to_owned();
        let name = name
            .to_str()
            .ok_or("Invalid model name")?
            .replace('\\', "/");
        target
            .anchor
            .absent(&format!("{}{SIDECAR}", source.name))
            .map_err(|_| "Destination already has metadata for that filename")?;
        associated.push((source.name.clone(), source.stamp.clone()));
        move_files(&source, target, &associated)?;
        let local_preview = index::find_local_preview(&new_path);
        Ok((
            FileChange {
                old,
                path: Some(path),
                name: Some(name),
                local_preview,
            },
            false,
        ))
    } else {
        source.verify()?;
        source.dir.anchor.delete_file(&source.name)?;
        let mut warning = false;
        for (name, stamp) in associated {
            if !source
                .dir
                .dir_stamp(&name)
                .is_ok_and(|current| current == stamp)
                || source.dir.anchor.delete_file(&name).is_err()
            {
                warning = true;
            }
        }
        Ok((
            FileChange {
                old,
                path: None,
                name: None,
                local_preview: None,
            },
            warning,
        ))
    }
}

fn change_files(
    directory: &Path,
    root: &Path,
    paths: Vec<String>,
    destination: Option<&Path>,
) -> Result<ModelFileReport, String> {
    if paths.is_empty()
        || paths.len() > MAX_LISTING
        || paths.iter().map(Path::new).collect::<HashSet<_>>().len() != paths.len()
    {
        return Err("Select a nonempty set of distinct model files".into());
    }
    let members = index::file_members(directory, root)?;
    let target = destination.map(CacheDir::open).transpose()?;
    let mut report = ModelFileReport {
        changes: vec![],
        errors: vec![],
    };
    {
        let _commit = CACHE_PUBLICATION
            .lock()
            .map_err(|_| "Model file lock failed")?;
        for file in paths {
            let path = Path::new(&file);
            let display = path.file_name().unwrap_or_default().to_string_lossy();
            let result = members
                .get(path)
                .ok_or_else(|| "File is not in the Library index".into())
                .and_then(|(category, expected)| {
                    edit_one(root, path, category, expected, target.as_ref())
                });
            match result {
                Ok((change, warning)) => {
                    report.changes.push(change);
                    if warning {
                        report.errors.push(format!(
                            "{display}: some companion files could not be removed"
                        ));
                    }
                }
                Err(error) => report.errors.push(format!("{display}: {error}")),
            }
        }
    }
    if index::apply_file_changes(directory, &report.changes).is_err() {
        report
            .errors
            .push("Could not update the saved index. Use Refresh models.".into());
    }
    Ok(report)
}

#[tauri::command]
pub async fn native_model_files_change(
    app: tauri::AppHandle,
    engine: tauri::State<'_, DownloadEngine>,
    scans: tauri::State<'_, background::ModelScanEngine>,
    root: String,
    paths: Vec<String>,
    destination: Option<String>,
    confirmed: bool,
) -> Result<ModelFileReport, String> {
    if !confirmed {
        return Err("Explicit file operation confirmation is required".into());
    }
    if engine.status()?.state == "running" || scans.status().state == "running" {
        return Err("Wait for Library downloads or Fetch to finish".into());
    }
    let directory = index::directory(&app)?;
    let result = tokio::task::spawn_blocking(move || {
        change_files(
            &directory,
            Path::new(&root),
            paths,
            destination.as_deref().map(Path::new),
        )
    })
    .await
    .map_err(|_| "Model file operation failed")?;
    if result.as_ref().is_err()
        || result
            .as_ref()
            .is_ok_and(|report| !report.errors.is_empty())
    {
        crate::logs::native_logs_library_error("files".into());
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moves_model_cover_and_metadata_then_deletes_only_the_indexed_selection() {
        let fixture = tempfile::tempdir().unwrap();
        let root = fixture.path().join("models");
        let from = root.join("loras/from");
        let to = root.join("loras/to");
        let directory = fixture.path().join("index");
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        let model = from.join("model.pt");
        let keep = from.join("keep.pt");
        std::fs::write(&model, b"weights").unwrap();
        std::fs::write(&keep, b"keep").unwrap();
        std::fs::write(from.join("model.preview.jpg"), b"cover").unwrap();
        let source = Source::open(&model).unwrap();
        let info = ModelInfo {
            sha256: "a".repeat(64),
            size: source.stamp.size,
            source: Some(source.stamp.clone()),
            fetched_at: 1,
            civitai: None,
        };
        publish_info(&source, &None, &info, || {}).unwrap();
        drop(source);
        index::load(&directory, vec![root.clone()], false).unwrap();
        let result = change_files(
            &directory,
            &root,
            vec![model.to_str().unwrap().into()],
            Some(&to),
        )
        .unwrap();
        assert!(result.errors.is_empty(), "{:?}", result.errors);
        assert!(!model.exists());
        let moved = to.join("model.pt");
        assert_eq!(std::fs::read(&moved).unwrap(), b"weights");
        assert_eq!(read_info(&moved), Some(info));
        assert_eq!(
            std::fs::read(to.join("model.preview.jpg")).unwrap(),
            b"cover"
        );
        let result = change_files(
            &directory,
            &root,
            vec![moved.to_str().unwrap().into()],
            None,
        )
        .unwrap();
        assert!(result.errors.is_empty(), "{:?}", result.errors);
        assert!(!moved.exists());
        assert!(!to.join("model.pt.deas.json").exists());
        assert!(!to.join("model.preview.jpg").exists());
        assert_eq!(std::fs::read(keep).unwrap(), b"keep");
        assert_eq!(index::load(&directory, vec![root], false).unwrap().len(), 1);
    }

    #[test]
    fn refuses_collisions_and_files_changed_since_indexing() {
        let fixture = tempfile::tempdir().unwrap();
        let root = fixture.path().join("models");
        let from = root.join("loras/from");
        let to = root.join("loras/to");
        let directory = fixture.path().join("index");
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        let model = from.join("model.pt");
        let path: String = model.to_str().unwrap().into();
        std::fs::write(&model, b"weights").unwrap();
        std::fs::write(from.join("model.preview.png"), b"cover").unwrap();
        std::fs::write(to.join("model.pt"), b"existing").unwrap();
        index::load(&directory, vec![root.clone()], false).unwrap();
        let result = change_files(&directory, &root, vec![path.clone()], Some(&to)).unwrap();
        assert_eq!(result.errors.len(), 1);
        assert!(result.changes.is_empty());
        assert!(from.join("model.preview.png").is_file());
        assert_eq!(std::fs::read(to.join("model.pt")).unwrap(), b"existing");
        std::fs::write(&model, b"replacement").unwrap();
        let result = change_files(&directory, &root, vec![path], None).unwrap();
        assert!(result.changes.is_empty());
        assert_eq!(std::fs::read(model).unwrap(), b"replacement");
    }
}
