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
    // 1. Strip UTF-8 BOM
    let raw = if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &raw[3..]
    } else {
        raw
    };

    // 2. Try strict UTF-8
    if let Ok(s) = std::str::from_utf8(raw) {
        return Ok(s.to_string());
    }

    // 3. Check for UTF-16 BOM
    if raw.len() >= 2 {
        if raw[0] == 0xFF && raw[1] == 0xFE {
            let (decoded, _, had_errors) = encoding_rs::UTF_16LE.decode(raw);
            if !had_errors {
                return Ok(decoded.into_owned());
            }
        } else if raw[0] == 0xFE && raw[1] == 0xFF {
            let (decoded, _, had_errors) = encoding_rs::UTF_16BE.decode(raw);
            if !had_errors {
                return Ok(decoded.into_owned());
            }
        }
    }

    // 4. Use chardet
    let result = chardet::detect(raw);
    let charset = chardet::charset2encoding(&result.0);

    if let Some(encoding) = encoding_rs::Encoding::for_label(charset.as_bytes()) {
        if encoding != encoding_rs::WINDOWS_1252 {
            let (decoded, _, had_errors) = encoding.decode(raw);
            if !had_errors {
                return Ok(decoded.into_owned());
            }
        }
    }

    // 5. Fallback: Windows-1252 (lossy but recoverable)
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
    
    // Check if the first word is exactly the keyword, OR if it's the keyword followed by a number/punctuation (handled by checking exact match of the first word, since `words[0]` is split by whitespace)
    // Actually, sometimes the word might have punctuation attached if we didn't strip it, but `first_lower` is just `words[0]`.
    // Wait, let's just check if `keywords.contains(&first_lower.as_str())`
    let stripped_first = first_lower.trim_matches(|c: char| !c.is_alphanumeric());
    if keywords.contains(&stripped_first) {
        return true;
    }

    // All-caps short phrase
    if t.len() <= 60 && words.len() <= 10 {
        let allcaps = t.chars().all(|c| c.is_uppercase() || !c.is_alphabetic());
        if allcaps && t.chars().any(|c| c.is_alphabetic()) {
            return true;
        }
    }

    // Numbered chapter pattern: "1.", "1)", "I.", "IV.", etc.
    if words.len() <= 2 {
        let first = words[0];
        let is_numeral = first
            .chars()
            .all(|c| c.is_numeric() || c == '.' || c == ')')
            || is_roman_numeral(first.trim_end_matches(&['.', ')'] as &[char]));
        if is_numeral {
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
