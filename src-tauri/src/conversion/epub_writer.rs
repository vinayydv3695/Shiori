/// Enhanced EPUB 3 ZIP assembler for the conversion module.
///
/// Supports images, cover pages, and the full EPUB 3 spec structure:
/// mimetype (Stored, first) → META-INF/container.xml → OEBPS/content.opf
/// → OEBPS/toc.ncx → OEBPS/nav.xhtml → OEBPS/Styles/stylesheet.css
/// → OEBPS/Text/chapter_NNN.xhtml → OEBPS/Images/*

use std::io::{Cursor, Write};
use std::path::Path;
use uuid::Uuid;
use zip::write::FileOptions;
use zip::CompressionMethod;

use super::ConversionError;

/// A chapter in the EPUB
#[derive(Debug, Clone)]
pub struct EpubChapter {
    pub title: String,
    /// Pre-formatted XHTML body content (everything inside <body>)
    pub body_html: String,
}

/// An image resource to include in the EPUB
#[derive(Debug, Clone)]
pub struct EpubImage {
    pub id: String,
    pub filename: String,
    pub media_type: String,
    pub data: Vec<u8>,
}

/// EPUB 3 document builder
pub struct EpubDocument {
    pub title: String,
    pub author: Option<String>,
    pub language: String,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub isbn: Option<String>,
    pub date: Option<String>,
    pub chapters: Vec<EpubChapter>,
    pub images: Vec<EpubImage>,
    pub cover_image_id: Option<String>,
    pub stylesheet: String,
}

impl EpubDocument {
    pub fn new(title: String) -> Self {
        Self {
            title,
            author: None,
            language: "en".to_string(),
            publisher: None,
            description: None,
            isbn: None,
            date: None,
            chapters: Vec::new(),
            images: Vec::new(),
            cover_image_id: None,
            stylesheet: Self::default_stylesheet(),
        }
    }

    pub fn add_chapter(&mut self, title: String, body_html: String) {
        self.chapters.push(EpubChapter { title, body_html });
    }

    pub fn add_image(&mut self, id: String, filename: String, media_type: String, data: Vec<u8>) {
        self.images.push(EpubImage { id, filename, media_type, data });
    }

    pub fn set_cover(&mut self, id: String, filename: String, data: Vec<u8>) {
        let media_type = if filename.ends_with(".png") {
            "image/png".to_string()
        } else {
            "image/jpeg".to_string()
        };
        self.cover_image_id = Some(id.clone());
        self.images.push(EpubImage { id, filename, media_type, data });
    }

    /// Write the EPUB to disk
    pub async fn write_to_file(&self, path: &Path) -> Result<(), ConversionError> {
        let data = self.build_zip()?;
        tokio::fs::write(path, data).await?;
        Ok(())
    }

    /// Build the EPUB as a ZIP byte array
    fn build_zip(&self) -> Result<Vec<u8>, ConversionError> {
        let mut buffer = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(&mut buffer);

        let stored: FileOptions<()> = FileOptions::default()
            .compression_method(CompressionMethod::Stored);
        let deflated: FileOptions<()> = FileOptions::default()
            .compression_method(CompressionMethod::Deflated);

        // 1. mimetype — MUST be first, MUST be Stored (uncompressed)
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
        zip.write_all(self.content_opf().as_bytes())
            .map_err(|e| ConversionError::Other(e.to_string()))?;

        // 4. OEBPS/toc.ncx
        zip.start_file("OEBPS/toc.ncx", deflated)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
        zip.write_all(self.toc_ncx().as_bytes())
            .map_err(|e| ConversionError::Other(e.to_string()))?;

        // 5. OEBPS/nav.xhtml
        zip.start_file("OEBPS/nav.xhtml", deflated)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
        zip.write_all(self.nav_xhtml().as_bytes())
            .map_err(|e| ConversionError::Other(e.to_string()))?;

        // 6. OEBPS/Styles/stylesheet.css
        zip.start_file("OEBPS/Styles/stylesheet.css", deflated)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
        zip.write_all(self.stylesheet.as_bytes())
            .map_err(|e| ConversionError::Other(e.to_string()))?;

        // 7. Chapter XHTML files
        for (i, chapter) in self.chapters.iter().enumerate() {
            let filename = format!("OEBPS/Text/chapter_{:03}.xhtml", i + 1);
            zip.start_file(&filename, deflated)
                .map_err(|e| ConversionError::Other(e.to_string()))?;
            zip.write_all(self.chapter_xhtml(chapter).as_bytes())
                .map_err(|e| ConversionError::Other(e.to_string()))?;
        }

        // 8. Image files
        for img in &self.images {
            let filename = format!("OEBPS/Images/{}", img.filename);
            zip.start_file(&filename, deflated)
                .map_err(|e| ConversionError::Other(e.to_string()))?;
            zip.write_all(&img.data)
                .map_err(|e| ConversionError::Other(e.to_string()))?;
        }

        zip.finish().map_err(|e| ConversionError::Other(e.to_string()))?;
        Ok(buffer.into_inner())
    }

    // ── XML generators ────────────────────────────────────────────────────

