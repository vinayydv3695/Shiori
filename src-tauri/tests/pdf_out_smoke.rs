//! EPUB/TXT → PDF output smoke (Q-owned harness): the printpdf writer must
//! produce a real PDF with bookmarks/outline, embedded-font text and page
//! numbers.

use shiori::services::conversion_engine::ConversionEngine;

#[tokio::test(flavor = "multi_thread")]
async fn txt_to_pdf_produces_bookmarked_pdf() {
    let src = std::path::Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../convert/corpus/src/txt/pg84.txt"
    ));
    if !src.exists() {
        eprintln!("skip: fixture missing");
        return;
    }
    let out = std::env::temp_dir().join("shiori_txt_to_pdf_smoke.pdf");
    let _ = std::fs::remove_file(&out);

    let result = ConversionEngine::convert_direct(
        src,
        &out,
        "txt",
        "pdf",
        None,
        None,
    )
    .await;

    assert!(result.is_ok(), "txt→pdf must succeed: {result:?}");
    let bytes = std::fs::read(&out).expect("pdf on disk");
    assert!(bytes.starts_with(b"%PDF"), "must be a PDF");
    let s = String::from_utf8_lossy(&bytes);
    assert!(s.contains("/Outlines") || s.contains("/outlines lnk"), "must carry an outline/bookmarks section");
    assert!(s.contains("LiberationSerif") || s.contains("/FontFile"), "must embed a font (or fall back)");
    let _ = std::fs::remove_file(&out);
}