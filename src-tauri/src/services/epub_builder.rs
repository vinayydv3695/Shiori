/// EPUB Builder for creating EPUB files from scratch
/// 
/// Provides a simple API for building EPUB 3.0 compliant files.
/// Used by conversion engine to convert TXT, HTML, DOCX, etc. to EPUB.

use std::collections::HashMap;
use std::io::{Cursor, Write};
use std::path::Path;
use tokio::fs;
use uuid::Uuid;
use zip::write::{FileOptions, ZipWriter};
use zip::CompressionMethod;

use crate::services::format_adapter::{FormatError, FormatResult};

/// EPUB chapter with title and content
#[derive(Debug, Clone)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub content: String,
}

/// EPUB metadata builder
#[derive(Debug, Clone)]
pub struct EpubMetadata {
    pub title: String,
    pub authors: Vec<String>,
    pub language: String,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub isbn: Option<String>,
    pub date: Option<String>,
}

impl Default for EpubMetadata {
    fn default() -> Self {
        Self {
            title: "Untitled".to_string(),
            authors: vec![],
            language: "en".to_string(),
            publisher: None,
            description: None,
            isbn: None,
            date: None,
        }
    }
}

/// EPUB builder for creating EPUB files
pub struct EpubBuilder {
    metadata: EpubMetadata,
    chapters: Vec<Chapter>,
    stylesheet: Option<String>,
    cover_image: Option<Vec<u8>>,
}

impl EpubBuilder {
    /// Create a new EPUB builder
    pub fn new() -> Self {
        Self {
            metadata: EpubMetadata::default(),
            chapters: Vec::new(),
            stylesheet: Some(Self::default_stylesheet()),
            cover_image: None,
        }
    }
    
    /// Set metadata
    pub fn metadata(mut self, metadata: EpubMetadata) -> Self {
        self.metadata = metadata;
        self
    }
    
    /// Add a chapter
    pub fn add_chapter(&mut self, title: String, content: String) {
        let id = format!("ch{:04}", self.chapters.len() + 1);
        self.chapters.push(Chapter { id, title, content });
    }
    
    /// Set custom stylesheet
    pub fn stylesheet(mut self, css: String) -> Self {
        self.stylesheet = Some(css);
        self
    }
    
    /// Set cover image
    pub fn cover_image(mut self, image_data: Vec<u8>) -> Self {
        self.cover_image = Some(image_data);
        self
    }
    
    /// Generate EPUB file
    pub async fn generate(&self, output_path: &Path) -> FormatResult<()> {
        let zip_data = self.build_zip()?;
        fs::write(output_path, zip_data).await?;
        Ok(())
    }
    
    /// Build EPUB as ZIP bytes
    fn build_zip(&self) -> FormatResult<Vec<u8>> {
        let mut buffer = Cursor::new(Vec::new());
        let mut zip = ZipWriter::new(&mut buffer);
        
        let options: FileOptions<()> = FileOptions::default()
            .compression_method(CompressionMethod::Deflated);
        
        // 1. mimetype (uncompressed, must be first)
        let mimetype_options: FileOptions<()> = FileOptions::default()
            .compression_method(CompressionMethod::Stored);
        zip.start_file("mimetype", mimetype_options)
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        zip.write_all(b"application/epub+zip")
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        
        // 2. META-INF/container.xml
        zip.start_file("META-INF/container.xml", options)
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        zip.write_all(self.container_xml().as_bytes())
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        
        // 3. OEBPS/content.opf (package document)
        zip.start_file("OEBPS/content.opf", options)
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        zip.write_all(self.content_opf().as_bytes())
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        
        // 4. OEBPS/toc.ncx (navigation for EPUB 2)
        zip.start_file("OEBPS/toc.ncx", options)
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        zip.write_all(self.toc_ncx().as_bytes())
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        
        // 5. OEBPS/nav.xhtml (navigation for EPUB 3)
        zip.start_file("OEBPS/nav.xhtml", options)
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        zip.write_all(self.nav_xhtml().as_bytes())
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        
        // 6. OEBPS/stylesheet.css
        if let Some(css) = &self.stylesheet {
            zip.start_file("OEBPS/stylesheet.css", options)
                .map_err(|e| FormatError::ConversionError(e.to_string()))?;
            zip.write_all(css.as_bytes())
                .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        }
        
        // 7. Cover image (if provided)
        if let Some(cover_data) = &self.cover_image {
            zip.start_file("OEBPS/cover.jpg", options)
                .map_err(|e| FormatError::ConversionError(e.to_string()))?;
            zip.write_all(cover_data)
                .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        }
        
        // 8. Chapter files
        for chapter in &self.chapters {
            let filename = format!("OEBPS/{}.xhtml", chapter.id);
            zip.start_file(&filename, options)
                .map_err(|e| FormatError::ConversionError(e.to_string()))?;
            zip.write_all(self.chapter_xhtml(chapter).as_bytes())
                .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        }
        
        zip.finish()
            .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        
        Ok(buffer.into_inner())
    }
    
