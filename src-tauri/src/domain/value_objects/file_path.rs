// FilePath value object
use crate::shared::{validation::validate_path, ValidationResult};
use std::path::{Path, PathBuf};

/// Validated file path
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FilePath(PathBuf);

impl FilePath {
    /// Create a new FilePath with validation
    pub fn new(path: impl AsRef<Path>) -> ValidationResult<Self> {
        let path_str = path.as_ref().to_string_lossy();
        validate_path(&path_str)?;
        Ok(Self(path.as_ref().to_path_buf()))
    }

    /// Create without validation (use only when loading from trusted source)
    pub fn from_trusted(path: PathBuf) -> Self {
        Self(path)
    }

    /// Get as Path reference
    pub fn as_path(&self) -> &Path {
        &self.0
    }

    /// Convert to PathBuf
    pub fn into_path_buf(self) -> PathBuf {
        self.0
    }

    /// Get file name
    pub fn file_name(&self) -> Option<&str> {
        self.0.file_name().and_then(|s| s.to_str())
    }

    /// Get extension
    pub fn extension(&self) -> Option<&str> {
        self.0.extension().and_then(|s| s.to_str())
    }

    /// Check if path exists
    pub fn exists(&self) -> bool {
        self.0.exists()
    }

    /// Check if path is a file
    pub fn is_file(&self) -> bool {
        self.0.is_file()
    }

    /// Check if path is a directory
    pub fn is_dir(&self) -> bool {
        self.0.is_dir()
    }
}

impl AsRef<Path> for FilePath {
    fn as_ref(&self) -> &Path {
        &self.0
    }
}

impl std::fmt::Display for FilePath {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0.display())
    }
}
