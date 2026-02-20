pub mod cache;
pub mod collection_service;
pub mod epub_adapter;
pub mod export_service;
pub mod format_detector;
pub mod library_service;
pub mod metadata_service;
pub mod pdf_adapter;
pub mod reader_service;
pub mod renderer;
pub mod rendering_service;
pub mod search_service;
pub mod tag_service;

// New v2.0 services
pub mod format_adapter;
pub mod manga_service;
pub mod format_detection;
pub mod adapters;
pub mod epub_builder;
pub mod conversion_engine;
pub mod cover_service;
pub mod rss_service;
pub mod rss_scheduler;
pub mod share_service;

// Metadata enrichment services (v2.1)
pub mod manga_metadata_service;
pub mod book_metadata_service;
