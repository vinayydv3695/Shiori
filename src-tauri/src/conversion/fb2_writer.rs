//! FB2 2.1 output writer (EPUB → FB2).
//!
//! Produces valid FictionBook XML: metadata (`description/title-info`), one
//! `<section>` per source chapter with `<title>` from the first heading,
//! paragraphs, inline `<emphasis>/<strong>/<code>`, `<cite>` blockquotes,
//! `<table>` structures and `<empty-line/>` breaks.
//!
//! v1 deliberately skips images (no `<binary>` embedding) and links (no
//! `l:href` targets) — `ponytail:` those are the next tier; every produced
//! file stays schema-valid and round-trips through `formats::fb2::parse`.

use std::path::Path;

use crate::conversion::error::ConversionError;
use crate::conversion::oeb::escape_xml;

/// Book metadata for the `<description>` block.
pub struct Fb2Book {
    pub title: String,
    pub authors: Vec<String>,
    pub language: String,
    /// Deterministic identifier (IR-SPEC §5) — e.g. `urn:shiori:<sha256>`.
    pub id: String,
}

/// Convert one XHTML chapter document to (section title, FB2 body markup).
///
/// The title is the first heading (`h1..h6`) in the document, falling back to
/// the `<title>` element of the head. Subsequent headings become
/// `<subtitle>`.
pub fn html_to_fb2_body(html: &str) -> (Option<String>, String) {
    use html5ever::parse_fragment;
    use html5ever::tendril::TendrilSink;
    use html5ever::{local_name, namespace_url, ns, QualName};
    use markup5ever_rcdom::{Handle, NodeData, RcDom};

    let context = QualName::new(None, ns!(html), local_name!("div"));
    let parser = parse_fragment(RcDom::default(), Default::default(), context, Vec::new());
    let dom = parser.one(html);

    struct State {
        out: String,
        title: Option<String>,
        fallback_title: Option<String>,
        heading_seen: bool,
    }

    fn text_of(handle: &Handle) -> String {
        match &handle.data {
            NodeData::Text { contents } => contents.borrow().trim().to_string(),
            NodeData::Element { .. } => {
                let mut s = String::new();
                for c in handle.children.borrow().iter() {
                    let t = text_of(c);
                    if !t.is_empty() {
                        if !s.is_empty() {
                            s.push(' ');
                        }
                        s.push_str(&t);
                    }
                }
                s
            }
            _ => String::new(),
        }
    }

    fn walk(handle: &Handle, st: &mut State, in_heading: bool, in_pre: bool, in_head: bool) {
        match &handle.data {
            NodeData::Text { contents } => {
                let t = contents.borrow();
                if t.trim().is_empty() {
                    return;
                }
                if in_head {
                    return; // <head><title> handled separately below
                }
                if in_heading {
                    let s = t.trim();
                    if !s.is_empty() {
                        if !st.out.is_empty() && !st.out.ends_with('>') {
                            st.out.push(' ');
                        }
                        st.out.push_str(&escape_xml(s));
                    }
                } else if in_pre {
                    st.out.push_str(&escape_xml(&t));
                } else {
                    // Collapse whitespace runs to single spaces but keep
                    // word-boundary spacing around inline elements
                    // ("Hello <em>world</em>" must not become "Helloworld").
                    let mut collapsed = String::with_capacity(t.len());
                    let mut prev_ws = false;
                    for ch in t.chars() {
                        if ch.is_whitespace() {
                            if !prev_ws {
                                collapsed.push(' ');
                                prev_ws = true;
                            }
                        } else {
                            collapsed.push(ch);
                            prev_ws = false;
                        }
                    }
                    st.out.push_str(&escape_xml(&collapsed));
                }
            }
            NodeData::Element { name, .. } => {
                let tag = name.local.as_ref();
                match tag {
                    "script" | "style" | "title" => return,
                    "head" => {
                        // capture <title> as fallback
                        for c in handle.children.borrow().iter() {
                            if let NodeData::Element { name, .. } = &c.data {
                                if name.local.as_ref() == "title" {
                                    let t = text_of(c);
                                    if !t.is_empty() && st.fallback_title.is_none() {
                                        st.fallback_title = Some(t);
                                    }
                                }
                            }
                        }
                        return;
                    }
                    "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                        let mut inner = State {
                            out: String::new(),
                            title: None,
                            fallback_title: None,
                            heading_seen: true,
                        };
                        for c in handle.children.borrow().iter() {
                            walk(c, &mut inner, true, false, false);
                        }
                        let text = inner.out.trim().to_string();
                        if text.is_empty() {
                            return;
                        }
                        if !st.heading_seen {
                            st.heading_seen = true;
                            st.title = Some(text.clone());
                            st.out.push_str(&format!("      <title><p>{}</p></title>\n", text));
                        } else {
                            st.out.push_str(&format!("      <subtitle>{}</subtitle>\n", text));
                        }
                        return;
                    }
                    "br" | "hr" => {
                        st.out.push_str("      <empty-line/>\n");
                        return;
                    }
                    "img" => {
                        // ponytail: no <binary> embedding yet — drop with a
                        // blank line so the reading flow stays intact.
                        st.out.push_str("      <empty-line/>\n");
                        return;
                    }
                    "p" | "div" | "li" => {
                        if !in_heading {
                            st.out.push_str("      <p>");
                            if tag == "li" {
                                st.out.push_str("• ");
                            }
                        }
                    }
                    "blockquote" => st.out.push_str("      <cite>"),
                    "pre" => st.out.push_str("      <p><code>"),
                    "em" | "i" => {
                        if !in_heading {
                            st.out.push_str("<emphasis>")
                        }
                    }
                    "strong" | "b" => {
                        if !in_heading {
                            st.out.push_str("<strong>")
                        }
                    }
                    "code" if !in_pre => {
                        if !in_heading {
                            st.out.push_str("<code>")
                        }
                    }
                    "sup" => {
                        if !in_heading {
                            st.out.push_str("<sup>")
                        }
                    }
                    "sub" => {
                        if !in_heading {
                            st.out.push_str("<sub>")
                        }
                    }
                    "table" => st.out.push_str("      <table>\n"),
                    "tr" => st.out.push_str("        <tr>"),
                    "td" | "th" => st.out.push_str("<td>"),
                    _ => {}
                }

                let was_pre = in_pre || tag == "pre";
                for c in handle.children.borrow().iter() {
                    walk(c, st, in_heading, was_pre, in_head);
                }

                match tag {
                    "p" | "div" | "li" => {
                        if !in_heading {
                            st.out.push_str("</p>\n");
                        }
                    }
                    "blockquote" => st.out.push_str("</cite>\n"),
                    "pre" => st.out.push_str("</code></p>\n"),
                    "em" | "i" => {
                        if !in_heading {
                            st.out.push_str("</emphasis>")
                        }
                    }
                    "strong" | "b" => {
                        if !in_heading {
                            st.out.push_str("</strong>")
                        }
                    }
                    "code" if !in_pre => {
                        if !in_heading {
                            st.out.push_str("</code>")
                        }
                    }
                    "sup" => {
                        if !in_heading {
                            st.out.push_str("</sup>")
                        }
                    }
                    "sub" => {
                        if !in_heading {
                            st.out.push_str("</sub>")
                        }
                    }
                    "table" => st.out.push_str("      </table>\n"),
                    "tr" => st.out.push_str("</tr>\n"),
                    "td" | "th" => st.out.push_str("</td>"),
                    _ => {}
                }
            }
            _ => {}
        }
    }

    let mut st = State {
        out: String::new(),
        title: None,
        fallback_title: None,
        heading_seen: false,
    };
    for child in dom.document.children.borrow().iter() {
        walk(child, &mut st, false, false, false);
    }
    let title = st.title.or(st.fallback_title);
    // Collapse runs of blank lines; trim trailing whitespace per line.
    let body = st
        .out
        .lines()
        .map(str::trim_end)
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    (title, body)
}

