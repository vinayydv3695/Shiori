use crate::services::library_service;
use crate::utils::validate;
use crate::{
    error::Result,
    models::{Book, ImportResult},
    AppState,
};
use serde::Serialize;
use tauri::{Emitter, State};
use walkdir::WalkDir;

#[derive(Clone, Serialize)]
struct ScanProgressPayload {
    scanned: usize,
    total: usize,
    current_file: String,
}

#[derive(Clone, Serialize)]
struct ScanCompletePayload {
    total_indexed: usize,
}

fn allowed_extensions(content_type: &str) -> &'static [&'static str] {
    match content_type.trim().to_lowercase().as_str() {
        "manga" => &["cbz", "cbr", "zip"],
        "book" | "books" => &["epub", "pdf", "mobi", "azw3"],
        "both" => &["cbz", "cbr", "zip", "epub", "pdf", "mobi", "azw3"],
        _ => &["cbz", "cbr", "zip", "epub", "pdf", "mobi", "azw3"],
    }
}

#[tauri::command]
pub fn start_background_scan(
    app: tauri::AppHandle,
    library_path: String,
    content_type: String,
) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::path::Path;

        let root = Path::new(&library_path);
        if !root.exists() || !root.is_dir() {
            let _ = app.emit("scan_complete", ScanCompletePayload { total_indexed: 0 });
            return;
        }

        let allowed = allowed_extensions(&content_type);
        let matching_files: Vec<String> = WalkDir::new(root)
            .into_iter()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_file())
            .filter_map(|entry| {
                let ext = entry.path().extension()?.to_str()?.to_lowercase();
                if allowed.contains(&ext.as_str()) {
                    Some(entry.path().to_string_lossy().to_string())
                } else {
                    None
                }
            })
            .collect();

        let total = matching_files.len();
        for (idx, file) in matching_files.iter().enumerate() {
            let _ = app.emit(
                "scan_progress",
                ScanProgressPayload {
                    scanned: idx + 1,
                    total,
                    current_file: file.clone(),
                },
            );
        }

        let _ = app.emit(
            "scan_complete",
            ScanCompletePayload {
                total_indexed: total,
            },
        );
    });

    Ok(())
}

#[tauri::command]
pub fn get_books(state: State<AppState>, limit: u32, offset: u32) -> Result<Vec<Book>> {
    let db = &state.db;
    library_service::get_all_books(db, limit, offset)
}

#[tauri::command]
pub fn get_total_books(state: State<AppState>) -> Result<i64> {
    let db = &state.db;
    library_service::get_total_books(db)
}

#[tauri::command]
pub fn get_book(state: State<AppState>, id: i64) -> Result<Book> {
    validate::require_positive_id(id, "book id")?;
    let db = &state.db;
    library_service::get_book_by_id(db, id)
}

#[tauri::command]
pub fn add_book(state: State<AppState>, book: Book) -> Result<i64> {
    validate::require_non_empty(&book.title, "title")?;
    validate::require_max_length(&book.title, 1000, "title")?;
    validate::require_non_empty(&book.file_path, "file_path")?;
    validate::require_safe_path(&book.file_path, "file_path")?;
    validate::require_non_empty(&book.file_format, "file_format")?;
    let db = &state.db;
    library_service::add_book(db, book)
}

#[tauri::command]
pub fn update_book(state: State<AppState>, book: Book) -> Result<()> {
    if let Some(id) = book.id {
        validate::require_positive_id(id, "book id")?;
    }
    validate::require_non_empty(&book.title, "title")?;
    validate::require_max_length(&book.title, 1000, "title")?;
    let db = &state.db;
    library_service::update_book(db, book)
}

#[tauri::command]
pub fn delete_books(state: State<AppState>, ids: Vec<i64>) -> Result<()> {
    validate::require_non_empty_vec(&ids, "book ids")?;
    for &id in &ids {
        validate::require_positive_id(id, "book id")?;
    }
    log::info!(
        "[command::delete_books] Received request to delete {} books: {:?}",
        ids.len(),
        ids
    );
    let db = &state.db;
    let ids_clone = ids.clone();
    let result = library_service::delete_books(db, ids);
    match &result {
        Ok(_) => log::info!(
            "[command::delete_books] Successfully deleted {} books",
            ids_clone.len()
        ),
        Err(e) => log::error!("[command::delete_books] Failed to delete books: {:?}", e),
    }
    result
}

