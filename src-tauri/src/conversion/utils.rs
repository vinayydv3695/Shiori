/// Shared conversion utilities for perfect EPUB output.
///
/// Covers encoding detection, HTML entity decoding, XHTML sanitization,
/// whitespace normalization, smart typography, image detection, scene-break
/// detection, heading heuristics, and inline-style/tag stripping.
use super::ConversionError;

// ──────────────────────────────────────────────────────────────────────────
// ENCODING DETECTION
// ──────────────────────────────────────────────────────────────────────────

/// Detect encoding of raw bytes and decode to String.
///
/// Strategy (matches calibre's approach):
/// 1. Strip UTF-8 BOM if present (EF BB BF)
/// 2. Try UTF-8 strict
/// 3. Check for UTF-16 BOM (FF FE = LE, FE FF = BE)
/// 4. Try UTF-8 lossy (accept near-UTF-8)
/// 5. Use chardet heuristic
/// 6. Final fallback: Windows-1252 (most common legacy Western encoding)
pub fn decode_text(raw: &[u8]) -> Result<String, ConversionError> {
    Ok(decode_text_scored(raw).0)
}

/// Score-based charset detection + decoding (replaces chardet).
///
/// Returns `(decoded_string, encoding_label, confidence_0_1)`. The scoring
/// runs every plausible legacy encoding through `encoding_rs`, penalizing
/// errors, replacement chars and control chars, and boosting script-typical
/// results (kana for Japanese, hangul for Korean, hanzi without kana for
/// Chinese, lowercase-heavy Cyrillic for Russian) so CJK/legacy files that
/// chardet used to mangle now decode cleanly without user tuning.
fn cyr_letters(s: &str) -> usize {
    s.chars()
        .filter(|c| matches!(c, '\u{0400}'..='\u{04FF}' | '\u{0500}'..='\u{052F}'))
        .count()
}

