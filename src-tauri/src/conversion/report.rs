/// Conversion report — the structured, human-readable outcome of a conversion.
///
/// Every conversion produces one. The UI shows it post-conversion:
/// warnings ("this PDF was converted in fixed-layout mode because 12 pages
/// have no text layer"), heuristics that ran, and a confidence score.
/// Codes are stable identifiers the UI can localize.
use serde::{Deserialize, Serialize};

/// Severity of a report item.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReportLevel {
    Info,
    Warning,
}

/// One structured report item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportItem {
    pub level: ReportLevel,
    /// Stable machine code, e.g. "fixed_layout_fallback", "encoding_guess".
    pub code: String,
    pub message: String,
}

impl ReportItem {
    pub fn info(code: &str, message: impl Into<String>) -> Self {
        Self {
            level: ReportLevel::Info,
            code: code.to_string(),
            message: message.into(),
        }
    }

    pub fn warn(code: &str, message: impl Into<String>) -> Self {
        Self {
            level: ReportLevel::Warning,
            code: code.to_string(),
            message: message.into(),
        }
    }
}

/// Full conversion report (IR-SPEC §4).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConversionReport {
    pub warnings: Vec<ReportItem>,
    /// Human-readable tags of heuristics applied, e.g. "running-header-removal".
    pub heuristics_used: Vec<String>,
    /// Set when a fallback path was taken (e.g. "fixed-layout (image-only pages)").
    pub fallback_used: Option<String>,
    /// Overall confidence 0.0–1.0.
    pub confidence: f32,
    pub source_format: String,
    pub source_size_bytes: u64,
    pub duration_ms: u64,
    /// SHA-256 of the produced file (deterministic digest).
    pub output_sha256: Option<String>,
    pub toc_entries: usize,
    pub chapter_count: usize,
    pub image_count: usize,
}

impl ConversionReport {
    pub fn new(source_format: &str, source_size_bytes: u64) -> Self {
        Self {
            source_format: source_format.to_string(),
            source_size_bytes,
            confidence: 1.0,
            ..Default::default()
        }
    }

    /// Record a heuristic that ran. Informational; does not dent confidence.
    pub fn note_heuristic(&mut self, name: &str) {
        if !self.heuristics_used.iter().any(|h| h == name) {
            self.heuristics_used.push(name.to_string());
        }
    }

    pub fn info(&mut self, code: &'static str, message: impl Into<String>) {
        self.warnings.push(ReportItem::info(code, message));
    }

    pub fn warn(&mut self, code: &'static str, message: impl Into<String>) {
        self.warnings.push(ReportItem::warn(code, message));
        // Warnings visibly reduce confidence.
        self.confidence = (self.confidence * 0.9).max(0.3);
    }

    /// Set a fallback mode (fixed-layout, ocr-less scan passthrough …).
    pub fn set_fallback(&mut self, mode: &str, message: impl Into<String>) {
        self.fallback_used = Some(mode.to_string());
        self.warn("fallback_used", message);
    }
}