// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cloudflare;
mod commands;
mod conversion;
mod db;
mod error;
mod models;
mod services;
mod sources;
mod utils;

use error::ShioriError;
use std::sync::Arc;
use tauri::Manager;

use services::{
    book_metadata_service::BookMetadataService,
    conversion_engine::ConversionEngine,
    cover_service::CoverService,
    folder_watch::FolderWatchService,
    manga_metadata_service::MangaMetadataService,
    online::{
        anilist::AniListProvider,
        openlibrary::OpenLibraryProvider,
        worker::{MetadataJob, MetadataWorker},
    },
    rss_scheduler::RssScheduler,
    rss_service::RssService,
    share_service::ShareService,
};

pub struct AppState {
    db: db::Database,
    covers_dir: std::path::PathBuf,
    pub plugin_registry: Arc<tokio::sync::RwLock<sources::registry::SourceRegistry>>,
    pub discord: Option<services::discord_service::DiscordService>,
}

pub struct MetadataState {
    pub sender: tokio::sync::mpsc::Sender<MetadataJob>,
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        // WEBKIT_DISABLE_DMABUF_RENDERER=1 prevents blank/white screens on Arch Linux.
        // DMA-BUF renderer is broken on many webkit2gtk-4.1 builds (both X11 and Wayland).
        // Set unconditionally unless the user explicitly opts back in via SHIORI_WEBKIT_DMABUF=1.
        let dmabuf_enabled = std::env::var("SHIORI_WEBKIT_DMABUF")
            .map(|v| matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);

