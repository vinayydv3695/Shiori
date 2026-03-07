/// Translation & Dictionary Service
///
/// Provides dictionary lookups (Free Dictionary API) and text translation
/// (MyMemory API with Lingva fallback). All APIs are free and require no keys.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::error::{Result, ShioriError};

// ═══════════════════════════════════════════════════════════════
// PUBLIC TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryResult {
    pub word: String,
    pub phonetic: Option<String>,
    pub audio_url: Option<String>,
    pub meanings: Vec<DictionaryMeaning>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryMeaning {
    pub part_of_speech: String,
    pub definitions: Vec<DictionaryDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryDefinition {
    pub definition: String,
    pub example: Option<String>,
    pub synonyms: Vec<String>,
    pub antonyms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationResult {
    pub translated_text: String,
    pub source_language: String,
    pub target_language: String,
    pub provider: String,
}

// ═══════════════════════════════════════════════════════════════
// API RESPONSE TYPES (internal)
// ═══════════════════════════════════════════════════════════════

// --- Free Dictionary API (dictionaryapi.dev) ---

#[derive(Debug, Deserialize)]
struct FreeDictEntry {
    word: String,
    phonetic: Option<String>,
    phonetics: Option<Vec<FreeDictPhonetic>>,
    meanings: Vec<FreeDictMeaning>,
    #[serde(rename = "sourceUrls")]
    source_urls: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct FreeDictPhonetic {
    text: Option<String>,
    audio: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FreeDictMeaning {
    #[serde(rename = "partOfSpeech")]
    part_of_speech: String,
    definitions: Vec<FreeDictDefinition>,
}

#[derive(Debug, Deserialize)]
struct FreeDictDefinition {
    definition: String,
    example: Option<String>,
    #[serde(default)]
    synonyms: Vec<String>,
    #[serde(default)]
    antonyms: Vec<String>,
}

// --- MyMemory Translation API ---

#[derive(Debug, Deserialize)]
struct MyMemoryResponse {
    #[serde(rename = "responseData")]
    response_data: MyMemoryData,
    #[serde(rename = "responseStatus")]
    response_status: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct MyMemoryData {
    #[serde(rename = "translatedText")]
    translated_text: String,
}

// --- Lingva Translate API (fallback) ---

#[derive(Debug, Deserialize)]
struct LingvaResponse {
    translation: String,
}

// ═══════════════════════════════════════════════════════════════
// SERVICE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════

fn build_client() -> std::result::Result<Client, reqwest::Error> {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Shiori/0.1.0")
        .build()
}

/// Look up a word in the Free Dictionary API.
/// Returns structured definitions, phonetics, and examples.
/// Supports English primarily; other languages via lang code.
pub async fn dictionary_lookup(word: &str, lang: &str) -> Result<DictionaryResult> {
    let client = build_client().map_err(|e| ShioriError::Other(format!("HTTP client error: {}", e)))?;

    let url = format!(
        "https://api.dictionaryapi.dev/api/v2/entries/{}/{}",
        urlencoding::encode(lang),
        urlencoding::encode(word)
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Dictionary request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        if status.as_u16() == 404 {
            return Err(ShioriError::Other(format!(
                "No definition found for \"{}\"",
                word
            )));
        }
        return Err(ShioriError::Other(format!(
            "Dictionary API returned status {}",
            status
        )));
    }

    let entries: Vec<FreeDictEntry> = response
        .json()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to parse dictionary response: {}", e)))?;

    let entry = entries
        .into_iter()
        .next()
        .ok_or_else(|| ShioriError::Other("Empty dictionary response".to_string()))?;

    // Extract best phonetic and audio
    let phonetic = entry
        .phonetic
        .clone()
        .or_else(|| {
            entry
                .phonetics
                .as_ref()
                .and_then(|ps| ps.iter().find_map(|p| p.text.clone()))
        });

    let audio_url = entry.phonetics.as_ref().and_then(|ps| {
        ps.iter()
            .find_map(|p| p.audio.as_ref().filter(|a| !a.is_empty()).cloned())
    });

    let source_url = entry.source_urls.and_then(|urls| urls.into_iter().next());

    let meanings = entry
        .meanings
        .into_iter()
        .map(|m| DictionaryMeaning {
            part_of_speech: m.part_of_speech,
            definitions: m
                .definitions
                .into_iter()
                .take(3) // Limit to 3 definitions per part of speech
                .map(|d| DictionaryDefinition {
                    definition: d.definition,
                    example: d.example,
                    synonyms: d.synonyms.into_iter().take(5).collect(),
                    antonyms: d.antonyms.into_iter().take(5).collect(),
                })
                .collect(),
        })
        .collect();

    Ok(DictionaryResult {
        word: entry.word,
        phonetic,
        audio_url,
        meanings,
        source_url,
    })
}

/// Translate text using MyMemory API (primary) with Lingva fallback.
/// source_lang: ISO 639-1 code (e.g. "en") or "auto" for auto-detect
/// target_lang: ISO 639-1 code (e.g. "es")
pub async fn translate_text(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    // Limit text length for free APIs
    let text = if text.len() > 500 {
        &text[..500]
    } else {
        text
    };

    // Skip MyMemory for "auto" source — it requires specific ISO language codes
    if source_lang != "auto" {
        match translate_mymemory(text, source_lang, target_lang).await {
            Ok(result) => return Ok(result),
            Err(e) => {
                log::warn!("MyMemory translation failed: {}, trying Lingva fallback", e);
            }
        }
    }

    // Fallback to Lingva
    match translate_lingva(text, source_lang, target_lang).await {
        Ok(result) => Ok(result),
        Err(e) => Err(ShioriError::Other(format!(
            "All translation providers failed. Last error: {}",
            e
        ))),
    }
}

/// Translate using MyMemory API
async fn translate_mymemory(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let client = build_client().map_err(|e| ShioriError::Other(format!("HTTP client error: {}", e)))?;

    let langpair = format!("{}|{}", source_lang, target_lang);

    let response = client
        .get("https://api.mymemory.translated.net/get")
        .query(&[("q", text), ("langpair", &langpair)])
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("MyMemory request failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "MyMemory API returned status {}",
            response.status()
        )));
    }

    let result: MyMemoryResponse = response
        .json()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to parse MyMemory response: {}", e)))?;

    // Check for error status in response body
    if let Some(status) = &result.response_status {
        if let Some(status_num) = status.as_u64() {
            if status_num == 403 {
                return Err(ShioriError::Other("MyMemory quota exceeded".to_string()));
            }
        }
    }

    Ok(TranslationResult {
        translated_text: result.response_data.translated_text,
        source_language: source_lang.to_string(),
        target_language: target_lang.to_string(),
        provider: "mymemory".to_string(),
    })
}

/// Translate using Lingva API (fallback)
async fn translate_lingva(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let client = build_client().map_err(|e| ShioriError::Other(format!("HTTP client error: {}", e)))?;

    let url = format!(
        "https://lingva.ml/api/v1/{}/{}/{}",
        urlencoding::encode(source_lang),
        urlencoding::encode(target_lang),
        urlencoding::encode(text)
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Lingva request failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Lingva API returned status {}",
            response.status()
        )));
    }

    let result: LingvaResponse = response
        .json()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to parse Lingva response: {}", e)))?;

    Ok(TranslationResult {
        translated_text: result.translation,
        source_language: source_lang.to_string(),
        target_language: target_lang.to_string(),
        provider: "lingva".to_string(),
    })
}
