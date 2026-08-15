// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cloudflare;
pub mod commands;
pub mod conversion;
pub mod db;
pub mod error;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod espeak_stubs;
pub mod models;
pub mod services;
pub mod sources;
pub mod utils;

use error::ShioriError;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;
#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

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
    sync_service::SyncService,
};

pub struct AppState {
    db: db::Database,
    covers_dir: std::path::PathBuf,
    pub plugin_registry: Arc<tokio::sync::RwLock<sources::registry::SourceRegistry>>,
    pub discovery_service: std::sync::Arc<services::discovery_service::DiscoveryService>,
    /// URLs delivered via `RunEvent::Opened` (mobile "Open with" intents)
    /// that arrived before the webview was ready to receive the `opened`
    /// event. The frontend drains this once on mount via `take_opened_urls`.
    pub opened_urls: std::sync::Mutex<Vec<String>>,
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    pub discord: Option<services::discord_service::DiscordService>,
}

pub struct MetadataState {
    pub sender: tokio::sync::mpsc::Sender<MetadataJob>,
}

pub struct ActiveDownloads {
    pub count: std::sync::atomic::AtomicUsize,
}

pub struct ActiveDownloadGuard {
    count: tauri::State<'static, ActiveDownloads>,
}

impl Drop for ActiveDownloadGuard {
    fn drop(&mut self) {
        self.count
            .count
            .fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

impl ActiveDownloads {
    pub fn increment<'a>(state: tauri::State<'a, ActiveDownloads>) -> ActiveDownloadGuard {
        state
            .count
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        ActiveDownloadGuard {
            // Unsafely extend the lifetime of the state for the guard.
            // This is safe because the state is managed by Tauri and lives for the 'static app duration.
            count: unsafe { std::mem::transmute(state) },
        }
    }
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
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    // File target: app_log_dir()/shiori.log — this is where the
                    // piper diagnostics land in packaged (console-less) builds.
                    Target::new(TargetKind::LogDir {
                        file_name: Some("shiori.log".into()),
                    }),
                    Target::new(TargetKind::Stdout),
                ])
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init());

    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(tauri_plugin_android_saf::init());
        builder = builder.plugin(tauri_plugin_android_auth::init());
        builder = builder.plugin(tauri_plugin_android_package_install::init());
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
                let is_valid = is_safe_url(&image_url);

                if is_valid {
                    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
                    let referer = match source_id.as_str() {
                        "toongod" => Some("https://www.toongod.org/"),
                        "toonily" => Some("https://toonily.com/"),
                        "toontop" => Some("https://toontop.io/"),
                        "manhwaread" => Some("https://manhwaread.com/"),
                        "mangadex" => Some("https://mangadex.org/"),
                        "weebrook" => Some("https://weebrook.com/"),
                        "manhwahub" => Some("https://manhwahub.net/"),
                        "mangafire" => Some("https://mangafire.to/"),
                        "libgen" => Some("https://libgen.li/"),
                        "annas-archive" => Some("https://annas-archive.gl/"),
                        _ => None,
                    };

                    lazy_static::lazy_static! {
                        static ref CLIENT: reqwest::Client = reqwest::Client::builder()
                            .timeout(std::time::Duration::from_secs(15))
                            .build()
                            .unwrap_or_default();
                    }

                    let result = guarded_get_with(&CLIENT, &image_url, |req| {
                        let req = req
                            .header("User-Agent", user_agent)
                            .header("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
                            .header("Accept-Language", "en-US,en;q=0.9")
                            .header("Sec-Fetch-Dest", "image")
                            .header("Sec-Fetch-Mode", "no-cors")
                            .header("Sec-Fetch-Site", "cross-site");
                        if let Some(ref_url) = referer {
                            req.header("Referer", ref_url)
                        } else {
                            req
                        }
                    })
                    .await;

                if let Ok(mut response) = result {
                    let status = response.status();
                    if status.is_success() {
                        // Forward Content-Type if present
                        let content_type = response
                            .headers()
                            .get(reqwest::header::CONTENT_TYPE)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("image/jpeg")
                            .to_string();

                        // Cap the response body at 25MB (S-42)
                        let max_body: usize = 25 * 1024 * 1024;
                        let mut bytes = Vec::new();
                        let mut body_ok = true;
                        loop {
                            match response.chunk().await {
                                Ok(Some(chunk)) => {
                                    if bytes.len() + chunk.len() > max_body {
                                        body_ok = false;
                                        break;
                                    }
                                    bytes.extend_from_slice(&chunk);
                                }
                                Ok(None) => break,
                                Err(_) => {
                                    body_ok = false;
                                    break;
                                }
                            }
                        }

                        if body_ok {
                            if let Ok(resp) = tauri::http::Response::builder()
                                .status(200)
                                .header("Content-Type", content_type)
                                .header("Access-Control-Allow-Origin", "*")
                                .header("Cache-Control", "public, max-age=31536000")
                                .body(bytes)
                            {
                                responder.respond(resp);
                                return;
                            }
                        }
                    } else {
                        // Forward the actual error status (e.g. 403)
                        if let Ok(resp) = tauri::http::Response::builder()
                            .status(status.as_u16())
                            .body(Vec::new())
                        {
                            responder.respond(resp);
                            return;
                        }
                    }
                }
                }
            }

            if let Ok(resp) = tauri::http::Response::builder()
                .status(404)
                .body(Vec::new())
            {
                responder.respond(resp);
            }
        });
    });

    #[cfg(all(feature = "native-tts", not(target_os = "linux")))]
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

            // Workaround for Tauri updater on Linux (AppImage):
            // Set TMPDIR to the app_dir (which is on the same partition as the AppImage)
            // to prevent "Invalid cross-device link (os error 18)" during fs::rename.
            #[cfg(target_os = "linux")]
            std::env::set_var("TMPDIR", app_dir.clone());

            let db_path = app_dir.join("library.db");
            let database = db::Database::new(&db_path)?;

            #[allow(unused_assignments, unused_variables)]
            let mut is_transparent = false;
            let mut is_first_time = true;
            if let Ok(conn) = database.get_connection() {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT value FROM user_preferences WHERE key = 'linuxTransparentWindow'",
                ) {
                    if let Ok(mut rows) = stmt.query([]) {
                        if let Ok(Some(row)) = rows.next() {
                            let value: String = row.get(0).unwrap_or_default();
                            is_transparent = value == "true" || value == "1";
                        }
                    }
                }

                if let Ok(mut stmt) = conn.prepare(
                    "SELECT value FROM user_preferences WHERE key = '_cachedOnboardingCompleted'",
                ) {
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
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Shiori")
            .inner_size(1200.0, 800.0)
            .resizable(true);

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                builder = builder.fullscreen(false).decorations(false).shadow(true);
            }

            // Silence unused_assignments on platforms where variables aren't used
            let _ = is_first_time;
            let _ = is_transparent;

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

            // Mode B (SAF managed storage): install the process-wide SAF
            // tree bridge so AppHandle-free services (ingest, managed-file
            // removal) can reach the user's chosen tree. Android only — the
            // plugin is registered in this build; desktop/tests keep the
            // global unset and degrade to local-mirror-only behaviour.
            #[cfg(target_os = "android")]
            {
                crate::services::saf::set_saf_tree(Box::new(
                    crate::commands::library_root::PluginSafTree(app.handle().clone()),
                ))?;
                log::info!("[saf] SAF tree bridge installed (Mode B managed storage)");
            }

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
            // Toonily
            registry.register(Arc::new(sources::toonily::ToonilySource::new()?));
            // ToonTop
            registry.register(Arc::new(sources::toontop::ToonTopSource::new()?));
            let manhwaread_source = Arc::new(sources::manhwaread::ManhwaReadSource::new()?);
            registry.register(manhwaread_source.clone() as Arc<dyn sources::Source>);
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

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let show_i = MenuItem::with_id(app, "show", "Show Shiori", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

                let mut tray_builder = TrayIconBuilder::new();
                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }
                let _tray = tray_builder
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

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

            // Wire the CfClient to ToonGod source for windowless HTML fetching
            // (cf_clearance session, auto-refresh via Playwright solver on block).
            let toongod_for_cf = toongod_source.clone();
            let cf_store_for_toongod = cf_store.clone();
            let app_handle_for_toongod = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match cloudflare::client::CfClient::new(
                    "https://www.toongod.org",
                    cf_store_for_toongod,
                ) {
                    Ok(cf_client) => {
                        let cf_client = cf_client.with_app_handle(app_handle_for_toongod.clone());
                        toongod_for_cf
                            .set_cf_client(std::sync::Arc::new(cf_client))
                            .await;

                        log::info!("ToonGod: CfClient attached successfully");
                    }
                    Err(e) => log::warn!("ToonGod: Failed to build CfClient: {}", e),
                }
            });

            let manhwaread_for_cf = manhwaread_source.clone();
            let app_handle_for_manhwaread = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                manhwaread_for_cf
                    .set_app_handle(app_handle_for_manhwaread)
                    .await;
                log::info!("ManhwaRead: app_handle attached for JS evaluation");
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
                        let cf_client = cf_client.with_app_handle(app_handle_for_mangafire.clone());
                        mangafire_for_cf
                            .set_cf_client(std::sync::Arc::new(cf_client), app_handle_for_mangafire)
                            .await;

                        log::info!("MangaFire: CfClient attached successfully");
                    }
                    Err(e) => log::warn!("MangaFire: Failed to build CfClient: {}", e),
                }
            });

            // Initialize discovery service
            let discovery_service = Arc::new(
                services::discovery_service::DiscoveryService::new().unwrap_or_else(|e| {
                    log::warn!("Failed to initialize DiscoveryService: {}", e);
                    services::discovery_service::DiscoveryService::dummy()
                }),
            );

            app.manage(ActiveDownloads {
                count: std::sync::atomic::AtomicUsize::new(0),
            });

            app.manage(AppState {
                db: database.clone(),
                covers_dir: covers_dir.clone(),
                plugin_registry: plugin_registry.clone(),
                discovery_service: discovery_service.clone(),
                opened_urls: std::sync::Mutex::new(Vec::new()),
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

            // Sync service
            let sync_service = Arc::new(tokio::sync::Mutex::new(SyncService::new(
                database.clone(),
                Some(8081),
            )));
            app.manage(sync_service);

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

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let piper_service = Arc::new(tokio::sync::Mutex::new(
                    services::piper_service::PiperService::new(app.handle().clone()),
                ));
                app.manage(piper_service);
            }

            log::info!("Shiori v2.0 initialized with database at {:?}", db_path);
            log::info!("Storage path: {:?}", storage_path);
            log::info!("Conversion engine: 4 workers");
            log::info!("RSS scheduler: enabled (daily EPUB at 6 AM)");
            log::info!("Share server: ready (port 8080)");
            log::info!("Metadata APIs: AniList (manga) + Open Library (books)");

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(state) = window.try_state::<ActiveDownloads>() {
                    let active = state.count.load(std::sync::atomic::Ordering::SeqCst);
                    if active > 0 {
                        // Prevent the window from closing and hide it instead
                        api.prevent_close();
                        let _ = window.hide();
                        log::info!(
                            "Window closed, but {} downloads are active. Hiding to tray.",
                            active
                        );
                    }
                }
            }
        })
        .invoke_handler(crate::generate_shiori_handlers!())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Mobile "Open with Shiori" file association: the OS delivers the
            // file(s) as `RunEvent::Opened { urls }` (tao forwards VIEW/SEND
            // intents — including cold-start intents via onActivityCreate —
            // through to tauri's RunEvent). The variant only exists on
            // mobile/macOS builds; on Linux desktop it never fires.
            //
            // Cold start: the webview isn't mounted yet, so the `opened`
            // emit below would be lost — buffer the urls in AppState and let
            // the frontend drain them via `take_opened_urls` once it mounts.
            // Warm start: the webview is listening, emit immediately.
            match event {
                #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
                tauri::RunEvent::Opened { urls } => {
                    let url_strings: Vec<String> = urls.iter().map(|u| u.to_string()).collect();
                    log::info!(
                        "[opened] received {} opened URL(s): {:?}",
                        url_strings.len(),
                        url_strings
                    );
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        state.opened_urls.lock().unwrap().extend(url_strings.clone());
                    }
                    let _ = app_handle.emit("opened", url_strings);
                }
                _ => {
                    #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
                    {
                        let _ = app_handle;
                    }
                }
            }
        });
}

