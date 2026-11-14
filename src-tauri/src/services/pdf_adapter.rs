use crate::error::{Result, ShioriError};
use crate::services::renderer::{BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry};
use async_trait::async_trait;
use lopdf::{Document, Object};

#[cfg(test)]
mod fidelity_tests {
    use super::*;
    use lopdf::{dictionary, Stream};

    fn fixture(content: &[u8]) -> Document {
        let mut doc = Document::with_version("1.5");
        let pages = doc.new_object_id();
        let font = doc.add_object(
            dictionary! {"Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica"},
        );
        let stream = doc.add_object(Stream::new(lopdf::Dictionary::new(), content.to_vec()));
        let page = doc.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages, "Contents" => stream,
            "Resources" => dictionary! {"Font" => dictionary! {"F1" => font}},
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        });
        doc.objects.insert(
            pages,
            dictionary! {"Type" => "Pages", "Kids" => vec![page.into()], "Count" => 1}.into(),
        );
        let outline = doc.new_object_id();
        let item = doc.add_object(dictionary! {"Title" => Object::string_literal("Introduction"), "Parent" => outline, "Dest" => vec![page.into(), Object::Name(b"Fit".to_vec())]});
        doc.objects.insert(
            outline,
            dictionary! {"Type" => "Outlines", "First" => item, "Last" => item, "Count" => 1}
                .into(),
        );
        let catalog = doc
            .add_object(dictionary! {"Type" => "Catalog", "Pages" => pages, "Outlines" => outline});
        doc.trailer.set("Root", catalog);
        let info = doc.add_object(dictionary! {"Title" => Object::string_literal("Embedded title"), "Author" => Object::string_literal("Writer")});
        doc.trailer.set("Info", info);
        doc
    }

    #[test]
    fn metadata_text_and_page_navigation_use_loaded_document() {
        let doc = fixture(b"BT /F1 12 Tf 72 720 Td (Actual text) Tj ET");
        assert_eq!(
            PdfAdapter::info_text(&doc, b"Title").as_deref(),
            Some("Embedded title")
        );
        assert_eq!(
            PdfAdapter::info_text(&doc, b"Author").as_deref(),
            Some("Writer")
        );
        assert_eq!(
            PdfAdapter::get_pdf_string(&Object::string_literal(vec![0xfe, 0xff, 0, 65])).as_deref(),
            Some("A")
        );
        let mut adapter = PdfAdapter::new();
        adapter.page_ids = doc.get_pages().values().copied().collect();
        adapter.page_count = 1;
        adapter.doc = Some(doc);
        assert!(adapter
            .get_chapter(0)
            .unwrap()
            .content
            .contains("Actual text"));
        let toc = adapter.get_toc().unwrap();
        assert_eq!(toc[0].label, "Page 1");
        assert_eq!(toc[0].location, "page:1");
        assert_eq!(adapter.search("Actual").unwrap()[0].location, "page:1");
    }

    #[test]
    fn cyclic_outline_links_are_not_traversed() {
        let mut doc = fixture(b"");
        let outline = doc.new_object_id();
        doc.objects.insert(
            outline,
            dictionary! {"Title" => "Loop", "First" => outline, "Next" => outline}.into(),
        );
        let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
        doc.get_object_mut(root)
            .unwrap()
            .as_dict_mut()
            .unwrap()
            .set("Outlines", outline);
        let mut adapter = PdfAdapter::new();
        adapter.page_count = 1;
        adapter.doc = Some(doc);
        assert_eq!(adapter.get_toc().unwrap()[0].label, "Page 1");
    }

    #[test]
    fn blank_and_malformed_pdfs_do_not_invent_text() {
        assert!(Document::load_mem(b"not a PDF").is_err());
        let doc = fixture(b"");
        let mut adapter = PdfAdapter::new();
        adapter.page_ids = doc.get_pages().values().copied().collect();
        adapter.page_count = 1;
        adapter.doc = Some(doc);
        assert!(adapter
            .get_chapter(0)
            .unwrap_err()
            .to_string()
            .contains("No extractable text"));
        assert!(adapter.search("Page 1").unwrap().is_empty());
        assert!(adapter.get_chapter(1).is_err());
    }

    #[test]
    fn malformed_metadata_and_outline_keep_safe_fallbacks() {
        let mut doc = fixture(b"");
        doc.trailer.set("Info", 7);
        assert!(PdfAdapter::info_text(&doc, b"Title").is_none());
        let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
        doc.get_object_mut(root)
            .unwrap()
            .as_dict_mut()
            .unwrap()
            .set("Outlines", Object::Reference((999, 0)));
        let mut adapter = PdfAdapter::new();
        adapter.page_count = 1;
        adapter.doc = Some(doc);
        assert_eq!(adapter.get_toc().unwrap()[0].location, "page:1");
    }
}

