/// Translation & Dictionary Service
///
/// Provides ultra-fast dictionary lookups (Wiktionary on Wikimedia global CDN with
/// Free Dictionary fallback) and instant text translation (Google Web Translate with
/// MyMemory & Lingva fallbacks). All providers are free and keyless.
///
/// Results are aggressively cached in memory so repeated lookups return in 0ms.
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use crate::conversion::utils::{decode_html_entities, strip_html_tags};
use crate::error::{Result, ShioriError};

static TRANSLATION_CACHE: OnceLock<Mutex<HashMap<String, TranslationResult>>> = OnceLock::new();
static DICTIONARY_CACHE: OnceLock<Mutex<HashMap<String, DictionaryResult>>> = OnceLock::new();
static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

fn get_translation_cache() -> &'static Mutex<HashMap<String, TranslationResult>> {
    TRANSLATION_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_dictionary_cache() -> &'static Mutex<HashMap<String, DictionaryResult>> {
    DICTIONARY_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_secs(8))
            .connect_timeout(Duration::from_secs(4))
            .pool_idle_timeout(Duration::from_secs(120))
            .pool_max_idle_per_host(8)
            .tcp_nodelay(true)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_default()
    })
}

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

// --- Wiktionary REST API ---
#[derive(Debug, Deserialize)]
struct WiktEntry {
    #[serde(rename = "partOfSpeech")]
    part_of_speech: Option<String>,
    #[serde(default)]
    definitions: Vec<WiktDefinition>,
}

#[derive(Debug, Deserialize)]
struct WiktDefinition {
    #[serde(default)]
    definition: String,
    #[serde(default)]
    examples: Vec<String>,
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

fn sanitize_definition_text(raw: &str) -> String {
    let mut cleaned = raw.to_string();
    while let Some(start) = cleaned.to_lowercase().find("<style") {
        if let Some(end) = cleaned[start..].to_lowercase().find("</style>") {
            cleaned.replace_range(start..start + end + 8, "");
        } else {
            break;
        }
    }
    while let Some(start) = cleaned.to_lowercase().find("<script") {
        if let Some(end) = cleaned[start..].to_lowercase().find("</script>") {
            cleaned.replace_range(start..start + end + 9, "");
        } else {
            break;
        }
    }
    let stripped = strip_html_tags(&cleaned);
    let decoded = decode_html_entities(&stripped);

    let mut result = decoded;
    while let Some(start) = result.find(".mw-parser-output") {
        if let Some(brace_end) = result[start..].find('}') {
            result.replace_range(start..start + brace_end + 1, "");
        } else {
            break;
        }
    }
    while let Some(start) = result.find('{') {
        if let Some(end) = result[start..].find('}') {
            let inner = &result[start + 1..start + end];
            if inner.contains(':') || inner.contains(';') {
                result.replace_range(start..start + end + 1, "");
                continue;
            }
        }
        break;
    }

    result.trim().to_string()
}

/// Look up a word, checking memory cache first, then querying Wiktionary (fast CDN)
/// with immediate fallback to the Free Dictionary API.
pub async fn dictionary_lookup(word: &str, lang: &str) -> Result<DictionaryResult> {
    let clean_word = word.trim();
    if clean_word.is_empty() {
        return Err(ShioriError::Other("Please provide a valid word".to_string()));
    }

    let cache_key = format!("{}:{}", lang.to_lowercase(), clean_word.to_lowercase());
    if let Some(cached) = get_dictionary_cache().lock().unwrap().get(&cache_key) {
        return Ok(cached.clone());
    }

    // Primary: Wiktionary on Wikimedia Global CDN (~100-250ms)
    let result = match wiktionary_lookup(clean_word, lang).await {
        Ok(res) => res,
        Err(wikt_err) => {
            // Fallback: Free Dictionary API (tight 2.5s timeout)
            match free_dictionary_lookup(clean_word, lang).await {
                Ok(res) => res,
                Err(_) => return Err(wikt_err),
            }
        }
    };

    get_dictionary_cache()
        .lock()
        .unwrap()
        .insert(cache_key, result.clone());

    Ok(result)
}

/// Primary dictionary provider: Wiktionary's REST API on Wikimedia's edge CDN.
async fn wiktionary_lookup(word: &str, lang: &str) -> Result<DictionaryResult> {
    let client = get_client();
    let lang_key = lang.to_lowercase();

    let url = format!(
        "https://en.wiktionary.org/api/rest_v1/page/definition/{}",
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
            "Wiktionary API returned status {}",
            status
        )));
    }

    let by_lang: HashMap<String, Vec<WiktEntry>> = response
        .json()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to parse Wiktionary response: {}", e)))?;

    let entries = by_lang
        .get(&lang_key)
        .or_else(|| by_lang.get("en"))
        .ok_or_else(|| ShioriError::Other(format!("No definition found for \"{}\"", word)))?;

    let meanings: Vec<DictionaryMeaning> = entries
        .iter()
        .filter_map(|entry| {
            let definitions: Vec<DictionaryDefinition> = entry
                .definitions
                .iter()
                .filter_map(|d| {
                    let text = sanitize_definition_text(&d.definition);
                    if text.is_empty() {
                        return None;
                    }
                    let example = d.examples.iter().find_map(|e| {
                        let cleaned = sanitize_definition_text(e);
                        if cleaned.is_empty() {
                            None
                        } else {
                            Some(cleaned)
                        }
                    });
                    Some(DictionaryDefinition {
                        definition: text,
                        example,
                        synonyms: Vec::new(),
                        antonyms: Vec::new(),
                    })
                })
                .take(3)
                .collect();

            if definitions.is_empty() {
                return None;
            }

            Some(DictionaryMeaning {
                part_of_speech: entry
                    .part_of_speech
                    .clone()
                    .unwrap_or_else(|| "definition".to_string()),
                definitions,
            })
        })
        .collect();

    if meanings.is_empty() {
        return Err(ShioriError::Other(format!(
            "No definition found for \"{}\"",
            word
        )));
    }

    Ok(DictionaryResult {
        word: word.to_string(),
        phonetic: None,
        audio_url: None,
        meanings,
        source_url: Some(format!("https://en.wiktionary.org/wiki/{}", word)),
    })
}

