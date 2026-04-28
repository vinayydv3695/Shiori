/// EPUB 3 ZIP assembler.
///
/// Consumes an `OebBook` and writes a standards-compliant `.epub` file.
/// Follows the EPUB 3.3 spec:
///   - `mimetype` entry: Stored (no compression), no extra fields, MUST be first.
///   - All other entries: Deflated.
///   - Package document (content.opf) at OEBPS/content.opf.
///   - EPUB 2 compatibility: toc.ncx included alongside nav.xhtml.

use std::io::{Cursor, Write};
use std::path::Path;
use uuid::Uuid;
use zip::write::FileOptions;
use zip::CompressionMethod;

use super::error::ConversionError;
use super::oeb::{escape_xml, OebBook};

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ──────────────────────────────────────────────────────────────────────────

/// Build an EPUB 3 file from the given `OebBook` and write it to `output_path`.
pub fn build_epub(book: &OebBook, output_path: &Path) -> Result<(), ConversionError> {
    let data = assemble_epub_zip(book)?;
    std::fs::write(output_path, data)?;
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────
// ZIP ASSEMBLY
// ──────────────────────────────────────────────────────────────────────────

fn assemble_epub_zip(book: &OebBook) -> Result<Vec<u8>, ConversionError> {
    let mut buffer = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(&mut buffer);

    // STORED options for mimetype (EPUB spec requirement)
    let stored: FileOptions<()> = FileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .large_file(false);
    let deflated: FileOptions<()> = FileOptions::default()
        .compression_method(CompressionMethod::Deflated);

    // 1. mimetype — MUST be first, MUST be Stored
    zip.start_file("mimetype", stored)
        .map_err(|e| ConversionError::Other(e.to_string()))?;
    zip.write_all(b"application/epub+zip")
        .map_err(|e| ConversionError::Other(e.to_string()))?;

    // 2. META-INF/container.xml
    zip.start_file("META-INF/container.xml", deflated)
        .map_err(|e| ConversionError::Other(e.to_string()))?;
    zip.write_all(CONTAINER_XML.as_bytes())
        .map_err(|e| ConversionError::Other(e.to_string()))?;

    // 3. OEBPS/content.opf
    zip.start_file("OEBPS/content.opf", deflated)
        .map_err(|e| ConversionError::Other(e.to_string()))?;
    zip.write_all(build_content_opf(book).as_bytes())
        .map_err(|e| ConversionError::Other(e.to_string()))?;

    // 4. OEBPS/toc.ncx (EPUB 2 compatibility)
    zip.start_file("OEBPS/toc.ncx", deflated)
        .map_err(|e| ConversionError::Other(e.to_string()))?;
    zip.write_all(build_toc_ncx(book).as_bytes())
        .map_err(|e| ConversionError::Other(e.to_string()))?;

    // 5. OEBPS/nav.xhtml (EPUB 3 navigation document)
    zip.start_file("OEBPS/nav.xhtml", deflated)
        .map_err(|e| ConversionError::Other(e.to_string()))?;
    zip.write_all(build_nav_xhtml(book).as_bytes())
        .map_err(|e| ConversionError::Other(e.to_string()))?;

    // 6. OEBPS/Styles/stylesheet.css
    let stylesheet = book.custom_stylesheet.as_deref().unwrap_or(DEFAULT_STYLESHEET);
    zip.start_file("OEBPS/Styles/stylesheet.css", deflated)
        .map_err(|e| ConversionError::Other(e.to_string()))?;
    zip.write_all(stylesheet.as_bytes())
        .map_err(|e| ConversionError::Other(e.to_string()))?;

    // 7. Cover XHTML page (if cover image present)
    if let Some(ref cover) = book.cover_image {
        zip.start_file("OEBPS/Text/cover.xhtml", deflated)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
        zip.write_all(build_cover_xhtml(book, &cover.filename).as_bytes())
            .map_err(|e| ConversionError::Other(e.to_string()))?;
    }

    // 8. Chapter XHTML files
    for chapter in &book.chapters {
        let filename = format!("OEBPS/Text/{}.xhtml", chapter.id);
        zip.start_file(&filename, deflated)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
        let title = chapter.title.as_deref().unwrap_or(&book.title);
        let xhtml = build_chapter_xhtml(&book.language, title, &chapter.html);
        zip.write_all(xhtml.as_bytes())
            .map_err(|e| ConversionError::Other(e.to_string()))?;
    }

    // 9. Cover image
    if let Some(ref cover) = book.cover_image {
        let filename = format!("OEBPS/Images/{}", cover.filename);
        zip.start_file(&filename, deflated)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
        zip.write_all(&cover.data)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
    }

    // 10. Inline images
    for img in &book.images {
        let filename = format!("OEBPS/Images/{}", img.filename);
        zip.start_file(&filename, deflated)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
        zip.write_all(&img.data)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
    }

    zip.finish().map_err(|e| ConversionError::Other(e.to_string()))?;
    Ok(buffer.into_inner())
}

// ──────────────────────────────────────────────────────────────────────────
// OPF (Package Document)
// ──────────────────────────────────────────────────────────────────────────

fn build_content_opf(book: &OebBook) -> String {
    let uid = Uuid::new_v4();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");

    // ── Metadata section ──
    let mut meta_lines: Vec<String> = vec![
        format!("    <dc:identifier id=\"uid\">urn:uuid:{uid}</dc:identifier>"),
        format!("    <dc:title>{}</dc:title>", escape_xml(&book.title)),
        format!("    <dc:language>{}</dc:language>", escape_xml(&book.language)),
        format!("    <meta property=\"dcterms:modified\">{now}</meta>"),
    ];

    for author in &book.authors {
        meta_lines.push(format!("    <dc:creator>{}</dc:creator>", escape_xml(author)));
    }
    if let Some(ref p) = book.publisher {
        meta_lines.push(format!("    <dc:publisher>{}</dc:publisher>", escape_xml(p)));
    }
    if let Some(ref d) = book.description {
        meta_lines.push(format!("    <dc:description>{}</dc:description>", escape_xml(d)));
    }
    if let Some(ref i) = book.isbn {
        meta_lines.push(format!("    <dc:identifier id=\"isbn\">{}</dc:identifier>", escape_xml(i)));
    }
    if let Some(ref date) = book.published_date {
        meta_lines.push(format!("    <dc:date>{}</dc:date>", escape_xml(date)));
    }
    if book.cover_image.is_some() {
        meta_lines.push("    <meta name=\"cover\" content=\"cover-image\"/>".to_string());
    }

    // ── Manifest section ──
    let mut manifest_items: Vec<String> = vec![
        "    <item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>".to_string(),
        "    <item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>".to_string(),
        "    <item id=\"stylesheet\" href=\"Styles/stylesheet.css\" media-type=\"text/css\"/>".to_string(),
    ];

    // Cover page & image
    if let Some(ref cover) = book.cover_image {
        manifest_items.push(
            "    <item id=\"cover-page\" href=\"Text/cover.xhtml\" media-type=\"application/xhtml+xml\"/>".to_string()
        );
        manifest_items.push(format!(
            "    <item id=\"cover-image\" href=\"Images/{}\" media-type=\"{}\" properties=\"cover-image\"/>",
            cover.filename, cover.mime_type
        ));
    }

    // Chapters
    for chapter in &book.chapters {
        manifest_items.push(format!(
            "    <item id=\"{id}\" href=\"Text/{id}.xhtml\" media-type=\"application/xhtml+xml\"/>",
            id = chapter.id
        ));
    }

    // Inline images
    for img in &book.images {
        manifest_items.push(format!(
            "    <item id=\"{}\" href=\"Images/{}\" media-type=\"{}\"/>",
            img.id, img.filename, img.mime_type
        ));
    }

    // ── Spine ──
    let mut spine_items: Vec<String> = Vec::new();
    if book.cover_image.is_some() {
        spine_items.push("    <itemref idref=\"cover-page\"/>".to_string());
    }
    for chapter in &book.chapters {
        spine_items.push(format!("    <itemref idref=\"{}\"/>", chapter.id));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
{meta}
  </metadata>
  <manifest>
{manifest}
  </manifest>
  <spine toc="ncx">
{spine}
  </spine>
</package>"#,
        meta = meta_lines.join("\n"),
        manifest = manifest_items.join("\n"),
        spine = spine_items.join("\n"),
    )
}

// ──────────────────────────────────────────────────────────────────────────
// NCX (EPUB 2 Table of Contents)
// ──────────────────────────────────────────────────────────────────────────

fn build_toc_ncx(book: &OebBook) -> String {
    let uid = Uuid::new_v4();
    let points: Vec<String> = book.chapters.iter().enumerate().map(|(i, ch)| {
        let title = ch.title.as_deref().unwrap_or(&book.title);
        format!(
            "    <navPoint id=\"navpoint-{n}\" playOrder=\"{n}\">\n      <navLabel><text>{title}</text></navLabel>\n      <content src=\"Text/{id}.xhtml\"/>\n    </navPoint>",
            n = i + 1,
            title = escape_xml(title),
            id = ch.id,
        )
    }).collect();

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:{uid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{title}</text></docTitle>
  <navMap>
{points}
  </navMap>
</ncx>"#,
        uid = uid,
        title = escape_xml(&book.title),
        points = points.join("\n"),
    )
}

// ──────────────────────────────────────────────────────────────────────────
// NAV (EPUB 3 Navigation Document)
// ──────────────────────────────────────────────────────────────────────────

fn build_nav_xhtml(book: &OebBook) -> String {
    let items: Vec<String> = book.chapters.iter().map(|ch| {
        let title = ch.title.as_deref().unwrap_or(&book.title);
        format!(
            "        <li><a href=\"Text/{id}.xhtml\">{title}</a></li>",
            id = ch.id,
            title = escape_xml(title),
        )
    }).collect();

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{lang}">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
{items}
    </ol>
  </nav>
</body>
</html>"#,
        lang = escape_xml(&book.language),
        items = items.join("\n"),
    )
}

