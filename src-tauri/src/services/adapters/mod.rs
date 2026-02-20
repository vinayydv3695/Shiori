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

pub mod txt;
pub mod pdf;
pub mod mobi;
pub mod docx;
pub mod html;
pub mod fb2;

pub use txt::TxtFormatAdapter;
pub use pdf::PdfFormatAdapter;
pub use mobi::MobiFormatAdapter;
pub use docx::DocxFormatAdapter;
pub use html::HtmlFormatAdapter;
pub use fb2::Fb2FormatAdapter;