        if !dmabuf_enabled {
            // Only set if not already set by the user's environment
            if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
                log::info!("Linux: disabled WebKit DMA-BUF renderer (set SHIORI_WEBKIT_DMABUF=1 to enable)");
            }
        }

        // Legacy SHIORI_WEBKIT_SAFE_MODE: additionally disable compositing mode
        let webkit_safe_mode = std::env::var("SHIORI_WEBKIT_SAFE_MODE")
            .map(|value| {
                let normalized = value.trim().to_ascii_lowercase();
                matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
            })
            .unwrap_or(false);

        if webkit_safe_mode {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            log::warn!("Linux WebKit safe mode enabled via SHIORI_WEBKIT_SAFE_MODE");
        }
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init());

    builder = builder.register_asynchronous_uri_scheme_protocol("shiori-proxy", |_ctx, request, responder| {
        let uri = request.uri().to_string();
        
        tauri::async_runtime::spawn(async move {
            let mut source_id = None;
            let mut image_url = None;
            
            if let Ok(url) = url::Url::parse(&uri) {
                for (key, value) in url.query_pairs() {
                    if key == "source" {
                        source_id = Some(value.into_owned());
                    } else if key == "url" {
                        image_url = Some(value.into_owned());
                    }
                }
            }
            
            if let (Some(source_id), Some(image_url)) = (source_id, image_url) {
                let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                let referer = match source_id.as_str() {
                    "toongod" => Some("https://www.toongod.org/"),
                    "mangadex" => Some("https://mangadex.org/"),
                    "weebrook" => Some("https://weebrook.com/"),
                    "manhwahub" => Some("https://manhwahub.net/"),
                    "libgen" => Some("https://libgen.li/"),
                    _ => None,
                };
                
                let mut req = reqwest::Client::new()
                    .get(&image_url)
                    .header("User-Agent", user_agent);
                if let Some(ref_url) = referer {
                    req = req.header("Referer", ref_url);
                }
                
                if let Ok(response) = req.send().await {
                    if response.status().is_success() {
                        // Forward Content-Type if present
                        let content_type = response
                            .headers()
                            .get(reqwest::header::CONTENT_TYPE)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("image/jpeg")
                            .to_string();
                            
                        if let Ok(bytes) = response.bytes().await {
                            responder.respond(
                                tauri::http::Response::builder()
                                    .status(200)
                                    .header("Content-Type", content_type)
                                    .header("Access-Control-Allow-Origin", "*")
                                    .header("Cache-Control", "public, max-age=31536000")
                                    .body(bytes.to_vec())
                                    .unwrap()
                            );
                            return;
                        }
                    }
                }
            }
            
            responder.respond(
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap()
            );
        });
    });

    #[cfg(feature = "native-tts")]
    {
        log::info!("Native TTS plugin enabled - initializing tauri-plugin-tts");
        builder = builder.plugin(tauri_plugin_tts::init());
    }

    #[cfg(not(feature = "native-tts"))]
    {
        log::warn!("Native TTS plugin NOT enabled - rebuild with --features native-tts for native TTS support");
    }

    builder
        .setup(|app| {
            let app_dir = app.path().app_data_dir().map_err(|e| {
                ShioriError::Other(format!("Failed to get app data directory: {}", e))
            })?;

            std::fs::create_dir_all(&app_dir)?;

            let db_path = app_dir.join("library.db");
            let database = db::Database::new(&db_path)?;

            let covers_dir = app_dir.join("covers");
            std::fs::create_dir_all(&covers_dir)?;

            let mut registry = sources::registry::SourceRegistry::new();
            registry.register(Arc::new(sources::mangadex::MangaDexSource::new()?));
            registry.register(Arc::new(sources::nyaa::NyaaSource::new()?));
            // Torbox books removed per requirement.
            let toongod_source = Arc::new(sources::toongod::ToonGodSource::new()?);
            registry.register(toongod_source.clone() as Arc<dyn sources::Source>);
            // Weebrook (freeonlinek.top) — Madara-theme manhwa sources
            registry.register(Arc::new(sources::weebrook::WeebrookManhwaSource::new()?));
            // ManhwaHub
            registry.register(Arc::new(sources::manhwahub::ManhwahubSource::new()?));
            // Anna's Archive for book search and download
            registry.register(Arc::new(sources::annas_archive::AnnasArchiveSource::new()?));
            // LibGen for book search and download
            registry.register(Arc::new(sources::libgen::LibgenSource::new()?));
            registry.register(Arc::new(sources::torrent_csv::TorrentCsvSource::new()?));

            // Load source configs from the Tauri store in the background so the UI
            // appears immediately. Sources use defaults until async hydration completes.
            let app_handle_for_sources = app.handle().clone();
            let toongod_for_config = toongod_source.clone();
            tauri::async_runtime::spawn(async move {
                // Load ToonGod Cloudflare bypass config
                {
                    use tauri_plugin_store::StoreExt;
                    if let Ok(store) = app_handle_for_sources.store("sources.json") {
                        let cf_clearance = store
                            .get("toongod.cf_clearance")
                            .and_then(|v: serde_json::Value| v.as_str().map(ToString::to_string))
                            .filter(|s: &String| !s.is_empty());
                        let flaresolverr_url = store
                            .get("toongod.flaresolverr_url")
                            .and_then(|v: serde_json::Value| v.as_str().map(ToString::to_string))
                            .filter(|s: &String| !s.is_empty());
                        toongod_for_config
                            .set_config(sources::toongod::ToonGodConfig {
                                cf_clearance,
                                flaresolverr_url,
                            })
                            .await;
                    }
                }

                log::info!("Source plugin configs loaded from store");
            });

            let plugin_registry = Arc::new(tokio::sync::RwLock::new(registry));

            // Initialize Discord RPC Service (Placeholder App ID)
            let discord_service =
                services::discord_service::DiscordService::new("1512062340827316265");

            // Cloudflare session state
            let cf_sessions_dir = app_dir.join("cloudflare_sessions");
            let cf_store =
                cloudflare::session::SessionStore::new(&cf_sessions_dir).map_err(|e| {
                    ShioriError::Other(format!("Failed to init CF session store: {}", e))
                })?;
            let cf_state = cloudflare::commands::CloudflareState {
                store: cf_store.clone(),
            };
            app.manage(cf_state);

            // Wire the CfClient to ToonGod source so it can auto-solve challenges.
            let toongod_for_cf = toongod_source.clone();
            let cf_store_for_toongod = cf_store.clone();
            tauri::async_runtime::spawn(async move {
                match cloudflare::client::CfClient::new(
                    "https://www.toongod.org",
                    cf_store_for_toongod,
                ) {
                    Ok(cf_client) => {
                        toongod_for_cf
                            .set_cf_client(std::sync::Arc::new(cf_client))
                            .await;
                        log::info!(
                            "ToonGod: CfClient attached (automatic Playwright solver active)"
                        );
                    }
                    Err(e) => log::warn!("ToonGod: Failed to build CfClient: {}", e),
                }
            });

            app.manage(AppState {
                db: database.clone(),
                covers_dir: covers_dir.clone(),
                plugin_registry,
                discord: Some(discord_service),
            });

            // Initialize Torbox service.
            // API key is loaded asynchronously AFTER setup so we never block_on
            // inside the setup closure (which would deadlock on fresh installs).
            let torbox_state = commands::torbox::TorboxState::new()?;
            app.manage(torbox_state);
            let torbox_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = torbox_handle.state::<commands::torbox::TorboxState>();
                if let Err(e) = state.service.load_api_key_from_store(&torbox_handle).await {
                    log::warn!(
                        "Torbox: failed to load API key from store (may not be configured yet): {}",
                        e
                    );
                } else {
                    log::info!("Torbox: API key loaded from store");
                }
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

            // RSS scheduler — created and started asynchronously so we never
            // block_on inside the setup closure (avoids deadlock on fresh installs).
            // Managed as Option<RssScheduler> — None until the scheduler is ready.
            let rss_scheduler: Arc<tokio::sync::Mutex<Option<RssScheduler>>> =
                Arc::new(tokio::sync::Mutex::new(None));
            app.manage(Arc::clone(&rss_scheduler));

            tauri::async_runtime::spawn(async move {
                match RssScheduler::new(rss_service, true, None).await {
                    Ok(mut scheduler) => {
                        if let Err(e) = scheduler.start().await {
                            log::error!("RSS scheduler failed to start: {}", e);
                            return;
                        }
                        *rss_scheduler.lock().await = Some(scheduler);
                        log::info!("RSS scheduler: started successfully");
                    }
                    Err(e) => log::error!("RSS scheduler failed to initialize: {}", e),
                }
            });

            // Share service
            let share_service = Arc::new(tokio::sync::Mutex::new(ShareService::new(
                database.clone(),
                storage_path.clone(),
                Some(8080),
            )));
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

            let folder_watch_service =
                FolderWatchService::new(database.clone(), covers_dir.clone());
            app.manage(commands::folder_watch::FolderWatchState::new(
                folder_watch_service,
            ));

            log::info!("Shiori v2.0 initialized with database at {:?}", db_path);
            log::info!("Storage path: {:?}", storage_path);
            log::info!("Conversion engine: 4 workers");
            log::info!("RSS scheduler: enabled (daily EPUB at 6 AM)");
            log::info!("Share server: ready (port 8080)");
            log::info!("Metadata APIs: AniList (manga) + Open Library (books)");

            Ok(())
        })
        .invoke_handler(crate::generate_shiori_handlers!())
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal error starting Shiori application: {}", e);
            std::process::exit(1);
        });
}
