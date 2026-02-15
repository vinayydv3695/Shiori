use crate::error::Result;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

pub fn calculate_file_hash(path: &str) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];

    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

pub fn get_file_size(path: &str) -> Result<i64> {
    let metadata = std::fs::metadata(path)?;
    Ok(metadata.len() as i64)
}

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