/// Security Fix: SSRF Prevention
/// Validates scheme (https) and ensures the host is not a private/loopback/
/// link-local/multicast IP literal or a single-label hostname.
pub fn is_safe_url(image_url: &str) -> bool {
    let parsed = match url::Url::parse(image_url) {
        Ok(p) => p,
        Err(_) => return false,
    };

    // Only allow HTTPS
    if parsed.scheme() != "https" {
        return false;
    }

    let host = match parsed.host_str() {
        Some(h) => h.to_lowercase(),
        None => return false,
    };

    // Block explicit loopback / special hostnames
    let blocked_literals = ["localhost", "0.0.0.0"];
    if blocked_literals.contains(&host.as_str()) {
        return false;
    }

    // Block private IPv4 ranges expressed as hostname prefixes (defense in
    // depth for hostnames that embed private literals, e.g. "10.0.0.1.evil.com")
    let private_prefixes = [
        "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.",
        "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
        "172.30.", "172.31.",
    ];
    for prefix in &private_prefixes {
        if host.starts_with(prefix) {
            return false;
        }
    }

    // Block .localhost TLD
    if host.ends_with(".localhost") || host == "localhost" {
        return false;
    }

    // Proper IP-literal handling: reject ANY non-public address (loopback,
    // link-local, private, CGNAT, multicast, IPv4-mapped IPv6 of a blocked
    // v4 range, IPv6 link-local/unique-local, ...).
    if let Some(ip) = parse_ip_host(&host) {
        return is_public_ip(&ip);
    }

    // Must have at least one dot (not a bare hostname / single-label domain)
    if !host.contains('.') {
        return false;
    }

    true
}

