/// Translation & Dictionary IPC Commands
///
/// Provides offline local dictionary lookup, custom dictionary import (Yomichan, StarDict, JSON),
/// and text translation via free APIs.
use crate::error::Result;
use crate::services::{dictionary_service, translation_service};
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ═══════════════════════════════════════════════════════════════
// RESPONSE TYPES (re-exported from service for frontend)
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct DictionaryResponse {
    pub word: String,
    pub phonetic: Option<String>,
    pub audio_url: Option<String>,
    pub meanings: Vec<translation_service::DictionaryMeaning>,
    pub source_url: Option<String>,
    #[serde(default)]
    pub reading: Option<String>,
    #[serde(default)]
    pub jlpt_level: Option<u8>,
    #[serde(default)]
    pub is_offline: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslationResponse {
    pub translated_text: String,
    pub source_language: String,
    pub target_language: String,
    pub provider: String,
}

// ═══════════════════════════════════════════════════════════════
// IPC COMMANDS
// ═══════════════════════════════════════════════════════════════

/// Look up a word in the dictionary (checks local offline dictionaries first, then online).
#[tauri::command]
pub async fn dictionary_lookup(
    word: String,
    lang: Option<String>,
    state: State<'_, AppState>,
) -> Result<DictionaryResponse> {
    let lang = lang.unwrap_or_else(|| "en".to_string());
    let clean_word = translation_service::clean_dictionary_term(&word);
    if clean_word.is_empty() {
        return Err(crate::error::ShioriError::Other(
            "Please select a valid word to define".to_string(),
        ));
    }

    // 1. Synchronously check local offline dictionaries & built-in core lexicons (instant, 0ms)
    if let Ok(conn) = state.db.get_connection() {
        if let Ok(Some(offline_res)) =
            dictionary_service::DictionaryService::lookup_offline(&conn, &clean_word, &lang)
        {
            return Ok(DictionaryResponse {
                word: offline_res.word,
                phonetic: offline_res.phonetic,
                audio_url: offline_res.audio_url,
                meanings: offline_res.meanings,
                source_url: offline_res.source_url,
                reading: offline_res.reading,
                jlpt_level: offline_res.jlpt_level,
                is_offline: offline_res.is_offline,
            });
        }
    }

    // 2. Query online providers (Wiktionary edge CDN with Free Dictionary API fallback)
    let result = translation_service::dictionary_lookup(&clean_word, &lang).await?;

    // 3. Cache online result into SQLite for future 100% offline access
    if let Ok(conn) = state.db.get_connection() {
        let _ = dictionary_service::DictionaryService::save_cached_entry(
            &conn, &result, &lang, "wiktionary",
        );
    }

    Ok(DictionaryResponse {
        word: result.word,
        phonetic: result.phonetic,
        audio_url: result.audio_url,
        meanings: result.meanings,
        source_url: result.source_url,
        reading: result.reading,
        jlpt_level: result.jlpt_level,
        is_offline: result.is_offline,
    })
}

/// Retrieve all registered offline dictionaries
#[tauri::command]
pub fn get_offline_dictionaries(
    state: State<'_, AppState>,
) -> Result<Vec<dictionary_service::OfflineDictionaryInfo>> {
    let conn = state.db.get_connection()?;
    dictionary_service::DictionaryService::get_dictionaries(&conn)
}

/// Import a custom dictionary from file path (.zip for Yomichan/StarDict, .json, or .idx/.dict)
#[tauri::command]
pub fn import_dictionary(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<dictionary_service::OfflineDictionaryInfo> {
    let conn = state.db.get_connection()?;
    dictionary_service::DictionaryService::import_dictionary(&conn, &file_path)
}

/// Delete an imported dictionary by ID
#[tauri::command]
pub fn delete_offline_dictionary(id: i64, state: State<'_, AppState>) -> Result<()> {
    let conn = state.db.get_connection()?;
    dictionary_service::DictionaryService::delete_dictionary(&conn, id)
}

/// Toggle an offline dictionary enabled/disabled
#[tauri::command]
pub fn toggle_offline_dictionary(
    id: i64,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<()> {
    let conn = state.db.get_connection()?;
    dictionary_service::DictionaryService::toggle_dictionary(&conn, id, enabled)
}

/// Translate text from one language to another.
/// Uses MyMemory API with Lingva fallback. Both are free, no API key needed.
#[tauri::command]
pub async fn translate_text(
    text: String,
    source_lang: Option<String>,
    target_lang: String,
) -> Result<TranslationResponse> {
    let source = source_lang.unwrap_or_else(|| "auto".to_string());

    let result = translation_service::translate_text(&text, &source, &target_lang).await?;

    Ok(TranslationResponse {
        translated_text: result.translated_text,
        source_language: result.source_language,
        target_language: result.target_language,
        provider: result.provider,
    })
}
