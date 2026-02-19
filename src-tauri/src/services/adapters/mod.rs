/// Format Adapters Module
/// 
/// Contains all format-specific adapters implementing the BookFormatAdapter trait.
/// Each adapter provides format-specific logic for metadata extraction, validation,
/// cover extraction, and conversion.

/// Format Adapters Module
/// 
/// Contains all format-specific adapters implementing the BookFormatAdapter trait.
/// Each adapter provides format-specific logic for metadata extraction, validation,
/// cover extraction, and conversion.

pub mod epub;
pub mod txt;
pub mod pdf;
pub mod mobi;
pub mod docx;
pub mod html;
pub mod fb2;
pub mod cbz;
pub mod cbr;

pub use epub::EpubFormatAdapter;
pub use txt::TxtFormatAdapter;
pub use pdf::PdfFormatAdapter;
pub use mobi::MobiFormatAdapter;
pub use docx::DocxFormatAdapter;
pub use html::HtmlFormatAdapter;
pub use fb2::Fb2FormatAdapter;
pub use cbz::CbzFormatAdapter;
pub use cbr::CbrFormatAdapter;