/// Parse a URL host string (lowercased, IPv6 without brackets) as an IP literal,
/// including WHATWG-style IPv4 shorthand such as `127.1` -> 127.0.0.1.
fn parse_ip_host(host: &str) -> Option<IpAddr> {
    // url crate serializes IPv6 hosts WITH brackets in host_str()
    // (e.g. "[2606:4700::1111]") — strip them before parsing.
    let host = host
        .strip_prefix('[')
        .and_then(|h| h.strip_suffix(']'))
        .unwrap_or(host);
    if let Ok(v4) = host.parse::<Ipv4Addr>() {
        return Some(IpAddr::V4(v4));
    }
    if let Ok(v6) = host.parse::<Ipv6Addr>() {
        return Some(IpAddr::V6(v6));
    }
    // WHATWG IPv4 shorthand (e.g. "127.1" -> 127.0.0.1, "127.0.1" -> 127.0.0.1)
    if host.bytes().all(|b| b.is_ascii_digit() || b == b'.') {
        let parts: Vec<&str> = host.split('.').collect();
        if !parts.is_empty() && parts.len() <= 4 {
            let mut nums = [0u32; 4];
            let mut ok = true;
            for (i, p) in parts.iter().enumerate() {
                if p.is_empty() || p.len() > 3 {
                    ok = false;
                    break;
                }
                match p.parse::<u32>() {
                    Ok(n) if n <= 255 => nums[i] = n,
                    _ => {
                        ok = false;
                        break;
                    }
                }
            }
            if ok {
                // Fill octets from the right: "a.b" -> a.0.0.b, "a" -> 0.0.0.a
                let mut octets = [0u8; 4];
                for (i, n) in nums.iter().take(parts.len()).enumerate() {
                    octets[4 - parts.len() + i] = *n as u8;
                }
                return Some(IpAddr::V4(Ipv4Addr::from(octets)));
            }
        }
    }
    None
}

