use crate::config::Thresholds;
use crate::model::{InsightEvent, InsightKind, MetricStats, Sample, SessionSummary};
use chrono::{DateTime, Utc};

pub fn stats(values: &[f64]) -> MetricStats {
    if values.is_empty() {
        return MetricStats::default();
    }
    let mut sorted: Vec<f64> = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let avg = values.iter().sum::<f64>() / values.len() as f64;
    let p95_idx = ((sorted.len() as f64 - 1.0) * 0.95).floor() as usize;
    MetricStats {
        min: sorted[0],
        max: *sorted.last().unwrap(),
        avg,
        p95: sorted[p95_idx.min(sorted.len() - 1)],
    }
}

pub fn compute_summary(samples: &[Sample], t: &Thresholds) -> SessionSummary {
    if samples.is_empty() {
        return SessionSummary::default();
    }

    let cpu: Vec<f64> = samples.iter().map(|s| s.cpu_util).collect();
    let mp: Vec<f64> = samples.iter().map(|s| s.mem_pressure).collect();
    let gpu: Vec<f64> = samples.iter().map(|s| s.gpu_util).collect();
    let mt: Vec<f64> = samples.iter().map(|s| s.max_temp as f64).collect();
    let mct: Vec<f64> = samples.iter().map(|s| s.max_cpu_temp as f64).collect();
    let mgt: Vec<f64> = samples.iter().map(|s| s.max_gpu_temp as f64).collect();
    let fan: Vec<f64> = samples.iter().map(|s| s.max_fan_speed as f64).collect();

    let cpu_stats = stats(&cpu);
    let mp_stats = stats(&mp);
    let gpu_stats = stats(&gpu);
    let mt_stats = stats(&mt);
    let mct_stats = stats(&mct);
    let mgt_stats = stats(&mgt);
    let fan_stats = stats(&fan);

    let secs_cpu = seconds_above(samples, |s| s.cpu_util > t.cpu_pct);
    let secs_gpu = seconds_above(samples, |s| s.gpu_util > t.gpu_pct);
    let secs_mp = seconds_above(samples, |s| s.mem_pressure > t.mem_pressure_pct);
    let secs_temp = seconds_above(samples, |s| s.max_temp > t.temp_celsius);

    let tags = derive_tags(&cpu_stats, &gpu_stats, &mt_stats, secs_cpu, secs_gpu, secs_temp);

    SessionSummary {
        cpu_util: cpu_stats,
        mem_pressure: mp_stats,
        gpu_util: gpu_stats,
        max_temp: mt_stats,
        max_cpu_temp: mct_stats,
        max_gpu_temp: mgt_stats,
        max_fan_speed: fan_stats,
        seconds_above_cpu80: secs_cpu,
        seconds_above_gpu80: secs_gpu,
        seconds_above_mem_pressure80: secs_mp,
        seconds_above_temp90: secs_temp,
        events: detect_events(samples, t),
        tags,
    }
}

fn seconds_above(samples: &[Sample], pred: impl Fn(&Sample) -> bool) -> i64 {
    let mut total: f64 = 0.0;
    for w in samples.windows(2) {
        if pred(&w[0]) {
            let dt = (w[1].timestamp - w[0].timestamp).num_milliseconds() as f64 / 1000.0;
            total += dt.max(0.0);
        }
    }
    total.round() as i64
}

fn derive_tags(
    cpu: &MetricStats,
    gpu: &MetricStats,
    temp: &MetricStats,
    secs_cpu: i64,
    secs_gpu: i64,
    secs_temp: i64,
) -> Vec<String> {
    let mut tags = Vec::new();
    if cpu.avg < 10.0 && gpu.avg < 5.0 {
        tags.push("空闲".into());
    } else {
        if cpu.avg > 50.0 || secs_cpu > 300 {
            tags.push("重 CPU".into());
        }
        if gpu.avg > 30.0 || secs_gpu > 60 {
            tags.push("重 GPU".into());
        }
        if cpu.p95 < 50.0 && temp.p95 < 80.0 {
            tags.push("稳定".into());
        }
    }
    if temp.max >= 95.0 || secs_temp > 60 {
        tags.push("过热".into());
    }
    tags
}

struct ThresholdSpec {
    kind: InsightKind,
    test: Box<dyn Fn(&Sample) -> Option<f64>>,
    min_duration: f64,
    merge_gap: f64,
}

