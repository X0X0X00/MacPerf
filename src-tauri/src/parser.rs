use crate::error::{AppError, AppResult};
use crate::model::Sample;
use chrono::{DateTime, NaiveDateTime, Utc};
use encoding_rs::{UTF_16BE, UTF_16LE, UTF_8};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

pub const EXPECTED_HEADER: &[&str] = &[
    "Time",
    "CPU Utilization",
    "Memory Pressure",
    "Memory Wired",
    "Memory Used",
    "Memory Cached",
    "Memory Free",
    "GPU Utilization",
    "GPU Memory Used",
    "Max Temperature",
    "Max CPU Temperature",
    "Max GPU Temperature",
    "Max Fan Speed",
];

pub struct ParsedFile {
    pub samples: Vec<Sample>,
    pub hash: String,
}

pub fn parse_file(path: &Path) -> AppResult<ParsedFile> {
    let bytes = fs::read(path)?;
    if bytes.is_empty() {
        return Err(AppError::Empty);
    }
    let hash = sha256_hex(&bytes);
    let text = decode(&bytes)?;
    let samples = parse_text(&text)?;
    if samples.is_empty() {
        return Err(AppError::Empty);
    }
    Ok(ParsedFile { samples, hash })
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    let out = h.finalize();
    out.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn decode(bytes: &[u8]) -> AppResult<String> {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (cow, _, had_errors) = UTF_16LE.decode(&bytes[2..]);
        if had_errors {
            return Err(AppError::Encoding);
        }
        return Ok(cow.into_owned());
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (cow, _, had_errors) = UTF_16BE.decode(&bytes[2..]);
        if had_errors {
            return Err(AppError::Encoding);
        }
        return Ok(cow.into_owned());
    }
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let (cow, _, had_errors) = UTF_8.decode(&bytes[3..]);
        if had_errors {
            return Err(AppError::Encoding);
        }
        return Ok(cow.into_owned());
    }
    let (cow, _, had_errors) = UTF_8.decode(bytes);
    if had_errors {
        return Err(AppError::Encoding);
    }
    Ok(cow.into_owned())
}

pub fn parse_text(text: &str) -> AppResult<Vec<Sample>> {
    // iStatistica Pro emits a UTF-16 BOM at the start of every row, which decodes
    // to U+FEFF (ZWNBSP) inside the string. Strip them all, plus the leading BOM if any.
    let cleaned: String = text.replace('\u{FEFF}', "");
    let mut lines = cleaned
        .split(|c| c == '\n' || c == '\r')
        .map(|l| l.trim())
        .filter(|l| !l.is_empty());

    let header_line = lines.next().ok_or(AppError::Empty)?;
    let header: Vec<&str> = header_line.split(',').map(|s| s.trim()).collect();
    if header != EXPECTED_HEADER {
        return Err(AppError::BadHeader {
            expected: EXPECTED_HEADER.join(","),
            got: header.join(","),
        });
    }

    let mut samples = Vec::new();
    for (i, line) in lines.enumerate() {
        let lineno = i + 2;
        let row = parse_row(line, lineno)?;
        samples.push(row);
    }
    samples.sort_by_key(|s| s.timestamp);
    Ok(samples)
}

fn parse_row(line: &str, lineno: usize) -> AppResult<Sample> {
    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    if parts.len() != EXPECTED_HEADER.len() {
        return Err(AppError::BadRow {
            line: lineno,
            reason: format!("expected {} cols, got {}", EXPECTED_HEADER.len(), parts.len()),
        });
    }

    let timestamp = parse_ts(parts[0]).map_err(|e| AppError::BadRow {
        line: lineno,
        reason: format!("bad timestamp '{}': {}", parts[0], e),
    })?;

    let cpu_util = parse_pct(parts[1]).map_err(|e| AppError::BadRow {
        line: lineno,
        reason: format!("bad CPU '{}': {}", parts[1], e),
    })?;
    let mem_pressure = parse_pct(parts[2]).map_err(|e| AppError::BadRow {
        line: lineno,
        reason: format!("bad mem pressure '{}': {}", parts[2], e),
    })?;
    let mem_wired = parse_i64(parts[3], "Memory Wired", lineno)?;
    let mem_used = parse_i64(parts[4], "Memory Used", lineno)?;
    let mem_cached = parse_i64(parts[5], "Memory Cached", lineno)?;
    let mem_free = parse_i64(parts[6], "Memory Free", lineno)?;
    let gpu_util = parse_pct(parts[7]).map_err(|e| AppError::BadRow {
        line: lineno,
        reason: format!("bad GPU '{}': {}", parts[7], e),
    })?;
    let gpu_mem_used = parse_i64(parts[8], "GPU Memory Used", lineno)?;
    let max_temp = parse_i32(parts[9], "Max Temperature", lineno)?;
    let max_cpu_temp = parse_i32(parts[10], "Max CPU Temperature", lineno)?;
    let max_gpu_temp = parse_i32(parts[11], "Max GPU Temperature", lineno)?;
    let max_fan_speed = parse_i32(parts[12], "Max Fan Speed", lineno)?;

    Ok(Sample {
        timestamp,
        cpu_util,
        mem_pressure,
        mem_wired,
        mem_used,
        mem_cached,
        mem_free,
        gpu_util,
        gpu_mem_used,
        max_temp,
        max_cpu_temp,
        max_gpu_temp,
        max_fan_speed,
    })
}

