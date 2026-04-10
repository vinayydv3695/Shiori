/// Shared conversion utilities: encoding detection, HTML sanitization, image processing.

use super::ConversionError;

// ──────────────────────────────────────────────────────────────────────────
// ENCODING DETECTION
// ──────────────────────────────────────────────────────────────────────────

/// Detect encoding of raw bytes and decode to String.
///
/// Strategy (matches calibre's approach):
/// 1. Try UTF-8
/// 2. Check for UTF-16 BOM (FF FE = LE, FE FF = BE)
/// 3. Use chardet heuristic fallback
/// 4. Final fallback: Windows-1252 (most common legacy Western encoding)
pub fn decode_text(raw: &[u8]) -> Result<String, ConversionError> {
    // 1. Try UTF-8
    if let Ok(s) = std::str::from_utf8(raw) {
        return Ok(s.to_string());
    }

    // 2. Check for UTF-16 BOM
    if raw.len() >= 2 {
        if raw[0] == 0xFF && raw[1] == 0xFE {
            // UTF-16 LE
            let (decoded, _, had_errors) = encoding_rs::UTF_16LE.decode(raw);
            if !had_errors {
                return Ok(decoded.into_owned());
            }
        } else if raw[0] == 0xFE && raw[1] == 0xFF {
            // UTF-16 BE
            let (decoded, _, had_errors) = encoding_rs::UTF_16BE.decode(raw);
            if !had_errors {
                return Ok(decoded.into_owned());
            }
        }
    }

    // 3. Use chardet
    let result = chardet::detect(raw);
    let charset = chardet::charset2encoding(&result.0);

    if let Some(encoding) = encoding_rs::Encoding::for_label(charset.as_bytes()) {
        let (decoded, _, _) = encoding.decode(raw);
        return Ok(decoded.into_owned());
    }

    // 4. Fallback: Windows-1252 (lossy)
    let (decoded, _, _) = encoding_rs::WINDOWS_1252.decode(raw);
    Ok(decoded.into_owned())
}

// ──────────────────────────────────────────────────────────────────────────
// LINE ENDING NORMALIZATION
// ──────────────────────────────────────────────────────────────────────────

/// Normalize all line endings to \n (LF).
pub fn normalize_line_endings(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

// ──────────────────────────────────────────────────────────────────────────
// SMART QUOTES (calibre's processor.py)
// ──────────────────────────────────────────────────────────────────────────

/// Apply smart typography: curly quotes, em-dashes, ellipsis.
pub fn smart_quotes(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();

    let mut i = 0;
    while i < len {
        let c = chars[i];
        let prev = if i > 0 { Some(chars[i - 1]) } else { None };

        match c {
            '"' => {
                // Open quote: after whitespace or start of line or after (
                let is_open = prev.is_none()
                    || prev.map_or(false, |p| p.is_whitespace() || p == '(' || p == '[' || p == '\n');
                result.push(if is_open { '\u{201C}' } else { '\u{201D}' }); // " or "
            }
            '\'' => {
                // Check for contractions (it's, don't, etc.)
                let next = chars.get(i + 1);
                let is_open = prev.is_none()
                    || prev.map_or(false, |p| p.is_whitespace() || p == '(' || p == '\n');
                let is_contraction = prev.map_or(false, |p| p.is_alphabetic())
                    && next.map_or(false, |n| n.is_alphabetic());

                if is_contraction {
                    result.push('\u{2019}'); // ' (right single / apostrophe)
                } else {
                    result.push(if is_open { '\u{2018}' } else { '\u{2019}' }); // ' or '
                }
            }
            '-' if i + 1 < len && chars[i + 1] == '-' => {
                // -- → em dash (—)
                if i + 2 < len && chars[i + 2] == '-' {
                    result.push('\u{2014}');
                    i += 3;
                    continue;
                }
                result.push('\u{2014}');
                i += 2;
                continue;
            }
            '.' if i + 2 < len && chars[i + 1] == '.' && chars[i + 2] == '.' => {
                result.push('\u{2026}'); // …
                i += 3;
                continue;
            }
            _ => {
                result.push(c);
            }
        }
        i += 1;
    }

    result
}

// ──────────────────────────────────────────────────────────────────────────
// HTML HELPERS
// ──────────────────────────────────────────────────────────────────────────

/// Wrap plain text paragraphs in <p> tags.
/// Double newlines are paragraph boundaries.
pub fn text_to_html_paragraphs(text: &str) -> String {
    text.split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .map(|p| {
            let clean = p.replace('\n', " ").trim().to_string();
            format!("  <p>{}</p>", super::epub_writer::escape_xml(&clean))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Strip HTML tags from content (simple regex-free approach)
pub fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }
    result
}

// ──────────────────────────────────────────────────────────────────────────
// IMAGE UTILITIES
// ──────────────────────────────────────────────────────────────────────────

/// Detect image format from magic bytes and return MIME type + extension
pub fn detect_image_format(data: &[u8]) -> Option<(&'static str, &'static str)> {
    if data.len() < 4 {
        return None;
    }
    if data[0] == 0xFF && data[1] == 0xD8 {
        Some(("image/jpeg", "jpg"))
    } else if data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
        Some(("image/png", "png"))
    } else if data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46 {
        Some(("image/gif", "gif"))
    } else if data[0..4] == [0x52, 0x49, 0x46, 0x46] && data.len() >= 12 && data[8..12] == [0x57, 0x45, 0x42, 0x50] {
        Some(("image/webp", "webp"))
    } else {
        None
    }
}

// ──────────────────────────────────────────────────────────────────────────
// SCENE BREAK DETECTION
// ──────────────────────────────────────────────────────────────────────────

/// Check if a line is a scene break marker
pub fn is_scene_break(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return false;
    }
    // Common scene break patterns
    matches!(
        trimmed,
        "***" | "* * *" | "---" | "- - -" | "___" | "_ _ _"
        | "###" | "# # #" | "* * * *" | "~ ~ ~" | "~~~"
        | "—" | "——" | "———"
    ) || (trimmed.len() <= 10 && trimmed.chars().all(|c| c == '*' || c == '-' || c == '_' || c == '~' || c == '#' || c == ' '))
}
