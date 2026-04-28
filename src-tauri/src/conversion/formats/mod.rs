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
pub mod mobi;
pub mod txt;
pub mod fb2;
pub mod docx;
pub mod cbz;
pub mod cbr;
