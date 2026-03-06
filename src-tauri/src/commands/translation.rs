/// Translation & Dictionary IPC Commands
///
/// Provides dictionary lookup and text translation via free APIs.

use crate::error::Result;
use crate::services::translation_service;
use serde::{Deserialize, Serialize};

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

/// Look up a word in the dictionary.
/// Returns definitions, phonetics, examples, synonyms, and antonyms.
#[tauri::command]
pub async fn dictionary_lookup(word: String, lang: Option<String>) -> Result<DictionaryResponse> {
    let lang = lang.unwrap_or_else(|| "en".to_string());

    let result = translation_service::dictionary_lookup(&word, &lang).await?;

    Ok(DictionaryResponse {
        word: result.word,
        phonetic: result.phonetic,
        audio_url: result.audio_url,
        meanings: result.meanings,
        source_url: result.source_url,
    })
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