#[tauri::command]
pub fn delete_book(state: State<AppState>, id: i64) -> Result<()> {
    validate::require_positive_id(id, "book id")?;
    log::info!(
        "[command::delete_book] Received request to delete book id: {}",
        id
    );
    let db = &state.db;
    let result = library_service::delete_book(db, id);
    match &result {
        Ok(_) => log::info!(
            "[command::delete_book] Successfully deleted book id: {}",
            id
        ),
        Err(e) => log::error!(
            "[command::delete_book] Failed to delete book id {}: {:?}",
            id,
            e
        ),
    }
    result
}

#[tauri::command]
pub fn restore_book(state: State<AppState>, id: i64) -> Result<()> {
    validate::require_positive_id(id, "book id")?;
    log::info!("[command::restore_book] Received request to restore book id: {}", id);
    let db = &state.db;
    let result = library_service::restore_book(db, id);
    match &result {
        Ok(_) => log::info!("[command::restore_book] Successfully restored book id: {}", id),
        Err(e) => log::error!("[command::restore_book] Failed to restore book id {}: {:?}", id, e),
    }
    result
}

#[tauri::command]
pub fn permanent_delete_book(state: State<AppState>, id: i64) -> Result<()> {
    validate::require_positive_id(id, "book id")?;
    log::info!("[command::permanent_delete_book] Received request to permanently delete book id: {}", id);
    let db = &state.db;
    let result = library_service::permanent_delete_book(db, id);
    match &result {
        Ok(_) => log::info!("[command::permanent_delete_book] Successfully deleted book id: {}", id),
        Err(e) => log::error!("[command::permanent_delete_book] Failed to delete book id {}: {:?}", id, e),
    }
    result
}

#[tauri::command]
pub fn empty_trash(state: State<AppState>) -> Result<()> {
    log::info!("[command::empty_trash] Received request to empty trash");
    let db = &state.db;
    let result = library_service::empty_trash(db);
    match &result {
        Ok(_) => log::info!("[command::empty_trash] Successfully emptied trash"),
        Err(e) => log::error!("[command::empty_trash] Failed to empty trash: {:?}", e),
    }
    result
}

#[tauri::command]
pub fn clean_up_database(state: State<AppState>) -> Result<(usize, usize)> {
    log::info!("[command::clean_up_database] Received request to clean up database");
    let db = &state.db;
    let covers_dir = state.covers_dir.clone();
    
    // Clean up recycle bin automatically
    if let Err(e) = library_service::clean_recycle_bin(db) {
        log::error!("[command::clean_up_database] Failed to clean recycle bin: {:?}", e);
    }

    let result = library_service::cleanup_database(db, &covers_dir);
    match &result {
        Ok((books, covers)) => log::info!(
            "[command::clean_up_database] Successfully cleaned up {} missing books and {} unused covers",
            books,
            covers
        ),
        Err(e) => log::error!(
            "[command::clean_up_database] Failed to clean up database: {:?}",
            e
        ),
    }
    result
}

