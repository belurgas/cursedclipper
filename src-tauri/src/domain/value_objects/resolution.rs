// Resolution value object
use crate::shared::{validation::validate_resolution, ValidationResult};

/// Validated video resolution
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Resolution {
    width: u32,
    height: u32,
}

impl Resolution {
    /// Create a new Resolution with validation
    pub fn new(width: u32, height: u32) -> ValidationResult<Self> {
        validate_resolution(width, height)?;
        Ok(Self { width, height })
    }

    /// Get width
    pub fn width(&self) -> u32 {
        self.width
    }

    /// Get height
    pub fn height(&self) -> u32 {
        self.height
    }

    /// Get aspect ratio
    pub fn aspect_ratio(&self) -> f64 {
        self.width as f64 / self.height as f64
    }

    /// Check if resolution is portrait
    pub fn is_portrait(&self) -> bool {
        self.height > self.width
    }

    /// Check if resolution is landscape
    pub fn is_landscape(&self) -> bool {
        self.width > self.height
    }

    /// Check if resolution is square
    pub fn is_square(&self) -> bool {
        self.width == self.height
    }

    /// Common presets
    pub fn hd_1080p() -> Self {
        Self { width: 1920, height: 1080 }
    }

    pub fn hd_720p() -> Self {
        Self { width: 1280, height: 720 }
    }

    pub fn square_1080() -> Self {
        Self { width: 1080, height: 1080 }
    }

    pub fn portrait_1080() -> Self {
        Self { width: 1080, height: 1920 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolution_creation() {
        assert!(Resolution::new(1920, 1080).is_ok());
        assert!(Resolution::new(1921, 1080).is_err()); // Odd width
    }

    #[test]
    fn test_resolution_aspect_ratio() {
        let res = Resolution::new(1920, 1080).unwrap();
        assert!((res.aspect_ratio() - 16.0 / 9.0).abs() < 0.01);
    }

    #[test]
    fn test_resolution_orientation() {
        let landscape = Resolution::hd_1080p();
        let portrait = Resolution::portrait_1080();
        let square = Resolution::square_1080();

        assert!(landscape.is_landscape());
        assert!(portrait.is_portrait());
        assert!(square.is_square());
    }
}
