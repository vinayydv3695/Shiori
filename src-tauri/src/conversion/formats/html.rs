/// HTML → OEB parser.
///
/// Parses with html5ever (the same parser the reader adapters use), splits
/// the body into chapters on `h1`/`h2`/`h3` headings, serializes each section
/// as safe XHTML, embeds local images and pulls metadata from the
/// `HtmlFormatAdapter`.
use html5ever::parse_document;
use html5ever::tendril::TendrilSink;
use markup5ever_rcdom::{Handle, NodeData, RcDom};
use std::path::Path;

use crate::conversion::error::ConversionError;
use crate::conversion::formats::common;
use crate::conversion::oeb::{OebBook, OebChapter, OebImage};
use crate::services::adapters::HtmlFormatAdapter;
use crate::services::format_adapter::BookFormatAdapter;

/// Parse an HTML file into an OebBook.
pub fn parse(path: &Path) -> Result<OebBook, ConversionError> {
    let data = std::fs::read(path).map_err(ConversionError::IoError)?;
    let content = String::from_utf8_lossy(&data).into_owned();

    let dom = parse_document(RcDom::default(), Default::default())
        .from_utf8()
        .read_from(&mut content.as_bytes())
        .map_err(|e| ConversionError::ParseError {
            format: "HTML".to_string(),
            detail: e.to_string(),
        })?;

    // Metadata via the shared adapter (error-tolerant: filename fallback)
    let adapter = HtmlFormatAdapter::new();
    let meta = common::block_on(adapter.extract_metadata(path))?.unwrap_or_default();

    let title = if !meta.title.is_empty() && meta.title != "Unknown" {
        meta.title
    } else {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string()
    };

    let mut book = OebBook::new(title);
    book.authors = meta.authors;
    book.language = meta.language.clone().unwrap_or_else(|| "en".to_string());
    book.description = meta.description;

    let base_dir = path.parent().unwrap_or_else(|| Path::new("."));
    let mut images: Vec<OebImage> = Vec::new();
    let mut img_counter = 0u32;

    let body = find_body(&dom.document);
    let children: Vec<Handle> = match body {
        Some(b) => b.children.borrow().clone(),
        None => dom.document.children.borrow().clone(),
    };

    // First h1 is treated as the book title (matches the adapter's
    // extract_first_heading convention); h2/h3 become chapters.
    let mut chapters: Vec<(String, String)> = Vec::new();
    let mut current_title: Option<String> = None;
    let mut current_html = String::new();
    let mut saw_heading = false;

    for child in &children {
        if common::is_chapter_heading(child) {
            let raw_title = common::node_text(child).trim().to_string();
            let mut heading_html = String::new();
            common::serialize_node(child, &mut heading_html);

            let is_first_h1 = !saw_heading && is_h1(child) && !raw_title.is_empty();

            if is_first_h1 {
                // Consumed as the book title — not a chapter.
                saw_heading = true;
                continue;
            }
            saw_heading = true;

            // Content between the title h1 and the first chapter heading
            // (intro text, images) must not be dropped — carry it into the
            // first chapter.
            let preamble = if current_title.is_none() {
                std::mem::take(&mut current_html)
            } else {
                String::new()
            };

            if let Some(t) = current_title.take() {
                if !current_html.trim().is_empty() {
                    chapters.push((t, std::mem::take(&mut current_html)));
                }
            }
            current_title = Some(if raw_title.is_empty() {
                "Section".to_string()
            } else {
                raw_title
            });
            current_html = if preamble.trim().is_empty() {
                heading_html
            } else {
                format!("{}{}", preamble, heading_html)
            };
        } else {
            let mut html = String::new();
            common::serialize_node(child, &mut html);
            if !html.trim().is_empty() {
                current_html.push_str(&html);
            }
        }
    }

    if let Some(t) = current_title.take() {
        if !current_html.trim().is_empty() {
            chapters.push((t, std::mem::take(&mut current_html)));
        }
    }

    // No headings at all — one chapter with everything.
    if chapters.is_empty() && !current_html.trim().is_empty() {
        chapters.push(("Content".to_string(), std::mem::take(&mut current_html)));
    }

    if chapters.is_empty() {
        return Err(ConversionError::EmptyContent);
    }

    // Rewrite <img> references: embed local files, keep remote/data URIs.
    for (i, (ch_title, ch_html)) in chapters.into_iter().enumerate() {
        let html = rewrite_images(&ch_html, base_dir, &mut images, &mut img_counter);
        book.chapters.push(OebChapter {
            id: format!("chapter_{:03}", i + 1),
            title: Some(ch_title),
            html,
        });
    }

    book.images = images;
    Ok(book)
}

