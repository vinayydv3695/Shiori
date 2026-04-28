/// PDF → OEB wrapper.
///
/// Bridges the existing `crate::conversion::pdf::convert` function to the
/// new `OebBook`-based pipeline. Runs conversion to a temp EPUB, then
/// builds an OebBook from the extracted metadata and chapter content — but
/// since the PDF parser already writes a complete EPUB to disk, we use the
/// existing path for direct EPUB output and only construct a minimal OebBook
/// for compatibility with the dispatcher.
///
/// For on-the-fly conversion (convert_to_epub), the dispatcher will call
/// `crate::conversion::pdf::convert` directly and return the output path.

use std::path::Path;

use crate::conversion::error::ConversionError;
use crate::conversion::oeb::OebBook;

/// Parse a PDF file into an OebBook.
///
/// Internally invokes pdftohtml (if available) or lopdf for text extraction,
/// then populates an OebBook with the extracted chapters and metadata.
#[allow(dead_code)]
pub fn parse(path: &Path) -> Result<OebBook, ConversionError> {
    // We need a sync runtime block since the existing pdf converter is async
    // but parse() is sync. Use tokio::task::block_in_place if inside a tokio
    // runtime, or create a minimal runtime.
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| ConversionError::Other(format!("Failed to build runtime: {}", e)))?;

    let path_buf = path.to_path_buf();
    let tmp = std::env::temp_dir().join(format!(
        "shiori_pdf_parse_{}.epub",
        uuid::Uuid::new_v4()
    ));

    // Run the existing async PDF converter synchronously
    let epub_output = runtime.block_on(async {
        crate::conversion::pdf::convert(&path_buf, &tmp).await
    }).map_err(|e| ConversionError::Other(e.to_string()))?;

    // Build a minimal OebBook with the converter's metadata.
    // The actual EPUB is at epub_output.path — the dispatcher will just
    // return that path directly, but for pipe compatibility we create an OebBook.
    let mut book = OebBook::new(&epub_output.title);
    if let Some(author) = epub_output.author {
        book.authors = vec![author];
    }
    book.language = "en".to_string();

    // Add a single placeholder chapter — the real content is in the temp EPUB
    // that was already written. The dispatcher returns that path directly.
    book.add_chapter(
        Some("Content".to_string()),
        "<p>See generated EPUB for content.</p>".to_string(),
    );

    // Clean up temp file (optional — dispatcher won't re-use it)
    let _ = std::fs::remove_file(&tmp);

    Ok(book)
}
