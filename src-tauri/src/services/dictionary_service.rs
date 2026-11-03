/// Offline Dictionary Service
///
/// Manages local SQLite-backed dictionaries, built-in English and Japanese
/// lexicons, and importers for Yomichan zip archives, StarDict (.ifo/.idx/.dict),
/// and custom JSON dictionaries.
use crate::error::{Result, ShioriError};
use crate::services::translation_service::{
    DictionaryDefinition, DictionaryMeaning, DictionaryResult,
};
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineDictionaryInfo {
    pub id: i64,
    pub name: String,
    pub lang_src: String,
    pub lang_target: String,
    pub format: String,
    pub file_path: Option<String>,
    pub entry_count: i64,
    pub is_enabled: bool,
    pub created_at: String,
}

pub struct DictionaryService;

impl DictionaryService {
    /// Retrieve all registered offline dictionaries
    pub fn get_dictionaries(conn: &Connection) -> Result<Vec<OfflineDictionaryInfo>> {
        Self::ensure_builtin_dictionaries(conn)?;

        let mut stmt = conn.prepare(
            "SELECT id, name, lang_src, lang_target, format, file_path, entry_count, is_enabled, created_at
             FROM offline_dictionaries
             ORDER BY id ASC",
        )?;

        let list = stmt
            .query_map([], |row| Self::dict_from_row(row))?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(list)
    }

    /// Toggle a dictionary's enabled status
    pub fn toggle_dictionary(conn: &Connection, id: i64, enabled: bool) -> Result<()> {
        let val = if enabled { 1 } else { 0 };
        conn.execute(
            "UPDATE offline_dictionaries SET is_enabled = ?1 WHERE id = ?2",
            params![val, id],
        )?;
        Ok(())
    }

    /// Delete a custom imported dictionary and all associated entries
    pub fn delete_dictionary(conn: &Connection, id: i64) -> Result<()> {
        // Prevent deleting built-in dictionaries; just disable them instead
        let format: String = conn.query_row(
            "SELECT format FROM offline_dictionaries WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )?;

        if format == "builtin" {
            Self::toggle_dictionary(conn, id, false)?;
            return Ok(());
        }

        conn.execute(
            "DELETE FROM dictionary_entries WHERE dictionary_id = ?1",
            params![id],
        )?;
        conn.execute(
            "DELETE FROM offline_dictionaries WHERE id = ?1",
            params![id],
        )?;

        Ok(())
    }

    /// Query local offline dictionaries for a word or phrase
    pub fn lookup_offline(
        conn: &Connection,
        query: &str,
        _lang: &str,
    ) -> Result<Option<DictionaryResult>> {
        Self::ensure_builtin_dictionaries(conn)?;

        let clean = query.trim().trim_matches(|c: char| !c.is_alphanumeric() && !is_cjk(c));
        if clean.is_empty() {
            return Ok(None);
        }

        let clean_lower = clean.to_lowercase();

        // 1. Exact match query against clean_word, word, or reading
        let sql = "SELECT e.word, e.reading, e.definitions_json, e.jlpt_level, d.name
                   FROM dictionary_entries e
                   LEFT JOIN offline_dictionaries d ON e.dictionary_id = d.id
                   WHERE (d.is_enabled = 1 OR e.dictionary_id IS NULL)
                     AND (e.clean_word = ?1 OR e.word = ?2 OR e.reading = ?2)
                   ORDER BY (e.clean_word = ?1) DESC, e.id ASC
                   LIMIT 1";

        let mut stmt = conn.prepare(sql)?;
        let mut rows = stmt.query(params![clean_lower, clean])?;

        if let Some(row) = rows.next()? {
            let word: String = row.get(0)?;
            let reading: Option<String> = row.get(1)?;
            let defs_json: String = row.get(2)?;
            let jlpt_level: Option<u8> = row.get(3)?;
            let dict_name: Option<String> = row.get(4)?;

            let meanings: Vec<DictionaryMeaning> =
                serde_json::from_str(&defs_json).unwrap_or_else(|_| {
                    vec![DictionaryMeaning {
                        part_of_speech: "general".to_string(),
                        definitions: vec![DictionaryDefinition {
                            definition: defs_json,
                            example: None,
                            synonyms: Vec::new(),
                            antonyms: Vec::new(),
                        }],
                    }]
                });

            let phonetic = reading.clone();
            let source_url = dict_name.map(|n| format!("Offline: {}", n));

            return Ok(Some(DictionaryResult {
                word,
                phonetic,
                audio_url: None,
                meanings,
                source_url,
                reading,
                jlpt_level,
                is_offline: Some(true),
            }));
        }

        // 2. Inflection fallback (plural -s, -es, -ed, -ing)
        if clean_lower.len() > 3 {
            let candidates: Vec<&str> = if clean_lower.ends_with("ies") {
                vec![clean_lower.strip_suffix("ies").unwrap()]
            } else if clean_lower.ends_with("es") {
                vec![clean_lower.strip_suffix("es").unwrap(), clean_lower.strip_suffix("s").unwrap()]
            } else if clean_lower.ends_with('s') {
                vec![clean_lower.strip_suffix('s').unwrap()]
            } else if clean_lower.ends_with("ing") {
                vec![clean_lower.strip_suffix("ing").unwrap()]
            } else if clean_lower.ends_with("ed") {
                vec![clean_lower.strip_suffix("ed").unwrap(), clean_lower.strip_suffix('d').unwrap()]
            } else {
                Vec::new()
            };

            for cand in candidates {
                let mut fallback_stmt = conn.prepare(
                    "SELECT e.word, e.reading, e.definitions_json, e.jlpt_level, d.name
                     FROM dictionary_entries e
                     LEFT JOIN offline_dictionaries d ON e.dictionary_id = d.id
                     WHERE (d.is_enabled = 1 OR e.dictionary_id IS NULL)
                       AND e.clean_word = ?1
                     LIMIT 1",
                )?;
                let mut f_rows = fallback_stmt.query(params![cand])?;
                if let Some(row) = f_rows.next()? {
                    let word: String = row.get(0)?;
                    let reading: Option<String> = row.get(1)?;
                    let defs_json: String = row.get(2)?;
                    let jlpt_level: Option<u8> = row.get(3)?;
                    let dict_name: Option<String> = row.get(4)?;

                    let meanings: Vec<DictionaryMeaning> =
                        serde_json::from_str(&defs_json).unwrap_or_default();

                    return Ok(Some(DictionaryResult {
                        word,
                        phonetic: reading.clone(),
                        audio_url: None,
                        meanings,
                        source_url: dict_name.map(|n| format!("Offline: {}", n)),
                        reading,
                        jlpt_level,
                        is_offline: Some(true),
                    }));
                }
            }
        }

        Ok(None)
    }

    /// Save an online result into the offline SQLite cache
    pub fn save_cached_entry(
        conn: &Connection,
        result: &DictionaryResult,
        _lang: &str,
        source: &str,
    ) -> Result<()> {
        let clean = result.word.trim().to_lowercase();
        let defs_json = serde_json::to_string(&result.meanings).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO dictionary_entries (dictionary_id, word, clean_word, reading, definitions_json, jlpt_level, source)
             VALUES (NULL, ?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                result.word,
                clean,
                result.reading.as_deref().or(result.phonetic.as_deref()),
                defs_json,
                result.jlpt_level,
                source
            ],
        )?;

        Ok(())
    }

