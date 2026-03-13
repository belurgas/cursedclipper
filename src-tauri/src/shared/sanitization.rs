// Text sanitization utilities
use super::result::ValidationResult;
use super::validation::validate_text_length;

/// Sanitize text by trimming and limiting length
pub fn sanitize_text(text: String, min: usize, max: usize, field_name: &str) -> ValidationResult<String> {
    let trimmed: String = text.trim().chars().take(max).collect();
    validate_text_length(&trimmed, min, max, field_name)?;
    Ok(trimmed)
}

/// Sanitize optional text
pub fn sanitize_optional_text(text: Option<String>, max: usize) -> Option<String> {
    text.and_then(|raw| {
        let trimmed: String = raw.trim().chars().take(max).collect();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

/// Sanitize file stem for safe filenames
pub fn sanitize_file_stem(stem: &str) -> String {
    stem.chars()
        .filter_map(|ch| {
            if ch.is_alphanumeric() || ch == '-' || ch == '_' || ch == ' ' {
                Some(ch)
            } else if ch == '/' || ch == '\\' {
                Some('-')
            } else {
                None
            }
        })
        .take(120)
        .collect::<String>()
        .trim()
        .to_string()
}

/// Sanitize project name for directory names
pub fn sanitize_project_name(name: Option<String>) -> String {
    name.and_then(|raw| {
        let sanitized = sanitize_file_stem(&raw);
        if sanitized.is_empty() {
            None
        } else {
            Some(sanitized)
        }
    })
    .unwrap_or_else(|| "project".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_text() {
        assert_eq!(
            sanitize_text("  hello  ".to_string(), 3, 10, "test").unwrap(),
            "hello"
        );
        assert!(sanitize_text("hi".to_string(), 3, 10, "test").is_err());
    }

    #[test]
    fn test_sanitize_file_stem() {
        assert_eq!(sanitize_file_stem("hello/world"), "hello-world");
        assert_eq!(sanitize_file_stem("test@#$file"), "testfile");
        assert_eq!(sanitize_file_stem("my project 2024"), "my project 2024");
    }

    #[test]
    fn test_sanitize_project_name() {
        assert_eq!(sanitize_project_name(Some("My Project".to_string())), "My Project");
        assert_eq!(sanitize_project_name(Some("".to_string())), "project");
        assert_eq!(sanitize_project_name(None), "project");
    }
}
