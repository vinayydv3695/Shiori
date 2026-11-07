use crate::services::vocabulary_service::{VocabularyService, VocabularyStats, VocabularyWord};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn add_vocabulary_word(
    state: State<'_, AppState>,
    book_id: Option<i64>,
    word: String,
    clean_word: String,
    reading: Option<String>,
    definition: String,
    sentence_context: Option<String>,
    chapter_title: Option<String>,
) -> Result<VocabularyWord, String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    VocabularyService::add_or_update_word(
        &conn,
        book_id,
        &word,
        &clean_word,
        reading.as_deref(),
        &definition,
        sentence_context.as_deref(),
        chapter_title.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_vocabulary_words(
    state: State<'_, AppState>,
    book_id: Option<i64>,
    due_only: bool,
) -> Result<Vec<VocabularyWord>, String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    VocabularyService::get_words(&conn, book_id, due_only).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn review_vocabulary_word(
    state: State<'_, AppState>,
    card_id: i64,
    grade: u8,
) -> Result<VocabularyWord, String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    VocabularyService::review_word(&conn, card_id, grade).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_vocabulary_word(state: State<'_, AppState>, card_id: i64) -> Result<(), String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    VocabularyService::delete_word(&conn, card_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_vocabulary_stats(
    state: State<'_, AppState>,
    book_id: Option<i64>,
) -> Result<VocabularyStats, String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    VocabularyService::get_stats(&conn, book_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_vocabulary_anki(
    state: State<'_, AppState>,
    book_id: Option<i64>,
) -> Result<String, String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    VocabularyService::export_anki_tsv(&conn, book_id).map_err(|e| e.to_string())
}