/// Fallback dictionary provider: the Free Dictionary API (dictionaryapi.dev).
async fn free_dictionary_lookup(word: &str, lang: &str) -> Result<DictionaryResult> {
    let client = get_client();

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

    let phonetic = entry.phonetic.clone().or_else(|| {
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
                .take(3)
                .map(|d| DictionaryDefinition {
                    definition: sanitize_definition_text(&d.definition),
                    example: d.example.map(|e| sanitize_definition_text(&e)),
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

// ═══════════════════════════════════════════════════════════════
// TRANSLATION SERVICE
// ═══════════════════════════════════════════════════════════════

/// Split text into semantic chunks bounded by `max_chars`.
/// Splits prefer paragraph breaks (`\n`), then sentence endings (`. `, `! `, `? `),
/// then whitespace, never splitting in the middle of UTF-8 characters.
fn split_text_into_chunks(text: &str, max_chars: usize) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if trimmed.chars().count() <= max_chars {
        return vec![trimmed.to_string()];
    }

    let mut chunks = Vec::new();
    let paragraphs: Vec<&str> = trimmed.split('\n').collect();
    let mut current_chunk = String::new();

    for (p_idx, p) in paragraphs.iter().enumerate() {
        let p_trimmed = p.trim();
        if p_trimmed.is_empty() {
            if !current_chunk.is_empty() && p_idx < paragraphs.len() - 1 {
                current_chunk.push('\n');
            }
            continue;
        }

        if p_trimmed.chars().count() > max_chars {
            // Flush current accumulated chunk
            if !current_chunk.is_empty() {
                chunks.push(current_chunk.clone());
                current_chunk.clear();
            }

            // Split paragraph by sentences
            let mut remaining = p_trimmed;
            while !remaining.is_empty() {
                if remaining.chars().count() <= max_chars {
                    chunks.push(remaining.to_string());
                    break;
                }

                // Look for sentence boundary (. ! ? ;) within the first max_chars characters
                let mut best_split = None;
                let mut char_count = 0;
                let mut last_space = None;

                for (byte_offset, c) in remaining.char_indices() {
                    char_count += 1;
                    if char_count > max_chars {
                        break;
                    }
                    if c == ' ' {
                        last_space = Some(byte_offset);
                    }
                    if (c == '.' || c == '!' || c == '?' || c == ';') && byte_offset + c.len_utf8() < remaining.len() {
                        let next_byte = byte_offset + c.len_utf8();
                        if remaining[next_byte..].starts_with(' ') || remaining[next_byte..].starts_with('\n') {
                            best_split = Some(next_byte);
                        }
                    }
                }

                let mut split_byte = if let Some(punct_split) = best_split {
                    punct_split
                } else if let Some(space_split) = last_space {
                    space_split
                } else {
                    // Hard boundary at max_chars safely on UTF-8 char boundary
                    let mut byte_idx = remaining.len();
                    let mut count = 0;
                    for (b_idx, _) in remaining.char_indices() {
                        if count == max_chars {
                            byte_idx = b_idx;
                            break;
                        }
                        count += 1;
                    }
                    byte_idx
                };

                if split_byte == 0 {
                    split_byte = remaining.chars().next().map(|c| c.len_utf8()).unwrap_or(remaining.len());
                }

                let piece = remaining[..split_byte].trim();
                if !piece.is_empty() {
                    chunks.push(piece.to_string());
                }
                remaining = remaining[split_byte..].trim_start();
            }
        } else {
            let needed = if current_chunk.is_empty() { 0 } else { 1 };
            if current_chunk.chars().count() + needed + p_trimmed.chars().count() > max_chars {
                chunks.push(current_chunk.clone());
                current_chunk.clear();
            }
            if !current_chunk.is_empty() {
                current_chunk.push('\n');
            }
            current_chunk.push_str(p_trimmed);
        }
    }

    if !current_chunk.is_empty() {
        chunks.push(current_chunk);
    }

    chunks
}

/// Translate text using high-performance Google Web Translate with MyMemory & Lingva fallbacks.
/// source_lang: ISO 639-1 code (e.g. "en") or "auto" for auto-detect
/// target_lang: ISO 639-1 code (e.g. "es")
pub async fn translate_text(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let clean_text = text.trim();
    if clean_text.is_empty() {
        return Ok(TranslationResult {
            translated_text: text.to_string(),
            source_language: source_lang.to_string(),
            target_language: target_lang.to_string(),
            provider: "none".to_string(),
        });
    }

    let key = format!("{}:{}:{}", source_lang, target_lang, clean_text);
    if let Some(cached) = get_translation_cache().lock().unwrap().get(&key) {
        return Ok(cached.clone());
    }

    let result = if clean_text.chars().count() > 1200 {
        translate_long_text(clean_text, source_lang, target_lang).await?
    } else {
        translate_text_single(clean_text, source_lang, target_lang).await?
    };

    // Only cache valid translations that are non-empty and don't match known error strings
    let upper = result.translated_text.to_uppercase();
    if !result.translated_text.trim().is_empty()
        && !upper.contains("QUERY LENGTH LIMIT EXCEEDED")
        && !upper.contains("MYMEMORY WARNING")
    {
        get_translation_cache()
            .lock()
            .unwrap()
            .insert(key, result.clone());
    }

    Ok(result)
}

async fn translate_long_text(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let chunks = split_text_into_chunks(text, 1000);
    if chunks.is_empty() {
        return Ok(TranslationResult {
            translated_text: String::new(),
            source_language: source_lang.to_string(),
            target_language: target_lang.to_string(),
            provider: "none".to_string(),
        });
    }

    let mut translated_pieces = Vec::with_capacity(chunks.len());
    let mut provider = String::new();

    for chunk in &chunks {
        let res = translate_text_single(chunk, source_lang, target_lang).await?;
        translated_pieces.push(res.translated_text);
        if provider.is_empty() {
            provider = res.provider;
        }
    }

    let separator = if text.contains("\n\n") {
        "\n\n"
    } else if text.contains('\n') {
        "\n"
    } else {
        " "
    };

    Ok(TranslationResult {
        translated_text: translated_pieces.join(separator),
        source_language: source_lang.to_string(),
        target_language: target_lang.to_string(),
        provider,
    })
}

async fn translate_text_single(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    // 0. Primary: Google GTX endpoint (JSON, fast, rock-solid, auto-detect)
    match translate_google_gtx(text, source_lang, target_lang).await {
        Ok(result) => return Ok(result),
        Err(e) => {
            log::warn!("Google GTX translation failed: {}, trying Google web fallback", e);
        }
    }

    // 1. Secondary: Google Web Translate mobile endpoint
    match translate_google_web(text, source_lang, target_lang).await {
        Ok(result) => return Ok(result),
        Err(e) => {
            log::warn!("Google web translation failed: {}, trying MyMemory fallback", e);
        }
    }

    // 2. Fallback: MyMemory (accepts ISO codes or 'autodetect')
    let mymemory_source = if source_lang == "auto" { "autodetect" } else { source_lang };
    match translate_mymemory(text, mymemory_source, target_lang).await {
        Ok(result) => return Ok(result),
        Err(e) => {
            log::warn!("MyMemory translation failed: {}, trying Lingva fallback", e);
        }
    }

    // 3. Fallback: Lingva
    match translate_lingva(text, source_lang, target_lang).await {
        Ok(result) => Ok(result),
        Err(e) => Err(ShioriError::Other(format!(
            "Translation failed: {}",
            e
        ))),
    }
}

/// Primary translation provider: Google Translate GTX endpoint (JSON).
/// Fast (~80-180ms), reliable, native auto-detection, no HTML scraping.
async fn translate_google_gtx(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let client = get_client();
    let url = "https://translate.googleapis.com/translate_a/single";

    let response = client
        .get(url)
        .query(&[
            ("client", "gtx"),
            ("sl", source_lang),
            ("tl", target_lang),
            ("dt", "t"),
            ("q", text),
        ])
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Google GTX request failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Google GTX returned status {}",
            response.status()
        )));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to parse Google GTX JSON: {}", e)))?;

    let mut translated_text = String::new();
    if let Some(sentences) = json.get(0).and_then(|v| v.as_array()) {
        for s in sentences {
            if let Some(part) = s.get(0).and_then(|v| v.as_str()) {
                translated_text.push_str(part);
            }
        }
    }

    let detected_lang = json
        .get(2)
        .and_then(|v| v.as_str())
        .unwrap_or(source_lang)
        .to_string();

    let cleaned = decode_html_entities(&translated_text).trim().to_string();
    if cleaned.is_empty() {
        return Err(ShioriError::Other("Empty translation received from Google GTX".to_string()));
    }

    Ok(TranslationResult {
        translated_text: cleaned,
        source_language: detected_lang,
        target_language: target_lang.to_string(),
        provider: "google".to_string(),
    })
}

/// Fallback translation provider: Google Web Translate mobile endpoint.
/// Fast, robust, supports auto-detection and all language pairs without rate-limiting.
async fn translate_google_web(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let client = get_client();
    let url = "https://translate.google.com/m";

    let response = client
        .get(url)
        .query(&[
            ("sl", source_lang),
            ("tl", target_lang),
            ("q", text),
        ])
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Google Translate request failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Google Translate returned status {}",
            response.status()
        )));
    }

    let html = response
        .text()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to read translation response: {}", e)))?;

    // Extract content from <div class="result-container">...</div>
    let start_marker = "class=\"result-container\">";
    let start_idx = html.find(start_marker).ok_or_else(|| {
        ShioriError::Other("Translation container not found in Google response".to_string())
    })? + start_marker.len();

    let end_idx = html[start_idx..].find("</div>").ok_or_else(|| {
        ShioriError::Other("Translation container end tag not found".to_string())
    })? + start_idx;

    let raw_result = &html[start_idx..end_idx];
    let stripped = strip_html_tags(raw_result);
    let decoded = decode_html_entities(&stripped).trim().to_string();

    if decoded.is_empty() {
        return Err(ShioriError::Other("Empty translation received".to_string()));
    }

    Ok(TranslationResult {
        translated_text: decoded,
        source_language: source_lang.to_string(),
        target_language: target_lang.to_string(),
        provider: "google".to_string(),
    })
}

