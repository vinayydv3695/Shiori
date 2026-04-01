// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod error;
mod models;
mod services;
mod sources;
mod utils;

use std::sync::Arc;
use tauri::Manager;
use error::ShioriError;

use services::{
    conversion_engine::ConversionEngine,
    cover_service::CoverService,
    rss_service::RssService,
    rss_scheduler::RssScheduler,
    share_service::ShareService,
    manga_metadata_service::MangaMetadataService,
    book_metadata_service::BookMetadataService,
    folder_watch::FolderWatchService,
    online::{
        worker::{MetadataWorker, MetadataJob},
        anilist::AniListProvider,
        openlibrary::OpenLibraryProvider,
    },
};

pub struct AppState {
    db: db::Database,
    covers_dir: std::path::PathBuf,
    pub plugin_registry: Arc<tokio::sync::RwLock<sources::registry::SourceRegistry>>,
}

pub struct MetadataState {
    pub sender: tokio::sync::mpsc::Sender<MetadataJob>,
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    env_logger::init();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build());
    
    #[cfg(feature = "native-tts")]
    {
        log::info!("Native TTS plugin enabled - initializing tauri-plugin-tts");
        builder = builder.plugin(tauri_plugin_tts::init());
    }
    
    #[cfg(not(feature = "native-tts"))]
    {
        log::warn!("Native TTS plugin NOT enabled - rebuild with --features native-tts for native TTS support");
    }
    
    builder.setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| ShioriError::Other(format!("Failed to get app data directory: {}", e)))?;

            std::fs::create_dir_all(&app_dir)?;

            let db_path = app_dir.join("library.db");
            let database = db::Database::new(&db_path)?;

            let covers_dir = app_dir.join("covers");
            std::fs::create_dir_all(&covers_dir)?;

            let mut registry = sources::registry::SourceRegistry::new();
            registry.register(Arc::new(sources::mangadex::MangaDexSource::new()?));
            registry.register(Arc::new(sources::mangafire::MangaFireSource::new()?));
            registry.register(Arc::new(sources::toongod::ToonGodSource::new()?));
            let anna_source = Arc::new(sources::annas_archive::AnnasArchiveSource::new()?);
            tauri::async_runtime::block_on(anna_source.load_api_key_from_store(&app.handle().clone()))?;
            registry.register(anna_source);
            let plugin_registry = Arc::new(tokio::sync::RwLock::new(registry));

            app.manage(AppState {
                db: database.clone(),
                covers_dir: covers_dir.clone(),
                plugin_registry,
            });

            // Initialize rendering service with 100MB cache
            app.manage(commands::rendering::RenderingState::new(100));

            // Initialize manga reader service
            app.manage(commands::manga::MangaState::new());

            // Initialize v2.0 services
            let storage_path = app_dir.join("storage");
            std::fs::create_dir_all(&storage_path)?;

            let mut conversion_engine = ConversionEngine::new(4, app.handle().clone());
            conversion_engine.set_database(database.clone());
            let conversion_engine = Arc::new(conversion_engine);
            if let Ok(conn) = database.get_connection() {
                conversion_engine.restore_from_db(&conn);
            }

            app.manage(conversion_engine);


            // Cover service
            let cover_service = Arc::new(CoverService::new(storage_path.clone())?);
            app.manage(cover_service);

            // RSS service
            let rss_service = Arc::new(RssService::new(database.clone(), storage_path.clone())?);
            app.manage(Arc::clone(&rss_service));

            // RSS scheduler (daily EPUB at 6 AM)
            let rss_scheduler = Arc::new(tokio::sync::Mutex::new(
                tauri::async_runtime::block_on(async {
                    RssScheduler::new(rss_service, true, None).await
                })?
            ));
            
            // Start RSS scheduler
            let scheduler_clone = Arc::clone(&rss_scheduler);
            tauri::async_runtime::spawn(async move {
                if let Ok(mut scheduler) = scheduler_clone.try_lock() {
                    if let Err(e) = scheduler.start().await {
                        log::error!("Failed to start RSS scheduler: {}", e);
                    }
                }
            });
            
            app.manage(rss_scheduler);

            // Share service
            let share_service = Arc::new(tokio::sync::Mutex::new(
                ShareService::new(database.clone(), storage_path.clone(), Some(8080))
            ));
            app.manage(share_service);

            // Metadata enrichment services (v2.1)
            let manga_metadata_service = Arc::new(MangaMetadataService::new()?);
            app.manage(manga_metadata_service);
            
            let book_metadata_service = Arc::new(BookMetadataService::new()?);
            app.manage(book_metadata_service);

            // Online Metadata Enrichment Worker
            let (mut metadata_worker, metadata_rx) = MetadataWorker::new(database.clone());
            
            if let Ok(anilist) = AniListProvider::new() {
                metadata_worker.add_provider(Arc::new(anilist));
            }
            if let Ok(ol) = OpenLibraryProvider::new() {
                metadata_worker.add_provider(Arc::new(ol));
            }

            let metadata_job_sender = metadata_worker.sender.clone();
            metadata_worker.set_app_handle(app.handle().clone());
            metadata_worker.start(metadata_rx);

            app.manage(MetadataState {
                sender: metadata_job_sender,
            });

            let folder_watch_service = FolderWatchService::new(database.clone(), covers_dir.clone());
            app.manage(commands::folder_watch::FolderWatchState::new(folder_watch_service));

            log::info!("Shiori v2.0 initialized with database at {:?}", db_path);
            log::info!("Storage path: {:?}", storage_path);
            log::info!("Conversion engine: 4 workers");
            log::info!("RSS scheduler: enabled (daily EPUB at 6 AM)");
            log::info!("Share server: ready (port 8080)");
            log::info!("Metadata APIs: AniList (manga) + Open Library (books)");
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::get_books,
            commands::library::find_duplicate_books,
            commands::library::get_total_books,
            commands::library::get_book,
            commands::library::add_book,
            commands::library::update_book,
            commands::library::delete_book,
            commands::library::delete_books,
            commands::library::import_books,
            commands::library::scan_folder_for_books,
            commands::library::import_manga,
            commands::library::scan_folder_for_manga,
            commands::library::import_comics,
            commands::library::scan_folder_for_comics,
            commands::library::start_background_scan,
            commands::library::get_books_by_domain,
            commands::library::get_total_books_by_domain,
            commands::library::reset_database,
            commands::library::update_reading_status,
            commands::library::get_books_by_reading_status,
            commands::search::search_books,
            commands::metadata::extract_metadata,
            commands::metadata::search_manga_metadata,
            commands::metadata::get_manga_metadata_by_id,
            commands::metadata::parse_manga_filename,
            commands::metadata::search_book_metadata,
            commands::metadata::search_book_by_isbn,
            commands::metadata::enrich_book_metadata,
            commands::metadata::apply_selected_metadata,
            commands::metadata::preview_cover_url,
            commands::tags::get_tags,
            commands::tags::create_tag,
            commands::tags::add_tag_to_book,
            commands::tags::remove_tag_from_book,
            commands::reader::get_reading_progress,
            commands::reader::save_reading_progress,
            commands::reader::get_annotations,
            commands::reader::create_annotation,
            commands::reader::update_annotation,
            commands::reader::delete_annotation,
            commands::reader::get_annotation_categories,
            commands::reader::create_annotation_category,
            commands::reader::update_annotation_category,
            commands::reader::delete_annotation_category,
            commands::reader::search_annotations_global,
            commands::reader::get_all_annotations,
            commands::reader::export_annotations,
            commands::reader::get_reader_settings,
            commands::reader::save_reader_settings,
            commands::reader::get_book_file_path,
            commands::reader::detect_book_format,
            commands::reader::validate_book_file,
            commands::reader::get_error_details,
            commands::reader::start_reading_session,
            commands::reader::end_reading_session,
            commands::reader::heartbeat_reading_session,
            commands::reader::get_daily_reading_stats,
            commands::reader::get_book_reading_stats,
            commands::reader::get_reading_streak,
            commands::reader::get_reading_goal,
            commands::reader::update_reading_goal,
            commands::reader::get_today_reading_time,
            commands::rendering::open_book_renderer,
            commands::rendering::close_book_renderer,
            commands::rendering::get_book_toc,
            commands::rendering::get_book_chapter,
            commands::rendering::get_book_chapter_count,
            commands::rendering::search_in_book,
            commands::rendering::get_epub_resource,
            commands::rendering::get_renderer_cache_stats,
            commands::rendering::clear_renderer_cache,
            commands::rendering::render_pdf_page,
            commands::rendering::get_pdf_page_dimensions,
            commands::collections::get_collections,
            commands::collections::get_collection,
            commands::collections::create_collection,
            commands::collections::update_collection,
            commands::collections::delete_collection,
            commands::collections::add_book_to_collection,
            commands::collections::remove_book_from_collection,
            commands::collections::add_books_to_collection,
            commands::collections::get_collection_books,
            commands::collections::get_nested_collections,
            commands::collections::toggle_book_favorite,
            commands::collections::get_favorite_book_ids,
            commands::collections::get_collections_by_type,
            commands::collections::preview_smart_collection,
            commands::export::export_library,
            // v2.0 commands
            commands::conversion::convert_book,
            commands::conversion::get_conversion_status,
            commands::conversion::list_conversion_jobs,
            commands::conversion::cancel_conversion,
            commands::conversion::get_supported_conversions,
            commands::cover::generate_cover,
            commands::cover::get_book_cover,
            commands::cover::get_book_cover_bytes,
            commands::cover::get_cover_by_id,
            commands::cover::get_cover_path_by_id,
            commands::cover::clear_cover_cache,
            commands::rss::add_rss_feed,
            commands::rss::get_rss_feed,
            commands::rss::list_rss_feeds,
            commands::rss::update_rss_feed,
            commands::rss::delete_rss_feed,
            commands::rss::toggle_rss_feed,
            commands::rss::update_rss_feed_articles,
            commands::rss::update_all_rss_feeds,
            commands::rss::get_unread_articles,
            commands::rss::mark_article_read,
            commands::rss::generate_daily_epub,
            commands::rss::trigger_feed_update,
            commands::rss::trigger_daily_epub_generation,
            commands::share::create_book_share,
            commands::share::get_share,
            commands::share::is_share_valid,
            commands::share::revoke_share,
            commands::share::list_book_shares,
            commands::share::start_share_server,
            commands::share::stop_share_server,
            commands::share::is_share_server_running,
            commands::share::cleanup_expired_shares,
            // Manga reader commands
            commands::manga::open_manga,
            commands::manga::get_manga_page,
            commands::manga::get_manga_page_path,
            commands::manga::preload_manga_pages,
            commands::manga::get_manga_page_dimensions,
            commands::manga::close_manga,
            commands::manga::get_manga_series_list,
            commands::manga::get_series_volumes,
            commands::manga::auto_group_manga_volumes,
            commands::manga::create_manga_series,
            commands::manga::assign_book_to_series,
            commands::manga::remove_book_from_series,
            // Preferences commands
            commands::preferences::get_user_preferences,
            commands::preferences::get_theme_sync,
            commands::preferences::update_user_preferences,
            commands::preferences::get_book_preference_overrides,
            commands::preferences::set_book_preference_override,
            commands::preferences::clear_book_preference_override,
            commands::preferences::get_manga_preference_overrides,
            commands::preferences::set_manga_preference_override,
            commands::preferences::clear_manga_preference_override,
            commands::preferences::get_onboarding_state,
            commands::preferences::complete_onboarding,
            commands::preferences::reset_onboarding,
            // Doodle commands
            commands::doodle::save_doodle,
            commands::doodle::get_doodle,
            commands::doodle::delete_doodle,
            commands::doodle::delete_book_doodles,
            // Backup commands
            commands::backup::create_backup,
            commands::backup::restore_backup,
            commands::backup::get_backup_info,
            // File write command
            commands::export::write_text_to_file,
            // Translation/dictionary commands
            commands::translation::dictionary_lookup,
            commands::translation::translate_text,
            // Folder watch commands
            commands::folder_watch::start_folder_watch,
            commands::folder_watch::stop_folder_watch,
            commands::folder_watch::add_watch_folder,
            commands::folder_watch::remove_watch_folder,
            commands::folder_watch::get_watch_folders,
            commands::folder_watch::get_watch_status,
            commands::sources::list_sources,
            commands::sources::list_sources_by_type,
            commands::sources::plugin_search,
            commands::sources::plugin_get_chapters,
            commands::sources::plugin_get_pages,
            commands::sources::plugin_download_chapter,
            commands::sources::set_source_config,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal error starting Shiori application: {}", e);
            std::process::exit(1);
        });
}