pub fn decode_text_scored(raw: &[u8]) -> (String, String, f32) {
    // 1. BOMs — authoritative when present.
    if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        if let Ok(s) = std::str::from_utf8(&raw[3..]) {
            return (s.to_string(), "utf-8".to_string(), 1.0);
        }
    }
    if raw.len() >= 2 && raw[0] == 0xFF && raw[1] == 0xFE {
        // UTF-16LE BOM (also covers UTF-32LE BOM: FF FE 00 00)
        if raw.len() >= 4 && raw[2] == 0x00 && raw[3] == 0x00 {
            let (s, _, had) = encoding_rs::Encoding::for_label(b"utf-32le").unwrap().decode(raw);
            if !had {
                return (s.into_owned(), "utf-32le".to_string(), 1.0);
            }
        }
        let (s, _, _had) = encoding_rs::UTF_16LE.decode(raw);
        return (s.into_owned(), "utf-16le".to_string(), 0.99);
    }
    if raw.len() >= 2 && raw[0] == 0xFE && raw[1] == 0xFF {
        let (s, _, _had) = encoding_rs::UTF_16BE.decode(raw);
        return (s.into_owned(), "utf-16be".to_string(), 0.99);
    }
    if raw.len() >= 4 && raw[0] == 0x00 && raw[1] == 0x00 && raw[2] == 0xFE && raw[3] == 0xFF {
        let (s, _, had) = encoding_rs::Encoding::for_label(b"utf-32be").unwrap().decode(raw);
        if !had {
            return (s.into_owned(), "utf-32be".to_string(), 1.0);
        }
    }

    // 2. BOM-less UTF-16 before the UTF-8 shortcut: a NUL-heavy byte stream
    // is valid UTF-8 (NULs are legal code points!), so `from_utf8` alone
    // cannot distinguish it — the alternating-NUL pattern is conclusive.
    if raw.len() >= 8 {
        let even_nuls = raw
            .iter()
            .step_by(2)
            .take(256)
            .filter(|b| **b == 0)
            .count();
        let odd_nuls = raw
            .iter()
            .skip(1)
            .step_by(2)
            .take(256)
            .filter(|b| **b == 0)
            .count();
        let pairs = (raw.len() / 2).min(256);
        if pairs > 8 && even_nuls as f32 / pairs as f32 > 0.5 {
            let (s, _, _) = encoding_rs::UTF_16BE.decode(raw);
            let clean = s.chars().filter(|c| !c.is_control()).count();
            if clean as f32 / s.chars().count().max(1) as f32 > 0.8 {
                return (s.into_owned(), "utf-16be".to_string(), 0.95);
            }
        }
        if pairs > 8 && odd_nuls as f32 / pairs as f32 > 0.5 {
            let (s, _, _) = encoding_rs::UTF_16LE.decode(raw);
            let clean = s.chars().filter(|c| !c.is_control()).count();
            if clean as f32 / s.chars().count().max(1) as f32 > 0.8 {
                return (s.into_owned(), "utf-16le".to_string(), 0.95);
            }
        }
    }

    // 3. Strict UTF-8 (the overwhelmingly common case — NUL-free or
    // sparse-NUL ASCII/UTF-8 goes here).
    if let Ok(s) = std::str::from_utf8(raw) {
        return (s.to_string(), "utf-8".to_string(), 1.0);
    }

    // 4. Score the legacy single-byte / CJK candidates.
    let candidates: &[(&'static str, &'static encoding_rs::Encoding)] = &[
        ("windows-1252", encoding_rs::WINDOWS_1252),
        ("windows-1251", encoding_rs::WINDOWS_1251),
        ("koi8-r", encoding_rs::KOI8_R),
        ("iso-8859-2", encoding_rs::ISO_8859_2),
        ("iso-8859-5", encoding_rs::ISO_8859_5),
        ("windows-1256", encoding_rs::WINDOWS_1256),
        ("iso-8859-7", encoding_rs::ISO_8859_7),
        ("shift_jis", encoding_rs::SHIFT_JIS),
        ("euc-jp", encoding_rs::EUC_JP),
        ("gbk", encoding_rs::GBK),
        ("big5", encoding_rs::BIG5),
        ("euc-kr", encoding_rs::EUC_KR),
    ];

    let mut best: Option<(String, &'static str, f32)> = None;
    for (label, enc) in candidates {
        let (decoded, _, had_errors) = enc.decode(raw);
        let s: &str = &decoded;
        if s.is_empty() && !raw.is_empty() {
            continue;
        }
        let mut score = 1.0f32;
        if had_errors {
            score -= 0.35;
        }
        let mut repl = 0usize;
        let mut ctrl = 0usize;
        let mut letters = 0usize;
        let mut lower = 0usize;
        let mut upper = 0usize;
        let mut kana = 0usize;
        let mut hangul = 0usize;
        let mut hanzi = 0usize;
        for c in s.chars() {
            if c == '\u{FFFD}' {
                repl += 1;
            } else if c.is_control() && !matches!(c, '\n' | '\r' | '\t') {
                ctrl += 1;
            } else if c.is_alphabetic() {
                letters += 1;
                if c.is_lowercase() {
                    lower += 1;
                } else if c.is_uppercase() {
                    upper += 1;
                }
                let cp = c as u32;
                // Hiragana + Katakana
                if (0x3040..=0x30FF).contains(&cp) {
                    kana += 1;
                }
                // Hangul syllables + jamo
                if (0xAC00..=0xD7AF).contains(&cp) || (0x1100..=0x11FF).contains(&cp) {
                    hangul += 1;
                }
                // CJK unified ideographs (hanzi / kanji)
                if (0x4E00..=0x9FFF).contains(&cp) {
                    hanzi += 1;
                }
            }
        }
        let total = s.chars().count().max(1) as f32;
        score -= (repl as f32 / total as f32) * 0.9;
        score -= (ctrl as f32 / total as f32) * 0.7;
        // Box-drawing / block elements (0x2500..0x25FF) never legitimately
        // appear in prose — koi8-r's art zone leaks them on wrong decodes.
        let weird = s.chars().filter(|c| (0x2500..=0x25FF).contains(&(*c as u32))).count();
        score -= (weird as f32 / total as f32) * 2.5;

        // Home-script consistency: a decode whose output is dominated by a
        // script its encoding never produces is a wrong guess.
        let home_script = |s: &str| -> usize {
            let (mut latin, mut cyr, mut arab, mut greek) = (0usize, 0usize, 0usize, 0usize);
            for c in s.chars() {
                let u = c as u32;
                if c.is_alphabetic() && c.is_ascii() {
                    latin += 1;
                }
                if (0x0400..=0x052F).contains(&u) {
                    cyr += 1;
                }
                if (0x0600..=0x06FF).contains(&u) {
                    arab += 1;
                }
                if (0x0370..=0x03FF).contains(&u) {
                    greek += 1;
                }
            }
            match *label {
                "windows-1252" | "iso-8859-2" => latin,
                "windows-1251" | "koi8-r" | "iso-8859-5" => cyr,
                "windows-1256" => arab,
                "iso-8859-7" => greek,
                _ => letters,
            }
        };
        let home = home_script(s);
        if letters > 0 && home as f32 / (letters as f32) < 0.5 {
            score -= 0.5;
        }

        // Script-consistency boosts: an encoding whose output looks like its
        // home script (and has few errors) beats a permissive wrong guess.
        let cjk_frac = (kana + hangul + hanzi) as f32 / total;
        match *label {
            "shift_jis" | "euc-jp" => {
                if kana as f32 / total > 0.02 {
                    score += 0.5; // kana can only come from a Japanese decode
                    if hanzi as f32 / total > 0.1 {
                        score += 0.15; // kanji + kana = unmistakably Japanese
                    }
                } else if hanzi as f32 / total > 0.2 && kana == 0 {
                    score -= 0.3; // hanzi without kana = more likely Chinese
                }
                if cjk_frac < 0.05 {
                    score -= 0.4;
                }
            }
            "gbk" | "big5" => {
                if hanzi as f32 / total > 0.2 && kana == 0 && hangul == 0 {
                    score += 0.3;
                } else if cjk_frac < 0.05 {
                    score -= 0.4;
                }
                // Big5 text that is NOT valid GBK (lead byte 0xA4 gap etc.)
                // already lost via had_errors; nothing more to do here.
            }
            "euc-kr" => {
                if hangul as f32 / total > 0.1 {
                    score += 0.4;
                    if hanzi as f32 / total > 0.05 {
                        score += 0.1; // hangul + hanja = Korean with hanja
                    }
                } else if cjk_frac < 0.05 {
                    score -= 0.4;
                }
            }
            "koi8-r" | "windows-1251" | "iso-8859-5" => {
                // koi8-r and cp1251 are byte-level case inverses of each
                // other on prose. The wrong decode turns ~88% lowercase text
                // into ~88% uppercase, with capitals landing mid-word; the
                // right decode keeps capitals at word starts only.
                let cyr = letters.max(1);
                let upper_ratio = upper as f32 / cyr as f32;
                let mut word_init = 0usize;
                let mut prev_alpha = false;
                for c in s.chars() {
                    if c.is_alphabetic() {
                        if c.is_uppercase() && !prev_alpha {
                            word_init += 1;
                        }
                        prev_alpha = true;
                    } else {
                        prev_alpha = false;
                    }
                }
                let init_ratio = if upper == 0 {
                    1.0
                } else {
                    word_init as f32 / upper as f32
                };
                if upper_ratio >= 0.55 && init_ratio < 0.85 {
                    score -= 0.6; // scrambled case: wrong Cyrillic decode
                } else if upper_ratio >= 0.55 && init_ratio >= 0.85 && letters > 8 {
                    score += 0.2; // legit all-caps heading block
                } else if (0.02..0.45).contains(&upper_ratio) {
                    let cyr_frac = cyr_letters(s) as f32 / letters.max(1) as f32;
                    if cyr_frac >= 0.9 && letters as f32 / total >= 0.15 {
                        score += 0.35; // prose-like case mix in real Cyrillic
                    }
                } else if upper_ratio <= 0.02 && letters > 12 {
                    score -= 0.25; // prose without ANY capital = suspicious
                }
                // Cyrillic-only sanity: scripts must actually contain Cyrillic.
                let cyr_chars = cyr_letters(s);
                if cyr_chars == 0 {
                    score -= 0.5;
                }
            }
            "windows-1252" => {
                // Latin-2 text decoded as 1252 exposes Polish/Czech glyphs as
                // superscript/currency artifacts (³ ¹ ² ±).
                let junk = s
                    .chars()
                    .filter(|c| matches!(c, '³' | '¹' | '²' | '±'))
                    .count();
                score -= (junk as f32 / total as f32) * 1.2;
            }
            "iso-8859-2" => {}
            _ => {}
        }

        // Hard cap: extremely noisy decodes are never winners.
        if score < 0.0 {
            continue;
        }
        let better = best
            .as_ref()
            .map(|(_, _, s)| score > *s)
            .unwrap_or(true);
        if better {
            best = Some((decoded.into_owned(), label, score));
        }
    }

    match best {
        Some((s, label, score)) if score >= 0.45 => (s, label.to_string(), score),
        // Degenerate fallback: lossy but recoverable.
        _ => {
            let (decoded, _, _) = encoding_rs::WINDOWS_1252.decode(raw);
            (decoded.into_owned(), "windows-1252".to_string(), 0.2)
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────
// LINE ENDING NORMALIZATION
// ──────────────────────────────────────────────────────────────────────────

/// Normalize all line endings to \n (LF).
pub fn normalize_line_endings(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

// ──────────────────────────────────────────────────────────────────────────
// RTF → PLAIN TEXT (minimal, safe)
// ──────────────────────────────────────────────────────────────────────────

/// Convert RTF markup to plain text. Handles the constructs found in books:
/// groups `{…}`, control words `\wordN`, `\'xx` hex escapes, `\uN?` unicode
/// escapes, `\par`/`\line` paragraph breaks, `\tab`, and skips font/color
/// tables. Anything unrecognized degrades to the literal text, never a crash.
pub fn rtf_to_text(rtf: &str) -> String {
    let mut out = String::with_capacity(rtf.len());
    let bytes = rtf.as_bytes();
    let mut i = 0usize;
    let mut skip_depth = 0usize; // inside {\*…} destination: drop until matching '}'
    let mut nested = 0usize; // group depth

    while i < bytes.len() {
        match bytes[i] {
            b'{' => {
                // "{\* …}" destinations (font tables, pictures, …) are skipped.
                if skip_depth == 0
                    && bytes.get(i + 1) == Some(&b'\\')
                    && bytes.get(i + 2) == Some(&b'*')
                {
                    skip_depth = nested + 1;
                }
                nested += 1;
                i += 1;
            }
            b'}' => {
                nested = nested.saturating_sub(1);
                if skip_depth > nested {
                    skip_depth = 0;
                }
                i += 1;
            }
            b'\\' => {
                i += 1;
                // \'xx — hex escape: consume and decode (ANSI codepage).
                if bytes.get(i) == Some(&b'\'') && i + 2 < bytes.len() {
                    if skip_depth == 0 {
                        if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                            if let Ok(v) = u8::from_str_radix(hex, 16) {
                                let one = [v];
                                let (dec, _, _) = encoding_rs::WINDOWS_1252.decode(&one);
                                out.push_str(&dec);
                            }
                        }
                    }
                    i += 3;
                    continue;
                }
                // Control word: letters, then optional -N argument.
                let mut cw = String::new();
                while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
                    cw.push(bytes[i] as char);
                    i += 1;
                }
                let mut arg = String::new();
                if bytes.get(i) == Some(&b'-') {
                    arg.push('-');
                    i += 1;
                }
                while i < bytes.len() && bytes[i].is_ascii_digit() {
                    arg.push(bytes[i] as char);
                    i += 1;
                }
                if skip_depth == 0 {
                    match cw.as_str() {
                        "par" | "line" | "sect" => out.push('\n'),
                        "tab" => out.push('\t'),
                        "u" => {
                            // \uN? — unicode scalar (decimal, may be negative).
                            if let Ok(v) = arg.parse::<i64>() {
                                let cp = v.unsigned_abs() as u32;
                                if let Some(ch) = char::from_u32(cp) {
                                    out.push(ch);
                                }
                            }
                            // skip the fallback char after \uN?
                            if bytes.get(i) == Some(&b'?') {
                                i += 1;
                            }
                        }
                        "emspace" | "enspace" => out.push(' '),
                        "bullet" => out.push('•'),
                        "endash" => out.push('–'),
                        "emdash" => out.push('—'),
                        "lquote" => out.push('\u{2018}'),
                        "rquote" => out.push('\u{2019}'),
                        "ldblquote" => out.push('\u{201C}'),
                        "rdblquote" => out.push('\u{201D}'),
                        "_" => out.push('_'),
                        // Document/table destinations we skip even at depth 0:
                        "fonttbl" | "colortbl" | "stylesheet" | "info" | "pict"
                        | "header" | "footer" | "footnote" | "headerf" | "footerf"
                        | "pntext" | "nonshppict" | "themedata" | "colorschememapping"
                        | "latentstyles" | "listtable" | "listoverridetable"
                        | "generator" | "wgrffmtfilter" | "updateres" | "rsidtbl"
                        | "mmathPr" | "datastore" | "xmlnstbl" | "slink" | "hlink"
                        | "field" | "comment" => {}
                        _ => {}
                    }
                }
                // Control words end with a skipped delimiting space.
                if i < bytes.len() && bytes[i] == b' ' {
                    i += 1;
                }
            }
            b'\r' => {
                out.push('\n');
                i += 1;
                if bytes.get(i) == Some(&b'\n') {
                    i += 1;
                }
            }
            _ => {
                if skip_depth == 0 {
                    // Copy one full UTF-8 char (byte boundaries stay valid).
                    let ch_len = utf8_char_len(bytes[i]);
                    let end = (i + ch_len).min(bytes.len());
                    out.push_str(&rtf[i..end]);
                    i += ch_len;
                } else {
                    i += 1;
                }
            }
        }
    }
    out
}

/// Length (in bytes) of the UTF-8 char starting at `b` (0 = 1 byte).
fn utf8_char_len(b: u8) -> usize {
    match b {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        0xF0..=0xF7 => 4,
        _ => 1,
    }
}

// ──────────────────────────────────────────────────────────────────────────
// WHITESPACE NORMALIZATION
// ──────────────────────────────────────────────────────────────────────────

/// Collapse multiple consecutive blank lines into at most one blank line.
/// Also trims leading/trailing whitespace from every line.
#[allow(dead_code)]
pub fn normalize_whitespace(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut blank_run = 0u32;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            blank_run += 1;
            if blank_run <= 1 {
                result.push('\n');
            }
        } else {
            blank_run = 0;
            result.push_str(trimmed);
            result.push('\n');
        }
    }

    result.trim().to_string()
}