/// Returns true if `ip` is a globally routable (public) address.
/// Rejects loopback, private, link-local, CGNAT, unspecified, multicast,
/// broadcast, documentation/TEST-NET, benchmark ranges, 0.0.0.0/8,
/// 192.0.0.0/24, IPv4-mapped IPv6 whose mapped v4 is blocked, IPv6
/// link-local (fe80::/10) and unique-local (fc00::/7).
pub fn is_public_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            if v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_documentation()
            {
                return false;
            }
            let o = v4.octets();
            // 0.0.0.0/8
            if o[0] == 0 {
                return false;
            }
            // 100.64.0.0/10 (carrier-grade NAT / CGNAT)
            if o[0] == 100 && (o[1] & 0xC0) == 0x40 {
                return false;
            }
            // 192.0.0.0/24 (IETF protocol assignments)
            if o[0] == 192 && o[1] == 0 && o[2] == 0 {
                return false;
            }
            // 198.18.0.0/15 (benchmarking)
            if o[0] == 198 && (o[1] & 0xFE) == 0x12 {
                return false;
            }
            true
        }
        IpAddr::V6(v6) => {
            if v6.is_loopback() || v6.is_multicast() || v6.is_unspecified() {
                return false;
            }
            // fe80::/10 link-local
            if (v6.segments()[0] & 0xFFC0) == 0xFE80 {
                return false;
            }
            // fc00::/7 unique-local
            if (v6.segments()[0] & 0xFE00) == 0xFC00 {
                return false;
            }
            // ::ffff:a.b.c.d — reject if the mapped IPv4 is any blocked range
            if let Some(mapped) = v6.to_ipv4_mapped() {
                return is_public_ip(&IpAddr::V4(mapped));
            }
            true
        }
    }
}

