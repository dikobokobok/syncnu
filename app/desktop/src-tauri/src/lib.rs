use std::collections::HashMap;
use std::sync::Mutex;
use std::path::Path;
use notify::{Watcher, RecommendedWatcher, RecursiveMode, Event};
use tauri::{AppHandle, Emitter};

// We need a thread-safe map to store the watchers so we can stop them later.
pub struct WatcherState {
    pub watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn select_folder() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .and_then(|p| p.to_str().map(|s| s.to_string()))
}

#[tauri::command]
fn start_watching(app_handle: AppHandle, state: tauri::State<'_, WatcherState>, path: String) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    
    // If already watching, return Ok
    if watchers.contains_key(&path) {
        return Ok(());
    }

    let path_clone = path.clone();
    let app_handle_clone = app_handle.clone();

    // Create watcher
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            // Watch for changes: create or modify events
            if event.kind.is_modify() || event.kind.is_create() {
                for p in event.paths {
                    if let Some(path_str) = p.to_str() {
                        // Emit file path to React frontend
                        let _ = app_handle_clone.emit("file-change-event", path_str);
                    }
                }
            }
        }
    }).map_err(|e| e.to_string())?;

    // Start watching path recursively
    watcher.watch(Path::new(&path), RecursiveMode::Recursive).map_err(|e| e.to_string())?;

    // Store watcher
    watchers.insert(path_clone, watcher);
    Ok(())
}

#[tauri::command]
fn stop_watching(state: tauri::State<'_, WatcherState>, path: String) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    if let Some(mut watcher) = watchers.remove(&path) {
        let _ = watcher.unwatch(Path::new(&path));
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct FileMetadata {
    name: String,
    size: u64,
    is_dir: bool,
    modified_at: u64,
}

#[tauri::command]
fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let file_name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let modified_at = metadata
        .modified()
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        })
        .unwrap_or(0);

    Ok(FileMetadata {
        name: file_name,
        size: metadata.len(),
        is_dir: metadata.is_dir(),
        modified_at,
    })
}

#[tauri::command]
fn read_file_chunk(path: String, offset: u64, size: usize) -> Result<Vec<u8>, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};

    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;

    let mut buffer = vec![0; size];
    let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
    buffer.truncate(bytes_read);

    Ok(buffer)
}

#[tauri::command]
fn scan_directory(path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    visit_dirs(Path::new(&path), &mut files)?;
    Ok(files)
}

fn visit_dirs(dir: &Path, files: &mut Vec<String>) -> Result<(), String> {
    if dir.is_dir() {
        for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                visit_dirs(&path, files)?;
            } else if let Some(path_str) = path.to_str() {
                files.push(path_str.to_string());
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState {
            watchers: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            select_folder,
            start_watching,
            stop_watching,
            get_file_metadata,
            read_file_chunk,
            scan_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