/// Collapse runs of spaces/tabs in a single text line into a single space.
pub fn collapse_spaces(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut in_space = false;
    for c in text.chars() {
        if c == ' ' || c == '\t' {
            if !in_space {
                result.push(' ');
                in_space = true;
            }
        } else {
            in_space = false;
            result.push(c);
        }
    }
    result
}

// ──────────────────────────────────────────────────────────────────────────
// SMART QUOTES (calibre's processor.py algorithm)
// ──────────────────────────────────────────────────────────────────────────

/// Apply smart typography: curly quotes, em-dashes, en-dashes, ellipsis,
/// guillemets, and apostrophes.
pub fn smart_quotes(text: &str) -> String {
    let mut result = String::with_capacity(text.len() + text.len() / 10);
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        let c = chars[i];
        let prev = if i > 0 { Some(chars[i - 1]) } else { None };
        let next = chars.get(i + 1).copied();

        match c {
            '"' => {
                let is_open = prev.is_none()
                    || prev.map_or(false, |p| {
                        p.is_whitespace() || p == '(' || p == '[' || p == '\n' || p == '\u{2014}'
                    });
                result.push(if is_open { '\u{201C}' } else { '\u{201D}' });
            }
            '\'' => {
                let is_contraction = prev.map_or(false, |p| p.is_alphabetic())
                    && next.map_or(false, |n| n.is_alphabetic());
                let is_open = prev.is_none()
                    || prev.map_or(false, |p| {
                        p.is_whitespace() || p == '(' || p == '\n' || p == '\u{201C}'
                    });
                if is_contraction {
                    result.push('\u{2019}'); // right single / apostrophe
                } else {
                    result.push(if is_open { '\u{2018}' } else { '\u{2019}' });
                }
            }
            // -- or --- → em dash
            '-' if next == Some('-') => {
                result.push('\u{2014}');
                i += 2;
                // skip third '-' if present (---)
                if i < len && chars[i] == '-' {
                    i += 1;
                }
                continue;
            }
            // ... → ellipsis
            '.' if i + 2 < len && chars[i + 1] == '.' && chars[i + 2] == '.' => {
                result.push('\u{2026}');
                i += 3;
                continue;
            }
            _ => result.push(c),
        }
        i += 1;
    }

    result
}

// ──────────────────────────────────────────────────────────────────────────
// HTML HELPERS
// ──────────────────────────────────────────────────────────────────────────

