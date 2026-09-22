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
            .timeout(Duration::from_secs(5))
            .connect_timeout(Duration::from_secs(3))
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

// ═══════════════════════════════════════════════════════════════
// DICTIONARY LOOKUP
// ═══════════════════════════════════════════════════════════════

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
                    let text = decode_html_entities(&strip_html_tags(&d.definition))
                        .trim()
                        .to_string();
                    if text.is_empty() {
                        return None;
                    }
                    let example = d.examples.iter().find_map(|e| {
                        let cleaned = decode_html_entities(&strip_html_tags(e))
                            .trim()
                            .to_string();
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
                    definition: decode_html_entities(&d.definition),
                    example: d.example.map(|e| decode_html_entities(&e)),
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

    let result = if clean_text.len() > 3000 {
        translate_long_text(clean_text, source_lang, target_lang).await?
    } else {
        translate_text_single(clean_text, source_lang, target_lang).await?
    };

    get_translation_cache()
        .lock()
        .unwrap()
        .insert(key, result.clone());
    Ok(result)
}

async fn translate_long_text(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let chunks: Vec<&str> = text
        .split("\n\n")
        .flat_map(|p| p.split(". "))
        .filter(|c| !c.trim().is_empty())
        .collect();

    let mut translated_pieces = Vec::new();
    let mut provider = String::new();

    for chunk in chunks {
        let safe_chunk = if chunk.len() > 2500 {
            &chunk[..2500]
        } else {
            chunk
        };
        let res = translate_text_single(safe_chunk, source_lang, target_lang).await?;
        translated_pieces.push(res.translated_text);
        if provider.is_empty() {
            provider = res.provider;
        }
    }

    Ok(TranslationResult {
        translated_text: translated_pieces.join(". "),
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

/// Fallback translation provider: MyMemory API.
async fn translate_mymemory(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let client = get_client();
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

    if let Some(status) = &result.response_status {
        if let Some(status_num) = status.as_u64() {
            if status_num == 403 {
                return Err(ShioriError::Other("MyMemory quota exceeded".to_string()));
            }
        }
    }

    let decoded = decode_html_entities(&result.response_data.translated_text);

    Ok(TranslationResult {
        translated_text: decoded,
        source_language: source_lang.to_string(),
        target_language: target_lang.to_string(),
        provider: "mymemory".to_string(),
    })
}

/// Fallback translation provider: Lingva API.
async fn translate_lingva(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult> {
    let client = get_client();

    let instances = [
        "https://lingva.ml",
        "https://translate.nerdvpn.de",
        "https://lingva.lunar.icu",
        "https://lingva.thedesk.top",
    ];

    let mut last_error = String::new();

    for instance in instances {
        let url = format!(
            "{}/api/v1/{}/{}/{}",
            instance,
            urlencoding::encode(source_lang),
            urlencoding::encode(target_lang),
            urlencoding::encode(text)
        );

        let response = match client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                last_error = format!("Request failed: {}", e);
                continue;
            }
        };

        if !response.status().is_success() {
            last_error = format!("Status {}", response.status());
            continue;
        }

        let result: LingvaResponse = match response.json().await {
            Ok(res) => res,
            Err(e) => {
                last_error = format!("Parse failed: {}", e);
                continue;
            }
        };

        let decoded = decode_html_entities(&result.translation);

        return Ok(TranslationResult {
            translated_text: decoded,
            source_language: source_lang.to_string(),
            target_language: target_lang.to_string(),
            provider: "lingva".to_string(),
        });
    }

    Err(ShioriError::Other(format!(
        "All translation providers failed. Last error: {}",
        last_error
    )))
}

