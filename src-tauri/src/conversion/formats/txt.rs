use crate::conversion::error::ConversionError;
use crate::conversion::oeb::OebBook;
/// TXT/RTF → OEB wrapper.
///
/// Bridges the existing async `crate::conversion::txt::convert` to the
/// new `OebBook`-based dispatcher.
use std::path::Path;

#[allow(dead_code)]
pub fn parse(path: &Path) -> Result<OebBook, ConversionError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| ConversionError::Other(format!("Failed to build runtime: {}", e)))?;

    let path_buf = path.to_path_buf();
    let tmp = std::env::temp_dir().join(format!("shiori_txt_parse_{}.epub", uuid::Uuid::new_v4()));

    let epub_output = runtime
        .block_on(async { crate::conversion::txt::convert(&path_buf, &tmp).await })
        .map_err(|e| ConversionError::Other(e.to_string()))?;

    let mut book = OebBook::new(&epub_output.title);
    book.language = "en".to_string();
    book.add_chapter(
        Some("Content".to_string()),
        "<p>See generated EPUB for content.</p>".to_string(),
    );

    let _ = std::fs::remove_file(&tmp);
    Ok(book)
}