// ──────────────────────────────────────────────────────────────────────────
// COVER PAGE
// ──────────────────────────────────────────────────────────────────────────

fn build_cover_xhtml(book: &OebBook, cover_filename: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}">
<head>
  <title>{title}</title>
  <link rel="stylesheet" type="text/css" href="../Styles/stylesheet.css"/>
  <style type="text/css">
    body {{ margin: 0; padding: 0; }}
    div.cover {{ text-align: center; }}
    img.cover {{ max-width: 100%; max-height: 100vh; display: block; margin: 0 auto; }}
  </style>
</head>
<body>
  <div class="cover">
    <img class="cover" src="../Images/{filename}" alt="Cover"/>
  </div>
</body>
</html>"#,
        lang = escape_xml(&book.language),
        title = escape_xml(&book.title),
        filename = cover_filename,
    )
}

// ──────────────────────────────────────────────────────────────────────────
// CHAPTER XHTML TEMPLATE
// ──────────────────────────────────────────────────────────────────────────

fn build_chapter_xhtml(lang: &str, title: &str, body_html: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}">
<head>
  <meta charset="UTF-8"/>
  <title>{title}</title>
  <link rel="stylesheet" type="text/css" href="../Styles/stylesheet.css"/>
</head>
<body>
{body}
</body>
</html>"#,
        lang = escape_xml(lang),
        title = escape_xml(title),
        body = body_html,
    )
}

