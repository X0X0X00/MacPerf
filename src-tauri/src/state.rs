use crate::error::AppResult;
use crate::watcher::WatcherHandle;
use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Arc;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub watcher: Mutex<Option<WatcherHandle>>,
    #[allow(dead_code)]
    pub db_path: PathBuf,
    pub config_path: PathBuf,
}

impl AppState {
    pub fn new(db_path: PathBuf, config_path: PathBuf) -> AppResult<Self> {
        let conn = crate::db::open(&db_path)?;
        Ok(Self {
            db: Arc::new(Mutex::new(conn)),
            watcher: Mutex::new(None),
            db_path,
            config_path,
        })
    }
}