fn build_specs(t: &Thresholds) -> Vec<ThresholdSpec> {
    let cpu_pct = t.cpu_pct;
    let gpu_pct = t.gpu_pct;
    let mp_pct = t.mem_pressure_pct;
    let temp_c = t.temp_celsius;
    vec![
        ThresholdSpec {
            kind: InsightKind::HighCpu,
            test: Box::new(move |s| if s.cpu_util > cpu_pct { Some(s.cpu_util) } else { None }),
            min_duration: t.cpu_min_seconds as f64,
            merge_gap: 15.0,
        },
        ThresholdSpec {
            kind: InsightKind::HighGpu,
            test: Box::new(move |s| if s.gpu_util > gpu_pct { Some(s.gpu_util) } else { None }),
            min_duration: t.gpu_min_seconds as f64,
            merge_gap: 15.0,
        },
        ThresholdSpec {
            kind: InsightKind::HighMemPressure,
            test: Box::new(move |s| if s.mem_pressure > mp_pct { Some(s.mem_pressure) } else { None }),
            min_duration: t.mem_min_seconds as f64,
            merge_gap: 15.0,
        },
        ThresholdSpec {
            kind: InsightKind::HighTemp,
            test: Box::new(move |s| if s.max_temp > temp_c { Some(s.max_temp as f64) } else { None }),
            min_duration: t.temp_min_seconds as f64,
            merge_gap: 10.0,
        },
    ]
}

pub fn detect_events(samples: &[Sample], t: &Thresholds) -> Vec<InsightEvent> {
    let mut events: Vec<InsightEvent> = Vec::new();

    let specs = build_specs(t);
    for spec in &specs {
        events.extend(detect_runs(samples, spec));
    }

    if let Some(peak) = samples.iter().max_by_key(|s| s.max_fan_speed) {
        if peak.max_fan_speed > 0 {
            events.push(InsightEvent {
                kind: InsightKind::FanPeak,
                start_time: peak.timestamp,
                end_time: peak.timestamp,
                peak_value: peak.max_fan_speed as f64,
            });
        }
    }

    events.sort_by_key(|e| e.start_time);
    events
}

fn detect_runs(samples: &[Sample], t: &ThresholdSpec) -> Vec<InsightEvent> {
    let mut raw: Vec<(DateTime<Utc>, DateTime<Utc>, f64)> = Vec::new();
    let mut cur: Option<(DateTime<Utc>, DateTime<Utc>, f64)> = None;

    for s in samples {
        match (t.test)(s) {
            Some(v) => match cur.take() {
                Some((start, _end, peak)) => cur = Some((start, s.timestamp, peak.max(v))),
                None => cur = Some((s.timestamp, s.timestamp, v)),
            },
            None => {
                if let Some(r) = cur.take() {
                    raw.push(r);
                }
            }
        }
    }
    if let Some(r) = cur.take() {
        raw.push(r);
    }

    let mut merged: Vec<(DateTime<Utc>, DateTime<Utc>, f64)> = Vec::new();
    for r in raw {
        if let Some(last) = merged.last_mut() {
            let gap = (r.0 - last.1).num_milliseconds() as f64 / 1000.0;
            if gap <= t.merge_gap {
                last.1 = r.1;
                last.2 = last.2.max(r.2);
                continue;
            }
        }
        merged.push(r);
    }

    merged
        .into_iter()
        .filter(|(start, end, _)| (*end - *start).num_milliseconds() as f64 / 1000.0 >= t.min_duration)
        .map(|(start, end, peak)| InsightEvent {
            kind: t.kind,
            start_time: start,
            end_time: end,
            peak_value: peak,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn make_sample(secs: i64, cpu: f64) -> Sample {
        Sample {
            timestamp: Utc.timestamp_opt(secs, 0).unwrap(),
            cpu_util: cpu,
            mem_pressure: 0.0,
            mem_wired: 0,
            mem_used: 0,
            mem_cached: 0,
            mem_free: 0,
            gpu_util: 0.0,
            gpu_mem_used: 0,
            max_temp: 0,
            max_cpu_temp: 0,
            max_gpu_temp: 0,
            max_fan_speed: 0,
        }
    }

    #[test]
    fn stats_simple() {
        let s = stats(&[10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]);
        assert_eq!(s.min, 10.0);
        assert_eq!(s.max, 100.0);
        assert!((s.avg - 55.0).abs() < 0.001);
    }

    #[test]
    fn detect_high_cpu_run() {
        let t = Thresholds::default();
        let samples: Vec<Sample> = (0..=120).map(|i| make_sample(i, 90.0)).collect();
        let events = detect_events(&samples, &t);
        let high_cpu: Vec<_> = events.iter().filter(|e| e.kind == InsightKind::HighCpu).collect();
        assert_eq!(high_cpu.len(), 1);
    }

    #[test]
    fn ignore_short_runs() {
        let t = Thresholds::default();
        let samples: Vec<Sample> = (0..=30).map(|i| make_sample(i, 90.0)).collect();
        let events = detect_events(&samples, &t);
        let high_cpu: Vec<_> = events.iter().filter(|e| e.kind == InsightKind::HighCpu).collect();
        assert!(high_cpu.is_empty());
    }

    #[test]
    fn custom_threshold_lowers_bar() {
        let mut t = Thresholds::default();
        t.cpu_pct = 50.0;
        t.cpu_min_seconds = 10;
        let samples: Vec<Sample> = (0..=20).map(|i| make_sample(i, 60.0)).collect();
        let events = detect_events(&samples, &t);
        assert_eq!(events.iter().filter(|e| e.kind == InsightKind::HighCpu).count(), 1);
    }
}