// ──────────────────────────────────────────────────────────────────────────
// STATIC CONTENT
// ──────────────────────────────────────────────────────────────────────────

const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;

const DEFAULT_STYLESHEET: &str = r#"body {
  font-family: Georgia, serif;
  line-height: 1.6;
  margin: 5%;
  color: #1a1a1a;
}
h1, h2, h3, h4, h5, h6 {
  font-weight: bold;
  margin-top: 2em;
  margin-bottom: 0.5em;
  text-align: left;
}
p {
  text-indent: 1.5em;
  margin: 0;
}
p:first-child, h1 + p, h2 + p, h3 + p {
  text-indent: 0;
}
blockquote {
  margin: 1em 2em;
  font-style: italic;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
}
pre, code {
  font-family: monospace;
  font-size: 0.9em;
}
.epigraph { margin: 1em 2em; font-style: italic; }
.poem { margin: 1em 2em; }
.scene-break { text-align: center; margin: 1.5em 0; }
/* Comic mode */
body.comic { margin: 0; padding: 0; background: #000; }
.comic-page { text-align: center; page-break-after: always; margin: 0; }
.comic-page img { max-width: 100%; max-height: 100vh; display: block; margin: 0 auto; }
"#;

const COMIC_STYLESHEET: &str = r#"body {
  margin: 0;
  padding: 0;
  background: #000;
}
.comic-page {
  text-align: center;
  page-break-after: always;
  margin: 0;
  padding: 0;
}
.comic-page img {
  max-width: 100%;
  max-height: 100vh;
  display: block;
  margin: 0 auto;
}
"#;

pub fn comic_stylesheet() -> &'static str {
    COMIC_STYLESHEET
}