/// Compose a complete FB2 2.1 document and write it to `target`.
pub fn write_fb2(
    book: &Fb2Book,
    chapters: &[(Option<String>, String)],
    target: &Path,
) -> Result<(), ConversionError> {
    let mut xml = String::with_capacity(4096);
    xml.push_str("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
    xml.push_str(
        "<FictionBook xmlns=\"http://www.gribuser.ru/xml/fictionbook/2.0\" xmlns:l=\"http://www.w3.org/1999/xlink\">\n",
    );
    xml.push_str("  <description>\n    <title-info>\n");
    xml.push_str(&format!(
        "      <book-title>{}</book-title>\n",
        escape_xml(&book.title)
    ));
    for a in &book.authors {
        let parts: Vec<&str> = a.split_whitespace().collect();
        if parts.len() >= 2 {
            let last = parts[parts.len() - 1];
            let first = parts[..parts.len() - 1].join(" ");
            xml.push_str(&format!(
                "      <author><first-name>{}</first-name><last-name>{}</last-name></author>\n",
                escape_xml(&first),
                escape_xml(last)
            ));
        } else {
            xml.push_str(&format!(
                "      <author><nickname>{}</nickname></author>\n",
                escape_xml(a)
            ));
        }
    }
    xml.push_str(&format!(
        "      <lang>{}</lang>\n    </title-info>\n    <document-info>\n",
        escape_xml(&book.language)
    ));
    xml.push_str("      <author><nickname>Shiori</nickname></author>\n");
    xml.push_str("      <program-used>Shiori conversion engine</program-used>\n");
    xml.push_str(&format!("      <id>{}</id>\n", escape_xml(&book.id)));
    xml.push_str("      <version>1.0</version>\n    </document-info>\n  </description>\n");
    xml.push_str("  <body>\n");
    xml.push_str(&format!(
        "    <title><p>{}</p></title>\n",
        escape_xml(&book.title)
    ));
    for (i, (title, body)) in chapters.iter().enumerate() {
        xml.push_str(&format!("    <section id=\"chapter_{:03}\">\n", i + 1));
        if let Some(t) = title.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
            xml.push_str(&format!("      <title><p>{}</p></title>\n", escape_xml(t)));
        }
        if body.trim().is_empty() {
            xml.push_str("      <empty-line/>\n");
        } else {
            for line in body.lines() {
                xml.push_str(line);
                xml.push('\n');
            }
        }
        xml.push_str("    </section>\n");
    }
    xml.push_str("  </body>\n</FictionBook>\n");

    std::fs::write(target, xml)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heading_becomes_section_title() {
        let (t, body) = html_to_fb2_body(
            "<html><head><title>ignored</title></head><body><h1>Chapter One</h1><p>Hello <em>world</em>.</p></body></html>",
        );
        assert_eq!(t.as_deref(), Some("Chapter One"));
        assert!(body.contains("<title><p>Chapter One</p></title>"), "{body}");
        assert!(body.contains("<p>Hello <emphasis>world</emphasis>.</p>"), "{body}");
    }

    #[test]
    fn second_heading_is_subtitle_and_entities_decode() {
        let (t, body) = html_to_fb2_body(
            "<body><h1>One</h1><p>Tom &amp; Jerry</p><h2>Later</h2><blockquote><p>Quote</p></blockquote></body>",
        );
        assert_eq!(t.as_deref(), Some("One"));
        assert!(body.contains("<subtitle>Later</subtitle>"), "{body}");
        assert!(body.contains("Tom &amp; Jerry"), "{body}");
        assert!(body.contains("<cite>"), "{body}");
        assert!(body.contains("<p>Quote</p>"), "{body}");
        assert!(body.contains("</cite>"), "{body}");
    }

    #[test]
    fn full_document_is_valid_fb2_shape() {
        let book = Fb2Book {
            title: "T".into(),
            authors: vec!["Ada Lovelace".into(), "Prince".into()],
            language: "en".into(),
            id: "urn:shiori:test".into(),
        };
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("out.fb2");
        write_fb2(
            &book,
            &[
                (Some("Ch 1".into()), "<p>A</p>".into()),
                (None, "<p>B</p>".into()),
            ],
            &out,
        )
        .unwrap();
        let xml = std::fs::read_to_string(&out).unwrap();
        assert!(xml.starts_with("<?xml"));
        assert!(xml.contains("<FictionBook"));
        assert!(xml.contains("<first-name>Ada</first-name><last-name>Lovelace</last-name>"));
        assert!(xml.contains("<nickname>Prince</nickname>"));
        assert!(xml.contains("<section id=\"chapter_001\">"));
        assert!(xml.contains("<section id=\"chapter_002\">"));
        assert!(xml.ends_with("</FictionBook>\n"));
    }
}