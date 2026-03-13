// TimeRange value object
use crate::shared::{validation::validate_time_range, ValidationResult};

/// Validated time range for video clips
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TimeRange {
    start: f64,
    end: f64,
}

impl TimeRange {
    /// Minimum duration for a valid clip (100ms)
    pub const MIN_DURATION: f64 = 0.1;

    /// Create a new TimeRange with validation
    pub fn new(start: f64, end: f64) -> ValidationResult<Self> {
        validate_time_range(start, end, Self::MIN_DURATION)?;
        Ok(Self { start, end })
    }

    /// Get start time
    pub fn start(&self) -> f64 {
        self.start
    }

    /// Get end time
    pub fn end(&self) -> f64 {
        self.end
    }

    /// Get duration
    pub fn duration(&self) -> f64 {
        self.end - self.start
    }

    /// Check if this range contains a given time
    pub fn contains(&self, time: f64) -> bool {
        time >= self.start && time <= self.end
    }

    /// Check if this range overlaps with another
    pub fn overlaps(&self, other: &TimeRange) -> bool {
        self.start < other.end && other.start < self.end
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_range_creation() {
        assert!(TimeRange::new(0.0, 10.0).is_ok());
        assert!(TimeRange::new(10.0, 5.0).is_err());
        assert!(TimeRange::new(0.0, 0.05).is_err());
    }

    #[test]
    fn test_time_range_duration() {
        let range = TimeRange::new(5.0, 15.0).unwrap();
        assert_eq!(range.duration(), 10.0);
    }

    #[test]
    fn test_time_range_contains() {
        let range = TimeRange::new(5.0, 15.0).unwrap();
        assert!(range.contains(10.0));
        assert!(!range.contains(20.0));
    }

    #[test]
    fn test_time_range_overlaps() {
        let range1 = TimeRange::new(5.0, 15.0).unwrap();
        let range2 = TimeRange::new(10.0, 20.0).unwrap();
        let range3 = TimeRange::new(20.0, 30.0).unwrap();
        
        assert!(range1.overlaps(&range2));
        assert!(!range1.overlaps(&range3));
    }
}
