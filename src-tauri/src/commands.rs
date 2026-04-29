use crate::config::{self, Config, Thresholds};
use crate::db;
use crate::error::AppResult;
use crate::insight;
use crate::model::{Sample, Session};
use crate::state::AppState;
use crate::watcher;
use chrono::{DateTime, Datelike, Timelike, Utc};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[derive(Serialize)]
pub struct Sparkline {
    pub cpu: Vec<f64>,
    pub temp: Vec<f64>,
}

#[derive(Serialize)]
pub struct Overview {
    pub session_count: i64,
    pub total_duration_seconds: i64,
    pub total_samples: i64,
    pub peak_temp: Option<PeakRef>,
    pub peak_cpu: Option<PeakRef>,
    pub peak_fan: Option<PeakRef>,
    pub hour_histogram: [i64; 24],
    pub weekday_histogram: [i64; 7],
}

#[derive(Serialize)]
pub struct PeakRef {
    pub value: f64,
    pub session_id: i64,
    pub session_label: String,
    pub when: DateTime<Utc>,
}

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
pub fn get_session_sparkline(
    state: State<AppState>,
    session_id: i64,
    points: usize,
) -> AppResult<Sparkline> {
    let conn = state.db.lock();
    let samples = db::get_samples(&conn, session_id)?;
    if samples.is_empty() {
        return Ok(Sparkline { cpu: vec![], temp: vec![] });
    }
    let target = points.max(2);
    let bucket = ((samples.len() + target - 1) / target).max(1);
    let mut cpu = Vec::with_capacity(target);
    let mut temp = Vec::with_capacity(target);
    let mut i = 0;
    while i < samples.len() {
        let end = (i + bucket).min(samples.len());
        let slice = &samples[i..end];
        let n = slice.len() as f64;
        cpu.push(slice.iter().map(|s| s.cpu_util).sum::<f64>() / n);
        temp.push(slice.iter().map(|s| s.max_temp as f64).sum::<f64>() / n);
        i = end;
    }
    Ok(Sparkline { cpu, temp })
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

    {
        let mut w = state.watcher.lock();
        *w = None;
    }
    let handle = watcher::start(&path, state.db.clone(), app, cfg.thresholds.clone())?;
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
        let handle = watcher::start(&folder, state.db.clone(), app, cfg.thresholds.clone())?;
        let mut w = state.watcher.lock();
        *w = Some(handle);
    }
    Ok(())
}

#[tauri::command]
pub fn get_thresholds(state: State<AppState>) -> AppResult<Thresholds> {
    Ok(config::load(&state.config_path).thresholds)
}

#[tauri::command]
pub fn set_thresholds(
    state: State<AppState>,
    thresholds: Thresholds,
    reanalyze: bool,
) -> AppResult<()> {
    let mut cfg = config::load(&state.config_path);
    cfg.thresholds = thresholds.clone();
    config::save(&state.config_path, &cfg)
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    if reanalyze {
        let conn = state.db.lock();
        let sessions = db::list_sessions(&conn)?;
        for s in sessions {
            let samples = db::get_samples(&conn, s.id)?;
            let new_summary = insight::compute_summary(&samples, &thresholds);
            db::update_summary(&conn, s.id, &new_summary)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_overview(state: State<AppState>) -> AppResult<Overview> {
    let conn = state.db.lock();
    let sessions = db::list_sessions(&conn)?;
    let mut total_duration: i64 = 0;
    let mut total_samples: i64 = 0;
    let mut hour_histogram = [0i64; 24];
    let mut weekday_histogram = [0i64; 7];
    let mut peak_temp: Option<PeakRef> = None;
    let mut peak_cpu: Option<PeakRef> = None;
    let mut peak_fan: Option<PeakRef> = None;

    for s in &sessions {
        total_duration += s.duration_seconds;
        total_samples += s.sample_count;
        let h = s.start_time.hour() as usize;
        if h < 24 {
            hour_histogram[h] += 1;
        }
        let wd = s.start_time.weekday().num_days_from_sunday() as usize;
        if wd < 7 {
            weekday_histogram[wd] += 1;
        }

        let label = format!("{}", s.start_time.format("%Y-%m-%d %H:%M"));

        let temp_max = s.summary.max_temp.max;
        if temp_max > peak_temp.as_ref().map(|p| p.value).unwrap_or(f64::MIN) {
            peak_temp = Some(PeakRef {
                value: temp_max,
                session_id: s.id,
                session_label: label.clone(),
                when: s.start_time,
            });
        }
        let cpu_max = s.summary.cpu_util.max;
        if cpu_max > peak_cpu.as_ref().map(|p| p.value).unwrap_or(f64::MIN) {
            peak_cpu = Some(PeakRef {
                value: cpu_max,
                session_id: s.id,
                session_label: label.clone(),
                when: s.start_time,
            });
        }
        let fan_max = s.summary.max_fan_speed.max;
        if fan_max > peak_fan.as_ref().map(|p| p.value).unwrap_or(f64::MIN) {
            peak_fan = Some(PeakRef {
                value: fan_max,
                session_id: s.id,
                session_label: label.clone(),
                when: s.start_time,
            });
        }
    }

    Ok(Overview {
        session_count: sessions.len() as i64,
        total_duration_seconds: total_duration,
        total_samples,
        peak_temp,
        peak_cpu,
        peak_fan,
        hour_histogram,
        weekday_histogram,
    })
}
