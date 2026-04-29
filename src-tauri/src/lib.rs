mod commands;
mod config;
mod db;
mod error;
mod importer;
mod insight;
mod model;
mod parser;
mod state;
mod watcher;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data dir");
            std::fs::create_dir_all(&app_data).ok();
            let db_path = app_data.join("macperf.sqlite");
            let config_path = app_data.join("config.json");

            let state = AppState::new(db_path, config_path)
                .expect("could not initialise app state");

            // If a folder was already configured, start the watcher.
            let cfg = config::load(&state.config_path);
            if let Some(folder) = cfg.watched_folder.clone() {
                if folder.exists() {
                    let handle_app = app.handle().clone();
                    if let Ok(h) = watcher::start(&folder, state.db.clone(), handle_app, cfg.thresholds.clone()) {
                        *state.watcher.lock() = Some(h);
                    }
                }
            }

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::get_session,
            commands::get_samples,
            commands::get_session_sparkline,
            commands::delete_session,
            commands::get_config,
            commands::set_watched_folder,
            commands::rescan,
            commands::get_thresholds,
            commands::set_thresholds,
            commands::get_overview,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
