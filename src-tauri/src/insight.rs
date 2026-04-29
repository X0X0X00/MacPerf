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

pub fn compute_summary(samples: &[Sample]) -> SessionSummary {
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

    SessionSummary {
        cpu_util: stats(&cpu),
        mem_pressure: stats(&mp),
        gpu_util: stats(&gpu),
        max_temp: stats(&mt),
        max_cpu_temp: stats(&mct),
        max_gpu_temp: stats(&mgt),
        max_fan_speed: stats(&fan),
        seconds_above_cpu80: seconds_above(samples, |s| s.cpu_util > 80.0),
        seconds_above_gpu80: seconds_above(samples, |s| s.gpu_util > 80.0),
        seconds_above_mem_pressure80: seconds_above(samples, |s| s.mem_pressure > 80.0),
        seconds_above_temp90: seconds_above(samples, |s| s.max_temp > 90),
        events: detect_events(samples),
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

struct Threshold {
    kind: InsightKind,
    test: fn(&Sample) -> Option<f64>,
    min_duration: f64, // seconds
    merge_gap: f64,    // seconds
}

const THRESHOLDS: &[Threshold] = &[
    Threshold {
        kind: InsightKind::HighCpu,
        test: |s| if s.cpu_util > 80.0 { Some(s.cpu_util) } else { None },
        min_duration: 60.0,
        merge_gap: 15.0,
    },
    Threshold {
        kind: InsightKind::HighGpu,
        test: |s| if s.gpu_util > 80.0 { Some(s.gpu_util) } else { None },
        min_duration: 60.0,
        merge_gap: 15.0,
    },
    Threshold {
        kind: InsightKind::HighMemPressure,
        test: |s| if s.mem_pressure > 80.0 { Some(s.mem_pressure) } else { None },
        min_duration: 60.0,
        merge_gap: 15.0,
    },
    Threshold {
        kind: InsightKind::HighTemp,
        test: |s| if s.max_temp > 90 { Some(s.max_temp as f64) } else { None },
        min_duration: 30.0,
        merge_gap: 10.0,
    },
];

pub fn detect_events(samples: &[Sample]) -> Vec<InsightEvent> {
    let mut events: Vec<InsightEvent> = Vec::new();

    for t in THRESHOLDS {
        events.extend(detect_runs(samples, t));
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

fn detect_runs(samples: &[Sample], t: &Threshold) -> Vec<InsightEvent> {
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
        let samples: Vec<Sample> = (0..=120).map(|i| make_sample(i, 90.0)).collect();
        let events = detect_events(&samples);
        let high_cpu: Vec<_> = events.iter().filter(|e| e.kind == InsightKind::HighCpu).collect();
        assert_eq!(high_cpu.len(), 1);
    }

    #[test]
    fn ignore_short_runs() {
        let samples: Vec<Sample> = (0..=30).map(|i| make_sample(i, 90.0)).collect();
        let events = detect_events(&samples);
        let high_cpu: Vec<_> = events.iter().filter(|e| e.kind == InsightKind::HighCpu).collect();
        assert!(high_cpu.is_empty());
    }
}