    /// Import a custom dictionary from a file (.zip for Yomichan/StarDict, or .json, or .idx/.dict)
    pub fn import_dictionary(conn: &Connection, file_path_str: &str) -> Result<OfflineDictionaryInfo> {
        let path = Path::new(file_path_str);
        if !path.exists() {
            return Err(ShioriError::FileNotFound {
                path: file_path_str.to_string(),
            });
        }

        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Dictionary");

        if ext == "zip" {
            Self::import_zip_dictionary(conn, path, file_stem)
        } else if ext == "json" {
            Self::import_json_dictionary(conn, path, file_stem)
        } else if ext == "idx" || ext == "dict" || ext == "ifo" {
            Self::import_stardict_raw(conn, path, file_stem)
        } else {
            Err(ShioriError::Other(format!(
                "Unsupported dictionary format '.{}'. Supported formats: .zip (Yomichan / StarDict), .json, or StarDict .idx/.dict",
                ext
            )))
        }
    }

    // ─────────────────────────────────────────────────────────────
    // IMPORTERS: Yomichan / StarDict / JSON
    // ─────────────────────────────────────────────────────────────

    fn import_zip_dictionary(
        conn: &Connection,
        path: &Path,
        default_name: &str,
    ) -> Result<OfflineDictionaryInfo> {
        let file = File::open(path)
            .map_err(|e| ShioriError::Other(format!("Failed to open zip file: {}", e)))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| ShioriError::Other(format!("Failed to parse zip archive: {}", e)))?;

        // 1. Check if this is a Yomichan format archive (contains index.json and term_bank_*.json)
        let mut is_yomichan = false;
        let mut dict_title = default_name.to_string();
        let lang_src = "ja".to_string();
        let mut lang_target = "en".to_string();

        if let Ok(mut index_file) = archive.by_name("index.json") {
            let mut contents = String::new();
            if index_file.read_to_string(&mut contents).is_ok() {
                if let Ok(index_json) = serde_json::from_str::<serde_json::Value>(&contents) {
                    is_yomichan = true;
                    if let Some(title) = index_json.get("title").and_then(|v| v.as_str()) {
                        dict_title = title.to_string();
                    }
                    if let Some(target) = index_json.get("targetLang").and_then(|v| v.as_str()) {
                        lang_target = target.to_string();
                    }
                }
            }
        }

        if is_yomichan {
            return Self::process_yomichan_zip(
                conn,
                &mut archive,
                &dict_title,
                &lang_src,
                &lang_target,
                path.to_str(),
            );
        }

        // 2. Check if this is a zipped StarDict archive
        let mut ifo_name: Option<String> = None;
        let mut idx_name: Option<String> = None;
        let mut dict_name: Option<String> = None;

