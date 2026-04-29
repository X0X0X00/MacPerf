use crate::error::AppResult;
use crate::model::{Sample, Session, SessionSummary};
use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    source_filename TEXT NOT NULL,
    source_file_hash TEXT NOT NULL UNIQUE,
    imported_at INTEGER NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    summary_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp INTEGER NOT NULL,
    cpu_util REAL NOT NULL,
    mem_pressure REAL NOT NULL,
    mem_wired INTEGER NOT NULL,
    mem_used INTEGER NOT NULL,
    mem_cached INTEGER NOT NULL,
    mem_free INTEGER NOT NULL,
    gpu_util REAL NOT NULL,
    gpu_mem_used INTEGER NOT NULL,
    max_temp INTEGER NOT NULL,
    max_cpu_temp INTEGER NOT NULL,
    max_gpu_temp INTEGER NOT NULL,
    max_fan_speed INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_samples_session_ts ON samples(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);
"#,
    )?;
    Ok(())
}

pub fn find_session_by_hash(conn: &Connection, hash: &str) -> AppResult<Option<i64>> {
    let id: Option<i64> = conn
        .query_row(
            "SELECT id FROM sessions WHERE source_file_hash = ?1",
            params![hash],
            |r| r.get(0),
        )
        .optional()?;
    Ok(id)
}

pub fn insert_session_with_samples(
    conn: &mut Connection,
    filename: &str,
    hash: &str,
    samples: &[Sample],
    summary: &SessionSummary,
) -> AppResult<i64> {
    let start = samples.first().unwrap().timestamp;
    let end = samples.last().unwrap().timestamp;
    let duration = (end - start).num_seconds();
    let imported_at = Utc::now();
    let summary_json = serde_json::to_string(summary).unwrap();

    let tx = conn.transaction()?;

    tx.execute(
        "INSERT INTO sessions (source_filename, source_file_hash, imported_at, start_time, end_time, duration_seconds, sample_count, summary_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            filename,
            hash,
            imported_at.timestamp_millis(),
            start.timestamp_millis(),
            end.timestamp_millis(),
            duration,
            samples.len() as i64,
            summary_json,
        ],
    )?;
    let session_id = tx.last_insert_rowid();

    {
        let mut stmt = tx.prepare(
            "INSERT INTO samples (
                session_id, timestamp, cpu_util, mem_pressure,
                mem_wired, mem_used, mem_cached, mem_free,
                gpu_util, gpu_mem_used, max_temp, max_cpu_temp, max_gpu_temp, max_fan_speed
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        )?;
        for s in samples {
            stmt.execute(params![
                session_id,
                s.timestamp.timestamp_millis(),
                s.cpu_util,
                s.mem_pressure,
                s.mem_wired,
                s.mem_used,
                s.mem_cached,
                s.mem_free,
                s.gpu_util,
                s.gpu_mem_used,
                s.max_temp,
                s.max_cpu_temp,
                s.max_gpu_temp,
                s.max_fan_speed,
            ])?;
        }
    }

    tx.commit()?;
    Ok(session_id)
}

pub fn list_sessions(conn: &Connection) -> AppResult<Vec<Session>> {
    let mut stmt = conn.prepare(
        "SELECT id, source_filename, source_file_hash, imported_at, start_time, end_time, duration_seconds, sample_count, summary_json
         FROM sessions ORDER BY start_time DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let summary_json: String = row.get(8)?;
        let summary: SessionSummary = serde_json::from_str(&summary_json).unwrap_or_default();
        Ok(Session {
            id: row.get(0)?,
            source_filename: row.get(1)?,
            source_file_hash: row.get(2)?,
            imported_at: ms_to_utc(row.get(3)?),
            start_time: ms_to_utc(row.get(4)?),
            end_time: ms_to_utc(row.get(5)?),
            duration_seconds: row.get(6)?,
            sample_count: row.get(7)?,
            summary,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn get_session(conn: &Connection, id: i64) -> AppResult<Option<Session>> {
    let row = conn
        .query_row(
            "SELECT id, source_filename, source_file_hash, imported_at, start_time, end_time, duration_seconds, sample_count, summary_json
             FROM sessions WHERE id = ?1",
            params![id],
            |row| {
                let summary_json: String = row.get(8)?;
                let summary: SessionSummary = serde_json::from_str(&summary_json).unwrap_or_default();
                Ok(Session {
                    id: row.get(0)?,
                    source_filename: row.get(1)?,
                    source_file_hash: row.get(2)?,
                    imported_at: ms_to_utc(row.get(3)?),
                    start_time: ms_to_utc(row.get(4)?),
                    end_time: ms_to_utc(row.get(5)?),
                    duration_seconds: row.get(6)?,
                    sample_count: row.get(7)?,
                    summary,
                })
            },
        )
        .optional()?;
    Ok(row)
}

pub fn get_samples(conn: &Connection, session_id: i64) -> AppResult<Vec<Sample>> {
    let mut stmt = conn.prepare(
        "SELECT timestamp, cpu_util, mem_pressure, mem_wired, mem_used, mem_cached, mem_free,
                gpu_util, gpu_mem_used, max_temp, max_cpu_temp, max_gpu_temp, max_fan_speed
         FROM samples WHERE session_id = ?1 ORDER BY timestamp ASC",
    )?;
    let rows = stmt.query_map(params![session_id], |row| {
        Ok(Sample {
            timestamp: ms_to_utc(row.get(0)?),
            cpu_util: row.get(1)?,
            mem_pressure: row.get(2)?,
            mem_wired: row.get(3)?,
            mem_used: row.get(4)?,
            mem_cached: row.get(5)?,
            mem_free: row.get(6)?,
            gpu_util: row.get(7)?,
            gpu_mem_used: row.get(8)?,
            max_temp: row.get(9)?,
            max_cpu_temp: row.get(10)?,
            max_gpu_temp: row.get(11)?,
            max_fan_speed: row.get(12)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn delete_session(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_summary(conn: &Connection, id: i64, summary: &crate::model::SessionSummary) -> AppResult<()> {
    let summary_json = serde_json::to_string(summary).unwrap();
    conn.execute(
        "UPDATE sessions SET summary_json = ?1 WHERE id = ?2",
        params![summary_json, id],
    )?;
    Ok(())
}

fn ms_to_utc(ms: i64) -> DateTime<Utc> {
    Utc.timestamp_millis_opt(ms).single().unwrap_or_else(Utc::now)
}