pub struct PdfAdapter {
    doc: Option<Document>,
    path: String,
    metadata: Option<BookMetadata>,
    page_count: usize,
    page_ids: Vec<lopdf::ObjectId>,
    /// Extracted from the loaded document once, shared by chapter reads and search.
    page_texts: std::sync::OnceLock<Vec<String>>,
}

unsafe impl Send for PdfAdapter {}
unsafe impl Sync for PdfAdapter {}

impl PdfAdapter {
    pub fn new() -> Self {
        Self {
            doc: None,
            path: String::new(),
            metadata: None,
            page_count: 0,
            page_ids: Vec::new(),
            page_texts: std::sync::OnceLock::new(),
        }
    }

    fn extract_text_from_page(&self, page_number: usize) -> Result<String> {
        let doc = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("PDF not loaded".into()))?;
        doc.extract_text(&[(page_number + 1) as u32])
            .map_err(|error| ShioriError::Other(format!("PDF text extraction failed: {error}")))
    }

    fn get_pdf_string(obj: &Object) -> Option<String> {
        match obj {
            Object::String(bytes, _) if bytes.starts_with(&[0xfe, 0xff]) => {
                let units: Vec<_> = bytes[2..]
                    .chunks_exact(2)
                    .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
                    .collect();
                Some(String::from_utf16_lossy(&units))
            }
            Object::String(bytes, _) => String::from_utf8(bytes.clone())
                .or_else(|_| Ok::<String, ()>(bytes.iter().map(|&b| b as char).collect()))
                .ok(),
            Object::Name(bytes) => String::from_utf8(bytes.clone()).ok(),
            _ => None,
        }
    }

    fn info_text(doc: &Document, key: &[u8]) -> Option<String> {
        let info = doc.trailer.get(b"Info").ok()?;
        let (_, info) = doc.dereference(info).ok()?;
        let value = info.as_dict().ok()?.get(key).ok()?;
        let (_, value) = doc.dereference(value).ok()?;
        Self::get_pdf_string(value).filter(|text| !text.trim().is_empty())
    }
}

#[async_trait]
impl BookReaderAdapter for PdfAdapter {
    async fn load(&mut self, path: &str) -> Result<()> {
        let path_str = path.to_string();

        // Load in a blocking task using Tauri's runtime to avoid panic
        let doc_result = tauri::async_runtime::spawn_blocking(move || {
            Document::load(&path_str).map_err(|e| ShioriError::CorruptedPdf {
                path: path_str.clone(),
                details: format!("{:?}", e),
            })
        })
        .await
        .map_err(|e| ShioriError::Other(format!("Task spawn failed: {:?}", e)))?;

        let doc = doc_result?;
        let page_ids: Vec<_> = doc.get_pages().into_values().collect();
        let page_count = page_ids.len();

        let title = Self::info_text(&doc, b"Title").unwrap_or_else(|| "Unknown Title".to_string());
        let author = Self::info_text(&doc, b"Author");

        self.metadata = Some(BookMetadata {
            title,
            author,
            total_chapters: page_count,
            total_pages: Some(page_count),
            format: "pdf".to_string(),
        });

        self.page_count = page_count;
        self.page_ids = page_ids;
        self.page_texts = std::sync::OnceLock::new();
        self.doc = Some(doc);
        self.path = path.to_string();

        Ok(())
    }

    fn get_metadata(&self) -> Result<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> Result<Vec<TocEntry>> {
        // lopdf 0.33 traverses untrusted outline links without cycle detection.
        let toc: Vec<TocEntry> = (0..self.page_count)
            .step_by(10)
            .map(|i| TocEntry {
                label: format!("Page {}", i + 1),
                location: format!("page:{}", i + 1),
                level: 0,
                children: Vec::new(),
            })
            .collect();
        Ok(toc)
    }