async fn translate_mymemory_single(
    chunk: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<String> {
    let client = get_client();
    let langpair = format!("{}|{}", source_lang, target_lang);

    let response = client
        .get("https://api.mymemory.translated.net/get")
        .query(&[("q", chunk), ("langpair", &langpair)])
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

    let status_code = match &result.response_status {
        Some(serde_json::Value::Number(n)) => n.as_u64().unwrap_or(200),
        Some(serde_json::Value::String(s)) => s.parse::<u64>().unwrap_or(200),
        _ => 200,
    };

    if status_code != 200 {
        return Err(ShioriError::Other(format!(
            "MyMemory API error status {}: {}",
            status_code, result.response_data.translated_text
        )));
    }

    let decoded = decode_html_entities(&result.response_data.translated_text);
    let trimmed = decoded.trim();

    let upper = trimmed.to_uppercase();
    if trimmed.is_empty()
        || upper.contains("QUERY LENGTH LIMIT EXCEEDED")
        || upper.contains("MYMEMORY WARNING")
        || upper.contains("INVALID TARGET LANGUAGE")
        || upper.contains("PLEASE SPECIFY A VALID")
        || upper.contains("QUOTA EXCEEDED")
    {
        return Err(ShioriError::Other(format!("MyMemory error: {}", trimmed)));
    }

    Ok(trimmed.to_string())
}

/// Fallback translation provider: MyMemory API.
/// Chunks queries to <= 450 characters to strictly respect MyMemory's 500-char limit.
async fn translate_mymemory(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let chunks = split_text_into_chunks(text, 450);
    if chunks.is_empty() {
        return Ok(TranslationResult {
            translated_text: String::new(),
            source_language: source_lang.to_string(),
            target_language: target_lang.to_string(),
            provider: "mymemory".to_string(),
        });
    }

    let mut translated_pieces = Vec::with_capacity(chunks.len());
    for chunk in &chunks {
        let piece = translate_mymemory_single(chunk, source_lang, target_lang).await?;
        translated_pieces.push(piece);
    }

    let separator = if text.contains("\n\n") {
        "\n\n"
    } else if text.contains('\n') {
        "\n"
    } else {
        " "
    };

    Ok(TranslationResult {
        translated_text: translated_pieces.join(separator),
        source_language: source_lang.to_string(),
        target_language: target_lang.to_string(),
        provider: "mymemory".to_string(),
    })
}

async fn translate_lingva_single(
    instance: &str,
    chunk: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<String> {
    let client = get_client();
    let url = format!(
        "{}/api/v1/{}/{}/{}",
        instance,
        urlencoding::encode(source_lang),
        urlencoding::encode(target_lang),
        urlencoding::encode(chunk)
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Lingva request failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!("Status {}", response.status())));
    }

    let result: LingvaResponse = response
        .json()
        .await
        .map_err(|e| ShioriError::Other(format!("Parse failed: {}", e)))?;

    let decoded = decode_html_entities(&result.translation);
    let trimmed = decoded.trim();
    if trimmed.is_empty() {
        return Err(ShioriError::Other("Empty translation".to_string()));
    }

    Ok(trimmed.to_string())
}

