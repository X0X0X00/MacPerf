use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thresholds {
    pub cpu_pct: f64,
    pub cpu_min_seconds: u32,
    pub gpu_pct: f64,
    pub gpu_min_seconds: u32,
    pub mem_pressure_pct: f64,
    pub mem_min_seconds: u32,
    pub temp_celsius: i32,
    pub temp_min_seconds: u32,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            cpu_pct: 80.0,
            cpu_min_seconds: 60,
            gpu_pct: 80.0,
            gpu_min_seconds: 60,
            mem_pressure_pct: 80.0,
            mem_min_seconds: 60,
            temp_celsius: 90,
            temp_min_seconds: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    pub watched_folder: Option<PathBuf>,
    #[serde(default)]
    pub thresholds: Thresholds,
}

pub fn load(path: &Path) -> Config {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(path: &Path, config: &Config) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let s = serde_json::to_string_pretty(config).unwrap();
    fs::write(path, s)
}
