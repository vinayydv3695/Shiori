pub mod docx;
pub mod fb2;
pub mod html;
pub mod mobi;
pub mod pdf;
/// Format Adapters Module
///
/// Contains all format-specific adapters implementing the BookFormatAdapter trait.
/// Each adapter provides format-specific logic for metadata extraction, validation,
/// cover extraction, and conversion.
pub mod txt;

pub use docx::DocxFormatAdapter;
pub use fb2::Fb2FormatAdapter;
pub use html::HtmlFormatAdapter;
pub use mobi::MobiFormatAdapter;
pub use pdf::PdfFormatAdapter;
pub use txt::TxtFormatAdapter;