/// Find the `<body>` element in the DOM.
fn find_body(handle: &Handle) -> Option<Handle> {
    if let NodeData::Element { name, .. } = &handle.data {
        if &name.local == "body" {
            return Some(handle.clone());
        }
    }
    for child in handle.children.borrow().iter() {
        if let Some(found) = find_body(child) {
            return Some(found);
        }
    }
    None
}

fn is_h1(handle: &Handle) -> bool {
    if let NodeData::Element { name, .. } = &handle.data {
        return &name.local == "h1";
    }
    false
}

/// Rewrite `<img src="…">` tags: embed local files, rewrite to `../Images/…`.
fn rewrite_images(
    html: &str,
    base_dir: &Path,
    images: &mut Vec<OebImage>,
    counter: &mut u32,
) -> String {
    static IMG_TAG_RE: once_cell::sync::Lazy<regex::Regex> =
        once_cell::sync::Lazy::new(|| regex::Regex::new(r"(?is)<img\b[^>]*>").expect("static regex"));
    static SRC_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r#"(?i)\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#).expect("static regex")
    });

    IMG_TAG_RE
        .replace_all(html, |caps: &regex::Captures| {
            let tag = caps.get(0).map(|m| m.as_str()).unwrap_or("");
            let Some(src_cap) = SRC_RE.captures(tag) else {
                return tag.to_string();
            };
            let src = src_cap
                .get(1)
                .or_else(|| src_cap.get(2))
                .or_else(|| src_cap.get(3))
                .map(|m| m.as_str())
                .unwrap_or("");

            match common::embed_local_image(src, base_dir, images, counter) {
                Some(internal) => SRC_RE
                    .replace(tag, format!("src=\"{}\"", internal))
                    .to_string(),
                None => {
                    // External or unreadable reference — drop the image tag.
                    String::new()
                }
            }
        })
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rewrite_images_keeps_remote() {
        let html = r#"<p>Hi</p><img src="https://example.com/a.png" alt="x"/><p>Bye</p>"#;
        let out = rewrite_images(html, Path::new("."), &mut Vec::new(), &mut 0);
        // Remote images are dropped (not embedded) but text survives.
        assert!(out.contains("Hi"));
        assert!(out.contains("Bye"));
        assert!(!out.contains("example.com"));
    }

    #[test]
    fn test_embed_local_image_embeds_png() {
        let dir = tempfile::tempdir().unwrap();
        // Minimal PNG signature (89 50 4E 47 ...)
        std::fs::write(dir.path().join("cover.png"), b"\x89PNG\r\n\x1a\n")
            .unwrap();
        let mut images = Vec::new();
        let mut counter = 0;
        let out = common::embed_local_image(
            dir.path().join("cover.png").to_str().unwrap(),
            dir.path(),
            &mut images,
            &mut counter,
        );
        assert!(out.is_some());
        assert_eq!(images.len(), 1);
        assert_eq!(counter, 1);
    }

    #[test]
    fn test_embed_local_image_skips_non_image_and_oversized() {
        let dir = tempfile::tempdir().unwrap();

        // .txt must NOT be embedded (arbitrary local-file exfiltration)
        std::fs::write(dir.path().join("secret.txt"), b"private data").unwrap();
        let mut images = Vec::new();
        assert!(common::embed_local_image("secret.txt", dir.path(), &mut images, &mut 0).is_none());
        assert!(images.is_empty());

        // Extensionless path under a dot-dir (`.ssh`-style) must NOT be embedded
        std::fs::create_dir_all(dir.path().join(".ssh")).unwrap();
        std::fs::write(dir.path().join(".ssh").join("id_rsa"), b"key material").unwrap();
        let src = format!("./.ssh/id_rsa");
        assert!(
            common::embed_local_image(&src, dir.path(), &mut images, &mut 0).is_none(),
            "extensionless local file must not be embedded"
        );
        assert!(images.is_empty());

        // Oversized image (>25 MB) must NOT be embedded
        let big = dir.path().join("huge.png");
        std::fs::write(&big, vec![0u8; 25 * 1024 * 1024 + 1]).unwrap();
        let src = big.to_str().unwrap().to_string();
        assert!(
            common::embed_local_image(&src, dir.path(), &mut images, &mut 0).is_none(),
            "oversized image must not be embedded"
        );
        assert!(images.is_empty());
    }
}