/// Validate a URL before fetching: must parse and pass `is_safe_url`.
pub fn validate_fetch_url(url: &str) -> Result<(), ShioriError> {
    url::Url::parse(url)
        .map(|_| ())
        .map_err(|e| ShioriError::Other(format!("Invalid URL: {e}")))?;
    if !is_safe_url(url) {
        return Err(ShioriError::Other(format!(
            "Blocked URL (SSRF guard): {url}"
        )));
    }
    Ok(())
}

/// Maximum redirect hops followed by `guarded_get` (matches reqwest's default limit).
const MAX_GUARDED_REDIRECTS: usize = 10;

/// Redirect policy that re-validates every hop URL with `is_safe_url` and
/// errors on the first unsafe hop (prevents redirect-based SSRF).
fn safe_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_GUARDED_REDIRECTS {
            return attempt.error(Box::new(ShioriError::Other(
                "Too many redirects".to_string(),
            )));
        }
        let next_url = attempt.url().clone();
        if !is_safe_url(next_url.as_str()) {
            return attempt.error(Box::new(ShioriError::Other(format!(
                "Redirect to unsafe URL blocked (SSRF guard): {next_url}"
            ))));
        }
        attempt.follow()
    })
}

/// SSRF-hardened GET: validates the URL, performs its own DNS lookup for
/// hostnames (rejecting if ANY resolved address is non-public), pins the
/// first resolved public address for this request (DNS-rebinding mitigation),
/// and re-validates every redirect hop with `is_safe_url`.
///
/// The request is sent through a dedicated client with the SSRF re-validation
/// policy (see `safe_redirect_policy`) and a fixed 30s timeout; settings of
/// the passed-in `client` (timeouts, cookies, proxies, TLS) are not carried
/// over.
pub async fn guarded_get(
    client: &reqwest::Client,
    url: &str,
) -> Result<reqwest::Response, ShioriError> {
    guarded_get_with(client, url, |req| req).await
}
/// Same as `guarded_get` but lets the caller attach headers/body via `configure`.
pub(crate) async fn guarded_get_with<F>(
    _client: &reqwest::Client,
    url: &str,
    configure: F,
) -> Result<reqwest::Response, ShioriError>
where
    F: FnOnce(reqwest::RequestBuilder) -> reqwest::RequestBuilder,
{
    validate_fetch_url(url)?;

    let parsed = url::Url::parse(url)
        .map_err(|e| ShioriError::Other(format!("Invalid URL: {e}")))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| ShioriError::Other("URL has no host".to_string()))?
        .to_lowercase();
    let port = parsed.port_or_known_default().unwrap_or(443);

    // Redirect policies are client-level in reqwest, so build a dedicated
    // client with the SSRF re-validating policy. The caller's client-level
    // settings (cookies, proxies, TLS) are not carried over; use a fixed
    // default timeout. DNS pinning (below) is applied on the same builder.
    let mut guarded_builder = reqwest::Client::builder()
        .redirect(safe_redirect_policy())
        .timeout(std::time::Duration::from_secs(30));

    // DNS-rebinding mitigation: for hostnames, resolve ourselves and reject the
    // request if ANY resolved address is non-public, then pin the first public
    // address so a second (attacker-controlled) lookup can't diverge.
    if matches!(parsed.host(), Some(url::Host::Domain(_))) {
        let addrs: Vec<IpAddr> = tokio::net::lookup_host((host.as_str(), port))
            .await
            .map_err(|e| ShioriError::Other(format!("DNS lookup failed for {host}: {e}")))?
            .map(|sa| sa.ip())
            .collect();

        if addrs.is_empty() {
            return Err(ShioriError::Other(format!(
                "DNS lookup returned no addresses for {host}"
            )));
        }
        for ip in &addrs {
            if !is_public_ip(ip) {
                return Err(ShioriError::Other(format!(
                    "Blocked non-public resolved address {ip} for {host}"
                )));
            }
        }
        guarded_builder = guarded_builder.resolve(&host, SocketAddr::new(addrs[0], port));
    }

    let guarded_client = guarded_builder
        .build()
        .map_err(|e| ShioriError::Other(format!("Failed to build HTTP client: {e}")))?;
    let req = configure(guarded_client.get(url));

    req.send()
        .await
        .map_err(|e| ShioriError::Other(format!("Request failed: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_safe_url_accepts_public_urls() {
        assert!(is_safe_url("https://example.com/"));
        assert!(is_safe_url("https://mangadex.org/"));
        assert!(is_safe_url("https://img.mangadex.org/x.png"));
        assert!(is_safe_url("https://8.8.8.8/"));
        assert!(is_safe_url("https://[2606:4700::1111]/"));
        assert!(is_safe_url("https://github.com"));
        assert!(is_safe_url("https://cdn.mangafire.to/image.jpg"));
    }

    #[test]
    fn test_is_safe_url_rejects_private_and_special_ips() {
        // Cloud metadata / link-local
        assert!(!is_safe_url("https://169.254.169.254/"));
        // Loopback variants
        assert!(!is_safe_url("https://127.0.0.2/x"));
        assert!(!is_safe_url("https://[::ffff:127.0.0.1]/"));
        assert!(!is_safe_url("https://127.1/"));
        assert!(!is_safe_url("https://127.0.0.1"));
        assert!(!is_safe_url("https://[::1]/"));
        // CGNAT
        assert!(!is_safe_url("https://100.64.0.1/"));
        // RFC1918 private
        assert!(!is_safe_url("https://10.1.2.3/"));
        assert!(!is_safe_url("https://192.168.1.1/"));
        assert!(!is_safe_url("https://172.16.5.5/"));
        assert!(!is_safe_url("https://10.0.0.1"));
        // IPv6 link-local / unique-local
        assert!(!is_safe_url("https://[fe80::1]/"));
        assert!(!is_safe_url("https://[fc00::1]/"));
        // Unspecified / multicast / benchmark
        assert!(!is_safe_url("https://0.0.0.0/"));
        assert!(!is_safe_url("https://224.0.0.1/"));
        assert!(!is_safe_url("https://198.18.0.1/"));
    }

    #[test]
    fn test_is_safe_url_rejects_scheme_and_hostname_issues() {
        assert!(!is_safe_url("http://example.com"));
        assert!(!is_safe_url("http://github.com"));
        assert!(!is_safe_url("file:///etc/passwd"));
        assert!(!is_safe_url("https://localhost/x"));
        assert!(!is_safe_url("https://foo.localhost/"));
        assert!(!is_safe_url("https://something.localhost"));
        assert!(!is_safe_url("https://internalhost"));
    }

    #[test]
    fn test_is_public_ip() {
        assert!(is_public_ip(&"8.8.8.8".parse::<IpAddr>().unwrap()));
        assert!(is_public_ip(&"1.1.1.1".parse::<IpAddr>().unwrap()));
        assert!(is_public_ip(&"2606:4700::1111".parse::<IpAddr>().unwrap()));
        assert!(!is_public_ip(&"127.0.0.1".parse::<IpAddr>().unwrap()));
        assert!(!is_public_ip(&"169.254.169.254".parse::<IpAddr>().unwrap()));
        assert!(!is_public_ip(&"100.64.0.1".parse::<IpAddr>().unwrap()));
        assert!(!is_public_ip(&"10.1.2.3".parse::<IpAddr>().unwrap()));
        assert!(!is_public_ip(&"192.168.1.1".parse::<IpAddr>().unwrap()));
        assert!(!is_public_ip(&"172.16.5.5".parse::<IpAddr>().unwrap()));
        assert!(!is_public_ip(&"::1".parse::<IpAddr>().unwrap()));
        assert!(!is_public_ip(&"fe80::1".parse::<IpAddr>().unwrap()));
        assert!(!is_public_ip(&"::ffff:127.0.0.1".parse::<IpAddr>().unwrap()));
    }
}
