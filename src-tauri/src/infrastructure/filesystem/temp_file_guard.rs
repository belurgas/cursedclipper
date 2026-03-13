// RAII guard for temporary files cleanup
use std::fs;
use std::path::PathBuf;

/// RAII guard that automatically cleans up temporary files on drop
pub struct TempFileGuard {
    paths: Vec<PathBuf>,
}

impl TempFileGuard {
    /// Create a new TempFileGuard
    pub fn new() -> Self {
        Self { paths: Vec::new() }
    }

    /// Track a temporary file for cleanup
    pub fn track(&mut self, path: PathBuf) {
        self.paths.push(path);
    }

    /// Manually cleanup all tracked files
    pub fn cleanup(&mut self) {
        for path in &self.paths {
            if path.exists() {
                let _ = fs::remove_file(path);
            }
        }
        self.paths.clear();
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        self.cleanup();
    }
}

impl Default for TempFileGuard {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn test_temp_file_guard_cleanup() {
        let temp_path = std::env::temp_dir().join("test_temp_file.txt");
        
        {
            let mut guard = TempFileGuard::new();
            
            // Create a temp file
            let mut file = File::create(&temp_path).unwrap();
            file.write_all(b"test").unwrap();
            
            guard.track(temp_path.clone());
            assert!(temp_path.exists());
        } // guard drops here
        
        // File should be cleaned up
        assert!(!temp_path.exists());
    }
}
