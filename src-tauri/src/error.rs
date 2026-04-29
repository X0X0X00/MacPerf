use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("sqlite error: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("CSV is empty")]
    Empty,

    #[error("unsupported encoding")]
    Encoding,

    #[error("CSV header mismatch.\nExpected: {expected}\nGot:      {got}")]
    BadHeader { expected: String, got: String },

    #[error("CSV line {line} malformed: {reason}")]
    BadRow { line: usize, reason: String },

    #[error("already imported (hash {0})")]
    Duplicate(String),

    #[error("{0}")]
    Other(String),
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Other(format!("{e:#}"))
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
