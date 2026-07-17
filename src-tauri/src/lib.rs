// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cloudflare;
mod commands;
mod conversion;
pub mod db;
pub mod error;
pub mod models;
pub mod services;
pub mod sources;
pub mod utils;

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
    pub discovery_service: std::sync::Arc<services::discovery_service::DiscoveryService>,
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    pub discord: Option<services::discord_service::DiscordService>,
}

pub struct MetadataState {
    pub sender: tokio::sync::mpsc::Sender<MetadataJob>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }


    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init());

    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(tauri_plugin_android_saf::init());
        builder = builder.plugin(tauri_plugin_android_auth::init());
    }
    
    builder = builder
        .plugin(tauri_plugin_os::init())
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
                // Security Fix: SSRF Prevention
                let is_valid = is_safe_url(&image_url).await;

                if is_valid {
                    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                    let referer = match source_id.as_str() {
                        "toongod" => Some("https://www.toongod.org/"),
                        "mangadex" => Some("https://mangadex.org/"),
                        "weebrook" => Some("https://weebrook.com/"),
                        "manhwahub" => Some("https://manhwahub.net/"),
                        "mangafire" => Some("https://mangafire.to/"),
                        "libgen" => Some("https://libgen.li/"),
                        _ => None,
                    };
                    
                    lazy_static::lazy_static! {
                        static ref CLIENT: reqwest::Client = reqwest::Client::builder()
                            .timeout(std::time::Duration::from_secs(15))
                            .build()
                            .unwrap_or_default();
                    }
                        
                    let mut req = CLIENT
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

    builder
        .setup(|app| {
            let app_dir = app.path().app_data_dir().map_err(|e| {
                ShioriError::Other(format!("Failed to get app data directory: {}", e))
            })?;

            std::fs::create_dir_all(&app_dir)?;

            let db_path = app_dir.join("library.db");
            let database = db::Database::new(&db_path)?;

            let mut is_transparent = false;
            let mut is_first_time = true;
            if let Ok(conn) = database.get_connection() {
                if let Ok(mut stmt) = conn.prepare("SELECT value FROM user_preferences WHERE key = 'linuxTransparentWindow'") {
                    if let Ok(mut rows) = stmt.query([]) {
                        if let Ok(Some(row)) = rows.next() {
                            let value: String = row.get(0).unwrap_or_default();
                            is_transparent = value == "true" || value == "1";
                        }
                    }
                }
                
                if let Ok(mut stmt) = conn.prepare("SELECT value FROM user_preferences WHERE key = '_cachedOnboardingCompleted'") {
                    if let Ok(mut rows) = stmt.query([]) {
                        if let Ok(Some(row)) = rows.next() {
                            let value: String = row.get(0).unwrap_or_default();
                            is_first_time = value != "true" && value != "1";
                        }
                    }
                }
            }

            #[allow(unused_mut)]
            let mut builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into())
            )
            .title("Shiori")
            .inner_size(1200.0, 800.0)
            .resizable(true);

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                builder = builder.fullscreen(false).decorations(false);
            }

            // Silence unused_assignments on platforms where is_first_time isn't used
            let _ = is_first_time;

            #[cfg(target_os = "windows")]
            {
                if is_first_time {
                    builder = builder.maximized(true);
                }
            }

            #[cfg(not(target_os = "macos"))]
            let builder = builder.transparent(is_transparent);

            let _window = builder.build()?;

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
            let mangafire_source = Arc::new(sources::mangafire::MangaFireSource::new());
            registry.register(mangafire_source.clone() as Arc<dyn sources::Source>);

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
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
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
            let app_handle_for_toongod = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match cloudflare::client::CfClient::new(
                    "https://www.toongod.org",
                    cf_store_for_toongod,
                ) {
                    Ok(cf_client) => {
                        let cf_client = cf_client.with_app_handle(app_handle_for_toongod);
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

            let mangafire_for_cf = mangafire_source.clone();
            let cf_store_for_mangafire = cf_store.clone();
            let app_handle_for_mangafire = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match cloudflare::client::CfClient::new(
                    "https://mangafire.to",
                    cf_store_for_mangafire,
                ) {
                    Ok(cf_client) => {
                        let cf_client = cf_client.with_app_handle(app_handle_for_mangafire);
                        mangafire_for_cf
                            .set_cf_client(std::sync::Arc::new(cf_client))
                            .await;
                        log::info!(
                            "MangaFire: CfClient attached (automatic Playwright solver active)"
                        );
                    }
                    Err(e) => log::warn!("MangaFire: Failed to build CfClient: {}", e),
                }
            });

            // Initialize discovery service
            let discovery_service = Arc::new(services::discovery_service::DiscoveryService::new().unwrap());

            app.manage(AppState {
                db: database.clone(),
                covers_dir: covers_dir.clone(),
                plugin_registry: plugin_registry.clone(),
                discovery_service: discovery_service.clone(),
                #[cfg(not(any(target_os = "android", target_os = "ios")))]
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

            let piper_service = Arc::new(tokio::sync::Mutex::new(services::piper_service::PiperService::new(app.handle().clone())));
            app.manage(piper_service);

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
        .expect("error while running tauri application");
}

/// Security Fix: SSRF Prevention
/// Validates scheme (https) and ensures IP is not private/loopback/link-local
pub async fn is_safe_url(image_url: &str) -> bool {
    let parsed = match url::Url::parse(image_url) {
        Ok(p) => p,
        Err(_) => return false,
    };
    if parsed.scheme() != "https" {
        return false;
    }
    
    // Validate IP / Host asynchronously
    let host = match parsed.host_str() {
        Some(h) => h,
        None => return false,
    };
    let port = parsed.port_or_known_default().unwrap_or(443);
    
    if let Ok(addrs) = tokio::net::lookup_host((host, port)).await {
        for addr in addrs {
            let ip = addr.ip();
            match ip {
                std::net::IpAddr::V4(ipv4) => {
                    if ipv4.is_private() || ipv4.is_loopback() || ipv4.is_link_local() {
                        return false;
                    }
                }
                std::net::IpAddr::V6(ipv6) => {
                    if ipv6.is_loopback() || (ipv6.segments()[0] & 0xfe00) == 0xfc00 {
                        return false;
                    }
                }
            }
        }
    } else {
        // Could not resolve, fail safe
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_is_safe_url() {
        // Valid HTTPS URLs should pass (assuming github.com resolves to public IP)
        assert!(is_safe_url("https://github.com").await);
        assert!(is_safe_url("https://mangadex.org/api/v2").await);

        // HTTP should fail
        assert!(!is_safe_url("http://github.com").await);
        
        // File schemes should fail
        assert!(!is_safe_url("file:///etc/passwd").await);
        
        // Internal IP addresses should fail
        assert!(!is_safe_url("https://127.0.0.1").await);
        assert!(!is_safe_url("https://localhost").await);
        assert!(!is_safe_url("https://10.0.0.1").await);
        assert!(!is_safe_url("https://192.168.1.1").await);
        assert!(!is_safe_url("https://[::1]").await);
    }
}