    fn get_chapter(&self, index: usize) -> Result<Chapter> {
        if index >= self.page_count {
            return Err(ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: "Page index out of bounds".to_string(),
            });
        }
        let content = self.extract_text_from_page(index)?;
        if content.trim().is_empty() {
            return Err(ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: "No extractable text on this PDF page; image rendering or OCR is required"
                    .to_string(),
            });
        }
        Ok(Chapter {
            index,
            title: format!("Page {}", index + 1),
            content,
            location: format!("page:{}", index + 1),
        })
    }

    fn chapter_count(&self) -> usize {
        self.page_count
    }

    fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        let text_pages = self.page_texts.get_or_init(|| {
            pdf_extract::extract_text_by_pages(&self.path)
                .ok()
                .filter(|pages| !pages.is_empty())
                .or_else(|| {
                    pdf_extract::extract_text(&self.path)
                        .ok()
                        .map(|text| vec![text])
                })
                .unwrap_or_else(|| {
                    (0..self.page_count)
                        .map(|page| self.extract_text_from_page(page).unwrap_or_default())
                        .collect()
                })
        });
        for (page_num, content) in text_pages.iter().enumerate() {
            {
                let content_lower = content.to_lowercase();
                let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();
                if !matches.is_empty() {
                    let first_match_pos = matches[0].0;

                    // Safely slice using character boundaries to avoid panics on multi-byte UTF-8
                    let char_indices: Vec<(usize, char)> = content.char_indices().collect();
                    let char_idx = char_indices
                        .iter()
                        .position(|&(b_idx, _)| b_idx >= first_match_pos)
                        .unwrap_or(0);
                    let start_char_idx = char_idx.saturating_sub(50);
                    let end_char_idx =
                        (char_idx + query.chars().count() + 50).min(char_indices.len());
                    let start_byte = char_indices
                        .get(start_char_idx)
                        .map(|&(b, _)| b)
                        .unwrap_or(0);
                    let end_byte = if end_char_idx >= char_indices.len() {
                        content.len()
                    } else {
                        char_indices[end_char_idx].0
                    };

                    let snippet = format!("...{}...", &content[start_byte..end_byte]);
                    results.push(SearchResult {
                        chapter_index: page_num,
                        chapter_title: format!("Page {}", page_num + 1),
                        snippet,
                        location: format!("page:{}", page_num + 1),
                        match_count: matches.len(),
                    });
                }
            }
        }
        Ok(results)
    }

    fn get_resource(&self, _path: &str) -> Result<Vec<u8>> {
        // Fallback or empty image to avoid errors
        Ok(Vec::new())
    }

    fn get_resource_mime(&self, _path: &str) -> Result<String> {
        Ok("application/octet-stream".to_string())
    }

    fn supports_pagination(&self) -> bool {
        true
    }

    fn supports_images(&self) -> bool {
        false
    }

    async fn render_page(&self, _page_number: usize, _scale: f32) -> Result<Vec<u8>> {
        Err(ShioriError::Other(
            "Native image rendering is configured off for lopdf".into(),
        ))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
        // Lopdf doesn't easily expose this through a standardized property without checking CropBox, MediaBox, etc.
        // Return standard A4 dimensions roughly as fallback
        Ok((595.0, 842.0))
    }

    fn page_count(&self) -> usize {
        self.page_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression guard for the user-reported "never opens" PDF:
    /// load must return Ok or Err — never panic.
    #[test]
    fn broken_pdf_load_never_panics() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../broken-files/Teachers_Pet_The_Shadows_of_Darkness_Universe_Book_2_Katerina_St.pdf"
        );
        if !std::path::Path::new(path).exists() {
            // Fixture absent (e.g. CI checkout) — nothing to guard, skip.
            return;
        }

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            tauri::async_runtime::block_on(async {
                let mut adapter = PdfAdapter::new();
                adapter.load(path).await
            })
        }));

        match result {
            Ok(_) => {
                // Ok(_) and Err(_) are both acceptable — the invariant is "no panic".
            }
            Err(_) => panic!("PdfAdapter::load panicked on the broken PDF at {}", path),
        }
    }
}
