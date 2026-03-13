// Unified error types for the application
use std::fmt;

/// Top-level application error
#[derive(Debug)]
pub enum AppError {
    Domain(DomainError),
    Infrastructure(InfraError),
    Validation(ValidationError),
}

/// Domain-level business logic errors
#[derive(Debug)]
pub enum DomainError {
    ProjectNotFound(String),
    InvalidTimeRange { start: f64, end: f64 },
    ExportFailed(String),
    InvalidProjectState(String),
    WorkspaceStateTooLarge { size: usize, max: usize },
}

/// Infrastructure-level errors (external dependencies)
#[derive(Debug)]
pub enum InfraError {
    Database(String),
    FileSystem(String),
    FFmpeg(FFmpegError),
    YtDlp(String),
    Network(String),
    PathResolution(String),
}

/// FFmpeg-specific errors with detailed context
#[derive(Debug)]
pub struct FFmpegError {
    pub operation: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

/// Validation errors for input data
#[derive(Debug)]
pub enum ValidationError {
    InvalidProjectId(String),
    InvalidPath(String),
    InvalidTimeRange,
    InvalidResolution { width: u32, height: u32 },
    TextTooLong { field: String, max: usize },
    TextTooShort { field: String, min: usize },
    InvalidFormat(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Domain(e) => write!(f, "Domain error: {e}"),
            AppError::Infrastructure(e) => write!(f, "Infrastructure error: {e}"),
            AppError::Validation(e) => write!(f, "Validation error: {e}"),
        }
    }
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DomainError::ProjectNotFound(id) => write!(f, "Project not found: {id}"),
            DomainError::InvalidTimeRange { start, end } => {
                write!(f, "Invalid time range: {start}-{end}")
            }
            DomainError::ExportFailed(msg) => write!(f, "Export failed: {msg}"),
            DomainError::InvalidProjectState(msg) => write!(f, "Invalid project state: {msg}"),
            DomainError::WorkspaceStateTooLarge { size, max } => {
                write!(f, "Workspace state too large: {size} bytes (max: {max})")
            }
        }
    }
}

impl fmt::Display for InfraError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            InfraError::Database(msg) => write!(f, "Database error: {msg}"),
            InfraError::FileSystem(msg) => write!(f, "File system error: {msg}"),
            InfraError::FFmpeg(e) => write!(f, "FFmpeg error: {e}"),
            InfraError::YtDlp(msg) => write!(f, "yt-dlp error: {msg}"),
            InfraError::Network(msg) => write!(f, "Network error: {msg}"),
            InfraError::PathResolution(msg) => write!(f, "Path resolution error: {msg}"),
        }
    }
}

impl fmt::Display for FFmpegError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "FFmpeg {} failed (exit code: {:?}): {}",
            self.operation, self.exit_code, self.stderr
        )
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::InvalidProjectId(id) => write!(f, "Invalid project ID: {id}"),
            ValidationError::InvalidPath(path) => write!(f, "Invalid path: {path}"),
            ValidationError::InvalidTimeRange => write!(f, "Invalid time range"),
            ValidationError::InvalidResolution { width, height } => {
                write!(f, "Invalid resolution: {width}x{height}")
            }
            ValidationError::TextTooLong { field, max } => {
                write!(f, "{field} is too long (max: {max})")
            }
            ValidationError::TextTooShort { field, min } => {
                write!(f, "{field} is too short (min: {min})")
            }
            ValidationError::InvalidFormat(msg) => write!(f, "Invalid format: {msg}"),
        }
    }
}

impl std::error::Error for AppError {}
impl std::error::Error for DomainError {}
impl std::error::Error for InfraError {}
impl std::error::Error for FFmpegError {}
impl std::error::Error for ValidationError {}

// Conversion to String for Tauri commands
impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.to_string()
    }
}

impl From<DomainError> for AppError {
    fn from(error: DomainError) -> Self {
        AppError::Domain(error)
    }
}

impl From<InfraError> for AppError {
    fn from(error: InfraError) -> Self {
        AppError::Infrastructure(error)
    }
}

impl From<ValidationError> for AppError {
    fn from(error: ValidationError) -> Self {
        AppError::Validation(error)
    }
}