#[tauri::command]
pub async fn import_books(state: State<'_, AppState>, paths: Vec<String>) -> Result<ImportResult> {
    validate::require_non_empty_vec(&paths, "file paths")?;
    for path in &paths {
        validate::require_safe_path(path, "import path")?;
    }
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    tokio::task::spawn_blocking(move || library_service::import_books(&db, paths, &covers_dir))
        .await
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn scan_folder_unified(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<ImportResult> {
    validate::require_safe_path(&folder_path, "folder path")?;
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    let folder_path_clone = folder_path.clone();

    let result = tokio::task::spawn_blocking(move || {
        library_service::scan_and_import_folder(&db, &folder_path_clone, &covers_dir)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))??;

    let db = &state.db;
    let conn = db.get_connection()?;
    let auto_group: bool = conn
        .query_row(
            "SELECT auto_group_manga FROM user_preferences WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(true);

    if auto_group {
        let _ = crate::commands::manga::auto_group_manga_volumes(state).await;
    }

    Ok(result)
}

#[tauri::command]
pub async fn import_manga(state: State<'_, AppState>, paths: Vec<String>) -> Result<ImportResult> {
    validate::require_non_empty_vec(&paths, "file paths")?;
    for path in &paths {
        validate::require_safe_path(path, "import path")?;
    }
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();

    let result =
        tokio::task::spawn_blocking(move || library_service::import_manga(&db, paths, &covers_dir))
            .await
            .map_err(|e| crate::error::ShioriError::Other(e.to_string()))??;

    let db = &state.db;
    let conn = db.get_connection()?;
    let auto_group: bool = conn
        .query_row(
            "SELECT auto_group_manga FROM user_preferences WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(true);

    if auto_group {
        let _ = crate::commands::manga::auto_group_manga_volumes(state).await;
    }

    Ok(result)
}

#[tauri::command]
pub async fn scan_folder_for_manga(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<ImportResult> {
    validate::require_safe_path(&folder_path, "folder path")?;
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    let folder_path_clone = folder_path.clone();

    let result = tokio::task::spawn_blocking(move || {
        library_service::scan_folder_for_manga(&db, &folder_path_clone, &covers_dir)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))??;

    let db = &state.db;
    let conn = db.get_connection()?;
    let auto_group: bool = conn
        .query_row(
            "SELECT auto_group_manga FROM user_preferences WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(true);

    if auto_group {
        let _ = crate::commands::manga::auto_group_manga_volumes(state).await;
    }

    Ok(result)
}

#[tauri::command]
pub async fn import_comics(state: State<'_, AppState>, paths: Vec<String>) -> Result<ImportResult> {
    validate::require_non_empty_vec(&paths, "file paths")?;
    for path in &paths {
        validate::require_safe_path(path, "import path")?;
    }
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    tokio::task::spawn_blocking(move || library_service::import_comics(&db, paths, &covers_dir))
        .await
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn scan_folder_for_comics(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<ImportResult> {
    validate::require_safe_path(&folder_path, "folder path")?;
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    tokio::task::spawn_blocking(move || {
        library_service::scan_folder_for_comics(&db, &folder_path, &covers_dir)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
}

#[tauri::command]
pub fn get_book_summaries(
    state: State<'_, AppState>,
    limit: u32,
    offset: u32,
) -> Result<Vec<crate::models::BookSummary>> {
    let db = &state.db;
    crate::services::library_service::get_book_summaries(db, limit, offset)
}

#[tauri::command]
pub fn get_book_summaries_by_domain(
    state: State<'_, AppState>,
    domain: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<crate::models::BookSummary>> {
    let db = &state.db;
    crate::services::library_service::get_book_summaries_by_domain(db, &domain, limit, offset)
}

#[tauri::command]
pub fn get_books_by_domain(
    state: State<'_, AppState>,
    domain: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<Book>> {
    validate::require_one_of(&domain, &["books", "manga", "comics", "all"], "domain")?;
    let db = &state.db;
    library_service::get_books_by_domain(db, &domain, limit, offset)
}

#[tauri::command]
pub fn get_total_books_by_domain(state: State<'_, AppState>, domain: String) -> Result<i64> {
    validate::require_one_of(&domain, &["books", "manga", "comics", "all"], "domain")?;
    let db = &state.db;
    library_service::get_total_books_by_domain(db, &domain)
}

#[tauri::command]
pub fn reset_database(state: State<'_, AppState>) -> Result<()> {
    let db = &state.db;
    library_service::reset_database(db)
}

#[tauri::command]
pub fn update_reading_status(
    app_state: State<'_, AppState>,
    book_id: i64,
    status: String,
) -> Result<()> {
    validate::require_positive_id(book_id, "book id")?;
    validate::require_one_of(
        &status,
        &["planning", "reading", "completed", "on_hold", "dropped"],
        "reading status",
    )?;
    library_service::update_reading_status(&app_state.db, book_id, &status)
}

#[tauri::command]
pub fn get_books_by_reading_status(
    app_state: State<'_, AppState>,
    status: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<Book>> {
    validate::require_one_of(
        &status,
        &["planning", "reading", "completed", "on_hold", "dropped"],
        "reading status",
    )?;
    library_service::get_books_by_reading_status(&app_state.db, &status, limit, offset)
}

#[tauri::command]
pub async fn find_duplicate_books(
    criteria: String,
    threshold: Option<f32>,
    state: State<'_, AppState>,
) -> Result<Vec<Vec<Book>>> {
    let db = &state.db;
    let books = crate::services::library_service::get_all_books(db, u32::MAX, 0)?;

    let duplicates = tokio::task::spawn_blocking(move || {
        let mut duplicates: Vec<Vec<Book>> = Vec::new();
        let threshold = threshold.unwrap_or(0.8);
        let mut processed_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();

        for i in 0..books.len() {
            let current_book = &books[i];
            let current_id = current_book.id.unwrap_or(-1);
            if processed_ids.contains(&current_id) {
                continue;
            }

            let mut group: Vec<Book> = vec![current_book.clone()];
            processed_ids.insert(current_id);

            for j in (i + 1)..books.len() {
                let other_book = &books[j];
                let other_id = other_book.id.unwrap_or(-1);
                if processed_ids.contains(&other_id) {
                    continue;
                }

                let is_duplicate = match criteria.as_str() {
                    "title" => {
                        let score = strsim::jaro_winkler(
                            &current_book.title.to_lowercase(),
                            &other_book.title.to_lowercase(),
                        );
                        score as f32 >= threshold
                    }
                    "author" => {
                        let current_authors = current_book
                            .authors
                            .iter()
                            .map(|a| a.name.to_lowercase())
                            .collect::<Vec<String>>()
                            .join(" ");
                        let other_authors = other_book
                            .authors
                            .iter()
                            .map(|a| a.name.to_lowercase())
                            .collect::<Vec<String>>()
                            .join(" ");
                        if current_authors.is_empty() || other_authors.is_empty() {
                            false
                        } else {
                            let score = strsim::jaro_winkler(&current_authors, &other_authors);
                            score as f32 >= threshold
                        }
                    }
                    "hash" => {
                        if let (Some(ref h1), Some(ref h2)) =
                            (&current_book.file_hash, &other_book.file_hash)
                        {
                            h1 == h2
                        } else {
                            false
                        }
                    }
                    "size" => {
                        if let (Some(s1), Some(s2)) = (current_book.file_size, other_book.file_size)
                        {
                            s1 == s2 && s1 > 0
                        } else {
                            false
                        }
                    }
                    _ => false,
                };

                if is_duplicate {
                    group.push(other_book.clone());
                    processed_ids.insert(other_id);
                }
            }

            if group.len() > 1 {
                duplicates.push(group);
            }
        }

        duplicates
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    Ok(duplicates)
}

#[tauri::command]
pub async fn download_gutenberg_epub(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    url: String,
    title_hint: String,
) -> Result<String> {
    use futures::StreamExt;
    use std::io::Write;
    use tauri::Manager;

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;
    let total_bytes = resp.content_length();

    let safe_title = title_hint
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ' || *c == '-')
        .collect::<String>();
    let file_name = format!("{}.epub", safe_title.trim());

    let prefs = crate::commands::preferences::get_user_preferences(state.clone()).await?;
    let downloads_dir = if !prefs.default_import_path.is_empty() {
        std::path::PathBuf::from(&prefs.default_import_path).join("Online Books")
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| crate::error::ShioriError::Other(format!("Failed to get app dir: {}", e)))?
            .join("downloads")
    };
    std::fs::create_dir_all(&downloads_dir)
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    let file_path = downloads_dir.join(file_name);

    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    let mut downloaded_bytes = 0u64;
    let mut stream = resp.bytes_stream();
    let target_id = url.clone();

    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;
        file.write_all(&chunk)
            .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;
        downloaded_bytes += chunk.len() as u64;

        if last_emit.elapsed().as_millis() > 100 {
            let payload = serde_json::json!({
                "target_id": target_id,
                "status": "downloading",
                "downloaded_bytes": downloaded_bytes,
                "total_bytes": total_bytes
            });
            let _ = app_handle.emit("online-book-download-progress", payload);
            last_emit = std::time::Instant::now();
        }
    }

    let completed_payload = serde_json::json!({
        "target_id": target_id,
        "status": "completed",
        "downloaded_bytes": downloaded_bytes,
        "total_bytes": total_bytes
    });
    let _ = app_handle.emit("online-book-download-progress", completed_payload);

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn download_libgen_epub(
    app_handle: tauri::AppHandle,
    url: String, // This is a serialized JSON array of mirrors
    title_hint: String,
    format_ext: Option<String>,
) -> Result<String> {
    use futures::StreamExt;
    use std::io::Write;
    use std::time::Duration;

    let all_mirrors: Vec<String> = serde_json::from_str(&url).unwrap_or_else(|_| vec![url.clone()]);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    let mut resp_opt: Option<reqwest::Response> = None;

    // Helper to try and extract md5
    let extract_md5 = |url: &str| -> Option<String> {
        if let Ok(re) = regex::Regex::new(r#"(?i)md5=([a-f0-9]{32})"#) {
            if let Some(caps) = re.captures(url) {
                return Some(caps.get(1).unwrap().as_str().to_string());
            }
        }
        if let Ok(re) = regex::Regex::new(r#"(?i)/main/([a-f0-9]{32})"#) {
            if let Some(caps) = re.captures(url) {
                return Some(caps.get(1).unwrap().as_str().to_string());
            }
        }
        None
    };

    // Attempt 1: Try get.php from libgen.li (bypasses Cloudflare entirely)
    let mut get_php_url = None;
    if let Some(md5) = extract_md5(&all_mirrors.first().cloned().unwrap_or_default()) {
        let ads_url = format!("https://libgen.li/ads.php?md5={}", md5);
        if let Ok(ads_resp) = client.get(&ads_url).send().await {
            if let Ok(text) = ads_resp.text().await {
                if let Ok(re) =
                    regex::Regex::new(r#"(?i)href=["']([^"']*get\.php\?md5=[^"']+)["']"#)
                {
                    if let Some(caps) = re.captures(&text) {
                        let href = caps.get(1).unwrap().as_str();
                        if href.starts_with("http") {
                            get_php_url = Some(href.to_string());
                        } else if href.starts_with("/") {
                            get_php_url = Some(format!("https://libgen.li{}", href));
                        } else {
                            get_php_url = Some(format!("https://libgen.li/{}", href));
                        }
                    }
                }
            }
        }
    }

    if let Some(direct_url) = get_php_url {
        if let Ok(file_resp) = client.get(&direct_url).send().await {
            if file_resp.status().is_success() {
                let content_type = file_resp
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("");
                if !content_type.contains("text/html") {
                    resp_opt = Some(file_resp);
                }
            }
        }
    }

    // Attempt 2: Fall back to existing mirror scraping logic if get.php fails
    if resp_opt.is_none() {
        for mirror_url in &all_mirrors {
            if mirror_url.trim().is_empty() {
                continue;
            }
            let mut download_url = mirror_url.clone();

            // 1. If it's a gateway, try to scrape it via proxy or directly
            if mirror_url.contains("library.lol")
                || mirror_url.contains("libgen.li")
                || mirror_url.contains("libgen.is")
            {
                // We use a free CORS proxy just in case the user's ISP blocks library.lol
                let proxy_url = format!(
                    "https://api.allorigins.win/raw?url={}",
                    urlencoding::encode(mirror_url)
                );

                // Try direct first, then proxy
                for fetch_url in &[mirror_url.clone(), proxy_url] {
                    if let Ok(resp) = client.get(fetch_url).send().await {
                        if resp.status().is_success() {
                            if let Ok(text) = resp.text().await {
                                // Try exact GET
                                if let Ok(re) = regex::Regex::new(
                                    r#"(?i)href=["']([^"']+)["'][^>]*>\s*GET\s*<"#,
                                ) {
                                    if let Some(caps) = re.captures(&text) {
                                        download_url = caps.get(1).unwrap().as_str().to_string();
                                        break;
                                    }
                                }

                                // Try IPFS links (cloudflare-ipfs, ipfs.io, etc)
                                if let Ok(re) = regex::Regex::new(
                                    r#"(?i)href=["'](https?://[^"']*(?:ipfs|cloudflare)[^"']*)["']"#,
                                ) {
                                    if let Some(caps) = re.captures(&text) {
                                        download_url = caps.get(1).unwrap().as_str().to_string();
                                        break;
                                    }
                                }

                                // Try loose GET
                                if let Ok(re) = regex::Regex::new(
                                    r#"(?i)<a[^>]+href=["']([^"']+)["'][^>]*>.*?GET.*?</a>"#,
                                ) {
                                    if let Some(caps) = re.captures(&text) {
                                        download_url = caps.get(1).unwrap().as_str().to_string();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                if download_url == *mirror_url {
                    continue; // failed to scrape anything
                }
            }

            // 2. Try to fetch the actual file from download_url
            if let Ok(file_resp) = client.get(&download_url).send().await {
                if file_resp.status().is_success() {
                    let content_type = file_resp
                        .headers()
                        .get(reqwest::header::CONTENT_TYPE)
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("");
                    if content_type.contains("text/html") {
                        continue; // STILL an HTML page
                    }
                    resp_opt = Some(file_resp);
                    break;
                }
            }
        }
    }

    let resp = match resp_opt {
        Some(r) => r,
        None => return Err(crate::error::ShioriError::Other("All Libgen mirrors failed or were blocked by Cloudflare/ISP. Try downloading from another source like Gutenberg.".to_string())),
    };

    let total_bytes = resp.content_length();

    let safe_title = title_hint
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ' || *c == '-')
        .collect::<String>();
    let ext = format_ext.unwrap_or_else(|| "epub".to_string()).replace(".", "").to_lowercase();
    let file_name = format!("{}.{}", safe_title.trim(), ext);
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(file_name);

    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    let mut downloaded_bytes = 0u64;
    let mut stream = resp.bytes_stream();
    let target_id = all_mirrors.first().cloned().unwrap_or(url);

    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;
        file.write_all(&chunk)
            .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;
        downloaded_bytes += chunk.len() as u64;

        if last_emit.elapsed().as_millis() > 100 {
            let payload = serde_json::json!({
                "target_id": target_id,
                "status": "downloading",
                "downloaded_bytes": downloaded_bytes,
                "total_bytes": total_bytes,
            });
            let _ = app_handle.emit("online-book-download-progress", payload);
            last_emit = std::time::Instant::now();
        }
    }

    let payload = serde_json::json!({
        "target_id": target_id,
        "status": "completed",
        "file_path": file_path.to_string_lossy(),
    });
    let _ = app_handle.emit("online-book-download-progress", payload);

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_library_stats(state: State<'_, AppState>) -> Result<crate::models::LibraryStats> {
    let db = &state.db;
    crate::services::library_service::get_library_stats(db)
}

#[tauri::command]
pub fn get_thumbnail(state: State<'_, AppState>, book_id: i64) -> Result<Option<String>> {
    let db = &state.db;
    let covers_dir = &state.covers_dir;
    crate::services::library_service::get_thumbnail_path(db, book_id, covers_dir)
}

#[tauri::command]
pub fn get_recommended_books(
    state: State<'_, AppState>,
    limit: u32,
) -> Result<Vec<crate::models::BookSummary>> {
    let db = &state.db;
    crate::services::library_service::get_recommended_books(db, limit)
}

#[tauri::command]
pub fn get_next_book_in_series(
    state: State<'_, AppState>,
    book_id: i64,
) -> Result<Option<crate::models::Book>> {
    let db = &state.db;
    let conn = db.get_connection()?;

    // First get the current book's series info
    let mut stmt = conn.prepare("SELECT series, series_index FROM books WHERE id = ? AND series IS NOT NULL AND series != ''")?;
    let mut rows = stmt.query([book_id])?;

    if let Some(row) = rows.next()? {
        let series: String = row.get(0)?;
        let current_index: f64 = row.get(1)?;

        // Find the next book in the series (lowest index greater than current)
        let mut next_stmt = conn.prepare(
            "SELECT id FROM books 
             WHERE series = ? AND series_index > ? 
             ORDER BY series_index ASC 
             LIMIT 1",
        )?;

        let mut next_rows = next_stmt.query(rusqlite::params![series, current_index])?;

        if let Some(r) = next_rows.next()? {
            let next_id: i64 = r.get(0)?;
            return crate::services::library_service::get_book_by_id(db, next_id).map(Some);
        }
    }

    Ok(None)
}