/// Fallback translation provider: Lingva API.
/// Chunks queries to <= 400 characters to prevent URL-length overflow.
async fn translate_lingva(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let instances = [
        "https://lingva.ml",
        "https://translate.nerdvpn.de",
        "https://lingva.lunar.icu",
        "https://lingva.thedesk.top",
    ];

    let chunks = split_text_into_chunks(text, 400);
    if chunks.is_empty() {
        return Ok(TranslationResult {
            translated_text: String::new(),
            source_language: source_lang.to_string(),
            target_language: target_lang.to_string(),
            provider: "lingva".to_string(),
        });
    }

    let separator = if text.contains("\n\n") {
        "\n\n"
    } else if text.contains('\n') {
        "\n"
    } else {
        " "
    };

    let mut last_error = String::new();

    for instance in instances {
        let mut translated_pieces = Vec::with_capacity(chunks.len());
        let mut failed = false;

        for chunk in &chunks {
            match translate_lingva_single(instance, chunk, source_lang, target_lang).await {
                Ok(res) => translated_pieces.push(res),
                Err(e) => {
                    last_error = e.to_string();
                    failed = true;
                    break;
                }
            }
        }

        if !failed && !translated_pieces.is_empty() {
            return Ok(TranslationResult {
                translated_text: translated_pieces.join(separator),
                source_language: source_lang.to_string(),
                target_language: target_lang.to_string(),
                provider: "lingva".to_string(),
            });
        }
    }

    Err(ShioriError::Other(format!(
        "All translation providers failed. Last error: {}",
        last_error
    )))
}

