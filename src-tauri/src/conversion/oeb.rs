/// OEB — Intermediate Open eBook representation.
///
/// All format parsers (PDF, MOBI, DOCX, FB2, etc.) populate an `OebBook`
/// struct, which is then consumed by `epub_builder::build_epub` to produce
/// a valid EPUB 3 file.

// ──────────────────────────────────────────────────────────────────────────
// DATA STRUCTURES
// ──────────────────────────────────────────────────────────────────────────

/// The top-level book representation produced by every format parser.
#[derive(Debug, Default)]
pub struct OebBook {
    // ── Metadata ──────────────────────────────────────────────────────────
    pub title: String,
    pub authors: Vec<String>,
    /// BCP-47 language tag, e.g. "en"
    pub language: String,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub isbn: Option<String>,
    pub published_date: Option<String>,
    /// Optional cover image (first image shown on a cover page)
    pub cover_image: Option<OebImage>,

    // ── Table of Contents ──────────────────────────────────────────────────
    /// Hierarchical Table of Contents
    pub toc: Vec<TocEntry>,

    // ── Content ───────────────────────────────────────────────────────────
    /// Ordered list of chapters (each is a self-contained XHTML body fragment)
    pub chapters: Vec<OebChapter>,

    /// Additional images referenced inside chapter HTML via `<img src="…">`.
    /// The `filename` must match the src reference used in the HTML.
    pub images: Vec<OebImage>,

    /// Optional custom CSS (comic mode, etc.). When Some, overrides the
    /// epub_builder's default stylesheet.
    pub custom_stylesheet: Option<String>,

    /// Keeps the on-disk extraction dir (CBR) alive while `ImageSource::Path`
    /// images are still referenced. Dropped — and the dir deleted — together
    /// with the book, after `build_epub` has streamed every image.
    pub(crate) temp_dir: Option<tempfile::TempDir>,
}

/// A single readable chapter.
#[derive(Debug, Default)]
pub struct OebChapter {
    /// Slug identifier, e.g. `"chapter_001"`. Must be unique within the book.
    pub id: String,
    /// Display title used in TOC. `None` for untitled chapters.
    pub title: Option<String>,
    /// Valid XHTML fragment — the content that goes *inside* `<body>`. Must
    /// not contain `<html>`, `<head>`, or `<body>` wrapper tags.
    pub html: String,
}

/// An entry in the Table of Contents.
#[derive(Debug, Clone)]
pub struct TocEntry {
    /// Title of the section.
    pub title: String,
    /// Target anchor, e.g. "chapter_001" or "chapter_001#anchor".
    pub href: String,
    /// Nested child sections.
    pub children: Vec<TocEntry>,
}

/// Where an image's bytes live.
///
/// EPUB/MOBI/PDF parsers keep bytes in RAM (`Bytes`); comic sources stream
/// from disk so a 1 GB CBZ/CBR costs bounded memory: CBZ pages are read
/// straight from the source archive entry, CBR pages from the temp
/// extraction dir.
#[derive(Debug, Clone)]
pub enum ImageSource {
    /// Raw image bytes held in memory.
    Bytes(Vec<u8>),
    /// On-disk file, e.g. a page extracted into `OebBook::temp_dir` (CBR).
    Path(std::path::PathBuf),
    /// Named entry inside a ZIP archive on disk (CBZ) — streamed entry by
    /// entry at build time. The archive path must outlive the book.
    ZipEntry {
        /// Path to the source ZIP (the CBZ file itself).
        archive: std::path::PathBuf,
        /// Entry name inside the archive.
        entry: String,
    },
}

/// An image resource (cover or inline).
#[derive(Debug, Clone)]
pub struct OebImage {
    /// Unique id, e.g. `"img_001"`.
    pub id: String,
    /// Filename used inside the EPUB ZIP, e.g. `"img_001.jpg"`.
    pub filename: String,
    /// MIME type, e.g. `"image/jpeg"`.
    pub mime_type: String,
    /// Where the image bytes come from.
    pub source: ImageSource,
}

// ──────────────────────────────────────────────────────────────────────────
// CONSTRUCTOR HELPERS
// ──────────────────────────────────────────────────────────────────────────

