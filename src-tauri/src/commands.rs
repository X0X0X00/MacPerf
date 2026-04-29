use crate::config::{self, Config};
use crate::db;
use crate::error::AppResult;
use crate::model::{Sample, Session};
use crate::state::AppState;
use crate::watcher;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_sessions(state: State<AppState>) -> AppResult<Vec<Session>> {
    let conn = state.db.lock();
    db::list_sessions(&conn)
}

#[tauri::command]
pub fn get_session(state: State<AppState>, id: i64) -> AppResult<Option<Session>> {
    let conn = state.db.lock();
    db::get_session(&conn, id)
}

#[tauri::command]
pub fn get_samples(state: State<AppState>, session_id: i64) -> AppResult<Vec<Sample>> {
    let conn = state.db.lock();
    db::get_samples(&conn, session_id)
}

#[tauri::command]
pub fn delete_session(state: State<AppState>, id: i64) -> AppResult<()> {
    let conn = state.db.lock();
    db::delete_session(&conn, id)
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> AppResult<Config> {
    Ok(config::load(&state.config_path))
}

#[tauri::command]
pub fn set_watched_folder(
    state: State<AppState>,
    app: AppHandle,
    folder: String,
) -> AppResult<Config> {
    let path = PathBuf::from(folder);
    let mut cfg = config::load(&state.config_path);
    cfg.watched_folder = Some(path.clone());
    config::save(&state.config_path, &cfg)
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    // Restart watcher
    {
        let mut w = state.watcher.lock();
        *w = None;
    }
    let handle = watcher::start(&path, state.db.clone(), app)?;
    {
        let mut w = state.watcher.lock();
        *w = Some(handle);
    }

    Ok(cfg)
}

#[tauri::command]
pub fn rescan(state: State<AppState>, app: AppHandle) -> AppResult<()> {
    let cfg = config::load(&state.config_path);
    if let Some(folder) = cfg.watched_folder {
        let handle = watcher::start(&folder, state.db.clone(), app)?;
        let mut w = state.watcher.lock();
        *w = Some(handle);
    }
    Ok(())
}
