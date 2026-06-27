/// Roundtrip test for the EPUB builder and OEB structs.

#[cfg(test)]
pub mod tests {
    use crate::conversion::{
        epub_builder,
        oeb::{OebBook, OebChapter},
    };

    #[test]
    fn test_epub_builder_roundtrip() {
        let mut book = OebBook::new("Test Book");
        book.authors = vec!["Test Author".to_string()];
        book.language = "en".to_string();
        book.chapters.push(OebChapter {
            id: "chapter_001".to_string(),
            title: Some("Chapter 1".to_string()),
            html: "<p>Hello, world.</p>".to_string(),
        });

        let tmp = std::env::temp_dir().join("shiori_test_roundtrip.epub");
        epub_builder::build_epub(&book, &tmp).expect("build_epub failed");
        assert!(tmp.exists(), "EPUB file was not created");

        let file = std::fs::File::open(&tmp).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();

        assert!(archive.by_name("mimetype").is_ok(), "mimetype missing");
        assert!(
            archive.by_name("META-INF/container.xml").is_ok(),
            "container.xml missing"
        );
        assert!(
            archive.by_name("OEBPS/content.opf").is_ok(),
            "content.opf missing"
        );
        assert!(
            archive.by_name("OEBPS/nav.xhtml").is_ok(),
            "nav.xhtml missing"
        );
        assert!(archive.by_name("OEBPS/toc.ncx").is_ok(), "toc.ncx missing");
        assert!(
            archive.by_name("OEBPS/Text/chapter_001.xhtml").is_ok(),
            "chapter_001.xhtml missing"
        );

        // Verify mimetype is uncompressed (EPUB spec requirement)
        let mimetype_entry = archive.by_name("mimetype").unwrap();
        assert_eq!(
            mimetype_entry.compression(),
            zip::CompressionMethod::Stored,
            "mimetype must be stored (uncompressed)"
        );

        std::fs::remove_file(tmp).unwrap();
    }

    #[test]
    fn test_oeb_sanitize_removes_script() {
        let mut book = OebBook::new("Test");
        book.add_chapter(
            Some("Ch1".to_string()),
            r#"<p>Hello</p><script>alert(1)</script><p>World</p>"#.to_string(),
        );
        book.sanitize_html();
        let html = &book.chapters[0].html;
        assert!(!html.contains("<script>"), "script tag should be removed");
        assert!(html.contains("Hello") && html.contains("World"));
    }

    #[tokio::test]
    async fn test_unsupported_format_error() {
        let result =
            crate::conversion::convert_to_epub_new(std::path::Path::new("test.xyz"), None, None).await;
        assert!(
            matches!(
                result,
                Err(crate::conversion::ConversionError::UnsupportedFormat(_))
            ),
            "Expected UnsupportedFormat error"
        );
    }
}
