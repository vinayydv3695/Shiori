//! EPUB/TXT → FB2 output smoke (Q-owned harness): the produced FictionBook
//! must be valid-shaped XML AND round-trip through our own FB2 parser.

use shiori::services::conversion_engine::ConversionEngine;

#[tokio::test(flavor = "multi_thread")]
async fn txt_to_fb2_round_trips() {
    let src = std::path::Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../convert/corpus/src/txt/pg84.txt"
    ));
    if !src.exists() {
        eprintln!("skip: fixture missing");
        return;
    }
    let out = std::env::temp_dir().join("shiori_txt_to_fb2_smoke.fb2");
    let _ = std::fs::remove_file(&out);

    let result = ConversionEngine::convert_direct(src, &out, "txt", "fb2", None, None).await;
    assert!(result.is_ok(), "txt→fb2 must succeed: {result:?}");

    let xml = std::fs::read_to_string(&out).expect("fb2 on disk");
    assert!(xml.starts_with("<?xml"), "XML prolog");
    assert!(xml.contains("<FictionBook"), "FictionBook root");
    assert!(xml.contains("<lang>"), "language metadata");
    assert!(xml.contains("<section id=\"chapter_"), "sections present");

    // Round-trip: our FB2 parser must read the produced file back.
    let book = shiori::conversion::formats::fb2::parse(&out).expect("round-trip parse");
    let text: String = book.chapters.iter().map(|c| c.html.clone()).collect();
    assert!(book.chapters.len() > 3, "expected several chapters, got {}", book.chapters.len());
    assert!(text.contains("Chapter 1") || text.contains("CHAPTER 1"), "chapter titles survive");
    assert!(text.contains("Walton") || text.contains("Frankenstein"), "body text survives");
    let _ = std::fs::remove_file(&out);
}

#[tokio::test(flavor = "multi_thread")]
async fn epub_to_fb2_keeps_structure() {
    // Build an EPUB from the corpus with our own writer first, then convert it
    // to FB2 (exercises the epub crate path).
    let src = std::path::Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../convert/corpus/src/txt/pg11.txt"
    ));
    if !src.exists() {
        eprintln!("skip: fixture missing");
        return;
    }
    let epub = std::env::temp_dir().join("shiori_epub_to_fb2_smoke.epub");
    let fb2 = std::env::temp_dir().join("shiori_epub_to_fb2_smoke.fb2");
    let _ = std::fs::remove_file(&epub);
    let _ = std::fs::remove_file(&fb2);

    let r1 = ConversionEngine::convert_direct(src, &epub, "txt", "epub", None, None).await;
    assert!(r1.is_ok(), "txt→epub: {r1:?}");
    let r2 = ConversionEngine::convert_direct(&epub, &fb2, "epub", "fb2", None, None).await;
    assert!(r2.is_ok(), "epub→fb2: {r2:?}");

    let xml = std::fs::read_to_string(&fb2).unwrap();
    assert!(xml.contains("<FictionBook"));
    assert!(xml.contains("Alice") || xml.contains("Rabbit"), "content present");
    let _ = std::fs::remove_file(&epub);
    let _ = std::fs::remove_file(&fb2);
}