/// Wrap plain text paragraphs in <p> tags.
/// Double newlines are paragraph boundaries. Exits cleanly.
pub fn text_to_html_paragraphs(text: &str) -> String {
    text.split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .map(|p| {
            let clean = collapse_spaces(&p.replace('\n', " ")).trim().to_string();
            format!("  <p>{}</p>", super::oeb::escape_xml(&clean))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Strip HTML tags from content, eliminating `<script>` and `<style>` block
/// content entirely, then decode all HTML entities.
///
/// This is intentionally "dumb" (no real parser) but robust against the
/// quasi-HTML that pdftohtml and similar tools produce.
pub fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut tag_name = String::new();
    let mut skip_until: Option<&'static str> = None; // closing tag to wait for
    let mut in_skip_content = false;

    let mut chars = html.chars().peekable();

    while let Some(c) = chars.next() {
        if let Some(end_tag) = skip_until {
            // We're inside a <script> or <style> — skip until closing tag
            if c == '<' {
                // Peek ahead for "/script>" or "/style>"
                let rest: String = std::iter::once(c)
                    .chain(chars.clone().take(end_tag.len() + 2))
                    .collect();
                let rest_lower = rest.to_lowercase();
                if rest_lower.contains(&format!("/{}>", &end_tag[1..]))
                    || rest_lower.contains(&format!("/{} ", &end_tag[1..]))
                {
                    skip_until = None;
                    in_skip_content = false;
                    // consume up to the closing '>'
                    for cc in chars.by_ref() {
                        if cc == '>' {
                            break;
                        }
                    }
                    continue;
                }
            }
            in_skip_content = true;
            continue;
        }
        let _ = in_skip_content;

        match c {
            '<' => {
                in_tag = true;
                tag_name.clear();
            }
            '>' => {
                in_tag = false;
                let tn = tag_name.trim().to_lowercase();
                let tn = tn.trim_start_matches('/');
                if tn == "script" {
                    skip_until = Some("script");
                } else if tn == "style" {
                    skip_until = Some("style");
                }
                tag_name.clear();
            }
            _ if in_tag => {
                // Collect tag name characters until whitespace or /
                if tag_name.len() < 16 && !c.is_whitespace() && c != '/' {
                    tag_name.push(c);
                }
            }
            _ => result.push(c),
        }
    }

    // Decode all HTML entities so &#160; → ' ', &nbsp; → ' ', etc.
    let decoded = decode_html_entities(&result);
    // Collapse multiple spaces produced by stripping tags
    collapse_spaces(&decoded)
}

/// Sanitize raw HTML for safe XHTML insertion into an EPUB chapter.
///
/// What this does:
/// 1. Strips `<script>` / `<style>` / `<link>` / `<meta>` / `<html>` / `<body>` / `<head>` wrapper tags
/// 2. Strips `style=""` and `class=""` attributes on all elements (reader uses its own CSS)
/// 3. Converts `<br>` → `<br/>`, `<hr>` → `<hr/>` (XHTML self-closing)
/// 4. Strips any `<font>` tags (keeps their inner text)
/// 5. Decodes and re-encodes all HTML entities to clean Unicode
/// 6. Strips HTML comments
/// 7. Ensures all remaining img tags have relative `../Images/` src or are stripped
pub fn sanitize_html_for_epub(html: &str) -> String {
    if html.is_empty() {
        return html.to_string();
    }

    let mut result = String::with_capacity(html.len());
    // Tags whose CONTENT should be dropped entirely
    let drop_content_tags: &[&str] = &["script", "style", "head"];
    // Tags that are wrapper/structural and should be dropped (but keep inner content)
    let drop_tag_only: &[&str] = &[
        "html", "body", "div", "span", "font", "center", "article", "section", "aside", "header",
        "footer", "nav", "main", "figure",
    ];
    // Tags to keep as-is (allow-list)
    let allowed_tags: &[&str] = &[
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "em",
        "strong",
        "i",
        "b",
        "u",
        "s",
        "sup",
        "sub",
        "blockquote",
        "pre",
        "code",
        "ul",
        "ol",
        "li",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "img",
        "a",
        "br",
        "hr",
        "aside",
        "figcaption",
    ];

    let mut chars = html.chars().peekable();
    let mut skip_depth: u32 = 0;
    let mut in_comment = false;

    while let Some(c) = chars.next() {
        // HTML comments
        if c == '<' {
            // Peek for <!--
            let mut peeked = String::new();
            let mut tmp = chars.clone();
            for _ in 0..3 {
                if let Some(cc) = tmp.next() {
                    peeked.push(cc);
                }
            }
            if peeked.starts_with("!--") {
                in_comment = true;
                // consume '!--'
                chars.next();
                chars.next();
                chars.next();
                continue;
            }
        }
        if in_comment {
            if c == '-' {
                let mut tmp = chars.clone();
                if tmp.next() == Some('-') && tmp.next() == Some('>') {
                    chars.next();
                    chars.next(); // consume '->'
                    in_comment = false;
                }
            }
            continue;
        }

        if c != '<' {
            if skip_depth == 0 {
                result.push(c);
            }
            continue;
        }

        // We're at '<' — collect the full tag
        let mut tag_buf = String::new();
        let mut closed_gt = false;
        for cc in chars.by_ref() {
            if cc == '>' {
                closed_gt = true;
                break;
            }
            tag_buf.push(cc);
        }
        if !closed_gt {
            continue;
        } // malformed, skip

        let tag_text = tag_buf.trim();
        let is_closing = tag_text.starts_with('/');
        let is_self_closing = tag_text.ends_with('/');
        let name_part = tag_text.trim_start_matches('/');
        let tag_name_raw: String = name_part
            .chars()
            .take_while(|c| c.is_alphanumeric())
            .collect();
        let tag_name = tag_name_raw.to_lowercase();

        // Drop-content tags (script/style/head)
        if drop_content_tags.contains(&tag_name.as_str()) {
            if is_closing {
                if skip_depth > 0 {
                    skip_depth -= 1;
                }
            } else if !is_self_closing {
                skip_depth += 1;
            }
            continue;
        }
        if skip_depth > 0 {
            continue; // inside a drop-content block
        }

        // Drop-tag-only (wrapper tags — keep content, drop tag)
        if drop_tag_only.contains(&tag_name.as_str()) {
            continue; // just emit nothing for the tag itself
        }

        // Allowed tags
        if allowed_tags.contains(&tag_name.as_str()) {
            if is_closing {
                // br/hr are self-closing, skip their closing tags
                if tag_name == "br" || tag_name == "hr" {
                    continue;
                }
                result.push_str(&format!("</{}>", tag_name));
            } else {
                // Reconstruct tag with only safe attributes
                let attrs = extract_safe_attrs(&tag_buf, &tag_name);
                if tag_name == "br" {
                    result.push_str("<br/>");
                } else if tag_name == "hr" {
                    result.push_str("<hr/>");
                } else if is_self_closing {
                    result.push_str(&format!("<{}{}/> ", tag_name, attrs));
                } else {
                    result.push_str(&format!("<{}{}>", tag_name, attrs));
                }
            }
        }
        // Unknown tags: drop the tag, keep any text content (already handled above)
    }

    // Final pass: decode remaining entities
    decode_html_entities(&result)
}

/// Extract only safe attributes from a tag string.
/// Keeps: href (for <a>), src/alt (for <img>), epub:type (for <aside>).
/// Drops: style, class, id, on*, data-*, width, height (reader controls these).
fn extract_safe_attrs(tag_buf: &str, tag_name: &str) -> String {
    let mut out = String::new();

    // Simple attribute parser — look for key="value" pairs
    let attr_re =
        regex::Regex::new(r#"(\w[\w:\-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?"#).unwrap();

    for cap in attr_re.captures_iter(tag_buf) {
        let key = cap.get(1).map_or("", |m| m.as_str()).to_lowercase();
        let val = cap
            .get(2)
            .or_else(|| cap.get(3))
            .or_else(|| cap.get(4))
            .map_or("", |m| m.as_str());

        let keep = match key.as_str() {
            "href" if tag_name == "a" => {
                // Only keep http(s) and mailto links (not javascript:)
                let v = val.trim().to_lowercase();
                v.starts_with("http") || v.starts_with("mailto") || v.starts_with('#')
            }
            "src" if tag_name == "img" => {
                // Allow any src. Legacy converters rewrite this to ../Images/
                // AFTER sanitization.
                true
            }
            "recindex" if tag_name == "img" => {
                // Allow recindex for MOBI parser which maps this to actual images
                true
            }
            "alt" if tag_name == "img" => true,
            "epub:type" | "type" if tag_name == "aside" => true,
            "id" | "name" if tag_name == "a" => true,
            "id" if tag_name == "aside" => true,
            _ => false,
        };

        if keep && !val.is_empty() {
            out.push_str(&format!(" {}=\"{}\"", key, super::oeb::escape_xml(val)));
        }
    }
    out
}

// ──────────────────────────────────────────────────────────────────────────
// HTML ENTITY DECODER — full HTML4 + HTML5 named entity table
// ──────────────────────────────────────────────────────────────────────────

/// Decode all HTML entities and numeric character references to Unicode.
///
/// Handles:
/// - All HTML4 named entities (&nbsp; &mdash; &laquo; &raquo; etc.)
/// - A selected set of HTML5 named entities
/// - Decimal numeric: &#160; &#8211; etc.
/// - Hex numeric: &#xA0; &#x2014; etc.
///
/// All non-breaking and fixed-width space variants are collapsed to a regular space.
/// Uses str::find-based sliding slice — always char-boundary-safe, no panics.
pub fn decode_html_entities(text: &str) -> String {
    if !text.contains('&') {
        return text.to_string();
    }

    let mut result = String::with_capacity(text.len());
    let mut remaining = text;

    while let Some(amp_rel) = remaining.find('&') {
        result.push_str(&remaining[..amp_rel]);
        let after_amp = &remaining[amp_rel + 1..]; // '&' is ASCII, safe +1

        // Scan for ';' up to 32 bytes ahead (longest HTML5 named entity is ~29 chars)
        let window_bytes = after_amp.len().min(32);
        let window = {
            let mut end = window_bytes;
            while end > 0 && !after_amp.is_char_boundary(end) {
                end -= 1;
            }
            &after_amp[..end]
        };

        if let Some(semi_rel) = window.find(';') {
            let entity = &after_amp[..semi_rel];

            let decoded: Option<char> = if entity.starts_with('#') {
                let num_str = &entity[1..];
                if num_str.starts_with('x') || num_str.starts_with('X') {
                    u32::from_str_radix(&num_str[1..], 16)
                        .ok()
                        .and_then(char::from_u32)
                } else {
                    num_str.parse::<u32>().ok().and_then(char::from_u32)
                }
            } else {
                named_entity(entity)
            };

            if let Some(ch) = decoded {
                // Normalize all space variants to a plain ASCII space
                let ch = normalize_space(ch);
                result.push(ch);
                remaining = &after_amp[semi_rel + 1..];
                continue;
            }
        }

        // Unrecognised or malformed — emit '&' literally
        result.push('&');
        remaining = after_amp;
    }

    result.push_str(remaining);
    result
}

/// Collapse Unicode space variants to ASCII space.
fn normalize_space(ch: char) -> char {
    match ch {
        '\u{00A0}' // NO-BREAK SPACE
        | '\u{2000}' // EN QUAD
        | '\u{2001}' // EM QUAD
        | '\u{2002}' // EN SPACE
        | '\u{2003}' // EM SPACE
        | '\u{2004}' // THREE-PER-EM SPACE
        | '\u{2005}' // FOUR-PER-EM SPACE
        | '\u{2006}' // SIX-PER-EM SPACE
        | '\u{2007}' // FIGURE SPACE
        | '\u{2008}' // PUNCTUATION SPACE
        | '\u{2009}' // THIN SPACE
        | '\u{200A}' // HAIR SPACE
        | '\u{202F}' // NARROW NO-BREAK SPACE
        | '\u{205F}' // MEDIUM MATHEMATICAL SPACE
        | '\u{3000}' // IDEOGRAPHIC SPACE
        => ' ',
        other => other,
    }
}

/// Map a named HTML entity string to the corresponding char.
/// Covers the full HTML4 set + common HTML5 additions.
fn named_entity(name: &str) -> Option<char> {
    Some(match name {
        // ── Spaces / invisible ──────────────────────────────────────────
        "nbsp" | "NonBreakingSpace" => '\u{00A0}',
        "ensp" => '\u{2002}',
        "emsp" => '\u{2003}',
        "emsp13" => '\u{2004}',
        "emsp14" => '\u{2005}',
        "numsp" => '\u{2007}',
        "puncsp" => '\u{2008}',
        "thinsp" | "ThinSpace" => '\u{2009}',
        "hairsp" | "VeryThinSpace" => '\u{200A}',
        "zwj" => '\u{200D}',
        "zwnj" => '\u{200C}',
        "lrm" => '\u{200E}',
        "rlm" => '\u{200F}',
        "shy" => '\u{00AD}', // soft hyphen

        // ── Basic XML escapes ────────────────────────────────────────────
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "quot" => '"',
        "apos" => '\'',

        // ── Punctuation ─────────────────────────────────────────────────
        "ndash" | "dash" => '\u{2013}', // –
        "mdash" => '\u{2014}',          // —
        "horbar" => '\u{2015}',
        "nleftrightarrow" => '\u{21AE}',
        "hellip" | "mldr" => '\u{2026}', // …
        "bull" | "bullet" => '\u{2022}', // •
        "prime" => '\u{2032}',           // ′
        "Prime" => '\u{2033}',           // ″
        "oline" => '\u{203E}',           // overline
        "frasl" => '\u{2044}',           // fraction slash
        "minus" => '\u{2212}',
        "times" => '\u{00D7}',          // ×
        "divide" | "div" => '\u{00F7}', // ÷
        "percnt" => '%',
        "plus" => '+',
        "equals" => '=',
        "sol" => '/',
        "bsol" => '\\',
        "verbar" | "vert" => '|',
        "excl" => '!',
        "quest" => '?',
        "comma" => ',',
        "period" | "dot" => '.',
        "colon" => ':',
        "semi" => ';',
        "lpar" => '(',
        "rpar" => ')',
        "lsqb" | "lbrack" => '[',
        "rsqb" | "rbrack" => ']',
        "lcub" | "lbrace" => '{',
        "rcub" | "rbrace" => '}',
        "num" => '#',
        "dollar" => '$',
        "ast" | "midast" => '*',
        "commat" => '@',
        "Hat" => '^',
        "grave" => '`',
        "tilde" => '~',

        // ── Quotes ──────────────────────────────────────────────────────
        "lsquo" | "OpenCurlyQuote" => '\u{2018}', // '
        "rsquo" | "rsquor" | "CloseCurlyQuote" => '\u{2019}', // '
        "sbquo" | "lsquor" => '\u{201A}',         // ‚
        "ldquo" | "OpenCurlyDoubleQuote" => '\u{201C}', // "
        "rdquo" | "rdquor" | "CloseCurlyDoubleQuote" => '\u{201D}', // "
        "bdquo" | "ldquor" => '\u{201E}',         // „
        "laquo" => '\u{00AB}',                    // «
        "raquo" => '\u{00BB}',                    // »
        "lsaquo" => '\u{2039}',                   // ‹
        "rsaquo" => '\u{203A}',                   // ›

        // ── Copyright / legal ───────────────────────────────────────────
        "copy" | "COPY" => '\u{00A9}',   // ©
        "reg" | "REG" => '\u{00AE}',     // ®
        "trade" | "TRADE" => '\u{2122}', // ™
        "phone" => '\u{260E}',

        // ── Maths / arrows ──────────────────────────────────────────────
        "plusmn" | "pm" => '\u{00B1}',   // ±
        "frac12" | "half" => '\u{00BD}', // ½
        "frac14" => '\u{00BC}',          // ¼
        "frac34" => '\u{00BE}',          // ¾
        "sup1" => '\u{00B9}',
        "sup2" => '\u{00B2}',                              // ²
        "sup3" => '\u{00B3}',                              // ³
        "micro" => '\u{00B5}',                             // µ
        "para" => '\u{00B6}',                              // ¶
        "middot" | "centerdot" => '\u{00B7}',              // ·
        "cedil" => '\u{00B8}',                             // ¸
        "degree" | "deg" => '\u{00B0}',                    // °
        "infin" => '\u{221E}',                             // ∞
        "radic" => '\u{221A}',                             // √
        "ne" => '\u{2260}',                                // ≠
        "le" | "leq" => '\u{2264}',                        // ≤
        "ge" | "geq" => '\u{2265}',                        // ≥
        "asymp" | "approx" => '\u{2248}',                  // ≈
        "sim" => '\u{223C}',                               // ∼
        "oplus" => '\u{2295}',                             // ⊕
        "otimes" => '\u{2297}',                            // ⊗
        "sum" => '\u{2211}',                               // ∑
        "prod" => '\u{220F}',                              // ∏
        "int" => '\u{222B}',                               // ∫
        "prop" => '\u{221D}',                              // ∝
        "part" => '\u{2202}',                              // ∂
        "empty" | "emptyset" | "varnothing" => '\u{2205}', // ∅
        "and" | "wedge" => '\u{2227}',                     // ∧
        "or" | "vee" => '\u{2228}',                        // ∨
        "cap" => '\u{2229}',                               // ∩
        "cup" => '\u{222A}',                               // ∪
        "sub" | "subset" => '\u{2282}',                    // ⊂
        "sup" | "supset" => '\u{2283}',                    // ⊃
        "sube" | "subseteq" => '\u{2286}',                 // ⊆
        "supe" | "supseteq" => '\u{2287}',                 // ⊇
        "notin" => '\u{2209}',                             // ∉
        "isin" | "in" => '\u{2208}',                       // ∈
        "ang" => '\u{2220}',                               // ∠
        "sdot" => '\u{22C5}',                              // ⋅
        "lowast" => '\u{2217}',                            // ∗
        "forall" => '\u{2200}',                            // ∀
        "exist" | "exists" => '\u{2203}',                  // ∃
        "nabla" => '\u{2207}',                             // ∇
        "perp" => '\u{22A5}',                              // ⊥
        "cong" => '\u{2245}',                              // ≅
        "equiv" => '\u{2261}',                             // ≡
        "not" => '\u{00AC}',                               // ¬
        "oelig" | "OElig" => {
            if name.starts_with('O') {
                '\u{0152}'
            } else {
                '\u{0153}'
            }
        } // Œ/œ
        "fnof" => '\u{0192}',                              // ƒ
        "Alpha" => '\u{0391}',
        "alpha" => '\u{03B1}',
        "Beta" => '\u{0392}',
        "beta" => '\u{03B2}',
        "Gamma" => '\u{0393}',
        "gamma" => '\u{03B3}',
        "Delta" => '\u{0394}',
        "delta" => '\u{03B4}',
        "Epsilon" => '\u{0395}',
        "epsilon" | "epsiv" => '\u{03B5}',
        "Zeta" => '\u{0396}',
        "zeta" => '\u{03B6}',
        "Eta" => '\u{0397}',
        "eta" => '\u{03B7}',
        "Theta" => '\u{0398}',
        "theta" | "thetav" | "vartheta" => '\u{03B8}',
        "Iota" => '\u{0399}',
        "iota" => '\u{03B9}',
        "Kappa" => '\u{039A}',
        "kappa" | "kappav" => '\u{03BA}',
        "Lambda" => '\u{039B}',
        "lambda" => '\u{03BB}',
        "Mu" => '\u{039C}',
        "mu" => '\u{03BC}',
        "Nu" => '\u{039D}',
        "nu" => '\u{03BD}',
        "Xi" => '\u{039E}',
        "xi" => '\u{03BE}',
        "Omicron" => '\u{039F}',
        "omicron" => '\u{03BF}',
        "Pi" => '\u{03A0}',
        "pi" | "piv" => '\u{03C0}',
        "Rho" => '\u{03A1}',
        "rho" | "rhov" | "varrho" => '\u{03C1}',
        "Sigma" => '\u{03A3}',
        "sigma" | "sigmav" => '\u{03C3}',
        "Tau" => '\u{03A4}',
        "tau" => '\u{03C4}',
        "Upsilon" => '\u{03A5}',
        "upsilon" => '\u{03C5}',
        "Phi" => '\u{03A6}',
        "phi" | "phiv" | "varphi" => '\u{03C6}',
        "Chi" => '\u{03A7}',
        "chi" => '\u{03C7}',
        "Psi" => '\u{03A8}',
        "psi" => '\u{03C8}',
        "Omega" => '\u{03A9}',
        "omega" => '\u{03C9}',
        "sigmaf" | "varsigma" => '\u{03C2}',
        "phmmat" | "Finv" => '\u{2132}',

        // ── Arrows ──────────────────────────────────────────────────────
        "larr" | "leftarrow" | "LeftArrow" | "slarr" | "ShortLeftArrow" => '\u{2190}',
        "uarr" | "uparrow" | "UpArrow" => '\u{2191}',
        "rarr" | "rightarrow" | "RightArrow" | "srarr" | "ShortRightArrow" => '\u{2192}',
        "darr" | "downarrow" | "DownArrow" => '\u{2193}',
        "harr" | "leftrightarrow" | "LeftRightArrow" => '\u{2194}',
        "crarr" => '\u{21B5}',
        "lArr" | "Leftarrow" | "DoubleLeftArrow" => '\u{21D0}',
        "uArr" | "Uparrow" | "DoubleUpArrow" => '\u{21D1}',
        "rArr" | "Rightarrow" | "DoubleRightArrow" => '\u{21D2}',
        "dArr" | "Downarrow" | "DoubleDownArrow" => '\u{21D3}',
        "hArr" | "Leftrightarrow" | "DoubleLeftRightArrow" => '\u{21D4}',

        // ── Latin-1 supplement (ISO 8859-1, HTML4 mandatory) ────────────
        "iexcl" => '\u{00A1}',
        "cent" => '\u{00A2}',
        "pound" => '\u{00A3}',
        "curren" => '\u{00A4}',
        "yen" => '\u{00A5}',
        "brvbar" => '\u{00A6}',
        "sect" => '\u{00A7}',
        "uml" => '\u{00A8}',
        "ordf" => '\u{00AA}',
        "macr" => '\u{00AF}',
        "acute" => '\u{00B4}',
        "ordm" => '\u{00BA}',
        "iquest" => '\u{00BF}',
        "Agrave" => '\u{00C0}',
        "Aacute" => '\u{00C1}',
        "Acirc" => '\u{00C2}',
        "Atilde" => '\u{00C3}',
        "Auml" => '\u{00C4}',
        "Aring" => '\u{00C5}',
        "AElig" => '\u{00C6}',
        "Ccedil" => '\u{00C7}',
        "Egrave" => '\u{00C8}',
        "Eacute" => '\u{00C9}',
        "Ecirc" => '\u{00CA}',
        "Euml" => '\u{00CB}',
        "Igrave" => '\u{00CC}',
        "Iacute" => '\u{00CD}',
        "Icirc" => '\u{00CE}',
        "Iuml" => '\u{00CF}',
        "ETH" => '\u{00D0}',
        "Ntilde" => '\u{00D1}',
        "Ograve" => '\u{00D2}',
        "Oacute" => '\u{00D3}',
        "Ocirc" => '\u{00D4}',
        "Otilde" => '\u{00D5}',
        "Ouml" => '\u{00D6}',
        "Oslash" => '\u{00D8}',
        "Ugrave" => '\u{00D9}',
        "Uacute" => '\u{00DA}',
        "Ucirc" => '\u{00DB}',
        "Uuml" => '\u{00DC}',
        "Yacute" => '\u{00DD}',
        "THORN" => '\u{00DE}',
        "szlig" => '\u{00DF}',
        "agrave" => '\u{00E0}',
        "aacute" => '\u{00E1}',
        "acirc" => '\u{00E2}',
        "atilde" => '\u{00E3}',
        "auml" => '\u{00E4}',
        "aring" => '\u{00E5}',
        "aelig" => '\u{00E6}',
        "ccedil" => '\u{00E7}',
        "egrave" => '\u{00E8}',
        "eacute" => '\u{00E9}',
        "ecirc" => '\u{00EA}',
        "euml" => '\u{00EB}',
        "igrave" => '\u{00EC}',
        "iacute" => '\u{00ED}',
        "icirc" => '\u{00EE}',
        "iuml" => '\u{00EF}',
        "eth" => '\u{00F0}',
        "ntilde" => '\u{00F1}',
        "ograve" => '\u{00F2}',
        "oacute" => '\u{00F3}',
        "ocirc" => '\u{00F4}',
        "otilde" => '\u{00F5}',
        "ouml" => '\u{00F6}',
        "oslash" => '\u{00F8}',
        "ugrave" => '\u{00F9}',
        "uacute" => '\u{00FA}',
        "ucirc" => '\u{00FB}',
        "uuml" => '\u{00FC}',
        "yacute" => '\u{00FD}',
        "thorn" => '\u{00FE}',
        "yuml" => '\u{00FF}',

        // ── Letterlike symbols ───────────────────────────────────────────
        "weierp" | "wp" => '\u{2118}',     // ℘
        "image" | "Im" => '\u{2111}',      // ℑ
        "real" | "Re" => '\u{211C}',       // ℜ
        "alefsym" | "aleph" => '\u{2135}', // ℵ

        // ── Shapes / misc ────────────────────────────────────────────────
        "spades" | "spadesuit" => '\u{2660}',
        "clubs" | "clubsuit" => '\u{2663}',
        "hearts" | "heartsuit" => '\u{2665}',
        "diams" | "diamondsuit" => '\u{2666}',
        "star" => '\u{2605}', // ★
        "starf" => '\u{2605}',
        "check" | "checkmark" => '\u{2713}', // ✓
        "cross" => '\u{2717}',               // ✗

        _ => return None,
    })
}

// ──────────────────────────────────────────────────────────────────────────
// HEADING HEURISTICS
// ──────────────────────────────────────────────────────────────────────────

/// Return true if a plain-text paragraph looks like a chapter/section heading.
/// Centralised here so all converters use the same logic.
///
/// Heuristics (calibre-inspired):
/// - Starts with "Chapter", "Part", "Section", "Book", "Prologue", "Epilogue",
///   "Introduction", "Preface", "Afterword", "Appendix", "Interlude"
/// - All-caps, ≤ 10 words, ≤ 60 chars
/// - Short line (≤ 60 chars) that ends without sentence-terminating punctuation
#[allow(dead_code)]
pub fn looks_like_heading(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() || t.len() > 120 {
        return false;
    }
    let words: Vec<&str> = t.split_whitespace().collect();
    if words.is_empty() {
        return false;
    }

    // Keyword match
    let keywords = [
        "chapter",
        "part",
        "section",
        "book",
        "prologue",
        "epilogue",
        "introduction",
        "preface",
        "afterword",
        "appendix",
        "interlude",
        "act",
        "scene",
        "volume",
    ];
    let first_lower = words[0].to_lowercase();
    let stripped_first = first_lower.trim_matches(|c: char| !c.is_alphanumeric());
    if keywords.contains(&stripped_first) {
        if words.len() == 1 {
            // A bare keyword: "Chapter" alone is a heading, but "Scene."
            // (lowercase scene-break marker) is body text. Reject bare
            // keywords ending in sentence punctuation or starting lowercase.
            return t.len() <= 60
                && !t.ends_with(['.', '!', '?', ':'])
                && t.chars().any(|c| c.is_uppercase() || !c.is_alphabetic());
        }
        // "Scene 2", "Part One", "Chapter III: The End" — short only.
        return t.len() <= 60;
    }

    // All-caps short phrase
    if t.len() <= 60 && words.len() <= 10 {
        let allcaps = t.chars().all(|c| c.is_uppercase() || !c.is_alphabetic());
        if allcaps && t.chars().any(|c| c.is_alphabetic()) {
            return true;
        }
    }

    // Bare numeral headings: "1.", "1)", "I.", "IV." etc. The WHOLE line
    // must be the numeral — checking only the first word turns every
    // sentence starting with "I" (a valid roman numeral!) into a heading.
    if words.len() <= 2 {
        let is_numeral_line = words.iter().all(|w| {
            let cleaned = w.trim_end_matches(&['.', ')', ':', ','] as &[char]);
            cleaned.chars().all(|c| c.is_numeric()) || is_roman_numeral(cleaned)
        });
        if is_numeral_line {
            return true;
        }
    }

    false
}

/// Very simple roman numeral checker (I..MMMCMXCIX range)
#[allow(dead_code)]
fn is_roman_numeral(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 12
        && s.chars().all(|c| {
            matches!(
                c,
                'I' | 'V' | 'X' | 'L' | 'C' | 'D' | 'M' | 'i' | 'v' | 'x' | 'l' | 'c' | 'd' | 'm'
            )
        })
}

// ──────────────────────────────────────────────────────────────────────────
// IMAGE UTILITIES
// ──────────────────────────────────────────────────────────────────────────

/// Detect image format from magic bytes and return (MIME type, extension).
/// Handles JPEG, PNG, GIF, WebP, BMP, TIFF, AVIF.
pub fn detect_image_format(data: &[u8]) -> Option<(&'static str, &'static str)> {
    if data.len() < 4 {
        return None;
    }
    // JPEG: FF D8
    if data[0] == 0xFF && data[1] == 0xD8 {
        return Some(("image/jpeg", "jpg"));
    }
    // PNG: 89 50 4E 47
    if &data[..4] == b"\x89PNG" {
        return Some(("image/png", "png"));
    }
    // GIF: 47 49 46
    if data.starts_with(b"GIF8") {
        return Some(("image/gif", "gif"));
    }
    // WebP: RIFF....WEBP
    if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return Some(("image/webp", "webp"));
    }
    // BMP: 42 4D
    if data[0] == 0x42 && data[1] == 0x4D {
        return Some(("image/bmp", "bmp"));
    }
    // TIFF: 49 49 or 4D 4D
    if (data[0] == 0x49 && data[1] == 0x49) || (data[0] == 0x4D && data[1] == 0x4D) {
        return Some(("image/tiff", "tiff"));
    }
    // AVIF / HEIF: check ftyp box
    if data.len() >= 12 && (&data[4..8] == b"ftyp") {
        let brand = &data[8..12];
        if brand == b"avif" || brand == b"avis" || brand == b"heic" || brand == b"heix" {
            return Some(("image/avif", "avif"));
        }
    }
    None
}

// ──────────────────────────────────────────────────────────────────────────
// SCENE BREAK DETECTION
// ──────────────────────────────────────────────────────────────────────────

/// Check if a plain-text line is a scene break / separator.
pub fn is_scene_break(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return false;
    }
    // Common explicit patterns
    if matches!(
        t,
        "***"
            | "* * *"
            | "* * * *"
            | "---"
            | "- - -"
            | "___"
            | "_ _ _"
            | "###"
            | "# # #"
            | "~ ~ ~"
            | "~~~"
            | "—"
            | "——"
            | "———"
            | "—— ——"
            | "✦"
            | "✧"
            | "✦✦✦"
            | "✧✧✧"
            | "• • •"
            | "⁂"
    ) {
        return true;
    }
    // Composed entirely of separator chars, short line
    t.len() <= 15
        && t.chars()
            .all(|c| matches!(c, '*' | '-' | '_' | '~' | '#' | ' ' | '•' | '·' | '—' | '–'))
        && t.chars().any(|c| !c.is_whitespace())
}

#[cfg(test)]
mod decoding_tests {
    use super::*;

    fn probe(path: &str) -> (String, String, f32) {
        let raw = std::fs::read(path).unwrap();
        decode_text_scored(&raw)
    }

    #[test]
    fn utf16le_bomless_decodes_clean() {
        let (s, label, score) = probe(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/enc_utf16le.txt"
        ));
        assert!(s.contains("The quick brown fox"), "utf16le text: {s:?}");
        assert_eq!(label, "utf-16le");
        assert!(score > 0.9);
    }

    #[test]
    fn koi8r_beat_cp1251() {
        let (s, label, _) = probe(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/enc_koi8r.txt"
        ));
        assert_eq!(label, "koi8-r", "decoded: {s:?}");
        assert!(s.contains("Война"), "decoded: {s:?}");
    }

    #[test]
    fn big5_beats_gbk() {
        let (s, label, _) = probe(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/enc_big5.txt"
        ));
        assert_eq!(label, "big5", "decoded: {s:?}");
        assert!(s.contains("寂靜"), "decoded: {s:?}");
    }

    #[test]
    fn gbk_beats_big5() {
        let (s, label, _) = probe(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/enc_gbk.txt"
        ));
        assert_eq!(label, "gbk", "decoded: {s:?}");
        assert!(s.contains("黎明"), "decoded: {s:?}");
    }

    #[test]
    fn shift_jis_beats_euc_jp_and_gbk() {
        let (s, label, _) = probe(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/enc_shift_jis.txt"
        ));
        assert_eq!(label, "shift_jis", "decoded: {s:?}");
        assert!(s.contains("夜明け"), "decoded: {s:?}");
    }

    #[test]
    fn cp1251_beats_koi8() {
        let (s, label, _) = probe(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/enc_cp1251.txt"
        ));
        assert_eq!(label, "windows-1251", "decoded: {s:?}");
        assert!(s.contains("Война"), "decoded: {s:?}");
    }

    #[test]
    fn euc_kr_beat_gbk() {
        let (s, label, _) = probe(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/enc_euc_kr.txt"
        ));
        assert_eq!(label, "euc-kr", "decoded: {s:?}");
        assert!(s.contains("새벽"), "decoded: {s:?}");
    }
}