    /// Generate container.xml
    fn container_xml(&self) -> String {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#.to_string()
    }
    
    /// Generate content.opf (package document)
    fn content_opf(&self) -> String {
        let uuid = Uuid::new_v4();
        let authors_meta = self.metadata.authors
            .iter()
            .map(|a| format!("    <dc:creator>{}</dc:creator>", Self::escape_xml(a)))
            .collect::<Vec<_>>()
            .join("\n");
        
        let optional_meta = vec![
            self.metadata.publisher.as_ref().map(|p| format!("    <dc:publisher>{}</dc:publisher>", Self::escape_xml(p))),
            self.metadata.description.as_ref().map(|d| format!("    <dc:description>{}</dc:description>", Self::escape_xml(d))),
            self.metadata.isbn.as_ref().map(|i| format!("    <dc:identifier id=\"isbn\">{}</dc:identifier>", Self::escape_xml(i))),
            self.metadata.date.as_ref().map(|d| format!("    <dc:date>{}</dc:date>", Self::escape_xml(d))),
        ].into_iter().flatten().collect::<Vec<_>>().join("\n");
        
        let manifest_items = self.chapters
            .iter()
            .map(|ch| format!(r#"    <item id="{}" href="{}.xhtml" media-type="application/xhtml+xml"/>"#, ch.id, ch.id))
            .collect::<Vec<_>>()
            .join("\n");
        
        let spine_items = self.chapters
            .iter()
            .map(|ch| format!(r#"    <itemref idref="{}"/>"#, ch.id))
            .collect::<Vec<_>>()
            .join("\n");
        
        let cover_item = if self.cover_image.is_some() {
            r#"    <item id="cover-image" href="cover.jpg" media-type="image/jpeg"/>"#
        } else {
            ""
        };
        
        format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:{}</dc:identifier>
    <dc:title>{}</dc:title>
{}
    <dc:language>{}</dc:language>
    <meta property="dcterms:modified">{}</meta>
{}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="stylesheet" href="stylesheet.css" media-type="text/css"/>
{}
{}
  </manifest>
  <spine toc="ncx">
{}
  </spine>
</package>"#,
            uuid,
            Self::escape_xml(&self.metadata.title),
            authors_meta,
            Self::escape_xml(&self.metadata.language),
            chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ"),
            optional_meta,
            cover_item,
            manifest_items,
            spine_items
        )
    }
    
    /// Generate toc.ncx (EPUB 2 navigation)
    fn toc_ncx(&self) -> String {
        let nav_points = self.chapters
            .iter()
            .enumerate()
            .map(|(i, ch)| format!(r#"    <navPoint id="{}" playOrder="{}">
      <navLabel><text>{}</text></navLabel>
      <content src="{}.xhtml"/>
    </navPoint>"#, ch.id, i + 1, Self::escape_xml(&ch.title), ch.id))
            .collect::<Vec<_>>()
            .join("\n");
        
        format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:{}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{}</text></docTitle>
  <navMap>
{}
  </navMap>
</ncx>"#,
            Uuid::new_v4(),
            Self::escape_xml(&self.metadata.title),
            nav_points
        )
    }
    
    /// Generate nav.xhtml (EPUB 3 navigation)
    fn nav_xhtml(&self) -> String {
        let nav_items = self.chapters
            .iter()
            .map(|ch| format!(r#"        <li><a href="{}.xhtml">{}</a></li>"#, ch.id, Self::escape_xml(&ch.title)))
            .collect::<Vec<_>>()
            .join("\n");
        
        format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>Navigation</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Table of Contents</h1>
      <ol>
{}
      </ol>
    </nav>
  </body>
</html>"#, nav_items)
    }
    
    /// Generate chapter XHTML
    fn chapter_xhtml(&self, chapter: &Chapter) -> String {
        format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>{}</title>
    <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
  </head>
  <body>
    <h1>{}</h1>
    {}
  </body>
</html>"#,
            Self::escape_xml(&chapter.title),
            Self::escape_xml(&chapter.title),
            Self::format_content(&chapter.content)
        )
    }
    
    /// Default CSS stylesheet
    fn default_stylesheet() -> String {
        r#"body {
  font-family: serif;
  line-height: 1.6;
  margin: 2em;
}

h1 {
  text-align: center;
  margin-bottom: 2em;
}

p {
  text-indent: 1.5em;
  margin: 0;
}

p:first-of-type {
  text-indent: 0;
}"#.to_string()
    }
    
    /// Format content as HTML paragraphs
    fn format_content(content: &str) -> String {
        content
            .split("\n\n")
            .filter(|p| !p.trim().is_empty())
            .map(|p| {
                let text = p.replace('\n', " ").trim().to_string();
                format!("    <p>{}</p>", Self::escape_xml(&text))
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
    
    /// Escape XML special characters
    fn escape_xml(text: &str) -> String {
        text.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }
}

impl Default for EpubBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper function to split text into chapters
pub fn split_text_into_chapters(text: &str) -> Vec<(String, String)> {
    let mut chapters = Vec::new();
    let mut current_title = "Chapter 1".to_string();
    let mut current_content = String::new();
    let mut chapter_num = 1;
    
    for line in text.lines() {
        let trimmed = line.trim();
        
        // Detect chapter markers
        if trimmed.to_lowercase().starts_with("chapter ")
            || trimmed.to_lowercase().starts_with("part ")
            || (trimmed.len() < 50 && trimmed.chars().all(|c| c.is_uppercase() || c.is_whitespace() || c.is_numeric()))
        {
            // Save previous chapter
            if !current_content.trim().is_empty() {
                chapters.push((current_title.clone(), current_content.trim().to_string()));
            }
            
            // Start new chapter
            chapter_num += 1;
            current_title = if trimmed.is_empty() {
                format!("Chapter {}", chapter_num)
            } else {
                trimmed.to_string()
            };
            current_content.clear();
        } else {
            current_content.push_str(line);
            current_content.push('\n');
        }
    }
    
    // Save last chapter
    if !current_content.trim().is_empty() {
        chapters.push((current_title, current_content.trim().to_string()));
    }
    
    // If no chapters detected, treat entire text as one chapter
    if chapters.is_empty() {
        chapters.push(("Full Text".to_string(), text.to_string()));
    }
    
    chapters
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_epub_builder() {
        let mut builder = EpubBuilder::new();
        builder.metadata = EpubMetadata {
            title: "Test Book".to_string(),
            authors: vec!["Test Author".to_string()],
            ..Default::default()
        };
        
        builder.add_chapter("Chapter 1".to_string(), "This is chapter 1 content.".to_string());
        builder.add_chapter("Chapter 2".to_string(), "This is chapter 2 content.".to_string());
        
        assert_eq!(builder.chapters.len(), 2);
    }
    
    #[test]
    fn test_xml_escape() {
        let text = r#"Test & <html> "quotes" 'apostrophe'"#;
        let escaped = EpubBuilder::escape_xml(text);
        assert_eq!(escaped, "Test &amp; &lt;html&gt; &quot;quotes&quot; &apos;apostrophe&apos;");
    }
    
    #[test]
    fn test_chapter_splitting() {
        let text = r#"Chapter 1
This is the first chapter.

Chapter 2
This is the second chapter."#;
        
        let chapters = split_text_into_chapters(text);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].0, "Chapter 1");
        assert_eq!(chapters[1].0, "Chapter 2");
    }
}
