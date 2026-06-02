use crate::error::Result;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

pub fn calculate_file_hash(path: &str) -> Result<String> {
    let mut file = File::open(path)?;
    let metadata = file.metadata()?;
    let file_size = metadata.len();
    
    let mut hasher = Sha256::new();
    
    // Include file size in the hash to prevent collisions between files with same start/end but different sizes
    hasher.update(&file_size.to_le_bytes());
    
    let chunk_size: u64 = 8192; // 8KB
    
    if file_size <= chunk_size * 2 {
        // If file is small (<= 16KB), just hash the whole thing
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        hasher.update(&buffer);
    } else {
        // Hash first 8KB
        let mut start_buffer = vec![0; chunk_size as usize];
        file.read_exact(&mut start_buffer)?;
        hasher.update(&start_buffer);
        
        // Hash last 8KB
        file.seek(SeekFrom::End(-(chunk_size as i64)))?;
        let mut end_buffer = vec![0; chunk_size as usize];
        file.read_exact(&mut end_buffer)?;
        hasher.update(&end_buffer);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

pub fn get_file_size(path: &str) -> Result<i64> {
    let metadata = std::fs::metadata(path)?;
    Ok(metadata.len() as i64)
}

#[allow(dead_code)]
pub fn is_supported_format(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        if let Some(ext_str) = ext.to_str() {
            let ext_lower = ext_str.to_lowercase();
            return matches!(
                ext_lower.as_str(),
                "epub" | "pdf" | "mobi" | "azw" | "azw3" | "txt" | "cbz" | "cbr"
            );
        }
    }
    false
}
