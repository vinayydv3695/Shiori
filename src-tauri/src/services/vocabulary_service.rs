use crate::error::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VocabularyWord {
    pub id: i64,
    pub book_id: Option<i64>,
    pub word: String,
    pub clean_word: String,
    pub reading: Option<String>,
    pub definition: String,
    pub sentence_context: Option<String>,
    pub chapter_title: Option<String>,
    pub tags: String,
    pub reps: i32,
    pub interval_days: f64,
    pub ease_factor: f64,
    pub due_date: String,
    pub created_at: String,
    pub last_reviewed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VocabularyStats {
    pub total_cards: usize,
    pub due_today: usize,
    pub learned: usize,
    pub new_today: usize,
}

pub struct VocabularyService;

impl VocabularyService {
    pub fn add_or_update_word(
        conn: &Connection,
        book_id: Option<i64>,
        word: &str,
        clean_word: &str,
        reading: Option<&str>,
        definition: &str,
        sentence_context: Option<&str>,
        chapter_title: Option<&str>,
    ) -> Result<VocabularyWord> {
        let clean = if clean_word.trim().is_empty() {
            word.trim().to_lowercase()
        } else {
            clean_word.trim().to_lowercase()
        };

        // If word already exists in deck, update context/definition if not yet learned
        let existing: Option<(i64, i32, f64, f64, String, String)> = conn
            .query_row(
                "SELECT id, reps, interval_days, ease_factor, due_date, created_at
                 FROM vocabulary_deck WHERE clean_word = ?1",
                params![clean],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .optional()?;

        let now = chrono::Utc::now().to_rfc3339();

        if let Some((id, reps, interval_days, ease_factor, due_date, created_at)) = existing {
            // Update definition and context if provided
            conn.execute(
                "UPDATE vocabulary_deck
                 SET definition = ?1, sentence_context = COALESCE(?2, sentence_context),
                     reading = COALESCE(?3, reading), chapter_title = COALESCE(?4, chapter_title),
                     book_id = COALESCE(?5, book_id)
                 WHERE id = ?6",
                params![definition, sentence_context, reading, chapter_title, book_id, id],
            )?;

            Ok(VocabularyWord {
                id,
                book_id,
                word: word.to_string(),
                clean_word: clean,
                reading: reading.map(|s| s.to_string()),
                definition: definition.to_string(),
                sentence_context: sentence_context.map(|s| s.to_string()),
                chapter_title: chapter_title.map(|s| s.to_string()),
                tags: "reader".to_string(),
                reps,
                interval_days,
                ease_factor,
                due_date,
                created_at,
                last_reviewed: None,
            })
        } else {
            conn.execute(
                "INSERT INTO vocabulary_deck (book_id, word, clean_word, reading, definition, sentence_context, chapter_title)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![book_id, word, clean, reading, definition, sentence_context, chapter_title],
            )?;
            let id = conn.last_insert_rowid();

            Ok(VocabularyWord {
                id,
                book_id,
                word: word.to_string(),
                clean_word: clean,
                reading: reading.map(|s| s.to_string()),
                definition: definition.to_string(),
                sentence_context: sentence_context.map(|s| s.to_string()),
                chapter_title: chapter_title.map(|s| s.to_string()),
                tags: "reader".to_string(),
                reps: 0,
                interval_days: 0.0,
                ease_factor: 2.5,
                due_date: now.clone(),
                created_at: now,
                last_reviewed: None,
            })
        }
    }

    pub fn get_words(
        conn: &Connection,
        book_id: Option<i64>,
        due_only: bool,
    ) -> Result<Vec<VocabularyWord>> {
        let now = chrono::Utc::now().to_rfc3339();

        let (sql, params_vec): (String, Vec<Box<dyn rusqlite::ToSql>>) = match (book_id, due_only) {
            (Some(bid), true) => (
                "SELECT id, book_id, word, clean_word, reading, definition, sentence_context, chapter_title, tags, reps, interval_days, ease_factor, due_date, created_at, last_reviewed
                 FROM vocabulary_deck WHERE book_id = ?1 AND due_date <= ?2 ORDER BY due_date ASC".to_string(),
                vec![Box::new(bid), Box::new(now)],
            ),
            (Some(bid), false) => (
                "SELECT id, book_id, word, clean_word, reading, definition, sentence_context, chapter_title, tags, reps, interval_days, ease_factor, due_date, created_at, last_reviewed
                 FROM vocabulary_deck WHERE book_id = ?1 ORDER BY created_at DESC".to_string(),
                vec![Box::new(bid)],
            ),
            (None, true) => (
                "SELECT id, book_id, word, clean_word, reading, definition, sentence_context, chapter_title, tags, reps, interval_days, ease_factor, due_date, created_at, last_reviewed
                 FROM vocabulary_deck WHERE due_date <= ?1 ORDER BY due_date ASC".to_string(),
                vec![Box::new(now)],
            ),
            (None, false) => (
                "SELECT id, book_id, word, clean_word, reading, definition, sentence_context, chapter_title, tags, reps, interval_days, ease_factor, due_date, created_at, last_reviewed
                 FROM vocabulary_deck ORDER BY created_at DESC".to_string(),
                vec![],
            ),
        };

        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

        let words = stmt
            .query_map(&param_refs[..], |row| {
                Ok(VocabularyWord {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    word: row.get(2)?,
                    clean_word: row.get(3)?,
                    reading: row.get(4)?,
                    definition: row.get(5)?,
                    sentence_context: row.get(6)?,
                    chapter_title: row.get(7)?,
                    tags: row.get(8)?,
                    reps: row.get(9)?,
                    interval_days: row.get(10)?,
                    ease_factor: row.get(11)?,
                    due_date: row.get(12)?,
                    created_at: row.get(13)?,
                    last_reviewed: row.get(14)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(words)
    }

    /// SuperMemo-2 (SM-2) Spaced Repetition Grading:
    /// Grade: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
    pub fn review_word(conn: &Connection, card_id: i64, grade: u8) -> Result<VocabularyWord> {
        let (mut reps, mut interval_days, mut ease_factor): (i32, f64, f64) = conn.query_row(
            "SELECT reps, interval_days, ease_factor FROM vocabulary_deck WHERE id = ?1",
            params![card_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;

        let now = chrono::Utc::now();

        match grade {
            1 => {
                // Again: Reset
                reps = 0;
                interval_days = 0.05; // ~1 hour
            }
            2 => {
                // Hard
                reps += 1;
                interval_days = if interval_days <= 1.0 { 1.2 } else { interval_days * 1.2 };
                ease_factor = (ease_factor - 0.15).max(1.3);
            }
            3 => {
                // Good
                reps += 1;
                interval_days = match reps {
                    1 => 1.0,
                    2 => 3.0,
                    _ => (interval_days * ease_factor).max(interval_days + 1.0),
                };
            }
            4 => {
                // Easy
                reps += 1;
                interval_days = match reps {
                    1 => 4.0,
                    2 => 7.0,
                    _ => (interval_days * ease_factor * 1.3).max(interval_days + 2.0),
                };
                ease_factor = (ease_factor + 0.15).min(3.0);
            }
            _ => {}
        }

        let due_duration = chrono::Duration::milliseconds((interval_days * 86400.0 * 1000.0) as i64);
        let due_date = (now + due_duration).to_rfc3339();
        let now_str = now.to_rfc3339();

        conn.execute(
            "UPDATE vocabulary_deck
             SET reps = ?1, interval_days = ?2, ease_factor = ?3, due_date = ?4, last_reviewed = ?5
             WHERE id = ?6",
            params![reps, interval_days, ease_factor, due_date, now_str, card_id],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, book_id, word, clean_word, reading, definition, sentence_context, chapter_title, tags, reps, interval_days, ease_factor, due_date, created_at, last_reviewed
             FROM vocabulary_deck WHERE id = ?1",
        )?;

        let word = stmt.query_row(params![card_id], |row| {
            Ok(VocabularyWord {
                id: row.get(0)?,
                book_id: row.get(1)?,
                word: row.get(2)?,
                clean_word: row.get(3)?,
                reading: row.get(4)?,
                definition: row.get(5)?,
                sentence_context: row.get(6)?,
                chapter_title: row.get(7)?,
                tags: row.get(8)?,
                reps: row.get(9)?,
                interval_days: row.get(10)?,
                ease_factor: row.get(11)?,
                due_date: row.get(12)?,
                created_at: row.get(13)?,
                last_reviewed: row.get(14)?,
            })
        })?;

        Ok(word)
    }

    pub fn delete_word(conn: &Connection, card_id: i64) -> Result<()> {
        conn.execute("DELETE FROM vocabulary_deck WHERE id = ?1", params![card_id])?;
        Ok(())
    }

    pub fn get_stats(conn: &Connection, book_id: Option<i64>) -> Result<VocabularyStats> {
        let now = chrono::Utc::now().to_rfc3339();

        let (total, due, learned): (usize, usize, usize) = match book_id {
            Some(bid) => {
                let total = conn.query_row(
                    "SELECT COUNT(*) FROM vocabulary_deck WHERE book_id = ?1",
                    params![bid],
                    |r| r.get(0),
                ).unwrap_or(0);
                let due = conn.query_row(
                    "SELECT COUNT(*) FROM vocabulary_deck WHERE book_id = ?1 AND due_date <= ?2",
                    params![bid, now],
                    |r| r.get(0),
                ).unwrap_or(0);
                let learned = conn.query_row(
                    "SELECT COUNT(*) FROM vocabulary_deck WHERE book_id = ?1 AND reps >= 3",
                    params![bid],
                    |r| r.get(0),
                ).unwrap_or(0);
                (total, due, learned)
            }
            None => {
                let total = conn.query_row(
                    "SELECT COUNT(*) FROM vocabulary_deck",
                    [],
                    |r| r.get(0),
                ).unwrap_or(0);
                let due = conn.query_row(
                    "SELECT COUNT(*) FROM vocabulary_deck WHERE due_date <= ?1",
                    params![now],
                    |r| r.get(0),
                ).unwrap_or(0);
                let learned = conn.query_row(
                    "SELECT COUNT(*) FROM vocabulary_deck WHERE reps >= 3",
                    [],
                    |r| r.get(0),
                ).unwrap_or(0);
                (total, due, learned)
            }
        };

        Ok(VocabularyStats {
            total_cards: total,
            due_today: due,
            learned,
            new_today: total.saturating_sub(learned),
        })
    }

    /// Export deck to Anki TSV format:
    /// Front (Word [Reading]) \t Back (Definition + Sentence Context) \t Tags
    pub fn export_anki_tsv(conn: &Connection, book_id: Option<i64>) -> Result<String> {
        let words = Self::get_words(conn, book_id, false)?;
        let mut tsv = String::from("#separator:tab\n#html:true\n#tags column:3\n");

        for w in words {
            let front = match &w.reading {
                Some(r) if !r.is_empty() => format!("<b>{}</b> [{}]", w.word, r),
                _ => format!("<b>{}</b>", w.word),
            };

            let mut back = format!("<div class='def'>{}</div>", w.definition.replace('\n', "<br>"));
            if let Some(ctx) = &w.sentence_context {
                if !ctx.trim().is_empty() {
                    back.push_str(&format!("<hr><blockquote class='context'>{}</blockquote>", ctx));
                }
            }

            let tags = format!("shiori-reader {}", w.chapter_title.as_deref().unwrap_or(""));
            tsv.push_str(&format!("{}\t{}\t{}\n", front, back, tags.trim()));
        }

        Ok(tsv)
    }
}