        for i in 0..archive.len() {
            if let Ok(file) = archive.by_index(i) {
                let name = file.name().to_string();
                if name.ends_with(".ifo") {
                    ifo_name = Some(name);
                } else if name.ends_with(".idx") {
                    idx_name = Some(name);
                } else if name.ends_with(".dict") || name.ends_with(".dict.dz") {
                    dict_name = Some(name);
                }
            }
        }

        if let (Some(ifo), Some(idx), Some(dict)) = (ifo_name, idx_name, dict_name) {
            return Self::process_stardict_zip(
                conn,
                &mut archive,
                &ifo,
                &idx,
                &dict,
                default_name,
                path.to_str(),
            );
        }

        Err(ShioriError::Other(
            "Zip archive is neither a recognized Yomichan dictionary (missing index.json) nor StarDict (missing .ifo/.idx/.dict files)."
                .to_string(),
        ))
    }

    fn process_yomichan_zip(
        conn: &Connection,
        archive: &mut zip::ZipArchive<File>,
        title: &str,
        lang_src: &str,
        lang_target: &str,
        file_path: Option<&str>,
    ) -> Result<OfflineDictionaryInfo> {
        // Register dictionary
        conn.execute(
            "INSERT INTO offline_dictionaries (name, lang_src, lang_target, format, file_path, entry_count, is_enabled)
             VALUES (?1, ?2, ?3, 'yomichan', ?4, 0, 1)",
            params![title, lang_src, lang_target, file_path],
        )?;
        let dict_id = conn.last_insert_rowid();

        let mut total_entries = 0i64;
        let mut term_bank_names: Vec<String> = Vec::new();

        for i in 0..archive.len() {
            if let Ok(f) = archive.by_index(i) {
                let name = f.name().to_string();
                if name.starts_with("term_bank_") && name.ends_with(".json") {
                    term_bank_names.push(name);
                }
            }
        }

        term_bank_names.sort();

        let tx = conn.unchecked_transaction()?;

        for bank_name in term_bank_names {
            if let Ok(mut bank_file) = archive.by_name(&bank_name) {
                let mut content = String::new();
                if bank_file.read_to_string(&mut content).is_ok() {
                    if let Ok(entries) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                        for item in entries {
                            if let Some(arr) = item.as_array() {
                                if arr.len() >= 6 {
                                    let term = arr[0].as_str().unwrap_or("").trim();
                                    let reading = arr[1].as_str().unwrap_or("").trim();
                                    let pos = arr[2].as_str().unwrap_or("").trim();

                                    let mut def_strings: Vec<String> = Vec::new();
                                    if let Some(glosses) = arr[5].as_array() {
                                        for g in glosses {
                                            if let Some(s) = g.as_str() {
                                                def_strings.push(s.to_string());
                                            } else if let Some(obj) = g.as_object() {
                                                if let Some(text) = obj.get("content").and_then(|c| c.as_str()) {
                                                    def_strings.push(text.to_string());
                                                }
                                            }
                                        }
                                    }

                                    if !term.is_empty() && !def_strings.is_empty() {
                                        let definitions: Vec<DictionaryDefinition> = def_strings
                                            .into_iter()
                                            .map(|d| DictionaryDefinition {
                                                definition: d,
                                                example: None,
                                                synonyms: Vec::new(),
                                                antonyms: Vec::new(),
                                            })
                                            .collect();

                                        let meanings = vec![DictionaryMeaning {
                                            part_of_speech: if pos.is_empty() { "word".to_string() } else { pos.to_string() },
                                            definitions,
                                        }];

                                        let defs_json = serde_json::to_string(&meanings).unwrap_or_default();
                                        let clean_term = term.to_lowercase();
                                        let reading_opt = if reading.is_empty() { None } else { Some(reading) };

                                        tx.execute(
                                            "INSERT INTO dictionary_entries (dictionary_id, word, clean_word, reading, definitions_json, source)
                                             VALUES (?1, ?2, ?3, ?4, ?5, 'yomichan')",
                                            params![dict_id, term, clean_term, reading_opt, defs_json],
                                        )?;

                                        total_entries += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        tx.execute(
            "UPDATE offline_dictionaries SET entry_count = ?1 WHERE id = ?2",
            params![total_entries, dict_id],
        )?;

        tx.commit()?;

        Ok(OfflineDictionaryInfo {
            id: dict_id,
            name: title.to_string(),
            lang_src: lang_src.to_string(),
            lang_target: lang_target.to_string(),
            format: "yomichan".to_string(),
            file_path: file_path.map(|s| s.to_string()),
            entry_count: total_entries,
            is_enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    fn process_stardict_zip(
        conn: &Connection,
        archive: &mut zip::ZipArchive<File>,
        ifo_name: &str,
        idx_name: &str,
        dict_name: &str,
        default_name: &str,
        file_path: Option<&str>,
    ) -> Result<OfflineDictionaryInfo> {
        let mut ifo_str = String::new();
        if let Ok(mut ifo_file) = archive.by_name(ifo_name) {
            let _ = ifo_file.read_to_string(&mut ifo_str);
        }

        let mut book_name = default_name.to_string();
        for line in ifo_str.lines() {
            if line.starts_with("bookname=") {
                book_name = line.trim_start_matches("bookname=").trim().to_string();
            }
        }

        let mut idx_bytes = Vec::new();
        if let Ok(mut idx_file) = archive.by_name(idx_name) {
            let _ = idx_file.read_to_end(&mut idx_bytes);
        }

        let mut dict_bytes = Vec::new();
        if let Ok(mut d_file) = archive.by_name(dict_name) {
            let mut raw_bytes = Vec::new();
            let _ = d_file.read_to_end(&mut raw_bytes);

            if dict_name.ends_with(".dz") {
                let mut decoder = flate2::read::GzDecoder::new(&raw_bytes[..]);
                let _ = decoder.read_to_end(&mut dict_bytes);
            } else {
                dict_bytes = raw_bytes;
            }
        }

        Self::ingest_stardict_data(conn, &book_name, &idx_bytes, &dict_bytes, file_path)
    }

    fn import_stardict_raw(
        conn: &Connection,
        path: &Path,
        file_stem: &str,
    ) -> Result<OfflineDictionaryInfo> {
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        let ifo_path = parent.join(format!("{}.ifo", file_stem));
        let idx_path = parent.join(format!("{}.idx", file_stem));
        let dict_path = parent.join(format!("{}.dict", file_stem));
        let dict_dz_path = parent.join(format!("{}.dict.dz", file_stem));

        let mut book_name = file_stem.to_string();
        if ifo_path.exists() {
            if let Ok(ifo_str) = std::fs::read_to_string(&ifo_path) {
                for line in ifo_str.lines() {
                    if line.starts_with("bookname=") {
                        book_name = line.trim_start_matches("bookname=").trim().to_string();
                    }
                }
            }
        }

        let idx_bytes = std::fs::read(&idx_path)
            .map_err(|e| ShioriError::Other(format!("Cannot read .idx file: {}", e)))?;

        let dict_bytes = if dict_dz_path.exists() {
            let raw = std::fs::read(&dict_dz_path)
                .map_err(|e| ShioriError::Other(format!("Cannot read .dict.dz file: {}", e)))?;
            let mut decoded = Vec::new();
            let mut decoder = flate2::read::GzDecoder::new(&raw[..]);
            let _ = decoder.read_to_end(&mut decoded);
            decoded
        } else if dict_path.exists() {
            std::fs::read(&dict_path)
                .map_err(|e| ShioriError::Other(format!("Cannot read .dict file: {}", e)))?
        } else {
            return Err(ShioriError::Other("StarDict .dict or .dict.dz not found".to_string()));
        };

        Self::ingest_stardict_data(conn, &book_name, &idx_bytes, &dict_bytes, path.to_str())
    }

    fn ingest_stardict_data(
        conn: &Connection,
        book_name: &str,
        idx_bytes: &[u8],
        dict_bytes: &[u8],
        file_path: Option<&str>,
    ) -> Result<OfflineDictionaryInfo> {
        conn.execute(
            "INSERT INTO offline_dictionaries (name, lang_src, lang_target, format, file_path, entry_count, is_enabled)
             VALUES (?1, 'auto', 'auto', 'stardict', ?2, 0, 1)",
            params![book_name, file_path],
        )?;
        let dict_id = conn.last_insert_rowid();

        let tx = conn.unchecked_transaction()?;
        let mut total_entries = 0i64;
        let mut cursor = 0;
        let idx_len = idx_bytes.len();

        while cursor < idx_len {
            // Find null terminator for word
            let mut null_pos = cursor;
            while null_pos < idx_len && idx_bytes[null_pos] != 0 {
                null_pos += 1;
            }

            if null_pos >= idx_len || null_pos + 8 > idx_len {
                break;
            }

            let word = String::from_utf8_lossy(&idx_bytes[cursor..null_pos]).to_string();
            let offset_bytes = &idx_bytes[null_pos + 1..null_pos + 5];
            let size_bytes = &idx_bytes[null_pos + 5..null_pos + 9];

            let offset = u32::from_be_bytes([offset_bytes[0], offset_bytes[1], offset_bytes[2], offset_bytes[3]]) as usize;
            let size = u32::from_be_bytes([size_bytes[0], size_bytes[1], size_bytes[2], size_bytes[3]]) as usize;

            cursor = null_pos + 9;

            if offset + size <= dict_bytes.len() {
                let def_str = String::from_utf8_lossy(&dict_bytes[offset..offset + size]).trim().to_string();
                if !word.is_empty() && !def_str.is_empty() {
                    let meanings = vec![DictionaryMeaning {
                        part_of_speech: "definition".to_string(),
                        definitions: vec![DictionaryDefinition {
                            definition: def_str,
                            example: None,
                            synonyms: Vec::new(),
                            antonyms: Vec::new(),
                        }],
                    }];

                    let defs_json = serde_json::to_string(&meanings).unwrap_or_default();
                    let clean = word.to_lowercase();

                    tx.execute(
                        "INSERT INTO dictionary_entries (dictionary_id, word, clean_word, definitions_json, source)
                         VALUES (?1, ?2, ?3, ?4, 'stardict')",
                        params![dict_id, word, clean, defs_json],
                    )?;

                    total_entries += 1;
                }
            }
        }

        tx.execute(
            "UPDATE offline_dictionaries SET entry_count = ?1 WHERE id = ?2",
            params![total_entries, dict_id],
        )?;

        tx.commit()?;

        Ok(OfflineDictionaryInfo {
            id: dict_id,
            name: book_name.to_string(),
            lang_src: "auto".to_string(),
            lang_target: "auto".to_string(),
            format: "stardict".to_string(),
            file_path: file_path.map(|s| s.to_string()),
            entry_count: total_entries,
            is_enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    fn import_json_dictionary(
        conn: &Connection,
        path: &Path,
        default_name: &str,
    ) -> Result<OfflineDictionaryInfo> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| ShioriError::Other(format!("Failed to read JSON: {}", e)))?;
        let items: Vec<serde_json::Value> = serde_json::from_str(&content)
            .map_err(|e| ShioriError::Other(format!("Invalid dictionary JSON array: {}", e)))?;

        conn.execute(
            "INSERT INTO offline_dictionaries (name, lang_src, lang_target, format, file_path, entry_count, is_enabled)
             VALUES (?1, 'auto', 'auto', 'json', ?2, 0, 1)",
            params![default_name, path.to_str()],
        )?;
        let dict_id = conn.last_insert_rowid();

        let tx = conn.unchecked_transaction()?;
        let mut count = 0i64;

        for item in items {
            let word = item.get("word").or_else(|| item.get("term")).and_then(|v| v.as_str()).unwrap_or("").trim();
            if word.is_empty() {
                continue;
            }

            let reading = item.get("reading").and_then(|v| v.as_str());
            let jlpt = item.get("jlpt").or_else(|| item.get("jlpt_level")).and_then(|v| v.as_u64()).map(|u| u as u8);

            let meanings: Vec<DictionaryMeaning> = if let Some(m_val) = item.get("meanings") {
                serde_json::from_value(m_val.clone()).unwrap_or_default()
            } else if let Some(def_str) = item.get("definition").and_then(|v| v.as_str()) {
                vec![DictionaryMeaning {
                    part_of_speech: "definition".to_string(),
                    definitions: vec![DictionaryDefinition {
                        definition: def_str.to_string(),
                        example: None,
                        synonyms: Vec::new(),
                        antonyms: Vec::new(),
                    }],
                }]
            } else {
                Vec::new()
            };

            if !meanings.is_empty() {
                let defs_json = serde_json::to_string(&meanings).unwrap_or_default();
                tx.execute(
                    "INSERT INTO dictionary_entries (dictionary_id, word, clean_word, reading, definitions_json, jlpt_level, source)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'json')",
                    params![dict_id, word, word.to_lowercase(), reading, defs_json, jlpt],
                )?;
                count += 1;
            }
        }

        tx.execute(
            "UPDATE offline_dictionaries SET entry_count = ?1 WHERE id = ?2",
            params![count, dict_id],
        )?;

        tx.commit()?;

        Ok(OfflineDictionaryInfo {
            id: dict_id,
            name: default_name.to_string(),
            lang_src: "auto".to_string(),
            lang_target: "auto".to_string(),
            format: "json".to_string(),
            file_path: path.to_str().map(|s| s.to_string()),
            entry_count: count,
            is_enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    // ─────────────────────────────────────────────────────────────
    // BUILT-IN LEXICONS (English + Japanese-English)
    // ─────────────────────────────────────────────────────────────

    /// Ensure built-in English and Japanese dictionaries are seeded in SQLite
    pub fn ensure_builtin_dictionaries(conn: &Connection) -> Result<()> {
        let has_en: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM offline_dictionaries WHERE format = 'builtin' AND lang_src = 'en'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(false);

        let has_ja: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM offline_dictionaries WHERE format = 'builtin' AND lang_src = 'ja'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(false);

        if has_en && has_ja {
            return Ok(());
        }

        let tx = conn.unchecked_transaction()?;

        // 1. Built-in English
        if !has_en {
            tx.execute(
                "INSERT INTO offline_dictionaries (name, lang_src, lang_target, format, entry_count, is_enabled)
                 VALUES ('Built-in English Core Lexicon', 'en', 'en', 'builtin', 0, 1)",
                [],
            )?;
            let en_id = tx.last_insert_rowid();

            let mut count = 0i64;
            for (word, phonetic, pos, def, example) in get_builtin_english_lexicon() {
                let meanings = vec![DictionaryMeaning {
                    part_of_speech: pos.to_string(),
                    definitions: vec![DictionaryDefinition {
                        definition: def.to_string(),
                        example: if example.is_empty() { None } else { Some(example.to_string()) },
                        synonyms: Vec::new(),
                        antonyms: Vec::new(),
                    }],
                }];
                let json = serde_json::to_string(&meanings).unwrap_or_default();
                tx.execute(
                    "INSERT INTO dictionary_entries (dictionary_id, word, clean_word, reading, definitions_json, source)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'builtin')",
                    params![en_id, word, word.to_lowercase(), phonetic, json],
                )?;
                count += 1;
            }

            tx.execute(
                "UPDATE offline_dictionaries SET entry_count = ?1 WHERE id = ?2",
                params![count, en_id],
            )?;
        }

        // 2. Built-in Japanese-English (JMdict Core)
        if !has_ja {
            tx.execute(
                "INSERT INTO offline_dictionaries (name, lang_src, lang_target, format, entry_count, is_enabled)
                 VALUES ('Built-in Japanese-English (JMdict Core)', 'ja', 'en', 'builtin', 0, 1)",
                [],
            )?;
            let ja_id = tx.last_insert_rowid();

            let mut count = 0i64;
            for (word, reading, romaji, pos, def, jlpt) in get_builtin_japanese_lexicon() {
                let meanings = vec![DictionaryMeaning {
                    part_of_speech: pos.to_string(),
                    definitions: vec![DictionaryDefinition {
                        definition: def.to_string(),
                        example: None,
                        synonyms: Vec::new(),
                        antonyms: Vec::new(),
                    }],
                }];
                let json = serde_json::to_string(&meanings).unwrap_or_default();
                let full_reading = format!("{} ({})", reading, romaji);
                tx.execute(
                    "INSERT INTO dictionary_entries (dictionary_id, word, clean_word, reading, definitions_json, jlpt_level, source)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'builtin')",
                    params![ja_id, word, word.to_lowercase(), full_reading, json, jlpt],
                )?;
                count += 1;
            }

            tx.execute(
                "UPDATE offline_dictionaries SET entry_count = ?1 WHERE id = ?2",
                params![count, ja_id],
            )?;
        }

        tx.commit()?;

        Ok(())
    }

    fn dict_from_row(row: &Row) -> rusqlite::Result<OfflineDictionaryInfo> {
        let is_enabled_num: i32 = row.get(7)?;
        Ok(OfflineDictionaryInfo {
            id: row.get(0)?,
            name: row.get(1)?,
            lang_src: row.get(2)?,
            lang_target: row.get(3)?,
            format: row.get(4)?,
            file_path: row.get(5)?,
            entry_count: row.get(6)?,
            is_enabled: is_enabled_num != 0,
            created_at: row.get(8)?,
        })
    }
}

fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{3040}'..='\u{309F}' | // Hiragana
        '\u{30A0}'..='\u{30FF}' | // Katakana
        '\u{4E00}'..='\u{9FFF}' | // CJK Unified Ideographs (Kanji)
        '\u{3400}'..='\u{4DBF}'   // CJK Extension A
    )
}

/// Rich starter English lexicon for completely offline lookups
fn get_builtin_english_lexicon() -> &'static [(&'static str, &'static str, &'static str, &'static str, &'static str)] {
    &[
        ("serendipity", "ˌsɛr.ənˈdɪp.ɪ.ti", "noun", "The occurrence and development of events by chance in a happy or beneficial way.", "A fortunate stroke of serendipity brought the two lovers together."),
        ("ephemeral", "ɪˈfɛm.ər.əl", "adjective", "Lasting for a very short time; fleeting or transient.", "Fashions are ephemeral, but true style is timeless."),
        ("melancholy", "ˈmɛl.ən.kɒl.i", "noun", "A feeling of pensive sadness, typically with no obvious cause.", "A gentle melancholy drifted over the quiet garden."),
        ("resilience", "rɪˈzɪl.jəns", "noun", "The capacity to recover quickly from difficulties; toughness.", "The community showed remarkable resilience after the storm."),
        ("petrichor", "ˈpɛt.rɪ.kɔːr", "noun", "A pleasant smell that frequently accompanies the first rain after a long period of warm, dry weather.", "The earthy scent of petrichor filled the summer air."),
        ("solitude", "ˈsɒl.ɪ.tjuːd", "noun", "The state or situation of being alone, especially when peaceful and pleasant.", "He found peace and clarity in the deep solitude of the mountains."),
        ("luminous", "ˈluː.mɪ.nəs", "adjective", "Full of or shedding light; bright or shining, especially in the dark.", "The luminous stars mirrored across the glassy lake."),
        ("effervescent", "ˌɛf.əˈvɛs.ənt", "adjective", "Vivacious and enthusiastic; bubbly.", "Her effervescent personality lit up the entire room."),
        ("ineffable", "ɪnˈɛf.ə.bəl", "adjective", "Too great or extreme to be expressed or described in words.", "The vista at the mountain peak filled them with ineffable awe."),
        ("nostalgia", "nɒˈstæl.dʒə", "noun", "A sentimental longing or wistful affection for the past.", "The old melody stirred up sweet memories of childhood nostalgia."),
        ("book", "bʊk", "noun", "A written or printed work consisting of pages bound together.", "She curled up in the corner with a favorite book."),
        ("read", "riːd", "verb", "Look at and comprehend the meaning of written or printed matter.", "He loves to read historical fiction before sleeping."),
        ("novel", "ˈnɒv.əl", "noun", "A fictitious prose narrative of book length.", "The author released a spellbinding fantasy novel."),
        ("story", "ˈstɔː.ri", "noun", "An account of imaginary or real people and events told for entertainment.", "The grandfather shared a bedtime story with the children."),
        ("chapter", "ˈtʃæp.tər", "noun", "A main division of a book, typically with a number or title.", "She promised to read just one more chapter."),
        ("author", "ˈɔː.θər", "noun", "A writer of a book, article, or document.", "The author signed copies for eager readers at the bookstore."),
        ("library", "ˈlaɪ.brər.i", "noun", "A building or room containing collections of books and periodicals for reading or borrowing.", "The quiet hall of the library was his favorite sanctuary."),
        ("shelves", "ʃɛlvz", "noun", "Flat horizontal lengths of wood or metal fixed to a wall or frame, used to display books.", "The sturdy wooden shelves were filled to the brim."),
        ("manga", "ˈmæŋ.ɡə", "noun", "A style of Japanese comic books and graphic novels, typically aimed at adults as well as children.", "He spent the weekend reading a bestselling manga series."),
        ("comic", "ˈkɒm.ɪk", "noun", "A periodical containing sequential art stories with speech bubbles.", "Classic superhero comics were stacked beside the bed."),
        ("adventure", "ədˈvɛn.tʃər", "noun", "An unusual and exciting, typically hazardous, experience or activity.", "They embarked on an epic adventure into uncharted territory."),
        ("magic", "ˈmædʒ.ɪk", "noun", "The power of apparently influencing events by using mysterious or supernatural forces.", "The wizard cast ancient magic to shield the castle."),
        ("journey", "ˈdʒɜː.ni", "noun", "An act of traveling from one place to another.", "Their journey led them through snowy mountain passes."),
        ("whisper", "ˈwɪs.pər", "verb", "Speak very softly using one's breath rather than the throat.", "She leaned in to whisper a long-guarded secret."),
        ("courage", "ˈkʌr.ɪdʒ", "noun", "The ability to do something that frightens one; bravery.", "It takes immense courage to stand up for the truth."),
        ("shadow", "ˈʃæd.əʊ", "noun", "A dark area or shape produced by a body coming between rays of light and a surface.", "Long shadows stretched across the cobblestone lane."),
        ("radiant", "ˈreɪ.di.ənt", "adjective", "Shining or glowing brightly; emanating joy and love.", "Her radiant smile greeted everyone at the door."),
        ("harmony", "ˈhɑː.mə.ni", "noun", "The combination of simultaneously sounded musical notes; agreement or concord.", "The travelers lived in harmony with the natural world."),
        ("wanderlust", "ˈwɒn.də.lʌst", "noun", "A strong desire to travel and explore the world.", "A sudden wave of wanderlust urged her to pack a bag and leave."),
        ("eloquent", "ˈɛl.ə.kwənt", "adjective", "Fluent or persuasive in speaking or writing.", "He gave an eloquent speech that moved the audience to tears."),
        ("zenith", "ˈzɛn.ɪθ", "noun", "The time at which something is most powerful or successful; peak.", "Her literary career reached its zenith with the international bestseller."),
        ("abyss", "əˈbɪs", "noun", "A deep or seemingly bottomless chasm.", "They stared down into the misty abyss below the cliff."),
        ("epiphany", "ɪˈpɪf.ən.i", "noun", "A moment of sudden and profound understanding or revelation.", "While walking through the woods, she had an epiphany about the problem."),
        ("quintessential", "ˌkwɪn.tɪˈsɛn.ʃəl", "adjective", "Representing the most perfect or typical example of a quality or class.", "A cozy fireplace and hot cocoa made for the quintessential winter night."),
        ("clandestine", "klænˈdɛs.tɪn", "adjective", "Kept secret or done secretively, especially because illicit.", "The characters held a clandestine meeting under the moonlight."),
        ("enigma", "ɪˈnɪɡ.mə", "noun", "A person or thing that is mysterious, puzzling, or difficult to understand.", "The detective found the strange traveler to be a total enigma."),
        ("labyrinth", "ˈlæb.ə.rɪnθ", "noun", "A complicated irregular network of passages or paths; a maze.", "The ancient fortress contained a labyrinth of underground corridors."),
        ("serene", "sɪˈriːn", "adjective", "Calm, peaceful, and untroubled; tranquil.", "The serene waters of the lake reflected the dawn sky."),
        ("sanctuary", "ˈsæŋk.tʃu.ər.i", "noun", "A place of safety or refuge; a nature reserve.", "The reading nook served as her quiet personal sanctuary."),
        ("lucid", "ˈluː.sɪd", "adjective", "Expressed clearly; easy to understand; bright or luminous.", "His writing style was remarkably lucid and captivating."),
    ]
}

/// Rich starter Japanese-English lexicon (Kanji, Hiragana, Romaji, POS, Def, JLPT)
fn get_builtin_japanese_lexicon() -> &'static [(&'static str, &'static str, &'static str, &'static str, &'static str, Option<u8>)] {
    &[
        ("読書", "どくしょ", "dokusho", "noun", "Reading books; reading literature.", Some(3)),
        ("本", "ほん", "hon", "noun", "Book; volume; script.", Some(5)),
        ("図書館", "としょかん", "toshokan", "noun", "Library (facility).", Some(5)),
        ("魔法", "まほう", "mahou", "noun", "Magic; witchcraft; sorcery.", Some(3)),
        ("冒険", "ぼうけん", "bouken", "noun", "Adventure; venture; quest.", Some(3)),
        ("勇者", "ゆうしゃ", "yuusha", "noun", "Hero; brave person; warrior.", Some(2)),
        ("世界", "せかい", "sekai", "noun", "The world; universe; society.", Some(4)),
        ("猫", "ねこ", "neko", "noun", "Cat; feline.", Some(5)),
        ("犬", "いぬ", "inu", "noun", "Dog; canine.", Some(5)),
        ("時間", "じかん", "jikan", "noun", "Time; hours; period.", Some(5)),
        ("心", "こころ", "kokoro", "noun", "Heart; mind; spirit; core.", Some(4)),
        ("友達", "ともだち", "tomodachi", "noun", "Friend; companion.", Some(5)),
        ("食べる", "たべる", "taberu", "verb", "To eat; to consume.", Some(5)),
        ("飲む", "のむ", "nomu", "verb", "To drink; to swallow.", Some(5)),
        ("見る", "みる", "miru", "verb", "To see; to look; to watch.", Some(5)),
        ("聞く", "きく", "kiku", "verb", "To hear; to listen; to ask.", Some(5)),
        ("行く", "いく", "iku", "verb", "To go; to proceed.", Some(5)),
        ("来る", "くる", "kuru", "verb", "To come; to arrive.", Some(5)),
        ("愛", "あい", "ai", "noun", "Love; affection.", Some(3)),
        ("桜", "さくら", "sakura", "noun", "Cherry blossom; cherry tree.", Some(3)),
        ("命", "いのち", "inochi", "noun", "Life; life force; destiny.", Some(3)),
        ("記憶", "きおく", "kioku", "noun", "Memory; recollection; remembrance.", Some(3)),
        ("物語", "ものがたり", "monogatari", "noun", "Story; tale; legend; narrative.", Some(3)),
        ("未来", "みらい", "mirai", "noun", "Future (distant/conceptual).", Some(3)),
        ("過去", "かこ", "kako", "noun", "The past; bygones.", Some(3)),
        ("夢", "ゆめ", "yume", "noun", "Dream; vision; aspiration.", Some(4)),
        ("希望", "きぼう", "kibou", "noun", "Hope; wish; aspiration.", Some(3)),
        ("光", "ひかり", "hikari", "noun", "Light; illumination; ray.", Some(4)),
        ("影", "かげ", "kage", "noun", "Shadow; silhouette; shade.", Some(3)),
        ("旅", "たび", "tabi", "noun", "Journey; travel; trip.", Some(4)),
        ("夜", "よる", "yoru", "noun", "Night; evening.", Some(5)),
        ("朝", "あさ", "asa", "noun", "Morning.", Some(5)),
        ("星", "ほし", "hoshi", "noun", "Star; celestial body.", Some(4)),
        ("月", "つき", "tsuki", "noun", "Moon; month.", Some(5)),
        ("太陽", "たいよう", "taiyou", "noun", "Sun; solar body.", Some(4)),
        ("空", "そら", "sora", "noun", "Sky; heavens.", Some(5)),
        ("海", "うみ", "umi", "noun", "Sea; ocean; beach.", Some(5)),
        ("山", "やま", "yama", "noun", "Mountain; hill.", Some(5)),
        ("川", "かわ", "kawa", "noun", "River; stream.", Some(5)),
        ("花", "はな", "hana", "noun", "Flower; blossom.", Some(5)),
        ("雨", "あめ", "ame", "noun", "Rain; rainfall.", Some(5)),
        ("雪", "ゆき", "yuki", "noun", "Snow.", Some(5)),
        ("風", "かぜ", "kaze", "noun", "Wind; breeze.", Some(5)),
        ("静か", "しずか", "shizuka", "adjective", "Quiet; peaceful; calm.", Some(5)),
        ("美しい", "うつくしい", "utsukushii", "adjective", "Beautiful; lovely; graceful.", Some(3)),
        ("面白い", "おもしろい", "omoshiroi", "adjective", "Interesting; amusing; entertaining.", Some(5)),
        ("強い", "つよい", "tsuyoi", "adjective", "Strong; powerful; potent.", Some(5)),
        ("優しい", "やさしい", "yasashii", "adjective", "Gentle; kind; affectionate.", Some(4)),
        ("剣", "つるぎ / けん", "tsurugi / ken", "noun", "Sword; blade.", Some(2)),
        ("城", "しろ", "shiro", "noun", "Castle; fortress.", Some(3)),
    ]
}
