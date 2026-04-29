use crate::config::Thresholds;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::insight;
use crate::parser;
use rusqlite::Connection;
use std::path::Path;

pub fn import_file(conn: &mut Connection, path: &Path, thresholds: &Thresholds) -> AppResult<i64> {
    let parsed = parser::parse_file(path)?;

    if let Some(_existing_id) = db::find_session_by_hash(conn, &parsed.hash)? {
        return Err(AppError::Duplicate(parsed.hash.chars().take(12).collect()));
    }

    let summary = insight::compute_summary(&parsed.samples, thresholds);
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown.csv".into());
    let id = db::insert_session_with_samples(conn, &filename, &parsed.hash, &parsed.samples, &summary)?;
    Ok(id)
}