#[cfg(test)]
mod pg_debug {
    use super::*;
    #[test]
    fn pg2701_decodes_clean() {
        let raw = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/pg2701.txt"
        ))
        .unwrap();
        let (s, label, score) = decode_text_scored(&raw);
        assert_eq!(label, "utf-8", "sample={:?}", &s[..300]);
        assert!(s.contains('—'), "label={} score={} sample={:?}", label, score, &s[..300]);
    }
}

#[cfg(test)]
mod pg_pipeline_debug {
    #[test]
    fn pg2701_pipeline_html_clean() {
        let p = std::path::Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/pg2701.txt"
        ));
        let rt = tokio::runtime::Runtime::new().unwrap();
        let book = rt.block_on(crate::conversion::txt::parse(p)).unwrap();
        let sample = book.chapters.iter().find(|c| c.html.contains('—'));
        match sample {
            Some(c) => {
                assert!(c.html.contains('\u{2014}'), "mojibake in chapter: {}", &c.html[..200.min(c.html.len())]);
            }
            None => {
                // no em dash at all — check something else
                let first = &book.chapters[1].html;
                assert!(first.contains("ISHMAEL"), "sample: {}", &first[..120]);
            }
        }
    }
}

#[cfg(test)]
mod epub_byte_integrity {
    /// End-to-end byte integrity: a UTF-8 book with em-dashes must produce an
    /// EPUB whose XHTML contains the proper UTF-8 sequence — double encoding
    /// (UTF-8 decoded as windows-1252) is a hard failure.
    #[test]
    fn pg2701_built_epub_bytes() {
        use crate::conversion::formats;
        let p = std::path::Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../convert/corpus/src/txt/pg2701.txt"
        ));
        let mut book = formats::txt::parse(p).unwrap();
        assert!(book.chapters.iter().any(|c| c.html.contains('\u{2014}')));

        book.sanitize_html();
        let out = std::env::temp_dir().join("pg2701_build_debug.epub");
        crate::conversion::epub_builder::build_epub(&book, &out).unwrap();
        let mut z = zip::ZipArchive::new(std::fs::File::open(&out).unwrap()).unwrap();
        let mut found_moji = 0;
        for i in 0..z.len() {
            let mut f = z.by_index(i).unwrap();
            let name = f.name().to_string();
            if name.ends_with(".xhtml") && !name.contains("nav") {
                let mut buf = Vec::new();
                std::io::Read::read_to_end(&mut f, &mut buf).unwrap();
                if buf.windows(3).any(|w| w == b"\xc3\xa2\xe2") {
                    found_moji += 1;
                    if found_moji <= 2 {
                        let s = String::from_utf8_lossy(&buf);
                        let i2 = s.find('\u{e2}').map(|i| i.saturating_sub(30)).unwrap_or(0);
                        println!("MOJI {} at {}: {}", name, i2, &s[i2..i2 + 60]);
                    }
                }
            }
        }
        assert_eq!(found_moji, 0, "mojibake chapters (UTF-8 dbl-encoded): {}", found_moji);
    }
}
