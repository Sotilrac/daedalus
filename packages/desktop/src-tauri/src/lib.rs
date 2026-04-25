use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

#[derive(Default)]
struct WatcherState {
    watchers: Mutex<HashMap<PathBuf, RecommendedWatcher>>,
}

#[derive(Serialize, Clone)]
struct FolderChange {
    path: String,
    kind: String,
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let path = app.dialog().file().blocking_pick_folder().map(|p| p.to_string());
    if let Some(ref p) = path {
        grant_folder_access(&app, p)?;
    }
    Ok(path)
}

fn grant_folder_access(app: &AppHandle, path: &str) -> Result<(), String> {
    let scope = app.fs_scope();
    scope.allow_directory(path, true).map_err(|e| e.to_string())?;
    // Glob `**` doesn't match dotfiles, so allow our sidecar explicitly.
    let sidecar = PathBuf::from(path).join(".daedalus.json");
    scope.allow_file(&sidecar).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn watch_folder(app: AppHandle, state: State<'_, WatcherState>, path: String) -> Result<(), String> {
    let folder = PathBuf::from(&path);
    if !folder.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    grant_folder_access(&app, &path)?;

    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    if watchers.contains_key(&folder) {
        return Ok(());
    }

    let app_for_event = app.clone();
    let mut watcher = recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            let kind = match event.kind {
                EventKind::Create(_) => "created",
                EventKind::Modify(_) => "modified",
                EventKind::Remove(_) => "removed",
                _ => return,
            };
            let payload: Vec<FolderChange> = event
                .paths
                .into_iter()
                .filter(|p| {
                    p.extension().map(|ext| ext == "d2").unwrap_or(false)
                        || p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n == ".daedalus.json")
                            .unwrap_or(false)
                })
                .map(|p| FolderChange {
                    path: p.to_string_lossy().to_string(),
                    kind: kind.to_string(),
                })
                .collect();
            if !payload.is_empty() {
                let _ = app_for_event.emit("daedalus://folder-changed", payload);
            }
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&folder, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    watchers.insert(folder, watcher);
    Ok(())
}

#[tauri::command]
fn unwatch_folder(state: State<'_, WatcherState>, path: String) -> Result<(), String> {
    let folder = PathBuf::from(&path);
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    watchers.remove(&folder);
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![pick_folder, watch_folder, unwatch_folder])
        .run(tauri::generate_context!())
        .expect("error while running daedalus");
}
