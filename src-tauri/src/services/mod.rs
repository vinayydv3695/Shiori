pub mod cache;
pub mod collection_service;
pub mod epub_adapter;
pub mod docx_adapter;
pub mod mobi_adapter;
pub mod fb2_reader_adapter;
pub mod html_reader_adapter;
pub mod txt_reader_adapter;
pub mod markdown_reader_adapter;
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
pub mod online;

// Backup/restore service
pub mod backup_service;

// Translation/dictionary service
pub mod translation_service;

// Folder watch service
pub mod folder_watch;

// Torbox service
pub mod torbox;