impl OebBook {
    /// Create a new book with a title. Language defaults to "en".
    pub fn new(title: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            language: "en".to_string(),
            ..Default::default()
        }
    }

    /// Add a chapter, automatically generating a sequential id.
    #[allow(dead_code)]
    pub fn add_chapter(&mut self, title: Option<String>, html: String) {
        let id = format!("chapter_{:03}", self.chapters.len() + 1);
        self.chapters.push(OebChapter { id, title, html });
    }

    /// Add a named in-memory image to the resource list.
    #[allow(dead_code)]
    pub fn add_image(&mut self, id: String, filename: String, mime_type: String, data: Vec<u8>) {
        self.images.push(OebImage {
            id,
            filename,
            mime_type,
            source: ImageSource::Bytes(data),
        });
    }

    // ── HTML sanitisation ──────────────────────────────────────────────────

    /// Sanitize all chapter HTML:
    /// - Escape stray `<` / `>` / `&` characters outside of tags
    /// - Remove `<script>` and `<style>` blocks
    /// - Ensure bare text nodes are wrapped in `<p>` tags
    /// - Strip XML processing instructions
    pub fn sanitize_html(&mut self) {
        for chapter in &mut self.chapters {
            chapter.html = sanitize_xhtml(&chapter.html);
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────
// HTML SANITISATION HELPERS
// ──────────────────────────────────────────────────────────────────────────

/// Sanitise an XHTML body fragment so it is safe to embed in an EPUB chapter.
fn sanitize_xhtml(html: &str) -> String {
    // 1. Remove <script> blocks
    let no_script = remove_tag_block(html, "script");
    // 2. Remove <style> blocks
    let no_style = remove_tag_block(&no_script, "style");
    // 3. Remove XML processing instructions
    let no_pi = remove_processing_instructions(&no_style);
    // 4. Ensure non-empty result
    if no_pi.trim().is_empty() {
        "<p>&#160;</p>".to_string()
    } else {
        no_pi
    }
}

/// Remove all occurrences of `<tagname ...>...</tagname>` (case-insensitive).
fn remove_tag_block(html: &str, tag: &str) -> String {
    let open_pat = format!("<{}", tag);
    let close_pat = format!("</{}>", tag);
    let mut result = String::with_capacity(html.len());
    let lower = html.to_lowercase();
    let open_lower = open_pat.to_lowercase();
    let close_lower = close_pat.to_lowercase();

    let mut pos = 0;
    while pos < html.len() {
        if let Some(start) = lower[pos..].find(&open_lower).map(|i| i + pos) {
            // Copy everything before this tag
            result.push_str(&html[pos..start]);
            // Find closing tag
            if let Some(end_rel) = lower[start..].find(&close_lower) {
                let close_start = start + end_rel;
                let close_end = close_start + close_pat.len();
                pos = close_end;
            } else {
                // No closing tag found — skip to end
                pos = html.len();
            }
        } else {
            // No more of this tag
            result.push_str(&html[pos..]);
            break;
        }
    }
    result
}

/// Remove `<?...?>` processing instructions.
///
/// IMPORTANT: iterates by full UTF-8 character — byte-wise pushes (`byte as
/// char`) mangle every multibyte character in the chapter (â€™/Â© mojibake).
fn remove_processing_instructions(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let bytes = html.as_bytes();
    let mut pos = 0;
    while pos < bytes.len() {
        if pos + 1 < bytes.len() && bytes[pos] == b'<' && bytes[pos + 1] == b'?' {
            if let Some(end) = html[pos..].find("?>") {
                pos += end + 2;
            } else {
                pos = html.len();
            }
        } else {
            // Copy one full UTF-8 character (never a lone byte).
            let ch = html[pos..].chars().next().unwrap_or('\u{FFFD}');
            result.push(ch);
            pos += ch.len_utf8();
        }
    }
    result
}

// ──────────────────────────────────────────────────────────────────────────
// XML ESCAPE (used by epub_builder and parsers)
// ──────────────────────────────────────────────────────────────────────────

/// Escape the five XML special characters.
#[inline]
pub fn escape_xml(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_script_removal() {
        let html = r#"<p>Hello</p><script>alert(1)</script><p>World</p>"#;
        let out = sanitize_xhtml(html);
        assert!(!out.contains("script"), "script tags should be removed");
        assert!(out.contains("Hello") && out.contains("World"));
    }

    #[test]
    fn test_add_chapter_ids() {
        let mut book = OebBook::new("Test");
        book.add_chapter(Some("Ch 1".to_string()), "<p>a</p>".to_string());
        book.add_chapter(Some("Ch 2".to_string()), "<p>b</p>".to_string());
        assert_eq!(book.chapters[0].id, "chapter_001");
        assert_eq!(book.chapters[1].id, "chapter_002");
    }
}
