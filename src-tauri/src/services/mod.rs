pub mod cache;
pub mod collection_service;
pub mod docx_adapter;
pub mod epub_adapter;
pub mod export_service;
pub mod fb2_reader_adapter;
pub mod format_detector;
pub mod html_reader_adapter;
pub mod library_service;
pub mod markdown_reader_adapter;
pub mod metadata_service;
pub mod mobi_adapter;
pub mod pdf_adapter;
pub mod reader_service;
pub mod renderer;
pub mod rendering_service;
pub mod search_service;
pub mod tag_service;
pub mod txt_reader_adapter;

// New v2.0 services
pub mod adapters;
pub mod calibre_service;
pub mod conversion_engine;
pub mod cover_service;
pub mod epub_builder;
pub mod format_adapter;
pub mod format_detection;
pub mod manga_service;
pub mod rss_scheduler;
pub mod rss_service;
pub mod share_service;

// Metadata enrichment services (v2.1)
pub mod book_metadata_service;
pub mod manga_metadata_service;
pub mod online;

// Backup/restore service
pub mod backup_service;

// Translation/dictionary service
pub mod translation_service;

// Folder watch service
pub mod folder_watch;

// Torbox service
pub mod torbox;

// Debrid provider service
pub mod debrid;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod discord_service;
pub mod discovery_service;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod piper_service;
