// Type aliases for Results used throughout the application
use super::error::AppError;

/// Standard Result type for application operations
pub type AppResult<T> = Result<T, AppError>;

/// Result type for domain operations
pub type DomainResult<T> = Result<T, super::error::DomainError>;

/// Result type for infrastructure operations
pub type InfraResult<T> = Result<T, super::error::InfraError>;

/// Result type for validation operations
pub type ValidationResult<T> = Result<T, super::error::ValidationError>;
