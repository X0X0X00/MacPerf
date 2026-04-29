export interface Sample {
  timestamp: string;
  cpu_util: number;
  mem_pressure: number;
  mem_wired: number;
  mem_used: number;
  mem_cached: number;
  mem_free: number;
  gpu_util: number;
  gpu_mem_used: number;
  max_temp: number;
  max_cpu_temp: number;
  max_gpu_temp: number;
  max_fan_speed: number;
}

export interface MetricStats {
  min: number;
  max: number;
  avg: number;
  p95: number;
}

export type InsightKind =
  | "highCpu"
  | "highGpu"
  | "highMemPressure"
  | "highTemp"
  | "fanPeak";

export interface InsightEvent {
  kind: InsightKind;
  start_time: string;
  end_time: string;
  peak_value: number;
}

export interface SessionSummary {
  cpu_util: MetricStats;
  mem_pressure: MetricStats;
  gpu_util: MetricStats;
  max_temp: MetricStats;
  max_cpu_temp: MetricStats;
  max_gpu_temp: MetricStats;
  max_fan_speed: MetricStats;
  seconds_above_cpu80: number;
  seconds_above_gpu80: number;
  seconds_above_mem_pressure80: number;
  seconds_above_temp90: number;
  events: InsightEvent[];
  tags: string[];
}

export interface Session {
  id: number;
  source_filename: string;
  source_file_hash: string;
  imported_at: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  sample_count: number;
  summary: SessionSummary;
}

export interface Thresholds {
  cpu_pct: number;
  cpu_min_seconds: number;
  gpu_pct: number;
  gpu_min_seconds: number;
  mem_pressure_pct: number;
  mem_min_seconds: number;
  temp_celsius: number;
  temp_min_seconds: number;
}

export interface AppConfig {
  watched_folder: string | null;
  thresholds: Thresholds;
}

export interface PeakRef {
  value: number;
  session_id: number;
  session_label: string;
  when: string;
}

export interface Overview {
  session_count: number;
  total_duration_seconds: number;
  total_samples: number;
  peak_temp: PeakRef | null;
  peak_cpu: PeakRef | null;
  peak_fan: PeakRef | null;
  hour_histogram: number[];
  weekday_histogram: number[];
}
