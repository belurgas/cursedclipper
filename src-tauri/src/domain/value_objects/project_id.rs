// ProjectId value object
use crate::shared::{validation::validate_project_id, ValidationResult};

/// Validated project identifier
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProjectId(String);

impl ProjectId {
    /// Create a new ProjectId with validation
    pub fn new(id: String) -> ValidationResult<Self> {
        validate_project_id(&id)?;
        Ok(Self(id))
    }

    /// Create without validation (use only when loading from trusted source)
    pub fn from_trusted(id: String) -> Self {
        Self(id)
    }

    /// Get the inner string value
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Convert to String
    pub fn into_string(self) -> String {
        self.0
    }
}

impl std::fmt::Display for ProjectId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl AsRef<str> for ProjectId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}
