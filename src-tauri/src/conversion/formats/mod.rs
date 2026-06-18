pub mod cbr;
pub mod cbz;
pub mod docx;
pub mod fb2;
pub mod mobi;
/// Format parser modules.
///
/// Each module exposes exactly one public function:
///
/// ```rust
/// pub fn parse(path: &std::path::Path) -> Result<OebBook, ConversionError>
/// ```
///
/// These are called by `conversion::convert_to_epub` after format detection.
/// All parsers return an `OebBook` which is then passed to `epub_builder::build_epub`.
pub mod pdf;
pub mod txt;