fn parse_pct(s: &str) -> Result<f64, std::num::ParseFloatError> {
    let stripped = s.strip_suffix('%').unwrap_or(s);
    stripped.parse::<f64>()
}

fn parse_i64(s: &str, name: &str, lineno: usize) -> AppResult<i64> {
    s.parse::<i64>().map_err(|_| AppError::BadRow {
        line: lineno,
        reason: format!("bad {name} '{s}'"),
    })
}

fn parse_i32(s: &str, name: &str, lineno: usize) -> AppResult<i32> {
    s.parse::<i32>().map_err(|_| AppError::BadRow {
        line: lineno,
        reason: format!("bad {name} '{s}'"),
    })
}

fn parse_ts(s: &str) -> Result<DateTime<Utc>, String> {
    // iStatistica Pro emits e.g. "2024-03-20 20:16:12 +0000"
    // Try the full format first, then fall back to a few variants.
    let formats = [
        "%Y-%m-%d %H:%M:%S %z",
        "%Y-%m-%d %H:%M:%S %#z",
        "%Y-%m-%dT%H:%M:%S%z",
    ];
    for f in formats {
        if let Ok(dt) = DateTime::parse_from_str(s, f) {
            return Ok(dt.with_timezone(&Utc));
        }
    }
    // Fall back to naive UTC parsing
    if let Ok(naive) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Ok(naive.and_utc());
    }
    Err(format!("unrecognized format: '{s}'"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_utf16le_with_bom() {
        let mut bytes = vec![0xFF, 0xFE];
        for b in "Hi".encode_utf16() {
            bytes.extend_from_slice(&b.to_le_bytes());
        }
        let s = decode(&bytes).unwrap();
        assert_eq!(s, "Hi");
    }

    #[test]
    fn parse_known_row() {
        let line = "2024-03-20 20:16:12 +0000,52%,54%,3847225344,5366611968,4749000704,958398464,5%,139703150,86,86,72,6867";
        let s = parse_row(line, 2).unwrap();
        assert_eq!(s.cpu_util, 52.0);
        assert_eq!(s.mem_wired, 3_847_225_344);
        assert_eq!(s.max_fan_speed, 6867);
    }

    #[test]
    fn ts_with_offset() {
        let dt = parse_ts("2024-03-20 20:16:12 +0000").unwrap();
        assert_eq!(dt.timestamp(), 1710965772);
    }

    #[test]
    fn parse_text_strips_per_line_bom() {
        // iStatistica Pro emits a BOM at the start of each line. After UTF-16 decode
        // those become U+FEFF characters that our parser must strip.
        let bom = '\u{FEFF}';
        let header = "Time,CPU Utilization,Memory Pressure,Memory Wired,Memory Used,Memory Cached,Memory Free,GPU Utilization,GPU Memory Used,Max Temperature,Max CPU Temperature,Max GPU Temperature,Max Fan Speed";
        let row = "2024-03-20 20:16:12 +0000,52%,54%,1,2,3,4,5%,6,86,86,72,6867";
        let text = format!("{bom}{header}\n{bom}{row}\n");
        let samples = parse_text(&text).unwrap();
        assert_eq!(samples.len(), 1);
        assert_eq!(samples[0].cpu_util, 52.0);
        assert_eq!(samples[0].max_fan_speed, 6867);
    }

    #[test]
    fn parse_real_fixture() {
        // Verifies end-to-end against the actual file iStatistica produced.
        let path = std::path::Path::new("../iStatistica Pro - 2024-03-20 20:16:10 +0000.csv");
        if !path.exists() {
            // CI/sandbox without fixture: skip silently.
            return;
        }
        let parsed = parse_file(path).unwrap();
        assert!(parsed.samples.len() > 8000);
        assert_eq!(parsed.samples[0].cpu_util, 52.0);
    }
}
