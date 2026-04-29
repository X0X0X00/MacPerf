use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sample {
    pub timestamp: DateTime<Utc>,
    pub cpu_util: f64,
    pub mem_pressure: f64,
    pub mem_wired: i64,
    pub mem_used: i64,
    pub mem_cached: i64,
    pub mem_free: i64,
    pub gpu_util: f64,
    pub gpu_mem_used: i64,
    pub max_temp: i32,
    pub max_cpu_temp: i32,
    pub max_gpu_temp: i32,
    pub max_fan_speed: i32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MetricStats {
    pub min: f64,
    pub max: f64,
    pub avg: f64,
    pub p95: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InsightKind {
    HighCpu,
    HighGpu,
    HighMemPressure,
    HighTemp,
    FanPeak,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightEvent {
    pub kind: InsightKind,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub peak_value: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionSummary {
    pub cpu_util: MetricStats,
    pub mem_pressure: MetricStats,
    pub gpu_util: MetricStats,
    pub max_temp: MetricStats,
    pub max_cpu_temp: MetricStats,
    pub max_gpu_temp: MetricStats,
    pub max_fan_speed: MetricStats,

    pub seconds_above_cpu80: i64,
    pub seconds_above_gpu80: i64,
    pub seconds_above_mem_pressure80: i64,
    pub seconds_above_temp90: i64,

    pub events: Vec<InsightEvent>,

    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: i64,
    pub source_filename: String,
    pub source_file_hash: String,
    pub imported_at: DateTime<Utc>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration_seconds: i64,
    pub sample_count: i64,
    pub summary: SessionSummary,
}
