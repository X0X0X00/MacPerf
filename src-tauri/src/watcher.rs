use crate::error::AppResult;
use crate::importer;
use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebouncedEvent, Debouncer};
use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct WatcherHandle {
    _debouncer: Debouncer<notify::RecommendedWatcher>,
    pub path: PathBuf,
}

pub fn start(
    folder: &Path,
    db: Arc<Mutex<Connection>>,
    app: AppHandle,
) -> AppResult<WatcherHandle> {
    let (tx, rx) = mpsc::channel::<Result<Vec<DebouncedEvent>, notify::Error>>();

    let mut debouncer = new_debouncer(Duration::from_secs(2), move |res| {
        let _ = tx.send(res);
    })
    .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    debouncer
        .watcher()
        .watch(folder, RecursiveMode::NonRecursive)
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    let app_for_events = app.clone();
    let db_for_events = db.clone();
    thread::spawn(move || {
        for res in rx {
            let Ok(events) = res else { continue };
            for ev in events {
                let path = ev.path;
                if !is_csv(&path) {
                    continue;
                }
                if !path.exists() {
                    continue;
                }
                let mut conn = db_for_events.lock();
                match importer::import_file(&mut conn, &path) {
                    Ok(id) => {
                        let _ = app_for_events.emit("session-imported", id);
                    }
                    Err(crate::error::AppError::Duplicate(_)) => {
                        // silent
                    }
                    Err(e) => {
                        let _ = app_for_events.emit("import-error", e.to_string());
                    }
                }
            }
        }
    });

    // Trigger an initial scan for any files already present (and not yet imported)
    let app2 = app.clone();
    let db2 = db.clone();
    let folder_owned2 = folder.to_path_buf();
    thread::spawn(move || {
        if let Ok(entries) = std::fs::read_dir(&folder_owned2) {
            for entry in entries.flatten() {
                let p = entry.path();
                if is_csv(&p) {
                    let mut conn = db2.lock();
                    match importer::import_file(&mut conn, &p) {
                        Ok(id) => {
                            let _ = app2.emit("session-imported", id);
                        }
                        Err(crate::error::AppError::Duplicate(_)) => {}
                        Err(e) => {
                            let _ = app2.emit("import-error", e.to_string());
                        }
                    }
                }
            }
        }
    });

    Ok(WatcherHandle {
        _debouncer: debouncer,
        path: folder.to_path_buf(),
    })
}

fn is_csv(p: &Path) -> bool {
    p.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("csv"))
        .unwrap_or(false)
}
