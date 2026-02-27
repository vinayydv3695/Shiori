/// Input validation utilities for Tauri commands.
///
/// Centralizes validation logic so commands stay concise and consistent.
/// All functions return `crate::error::Result<()>` to integrate with the
/// existing unified error type.
use crate::error::{Result, ShioriError};

/// Validate that an ID is positive (> 0).
pub fn require_positive_id(value: i64, field: &str) -> Result<()> {
    if value <= 0 {
        return Err(ShioriError::Validation(format!(
            "{} must be a positive integer, got {}",
            field, value
        )));
    }
    Ok(())
}

/// Validate that a string is not empty after trimming.
pub fn require_non_empty(value: &str, field: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(ShioriError::Validation(format!(
            "{} must not be empty",
            field
        )));
    }
    Ok(())
}

/// Validate that a string does not exceed a maximum length.
pub fn require_max_length(value: &str, max: usize, field: &str) -> Result<()> {
    if value.len() > max {
        return Err(ShioriError::Validation(format!(
            "{} exceeds maximum length of {} characters (got {})",
            field,
            max,
            value.len()
        )));
    }
    Ok(())
}

/// Validate a file path: non-empty, no path traversal components.
pub fn require_safe_path(path: &str, field: &str) -> Result<()> {
    require_non_empty(path, field)?;

    // Reject path traversal
    let normalized = path.replace('\\', "/");
    if normalized.contains("../") || normalized.contains("/..") || normalized == ".." {
        return Err(ShioriError::Validation(format!(
            "{} contains path traversal (../) which is not allowed",
            field
        )));
    }

    Ok(())
}

/// Validate a URL is well-formed and uses http/https.
pub fn require_valid_url(url: &str, field: &str) -> Result<()> {
    require_non_empty(url, field)?;
    require_max_length(url, 2048, field)?;

    // Basic scheme check
    let lower = url.to_lowercase();
    if !lower.starts_with("http://") && !lower.starts_with("https://") {
        return Err(ShioriError::Validation(format!(
            "{} must be an HTTP or HTTPS URL",
            field
        )));
    }

    // Reject obvious SSRF targets
    let host_part = lower
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    let host = host_part.split('/').next().unwrap_or("");
    let host_no_port = host.split(':').next().unwrap_or("");

    if host_no_port == "localhost"
        || host_no_port == "127.0.0.1"
        || host_no_port == "[::1]"
        || host_no_port.starts_with("0.")
        || host_no_port.starts_with("10.")
        || host_no_port.starts_with("192.168.")
        || host_no_port.starts_with("169.254.")
        || host_no_port.starts_with("172.16.")
        || host_no_port.starts_with("172.17.")
        || host_no_port.starts_with("172.18.")
        || host_no_port.starts_with("172.19.")
        || host_no_port.starts_with("172.2")
        || host_no_port.starts_with("172.30.")
        || host_no_port.starts_with("172.31.")
    {
        return Err(ShioriError::Validation(format!(
            "{} must not target local/private network addresses",
            field
        )));
    }

    Ok(())
}

/// Validate a domain string against a list of allowed values.
pub fn require_one_of(value: &str, allowed: &[&str], field: &str) -> Result<()> {
    if !allowed.contains(&value) {
        return Err(ShioriError::Validation(format!(
            "{} must be one of {:?}, got '{}'",
            field, allowed, value
        )));
    }
    Ok(())
}

/// Validate that a vector is not empty.
pub fn require_non_empty_vec<T>(items: &[T], field: &str) -> Result<()> {
    if items.is_empty() {
        return Err(ShioriError::Validation(format!(
            "{} must not be empty",
            field
        )));
    }
    Ok(())
}
