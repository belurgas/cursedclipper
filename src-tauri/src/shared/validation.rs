// Common validation functions
use super::error::ValidationError;
use super::result::ValidationResult;

/// Validate text length within bounds
pub fn validate_text_length(
    text: &str,
    min: usize,
    max: usize,
    field_name: &str,
) -> ValidationResult<()> {
    let len = text.chars().count();
    
    if len < min {
        return Err(ValidationError::TextTooShort {
            field: field_name.to_string(),
            min,
        });
    }
    
    if len > max {
        return Err(ValidationError::TextTooLong {
            field: field_name.to_string(),
            max,
        });
    }
    
    Ok(())
}

/// Validate project ID format
pub fn validate_project_id(id: &str) -> ValidationResult<()> {
    if id.is_empty() || id.len() > 120 {
        return Err(ValidationError::InvalidProjectId(id.to_string()));
    }
    
    if id.contains(|c: char| c.is_control()) {
        return Err(ValidationError::InvalidProjectId(
            "Project ID contains control characters".to_string(),
        ));
    }
    
    Ok(())
}

/// Validate time range
pub fn validate_time_range(start: f64, end: f64, min_duration: f64) -> ValidationResult<()> {
    if !start.is_finite() || !end.is_finite() {
        return Err(ValidationError::InvalidTimeRange);
    }
    
    if start < 0.0 || end < 0.0 {
        return Err(ValidationError::InvalidTimeRange);
    }
    
    if end <= start + min_duration {
        return Err(ValidationError::InvalidTimeRange);
    }
    
    Ok(())
}

/// Validate resolution dimensions
pub fn validate_resolution(width: u32, height: u32) -> ValidationResult<()> {
    const MIN_DIM: u32 = 240;
    const MAX_DIM: u32 = 4320;
    
    if width < MIN_DIM || width > MAX_DIM || height < MIN_DIM || height > MAX_DIM {
        return Err(ValidationError::InvalidResolution { width, height });
    }
    
    // Ensure even dimensions for video encoding
    if width % 2 != 0 || height % 2 != 0 {
        return Err(ValidationError::InvalidResolution { width, height });
    }
    
    Ok(())
}

/// Validate path string
pub fn validate_path(path: &str) -> ValidationResult<()> {
    if path.is_empty() {
        return Err(ValidationError::InvalidPath("Path is empty".to_string()));
    }
    
    if path.len() > 2048 {
        return Err(ValidationError::InvalidPath("Path is too long".to_string()));
    }
    
    if path.contains(|c: char| c.is_control()) {
        return Err(ValidationError::InvalidPath(
            "Path contains control characters".to_string(),
        ));
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_text_length() {
        assert!(validate_text_length("hello", 3, 10, "test").is_ok());
        assert!(validate_text_length("hi", 3, 10, "test").is_err());
        assert!(validate_text_length("hello world!", 3, 10, "test").is_err());
    }

    #[test]
    fn test_validate_time_range() {
        assert!(validate_time_range(0.0, 10.0, 0.1).is_ok());
        assert!(validate_time_range(10.0, 5.0, 0.1).is_err());
        assert!(validate_time_range(0.0, 0.05, 0.1).is_err());
    }

    #[test]
    fn test_validate_resolution() {
        assert!(validate_resolution(1920, 1080).is_ok());
        assert!(validate_resolution(1921, 1080).is_err()); // Odd width
        assert!(validate_resolution(100, 100).is_err()); // Too small
    }
}
