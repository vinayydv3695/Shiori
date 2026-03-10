use crate::services::library_service;
use crate::utils::validate;
use crate::{
    error::Result,
    models::{Book, ImportResult},
    AppState,
};
use tauri::State;

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
pub fn import_books(state: State<'_, AppState>, paths: Vec<String>) -> Result<ImportResult> {
    validate::require_non_empty_vec(&paths, "file paths")?;
    for path in &paths {
        validate::require_safe_path(path, "import path")?;
    }
    let db = &state.db;
    library_service::import_books(db, paths, &state.covers_dir)
}

#[tauri::command]
pub fn scan_folder_for_books(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<ImportResult> {
    validate::require_safe_path(&folder_path, "folder path")?;
    let db = &state.db;
    library_service::scan_and_import_folder(db, &folder_path, &state.covers_dir)
}

#[tauri::command]
pub async fn import_manga(state: State<'_, AppState>, paths: Vec<String>) -> Result<ImportResult> {
    validate::require_non_empty_vec(&paths, "file paths")?;
    for path in &paths {
        validate::require_safe_path(path, "import path")?;
    }
    let db = &state.db;
    let result = library_service::import_manga(db, paths, &state.covers_dir)?;
    
    let conn = db.get_connection()?;
    let auto_group: bool = conn.query_row(
        "SELECT auto_group_manga FROM user_preferences WHERE id = 1",
        [],
        |row| row.get(0)
    ).unwrap_or(true);
    
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
    let db = &state.db;
    let result = library_service::scan_folder_for_manga(db, &folder_path, &state.covers_dir)?;
    
    let conn = db.get_connection()?;
    let auto_group: bool = conn.query_row(
        "SELECT auto_group_manga FROM user_preferences WHERE id = 1",
        [],
        |row| row.get(0)
    ).unwrap_or(true);
    
    if auto_group {
        let _ = crate::commands::manga::auto_group_manga_volumes(state).await;
    }
    
    Ok(result)
}

#[tauri::command]
pub fn import_comics(state: State<'_, AppState>, paths: Vec<String>) -> Result<ImportResult> {
    validate::require_non_empty_vec(&paths, "file paths")?;
    for path in &paths {
        validate::require_safe_path(path, "import path")?;
    }
    let db = &state.db;
    library_service::import_comics(db, paths, &state.covers_dir)
}

#[tauri::command]
pub fn scan_folder_for_comics(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<ImportResult> {
    validate::require_safe_path(&folder_path, "folder path")?;
    let db = &state.db;
    library_service::scan_folder_for_comics(db, &folder_path, &state.covers_dir)
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
                    let score = strsim::jaro_winkler(&current_book.title.to_lowercase(), &other_book.title.to_lowercase());
                    score as f32 >= threshold
                },
                "author" => {
                    let current_authors = current_book.authors.iter().map(|a| a.name.to_lowercase()).collect::<Vec<String>>().join(" ");
                    let other_authors = other_book.authors.iter().map(|a| a.name.to_lowercase()).collect::<Vec<String>>().join(" ");
                    if current_authors.is_empty() || other_authors.is_empty() {
                        false
                    } else {
                        let score = strsim::jaro_winkler(&current_authors, &other_authors);
                        score as f32 >= threshold
                    }
                },
                "hash" => {
                    if let (Some(ref h1), Some(ref h2)) = (&current_book.file_hash, &other_book.file_hash) {
                        h1 == h2
                    } else {
                        false
                    }
                },
                "size" => {
                    if let (Some(s1), Some(s2)) = (current_book.file_size, other_book.file_size) {
                        s1 == s2 && s1 > 0
                    } else {
                        false
                    }
                },
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

    Ok(duplicates)
}
