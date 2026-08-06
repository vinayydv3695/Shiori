/// Shared helpers for the OEB format parsers.
///
/// - `block_on`: run an async legacy parser synchronously, adapting to the
///   calling context (outside a runtime, inside a multi-thread runtime, or
///   inside a current-thread runtime).
/// - `serialize_rcdom_node`: XHTML serializer for the html5ever RcDom tree.
/// - `embed_local_image`: embed a local image file into the EPUB resource list
///   and rewrite the `<img src>` reference to the internal path.
use std::path::{Path, PathBuf};

use crate::conversion::error::ConversionError;
use crate::conversion::oeb::{escape_xml, OebImage};
use crate::conversion::utils;
use markup5ever_rcdom::{Handle, NodeData};

/// Run a future to completion, adapting to the calling context.
///
/// - Outside a runtime: build a fresh current-thread runtime.
/// - Inside a multi-thread runtime (tauri async commands): `block_in_place`
///   on the current handle — no nested runtime.
/// - Inside a current-thread runtime (e.g. `#[tokio::test]`): run the future
///   on a fresh runtime on a scoped thread — no nested runtime.
pub fn block_on<F: std::future::Future + Send>(f: F) -> Result<F::Output, ConversionError>
where
    F::Output: Send,
{
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => {
            if handle.runtime_flavor() == tokio::runtime::RuntimeFlavor::MultiThread {
                Ok(tokio::task::block_in_place(|| handle.block_on(f)))
            } else {
                std::thread::scope(|s| {
                    s.spawn(|| {
                        tokio::runtime::Builder::new_current_thread()
                            .enable_all()
                            .build()
                            .map_err(|e| {
                                ConversionError::Other(format!("Failed to build runtime: {}", e))
                            })
                            .and_then(|rt| Ok(rt.block_on(f)))
                    })
                    .join()
                    .map_err(|_| {
                        ConversionError::Other("block_on worker thread panicked".to_string())
                    })?
                })
            }
        }
        Err(_) => {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| ConversionError::Other(format!("Failed to build runtime: {}", e)))?;
            Ok(rt.block_on(f))
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────
// RCDOM → XHTML SERIALIZATION
// ──────────────────────────────────────────────────────────────────────────

/// Elements whose entire subtree is dropped (unsafe or meaningless in EPUB).
const DROP_ELEMENTS: &[&str] = &[
    "script", "style", "iframe", "frame", "object", "embed", "video", "audio", "source", "track",
    "canvas", "svg", "math", "form", "input", "button", "select", "textarea", "template",
    "noscript", "link", "meta", "base",
];

/// Void elements — serialized self-closing in XHTML.
const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
    "track", "wbr",
];

/// Serialize an RcDom node as an XHTML fragment (no `<html>`/`<body>` wrappers).
pub fn serialize_node(handle: &Handle, out: &mut String) {
    match &handle.data {
        NodeData::Text { contents } => {
            out.push_str(&escape_xml(&contents.borrow()));
        }
        NodeData::Element { name, attrs, .. } => {
            let local = name.local.to_string();
            if DROP_ELEMENTS.contains(&local.as_str()) {
                return;
            }

            // Filtered attribute list (drop event handlers and inline styles)
            let attrs = attrs.borrow();
            let mut attr_str = String::new();
            for attr in attrs.iter() {
                let key = attr.name.local.to_string();
                if key.starts_with("on") || key == "style" {
                    continue;
                }
                attr_str.push_str(&format!(" {}=\"{}\"", key, escape_xml(&attr.value)));
            }

            if VOID_ELEMENTS.contains(&local.as_str()) {
                out.push_str(&format!("<{}{}/>", local, attr_str));
                return;
            }

            out.push_str(&format!("<{}{}>", local, attr_str));
            for child in handle.children.borrow().iter() {
                serialize_node(child, out);
            }
            out.push_str(&format!("</{}>", local));
        }
        // Comments, doctypes, processing instructions and the document root
        // are not emitted into chapter content.
        _ => {}
    }
}

/// Extract the plain-text content of a node (used for heading titles).
pub fn node_text(handle: &Handle) -> String {
    let mut text = String::new();
    match &handle.data {
        NodeData::Text { contents } => text.push_str(&contents.borrow()),
        NodeData::Element { .. } => {
            for child in handle.children.borrow().iter() {
                text.push_str(&node_text(child));
            }
        }
        _ => {}
    }
    text
}

/// Is this element a chapter-level heading (`h1`/`h2`/`h3`)?
pub fn is_chapter_heading(handle: &Handle) -> bool {
    if let NodeData::Element { name, .. } = &handle.data {
        let local = name.local.to_string();
        return matches!(local.as_str(), "h1" | "h2" | "h3");
    }
    false
}

// ──────────────────────────────────────────────────────────────────────────
// LOCAL IMAGE EMBEDDING
// ──────────────────────────────────────────────────────────────────────────

/// Embed a local image referenced from a chapter, returning the EPUB-internal
/// `../Images/…` src to use. Returns `None` when the reference is external
/// (http/https/data/`#`) or the file cannot be read.
pub fn embed_local_image(
    src: &str,
    base_dir: &Path,
    images: &mut Vec<OebImage>,
    counter: &mut u32,
) -> Option<String> {
    let lowered = src.trim().to_lowercase();
    if lowered.starts_with("http://")
        || lowered.starts_with("https://")
        || lowered.starts_with("data:")
        || lowered.starts_with('#')
    {
        return None;
    }

    // Strip query strings / fragments from the file path
    let path_part = src.split(['?', '#']).next().unwrap_or(src);
    if path_part.is_empty() {
        return None;
    }

    let candidate = PathBuf::from(path_part);
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        base_dir.join(candidate)
    };

    let data = match std::fs::read(&resolved) {
        Ok(d) if !d.is_empty() => d,
        _ => return None,
    };

    let (mime, ext) = match utils::detect_image_format(&data) {
        Some((m, e)) => (m.to_string(), e.to_string()),
        None => return None,
    };

    *counter += 1;
    let filename = format!("img_{:03}.{}", counter, ext);
    images.push(OebImage {
        id: format!("img_{:03}", counter),
        filename: filename.clone(),
        mime_type: mime,
        source: crate::conversion::oeb::ImageSource::Bytes(data),
    });
    Some(format!("../Images/{}", filename))
}