    fn content_opf(&self) -> String {
        let uuid = Uuid::new_v4();
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");

        let author_xml = self.author.as_ref()
            .map(|a| format!("    <dc:creator>{}</dc:creator>", escape_xml(a)))
            .unwrap_or_default();

        let mut optional = Vec::new();
        if let Some(ref p) = self.publisher {
            optional.push(format!("    <dc:publisher>{}</dc:publisher>", escape_xml(p)));
        }
        if let Some(ref d) = self.description {
            optional.push(format!("    <dc:description>{}</dc:description>", escape_xml(d)));
        }
        if let Some(ref i) = self.isbn {
            optional.push(format!("    <dc:identifier id=\"isbn\">{}</dc:identifier>", escape_xml(i)));
        }
        if let Some(ref d) = self.date {
            optional.push(format!("    <dc:date>{}</dc:date>", escape_xml(d)));
        }

        // Cover meta
        let cover_meta = self.cover_image_id.as_ref()
            .map(|id| format!("    <meta name=\"cover\" content=\"{}\"/>", id))
            .unwrap_or_default();

        // Manifest: nav, ncx, stylesheet, chapters, images
        let mut manifest = vec![
            "    <item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>".to_string(),
            "    <item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>".to_string(),
            "    <item id=\"stylesheet\" href=\"Styles/stylesheet.css\" media-type=\"text/css\"/>".to_string(),
        ];
        for (i, _) in self.chapters.iter().enumerate() {
            let id = format!("chapter_{:03}", i + 1);
            manifest.push(format!(
                "    <item id=\"{}\" href=\"Text/{}.xhtml\" media-type=\"application/xhtml+xml\"/>",
                id, id
            ));
        }
        for img in &self.images {
            let props = if self.cover_image_id.as_deref() == Some(&img.id) {
                " properties=\"cover-image\""
            } else {
                ""
            };
            manifest.push(format!(
                "    <item id=\"{}\" href=\"Images/{}\" media-type=\"{}\"{}/>" ,
                img.id, img.filename, img.media_type, props
            ));
        }

        // Spine
        let spine: Vec<String> = (0..self.chapters.len())
            .map(|i| format!("    <itemref idref=\"chapter_{:03}\"/>", i + 1))
            .collect();

        format!(
r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:{uuid}</dc:identifier>
    <dc:title>{title}</dc:title>
{author}
    <dc:language>{lang}</dc:language>
    <meta property="dcterms:modified">{modified}</meta>
{optional}
{cover_meta}
  </metadata>
  <manifest>
{manifest}
  </manifest>
  <spine toc="ncx">
{spine}
  </spine>
</package>"#,
            uuid = uuid,
            title = escape_xml(&self.title),
            author = author_xml,
            lang = escape_xml(&self.language),
            modified = now,
            optional = optional.join("\n"),
            cover_meta = cover_meta,
            manifest = manifest.join("\n"),
            spine = spine.join("\n"),
        )
    }

    fn toc_ncx(&self) -> String {
        let uuid = Uuid::new_v4();
        let points: Vec<String> = self.chapters.iter().enumerate().map(|(i, ch)| {
            format!(
r#"    <navPoint id="navpoint-{n}" playOrder="{n}">
      <navLabel><text>{title}</text></navLabel>
      <content src="Text/chapter_{id}.xhtml"/>
    </navPoint>"#,
                n = i + 1,
                title = escape_xml(&ch.title),
                id = format!("{:03}", i + 1),
            )
        }).collect();

        format!(
r#"<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:{uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{title}</text></docTitle>
  <navMap>
{points}
  </navMap>
</ncx>"#,
            uuid = uuid,
            title = escape_xml(&self.title),
            points = points.join("\n"),
        )
    }

    fn nav_xhtml(&self) -> String {
        let items: Vec<String> = self.chapters.iter().enumerate().map(|(i, ch)| {
            format!(
                "        <li><a href=\"Text/chapter_{:03}.xhtml\">{}</a></li>",
                i + 1,
                escape_xml(&ch.title)
            )
        }).collect();

        format!(
r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops" lang="{lang}">
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
            lang = escape_xml(&self.language),
            items = items.join("\n"),
        )
    }

    fn chapter_xhtml(&self, chapter: &EpubChapter) -> String {
        format!(
r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}">
<head>
  <title>{title}</title>
  <link rel="stylesheet" type="text/css" href="../Styles/stylesheet.css"/>
</head>
<body>
{body}
</body>
</html>"#,
            lang = escape_xml(&self.language),
            title = escape_xml(&chapter.title),
            body = &chapter.body_html,
        )
    }

    fn default_stylesheet() -> String {
        r#"body { margin: 5%; text-align: justify; font-size: 1em; }
h1, h2, h3, h4, h5, h6 { text-align: left; margin: 1.5em 0 0.5em; }
p { text-indent: 1.5em; margin: 0; }
p.first-in-chapter { text-indent: 0; }
blockquote { margin: 1em 2em; font-style: italic; }
.scene-break { text-align: center; margin: 1.5em 0; border: none; }
img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
pre, code { font-family: monospace; font-size: 0.9em; }
.epigraph { margin: 1em 2em; font-style: italic; }
.poem { margin: 1em 2em; }
.stanza { margin: 0.5em 0; }
aside[epub|type="footnote"] { font-size: 0.85em; margin-top: 1em; border-top: 1px solid #ccc; padding-top: 0.5em; }
"#.to_string()
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;

/// Escape XML special characters
pub fn escape_xml(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
