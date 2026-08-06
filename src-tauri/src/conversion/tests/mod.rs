/// Roundtrip tests for the EPUB builder and OEB structs.
///
/// Each supported source format is parsed from the shared fixtures in
/// `broken-files/samples/`, assembled into an EPUB and read back with the
/// `epub` crate to assert chapter structure and content survived.

#[cfg(test)]
pub mod tests {
    use crate::conversion::{
        epub_builder, formats,
        oeb::{ImageSource, OebBook, OebChapter},
    };
    use std::io::Read;
    use std::io::Write;
    use std::path::{Path, PathBuf};

    /// Absolute path to a fixture in `broken-files/samples/`.
    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../broken-files/samples")
            .join(name)
    }

    /// True when all external fixture files exist (they live in broken-files/
    /// which is not part of the repo). Callers: `if !require_fixtures(&[…]) {
    /// return; }` to skip fixture-dependent tests gracefully.
    fn require_fixtures(names: &[&str]) -> bool {
        for name in names {
            let p = fixture(name);
            if !p.exists() {
                eprintln!("SKIP: fixture missing: {}", p.display());
                return false;
            }
        }
        true
    }

    /// Absolute path to a fixture in `broken-files/`.
    fn broken_fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../broken-files")
            .join(name)
    }

    /// Build an EPUB from a parsed book and return (epub path, full text of all chapters).
    fn build_and_read(book: &mut OebBook) -> (PathBuf, String) {
        book.sanitize_html();
        let tmp = std::env::temp_dir().join(format!(
            "shiori_test_roundtrip_{}.epub",
            uuid::Uuid::new_v4()
        ));
        epub_builder::build_epub(book, &tmp).expect("build_epub failed");
        assert!(tmp.exists(), "EPUB file was not created");

        let mut doc = ::epub::doc::EpubDoc::new(&tmp).expect("epub crate failed to open output");
        let mut full_text = String::new();
        for i in 0..doc.get_num_chapters() {
            doc.set_current_chapter(i);
            if let Some((content, _mime)) = doc.get_current_str() {
                full_text.push_str(&content);
                full_text.push('\n');
            }
        }
        (tmp, full_text)
    }

    fn assert_chapter_text(book: &mut OebBook, expected: &[&str]) {
        let (tmp, full_text) = build_and_read(book);
        for fragment in expected {
            assert!(
                full_text.contains(fragment),
                "EPUB text missing {:?}. Got: {}",
                fragment,
                full_text.chars().take(500).collect::<String>()
            );
        }
        std::fs::remove_file(tmp).unwrap();
    }

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
            crate::conversion::convert_to_epub_new(std::path::Path::new("test.xyz"), None, None)
                .await;
        assert!(
            matches!(
                result,
                Err(crate::conversion::ConversionError::UnsupportedFormat(_))
            ),
            "Expected UnsupportedFormat error"
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    // PER-FORMAT ROUND-TRIPS (fixtures from broken-files/samples/)
    // ──────────────────────────────────────────────────────────────────────

    #[test]
    fn test_pdf_roundtrip() {
        if !require_fixtures(&["book.pdf"]) { return; }
        let mut book = formats::pdf::parse(&fixture("book.pdf")).expect("pdf parse failed");
        assert!(!book.chapters.is_empty(), "pdf produced no chapters");
        assert_chapter_text(&mut book, &["Chapter One", "Once upon a time"]);
    }

    /// Extract TOC link labels from the generated EPUB's nav.xhtml.
    fn toc_titles(epub_path: &Path) -> Vec<String> {
        let file = std::fs::File::open(epub_path).expect("open epub");
        let mut archive = zip::ZipArchive::new(file).expect("zip open");
        let mut nav = String::new();
        archive
            .by_name("OEBPS/nav.xhtml")
            .expect("nav.xhtml")
            .read_to_string(&mut nav)
            .expect("read nav");
        let mut titles = Vec::new();
        for line in nav.lines() {
            let t = line.trim();
            if !t.contains("<a href=") {
                continue;
            }
            if let Some(end) = t.find("</a>") {
                if let Some(open) = t[..end].rfind('>') {
                    titles.push(t[open + 1..end].to_string());
                }
            }
        }
        titles
    }

    #[test]
    fn test_pdf_fixture_exact_chapters() {
        let path = fixture("book.pdf");
        if !path.exists() {
            eprintln!("SKIP: pdf fixture not present");
            return;
        }
        let mut book = formats::pdf::parse(&path).expect("pdf parse failed");
        // The 3-page fixture has exactly three "Chapter …" headings — the
        // title page must not become a chapter and body text must never be
        // swallowed into a TOC title (regression: "Chapter TwoSed do
        // eiusmod tempor …" junk titles and 6 chapters).
        assert_eq!(
            book.chapters.len(),
            3,
            "expected exactly 3 chapters, got {}: {:?}",
            book.chapters.len(),
            book.chapters
                .iter()
                .map(|c| c.title.clone().unwrap_or_default())
                .collect::<Vec<_>>()
        );
        let titles: Vec<&str> = book
            .chapters
            .iter()
            .filter_map(|c| c.title.as_deref())
            .collect();
        assert_eq!(
            titles,
            vec!["Chapter One", "Chapter Two", "Chapter Three"],
            "TOC titles must be the three chapter headings"
        );

        let (tmp, _full_text) = build_and_read(&mut book);

        // dc:title must come from the PDF Info dict, not the filename stem.
        // The libreoffice-generated fixture has no PDF Info title, so the
        // filename-stem fallback applies.
        assert_eq!(
            read_opf_tag(&tmp, "dc:title").as_deref(),
            Some("book"),
            "EPUB dc:title must be the filename fallback for a title-less PDF"
        );

        let file = std::fs::File::open(&tmp).expect("open epub");
        let mut archive = zip::ZipArchive::new(file).expect("zip open");
        let mut chapter_files = 0usize;
        for i in 0..archive.len() {
            let f = archive.by_index(i).expect("zip entry");
            let name = f.name().to_string();
            if name.starts_with("OEBPS/Text/chapter_") && name.ends_with(".xhtml") {
                chapter_files += 1;
            }
        }
        assert_eq!(
            chapter_files, 3,
            "expected exactly 3 chapter XHTML files, got {chapter_files}"
        );

        let titles = toc_titles(&tmp);
        for t in &titles {
            assert!(t.len() <= 80, "TOC title longer than 80 chars: {t:?}");
        }
        assert!(
            titles.iter().any(|t| t == "Chapter One"),
            "nav must list Chapter One, got {titles:?}"
        );
        assert!(
            titles.iter().any(|t| t == "Chapter Two"),
            "nav must list Chapter Two, got {titles:?}"
        );
        assert!(
            titles.iter().any(|t| t == "Chapter Three"),
            "nav must list Chapter Three, got {titles:?}"
        );
        std::fs::remove_file(tmp).unwrap();
    }

    #[test]
    fn test_pdf_real_novel_chapters() {
        let path =
            broken_fixture("Teachers_Pet_The_Shadows_of_Darkness_Universe_Book_2_Katerina_St.pdf");
        if !path.exists() {
            eprintln!("SKIP: real pdf fixture not present");
            return;
        }
        let mut book = formats::pdf::parse(&path).expect("pdf parse failed");
        // The 236-page novel has 40 real "Chapter N" headings (plus front
        // matter sections) — a sane TOC needs at least 10 entries.
        assert!(
            book.chapters.len() >= 10,
            "expected ≥10 chapters, got {}",
            book.chapters.len()
        );
        assert!(
            !book.title.trim().is_empty() && book.title != "Untitled",
            "title must not be empty, got {:?}",
            book.title
        );
        // The real file's Info dict title is a UTF-16 artifact ("1. Chapter
        // 1") — filename fallback is fine; only chapter structure matters.
        // The real file's Info dict has no Author entry either — the legacy
        // pipeline yields an empty author list; that's acceptable (the
        // front matter contains it as text, not metadata).

        let (tmp, _full_text) = build_and_read(&mut book);

        let file = std::fs::File::open(&tmp).expect("open epub");
        let mut archive = zip::ZipArchive::new(file).expect("zip open");
        for i in 0..archive.len() {
            let f = archive.by_index(i).expect("zip entry");
            let name = f.name().to_string();
            if name.starts_with("OEBPS/Text/") && name.ends_with(".xhtml") {
                assert!(
                    f.size() <= 400 * 1024,
                    "chapter {name} too large: {} bytes",
                    f.size()
                );
            }
        }

        let titles = toc_titles(&tmp);
        for t in &titles {
            assert!(t.len() <= 80, "TOC title too long: {t:?}");
            assert!(!t.contains("dolor"), "TOC title contains body text: {t:?}");
            assert!(
                !t.contains("pokehaven") && !t.contains("University"),
                "TOC title contains first-paragraph body text: {t:?}"
            );
        }
        assert!(
            titles.iter().any(|t| t == "Chapter 1"),
            "nav must list Chapter 1, got {titles:?}"
        );
        assert!(
            titles.iter().any(|t| t == "Chapter 40"),
            "nav must list the last chapter, got {titles:?}"
        );
        std::fs::remove_file(tmp).unwrap();
    }

    #[test]
    fn test_docx_roundtrip() {
        if !require_fixtures(&["book.docx"]) { return; }
        let mut book = formats::docx::parse(&fixture("book.docx")).expect("docx parse failed");
        assert!(!book.chapters.is_empty(), "docx produced no chapters");
        assert_chapter_text(&mut book, &["Chapter One", "docx content"]);
    }

    #[test]
    fn test_fb2_roundtrip() {
        if !require_fixtures(&["book.fb2"]) { return; }
        let mut book = formats::fb2::parse(&fixture("book.fb2")).expect("fb2 parse failed");
        assert!(!book.chapters.is_empty(), "fb2 produced no chapters");
        assert_eq!(book.title, "Sample Book", "fb2 title from metadata");
        assert_chapter_text(&mut book, &["Chapter One", "test book in FB2"]);
    }

    #[test]
    fn test_txt_roundtrip() {
        if !require_fixtures(&["book.txt"]) { return; }
        let mut book = formats::txt::parse(&fixture("book.txt")).expect("txt parse failed");
        assert!(!book.chapters.is_empty(), "txt produced no chapters");
        assert_chapter_text(&mut book, &["Chapter One", "Once upon a time"]);
    }

    #[test]
    fn test_html_roundtrip() {
        if !require_fixtures(&["book.html"]) { return; }
        let mut book = formats::html::parse(&fixture("book.html")).expect("html parse failed");
        assert!(!book.chapters.is_empty(), "html produced no chapters");
        // First h1 is the title; h2s become chapters.
        assert_eq!(book.title, "Sample Book", "html title from <title> tag");
        assert_chapter_text(&mut book, &["Chapter One", "enough text to paginate"]);
    }

    #[test]
    fn test_markdown_roundtrip() {
        if !require_fixtures(&["book.md"]) { return; }
        let mut book = formats::markdown::parse(&fixture("book.md")).expect("md parse failed");
        assert!(!book.chapters.is_empty(), "md produced no chapters");
        assert_eq!(book.title, "Sample Book", "md title from first heading");
        // # Sample Book is the title; ## Chapter One/Two/Three are chapters.
        assert_eq!(book.chapters.len(), 3, "three h2 chapters expected");
        assert_chapter_text(
            &mut book,
            &["Chapter One", "Markdown chapter one content here."],
        );
    }

    #[test]
    fn test_convert_to_epub_new_markdown() {
        if !require_fixtures(&["book.md"]) { return; }
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../broken-files/samples/book.md");
        let out = crate::conversion::convert_to_epub_new(&path, None, None);
        let out = futures::executor::block_on(out).expect("md conversion failed");
        assert!(out.exists());

        let mut doc = ::epub::doc::EpubDoc::new(&out).expect("epub crate failed to open output");
        let mut full_text = String::new();
        for i in 0..doc.get_num_chapters() {
            doc.set_current_chapter(i);
            if let Some((content, _)) = doc.get_current_str() {
                full_text.push_str(&content);
            }
        }
        assert!(full_text.contains("Chapter One"));
        assert!(full_text.contains("Markdown chapter one content here."));

        // Clean up the temp conversion directory.
        if let Some(parent) = out.parent() {
            let _ = std::fs::remove_dir_all(parent);
        }
    }

    /// Read a metadata element (e.g. `dc:title`) from the generated EPUB's
    /// content.opf.
    fn read_opf_tag(epub_path: &Path, tag: &str) -> Option<String> {
        let file = std::fs::File::open(epub_path).ok()?;
        let mut archive = zip::ZipArchive::new(file).ok()?;
        let mut opf = archive.by_name("OEBPS/content.opf").ok()?;
        let mut s = String::new();
        std::io::Read::read_to_string(&mut opf, &mut s).ok()?;
        let open = format!("<{}>", tag);
        let close = format!("</{}>", tag);
        let start = s.find(&open)? + open.len();
        let end = s[start..].find(&close)? + start;
        Some(s[start..end].to_string())
    }

    // ──────────────────────────────────────────────────────────────────────
    // DOCX / TXT — title and chapter-structure fixes
    // ──────────────────────────────────────────────────────────────────────

    #[test]
    fn test_docx_title_not_first_heading() {
        let path = fixture("book.docx");
        if !path.exists() {
            eprintln!("SKIP: docx fixture not present");
            return;
        }
        let mut book = formats::docx::parse(&path).expect("docx parse failed");
        assert_eq!(
            book.title, "Sample Book",
            "docx title must come from the first-paragraph heuristic, not 'Chapter 1'"
        );
        assert!(
            book.chapters.len() >= 2,
            "docx should keep ≥2 chapters, got {}",
            book.chapters.len()
        );
        let (tmp, full_text) = build_and_read(&mut book);
        assert_eq!(
            read_opf_tag(&tmp, "dc:title").as_deref(),
            Some("Sample Book"),
            "EPUB dc:title must be 'Sample Book'"
        );
        assert!(
            full_text.contains("Chapter One"),
            "chapter text must contain 'Chapter One'"
        );
        std::fs::remove_file(tmp).unwrap();
    }

    #[test]
    fn test_txt_title_and_exact_chapters() {
        let path = fixture("book.txt");
        if !path.exists() {
            eprintln!("SKIP: txt fixture not present");
            return;
        }
        let mut book = formats::txt::parse(&path).expect("txt parse failed");
        assert_eq!(
            book.title, "Sample Book",
            "txt title must come from the first-line heuristic, not the filename stem"
        );
        assert_eq!(
            book.chapters.len(),
            3,
            "exactly 3 chapters expected, got {}",
            book.chapters.len()
        );
        let titles: Vec<&str> = book
            .chapters
            .iter()
            .filter_map(|c| c.title.as_deref())
            .collect();
        assert_eq!(
            titles,
            vec!["Chapter One", "Chapter Two", "Chapter Three"],
            "TOC titles must be the three chapter headings"
        );
        assert!(
            !book.chapters[0]
                .html
                .trim_start()
                .starts_with("<p>Sample Book</p>"),
            "title must not be duplicated as the first chapter body paragraph"
        );
        let (tmp, full_text) = build_and_read(&mut book);
        assert_eq!(
            read_opf_tag(&tmp, "dc:title").as_deref(),
            Some("Sample Book"),
            "EPUB dc:title must be 'Sample Book'"
        );
        assert!(
            !full_text.contains("Sample Book"),
            "front-matter title must not appear in any chapter body"
        );
        assert!(
            !full_text.contains("by Test Author"),
            "author line must not appear in any chapter body"
        );
        std::fs::remove_file(tmp).unwrap();
    }

    // ──────────────────────────────────────────────────────────────────────
    // MOBI — stub fixture errors gracefully, real fixture round-trips
    // ──────────────────────────────────────────────────────────────────────

    #[test]
    fn test_mobi_corrupt_input_errors() {
        // book.mobi is a 14-byte "404: Not Found" stub — must fail cleanly.
        let result = formats::mobi::parse(&fixture("book.mobi"));
        assert!(
            result.is_err(),
            "corrupt/missing mobi must produce a conversion error"
        );
    }

    #[test]
    #[ignore]
    fn probe_mobi_adapter() {
        let real = broken_fixture("1752426479_the_briar_club_-_kate_quinn.mobi");
        if !real.exists() {
            eprintln!("SKIP: real mobi fixture not present");
            return;
        }
        let data = std::fs::read(&real).unwrap();
        let m = mobi::Mobi::from_read(&mut &data[..]).unwrap();
        eprintln!(
            "title={:?} author={:?} publisher={:?} lang={:?}",
            m.title(),
            m.author(),
            m.publisher(),
            m.language()
        );
        let mut adapter = crate::services::mobi_adapter::MobiAdapter::new();
        use crate::services::renderer::BookReaderAdapter;
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(adapter.load(&real.to_string_lossy())).unwrap();
        let meta = adapter.get_metadata().unwrap();
        eprintln!("meta={:?} chapters={}", meta.title, adapter.chapter_count());
        let toc = adapter.get_toc().unwrap();
        for t in toc.iter().take(40) {
            eprintln!("toc: {:?} @ {:?}", t.label, t.location);
        }
        for i in 0..adapter.chapter_count() {
            let ch = adapter.get_chapter(i).unwrap();
            eprintln!(
                "ch[{}] title={:?} len={} has_datauri={} has_mbp={} has_img={} has_filepos={}",
                i,
                ch.title,
                ch.content.len(),
                ch.content.contains("data:image"),
                ch.content.contains("mbp:"),
                ch.content.contains("<img"),
                ch.content.contains("filepos")
            );
            if ch.content.contains("<img") || ch.content.contains("mbp:") {
                let idx = ch
                    .content
                    .find("<img")
                    .or_else(|| ch.content.find("mbp:"))
                    .unwrap();
                let start = idx.saturating_sub(50);
                eprintln!(
                    "    ...{:?}...",
                    &ch.content[start..(idx + 150).min(ch.content.len())]
                );
            }
        }
    }

    #[test]
    #[ignore]
    fn probe_mobi_images() {
        let real = broken_fixture("1752426479_the_briar_club_-_kate_quinn.mobi");
        if !real.exists() {
            eprintln!("SKIP");
            return;
        }
        let data = std::fs::read(&real).unwrap();
        fn be_u16(d: &[u8], o: usize) -> Option<u16> {
            d.get(o..o + 2).map(|b| u16::from_be_bytes([b[0], b[1]]))
        }
        fn be_u32(d: &[u8], o: usize) -> Option<u32> {
            d.get(o..o + 4)
                .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
        }
        let num = be_u16(&data, 76).unwrap() as usize;
        let mut offs = Vec::new();
        for i in 0..num {
            offs.push(be_u32(&data, 78 + i * 8).unwrap() as usize);
        }
        let mobi_start = offs[0] + 16;
        let fii = be_u32(&data, mobi_start + 92).unwrap_or(0) as usize;
        eprintln!("fii={fii} num={num}");
        let mut found = 0usize;
        for idx in fii..offs.len() {
            let s = offs[idx];
            let e = offs.get(idx + 1).copied().unwrap_or(data.len());
            let rec = &data[s..e];
            let is_img = (0..rec.len().min(32)).any(|st| {
                let t = &rec[st..];
                (t.len() >= 3 && t[0..3] == [0xFF, 0xD8, 0xFF])
                    || (t.len() >= 8 && t[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
            });
            if is_img {
                found += 1;
            }
        }
        eprintln!("image records found: {found}");
    }

    #[test]
    #[ignore]
    fn probe_mobi_parse() {
        let real = broken_fixture("1752426479_the_briar_club_-_kate_quinn.mobi");
        if !real.exists() {
            eprintln!("SKIP");
            return;
        }
        let mut book = formats::mobi::parse(&real).expect("parse failed");
        eprintln!(
            "title={:?} authors={:?} publisher={:?} lang={:?}",
            book.title, book.authors, book.publisher, book.language
        );
        eprintln!(
            "chapters={} toc={} images={} cover={:?}",
            book.chapters.len(),
            book.toc.len(),
            book.images.len(),
            book.cover_image
                .as_ref()
                .map(|c| {
                    let len = match &c.source {
                        crate::conversion::oeb::ImageSource::Bytes(b) => b.len(),
                        _ => 0,
                    };
                    (c.filename.clone(), len)
                })
        );
        let mut max_len = 0usize;
        for (i, ch) in book.chapters.iter().enumerate() {
            max_len = max_len.max(ch.html.len());
            if ch.html.contains("data:image") || ch.html.contains("<img") {
                eprintln!(
                    "ch[{i}] {:?} len={} img_ref: {:?}",
                    ch.title,
                    ch.html.len(),
                    ch.html.chars().filter(|c| *c == '<').count()
                );
                let idx = ch.html.find("<img").unwrap();
                eprintln!(
                    "    ...{:?}...",
                    &ch.html[idx..(idx + 120).min(ch.html.len())]
                );
            }
        }
        eprintln!("max chapter len={}", max_len);
        book.sanitize_html();
        let tmp = std::env::temp_dir().join(format!("probe_mobi_{}.epub", uuid::Uuid::new_v4()));
        epub_builder::build_epub(&book, &tmp).unwrap();
        let f = std::fs::File::open(&tmp).unwrap();
        let mut z = zip::ZipArchive::new(f).unwrap();
        for i in 0..z.len() {
            let e = z.by_index(i).unwrap();
            eprintln!("entry: {} ({} bytes)", e.name(), e.size());
        }
        use std::io::Read;
        let mut opf = String::new();
        z.by_name("OEBPS/content.opf")
            .unwrap()
            .read_to_string(&mut opf)
            .unwrap();
        eprintln!("opf has cover meta: {}", opf.contains("name=\"cover\""));
        eprintln!(
            "opf has cover-image prop: {}",
            opf.contains("properties=\"cover-image\"")
        );
        eprintln!("opf title: {}", opf.contains("dc:title>The Briar Club<"));
        let mut ncx = String::new();
        z.by_name("OEBPS/toc.ncx")
            .unwrap()
            .read_to_string(&mut ncx)
            .unwrap();
        eprintln!("ncx navPoints: {}", ncx.matches("<navPoint").count());
        std::fs::remove_file(tmp).unwrap();
    }

    #[test]
    fn test_mobi_real_roundtrip() {
        let real = broken_fixture("1752426479_the_briar_club_-_kate_quinn.mobi");
        if !real.exists() {
            eprintln!("SKIP: real mobi fixture not present");
            return;
        }
        let mut book = formats::mobi::parse(&real).expect("real mobi parse failed");
        assert!(!book.chapters.is_empty(), "real mobi produced no chapters");
        assert_chapter_text(&mut book, &["Briar"]);
    }

    // ──────────────────────────────────────────────────────────────────────
    // CBZ / CBR — streaming image sources (bounded RAM)
    // ──────────────────────────────────────────────────────────────────────

    /// A tiny valid PNG (via the image crate).
    fn tiny_png(seed: u8) -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(
            3,
            3,
            image::Rgba([seed, seed.wrapping_mul(2), 255 - seed, 255]),
        );
        let mut bytes = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    /// Like `build_and_read`, but the output EPUB lives inside `dir` — the
    /// shared system temp dir must never see a bare `.epub` child (the
    /// conversion_engine leak test snapshots it, and tests run in parallel).
    fn build_and_read_in(book: &mut OebBook, dir: &Path) -> (PathBuf, String) {
        book.sanitize_html();
        let tmp = dir.join(format!("out_{}.epub", uuid::Uuid::new_v4()));
        epub_builder::build_epub(book, &tmp).expect("build_epub failed");
        assert!(tmp.exists(), "EPUB file was not created");

        let mut doc = ::epub::doc::EpubDoc::new(&tmp).expect("epub crate failed to open output");
        let mut full_text = String::new();
        for i in 0..doc.get_num_chapters() {
            doc.set_current_chapter(i);
            if let Some((content, _mime)) = doc.get_current_str() {
                full_text.push_str(&content);
                full_text.push('\n');
            }
        }
        (tmp, full_text)
    }

    /// Write a synthetic CBZ with `pages` PNG pages (plus ComicInfo.xml).
    fn write_synthetic_cbz(path: &Path, pages: usize) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts: zip::write::FileOptions<()> = zip::write::FileOptions::default();
        zip.start_file("ComicInfo.xml", opts).unwrap();
        zip.write_all(
            b"<?xml version=\"1.0\"?><ComicInfo><Series>Test Comic</Series><Writer>Test Author</Writer></ComicInfo>",
        )
        .unwrap();
        for i in 1..=pages {
            zip.start_file(&format!("page_{:03}.png", i), opts).unwrap();
            zip.write_all(&tiny_png(i as u8)).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn test_cbz_roundtrip_streams_from_archive() {
        let dir = tempfile::Builder::new()
            .prefix("shiori_cbz_rt_")
            .tempdir()
            .unwrap();
        let cbz = dir.path().join("comic.cbz");
        write_synthetic_cbz(&cbz, 12);

        let mut book = formats::cbz::parse(&cbz).expect("cbz parse failed");
        assert_eq!(book.chapters.len(), 12, "one chapter per page");
        assert_eq!(book.images.len(), 12);
        assert!(book.cover_image.is_some());
        // Pages must be streamed from the source archive — no page bytes in RAM.
        for img in book.images.iter().chain(book.cover_image.iter()) {
            assert!(
                matches!(img.source, ImageSource::ZipEntry { .. }),
                "cbz page must be ZipEntry-sourced, got {:?}",
                img.source
            );
        }

        let (tmp, full_text) = build_and_read_in(&mut book, dir.path());
        for page in 1..=12 {
            assert!(
                full_text.contains(&format!("Page {}", page)),
                "epub missing page {}",
                page
            );
        }
        // Title from ComicInfo.xml.
        assert_eq!(book.title, "Test Comic", "title from ComicInfo");

        // All images present in the output zip (12 pages + 1 cover).
        let file = std::fs::File::open(&tmp).unwrap();
        let mut z = zip::ZipArchive::new(file).unwrap();
        let mut img_entries = 0usize;
        for i in 0..z.len() {
            let name = z.by_index(i).unwrap().name().to_string();
            if name.starts_with("OEBPS/Images/") {
                img_entries += 1;
                // Each image entry must round-trip its PNG magic.
                let mut f = z.by_name(&name).unwrap();
                let mut head = [0u8; 8];
                f.read_exact(&mut head).unwrap();
                assert_eq!(&head, b"\x89PNG\r\n\x1a\n", "{} magic", name);
            }
        }
        assert_eq!(img_entries, 13, "12 pages + cover in output epub");
    }

    #[test]
    fn test_image_dir_roundtrip_streams_from_paths() {
        // parse_image_dir is the CBR path (pages already extracted to disk).
        let dir = tempfile::Builder::new()
            .prefix("shiori_imgdir_")
            .tempdir()
            .unwrap();
        for i in 1..=4 {
            std::fs::write(dir.path().join(format!("p{:02}.png", i)), tiny_png(i as u8)).unwrap();
        }

        let mut book = formats::cbz::parse_image_dir(dir.path()).expect("dir parse failed");
        assert_eq!(book.chapters.len(), 4);
        for img in book.images.iter().chain(book.cover_image.iter()) {
            assert!(
                matches!(img.source, ImageSource::Path(_)),
                "extracted page must be Path-sourced"
            );
        }

        let (tmp, full_text) = build_and_read_in(&mut book, dir.path());
        for page in 1..=4 {
            assert!(full_text.contains(&format!("Page {}", page)));
        }
        let _ = tmp;
    }

    // ──────────────────────────────────────────────────────────────────────
    // PDF — file-backed extraction (no whole-file read held in RAM)
    // ──────────────────────────────────────────────────────────────────────

    /// Write a two-page PDF (lopdf) whose pages carry plain Tj text.
    fn write_synthetic_pdf(path: &Path) {
        use lopdf::content::{Content, Operation};
        use lopdf::{dictionary, Document, Object, Stream};

        let mut doc = Document::with_version("1.5");
        let font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        });
        let pages_id = doc.new_object_id();
        let mut page_ids = Vec::new();
        for text in [
            "Chapter One\n\nOnce upon a time there was a test book.",
            "Chapter Two\n\nSed do eiusmod tempor incididunt.",
        ] {
            let content = Content {
                operations: vec![
                    Operation::new("BT", vec![]),
                    Operation::new(
                        "Tf",
                        vec![Object::Name(b"F1".to_vec()), Object::Integer(24)],
                    ),
                    Operation::new("Td", vec![Object::Integer(72), Object::Integer(720)]),
                    Operation::new("Tj", vec![Object::string_literal(text)]),
                    Operation::new("ET", vec![]),
                ],
            };
            let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
            let page_id = doc.add_object(dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "MediaBox" => vec![0i64.into(), 0i64.into(), 612i64.into(), 792i64.into()],
                "Resources" => dictionary! { "Font" => dictionary! { "F1" => font_id } },
                "Contents" => content_id,
            });
            page_ids.push(page_id);
        }
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => page_ids.iter().map(|id| Object::Reference(*id)).collect::<Vec<_>>(),
                "Count" => page_ids.len() as i64,
            }),
        );
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", Object::Reference(catalog_id));
        doc.save(path).expect("lopdf save");
    }

    #[test]
    fn test_pdf_synthetic_roundtrip_file_backed() {
        let dir = tempfile::Builder::new()
            .prefix("shiori_pdf_test_")
            .tempdir()
            .unwrap();
        let pdf = dir.path().join("synthetic.pdf");
        write_synthetic_pdf(&pdf);

        let mut book = formats::pdf::parse(&pdf).expect("pdf parse failed");
        assert!(!book.chapters.is_empty(), "synthetic pdf produced no chapters");

        let (_tmp, full_text) = build_and_read_in(&mut book, dir.path());
        assert!(
            full_text.contains("Chapter One") || full_text.contains("Once upon a time"),
            "pdf text must survive into the epub, got: {:?}",
            full_text.chars().take(200).collect::<String>()
        );
    }
}
