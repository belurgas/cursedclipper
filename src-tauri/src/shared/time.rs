// Time utilities
use std::time::{SystemTime, UNIX_EPOCH};

/// Get current Unix timestamp in milliseconds
pub fn now_unix_millis() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| "Failed to get current time.".to_string())
}

/// Clamp time value to valid range
pub fn clamp_time(value: f64, min: f64, max: f64) -> f64 {
    if !value.is_finite() {
        return min;
    }
    value.clamp(min, max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_now_unix_millis() {
        let now = now_unix_millis().unwrap();
        assert!(now > 1_600_000_000_000); // After 2020
    }

    #[test]
    fn test_clamp_time() {
        assert_eq!(clamp_time(5.0, 0.0, 10.0), 5.0);
        assert_eq!(clamp_time(-1.0, 0.0, 10.0), 0.0);
        assert_eq!(clamp_time(15.0, 0.0, 10.0), 10.0);
        assert_eq!(clamp_time(f64::NAN, 0.0, 10.0), 0.0);
    }
}
