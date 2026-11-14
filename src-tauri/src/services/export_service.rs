use crate::db::Database;
use crate::error::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataImportReport {
    pub fingerprint: String,
    pub total: usize,
    pub matched: usize,
    pub unmatched: usize,
    pub would_update: usize,
    pub updated: usize,
    pub unchanged: usize,
}

fn metadata_input(path: &str) -> Result<(Vec<ExportedBook>, String)> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let invalid = |message: &str| crate::error::ShioriError::InvalidOperation(message.into());
    // Reject special files before open, since opening a FIFO can block.
    if !std::fs::metadata(path)?.is_file() {
        return Err(invalid("Metadata input must be a regular file"));
    }
    let file = File::open(path)?;
    if !file.metadata()?.is_file() {
        return Err(invalid("Metadata input must be a regular file"));
    }
    let mut bytes = Vec::new();
    file.take(32 * 1024 * 1024 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err(invalid("Metadata input exceeds 32 MiB"));
    }
    let books: Vec<ExportedBook> = serde_json::from_slice(&bytes)?;
    if books.len() > 100_000 {
        return Err(invalid("Metadata input exceeds 100000 records"));
    }
    let mut paths = std::collections::HashSet::new();
    for book in &books {
        if !paths.insert(&book.file_path) {
            return Err(invalid("Duplicate metadata file_path"));
        }
        let strings = [
            &book.title,
            &book.authors,
            &book.file_format,
            &book.file_path,
            &book.language,
            &book.tags,
            &book.added_date,
        ];
        if strings.iter().any(|s| s.len() > 16 * 1024)
            || [
                &book.isbn,
                &book.publisher,
                &book.pubdate,
                &book.series,
                &book.shelves,
            ]
            .iter()
            .any(|s| s.as_ref().is_some_and(|s| s.len() > 16 * 1024))
        {
            return Err(invalid("Metadata string exceeds 16 KiB"));
        }
        if [book.series_index, book.rating, book.reading_progress]
            .iter()
            .flatten()
            .any(|n| !n.is_finite())
            || book.rating.is_some_and(|n| !(0.0..=10.0).contains(&n))
        {
            return Err(invalid("Invalid metadata number or rating"));
        }
    }
    Ok((books, format!("{:x}", Sha256::digest(&bytes))))
}

pub fn import_library_metadata(
    db: &Database,
    file_path: &str,
    expected_fingerprint: Option<&str>,
) -> Result<MetadataImportReport> {
    let (books, fingerprint) = metadata_input(file_path)?;
    if expected_fingerprint.is_some_and(|expected| expected != fingerprint) {
        return Err(crate::error::ShioriError::InvalidOperation(
            "Metadata file changed since preview".into(),
        ));
    }
    let apply = expected_fingerprint.is_some();
    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;
    let mut report = MetadataImportReport {
        fingerprint,
        total: books.len(),
        ..Default::default()
    };
    {
        let mut lookup = tx.prepare("SELECT isbn,publisher,pubdate,series,series_index,rating,language FROM books WHERE file_path=?1")?;
        let mut update = tx.prepare("UPDATE books SET isbn=?2,publisher=?3,pubdate=?4,series=?5,series_index=?6,rating=?7,language=?8 WHERE file_path=?1")?;
        for book in books {
            let mut rows = lookup.query([&book.file_path])?;
            let Some(row) = rows.next()? else {
                report.unmatched += 1;
                continue;
            };
            report.matched += 1;
            let mut changed = false;
            let mut text = Vec::new();
            for (index, incoming) in [
                (0, book.isbn),
                (1, book.publisher),
                (2, book.pubdate),
                (3, book.series),
                (6, Some(book.language)),
            ] {
                let old: Option<String> = row.get(index)?;
                let value = if old.as_ref().map_or(true, |s| s.is_empty()) {
                    match incoming.filter(|s| !s.is_empty()) {
                        Some(value) => {
                            changed = true;
                            Some(value)
                        }
                        None => old,
                    }
                } else {
                    old
                };
                text.push(value);
            }
            let old_series: Option<f64> = row.get(4)?;
            let old_rating: Option<f64> = row.get(5)?;
            changed |= old_series.is_none() && book.series_index.is_some();
            changed |= old_rating.is_none() && book.rating.is_some();
            if changed {
                report.would_update += 1;
                if apply {
                    update.execute(params![
                        book.file_path,
                        text[0],
                        text[1],
                        text[2],
                        text[3],
                        old_series.or(book.series_index),
                        old_rating.or(book.rating),
                        text[4]
                    ])?;
                    report.updated += 1;
                }
            } else {
                report.unchanged += 1;
            }
        }
    }
    if apply {
        tx.commit()?;
    }
    Ok(report)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: ExportFormat,
    pub include_metadata: bool,
    pub include_shelves: bool,
    pub include_reading_progress: bool,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
    Markdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedBook {
    pub title: String,
    pub authors: String,
    pub isbn: Option<String>,
    pub publisher: Option<String>,
    pub pubdate: Option<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub rating: Option<f64>,
    pub file_format: String,
    pub file_path: String,
    pub language: String,
    pub tags: String,
    pub added_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shelves: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reading_progress: Option<f64>,
}

pub fn export_library(db: &Database, options: ExportOptions) -> Result<String> {
    let conn = db.get_connection()?;

    // Build query based on options
    let query = String::from(
        "SELECT b.title, b.isbn, b.publisher, b.pubdate, b.series, b.series_index, 
                b.rating, b.file_format, b.file_path, b.language, b.added_date, b.id
         FROM books b",
    );

    let mut stmt = conn.prepare(&query)?;
    let books_iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,         // title
            row.get::<_, Option<String>>(1)?, // isbn
            row.get::<_, Option<String>>(2)?, // publisher
            row.get::<_, Option<String>>(3)?, // pubdate
            row.get::<_, Option<String>>(4)?, // series
            row.get::<_, Option<f64>>(5)?,    // series_index
            row.get::<_, Option<f64>>(6)?,    // rating
            row.get::<_, String>(7)?,         // file_format
            row.get::<_, String>(8)?,         // file_path
            row.get::<_, String>(9)?,         // language
            row.get::<_, String>(10)?,        // added_date
            row.get::<_, i64>(11)?,           // id
        ))
    })?;

    let mut exported_books = Vec::new();

    for book_result in books_iter {
        let (
            title,
            isbn,
            publisher,
            pubdate,
            series,
            series_index,
            rating,
            file_format,
            file_path,
            language,
            added_date,
            book_id,
        ) = book_result?;

        // Get authors
        let authors = get_authors_string(&conn, book_id)?;

        // Get tags
        let tags = get_tags_string(&conn, book_id)?;

        // Get shelves if requested
        let shelves = if options.include_shelves {
            Some(get_shelves_string(&conn, book_id)?)
        } else {
            None
        };

        // Get reading progress if requested
        let reading_progress = if options.include_reading_progress {
            get_reading_progress(&conn, book_id)?
        } else {
            None
        };

        exported_books.push(ExportedBook {
            title,
            authors,
            isbn,
            publisher,
            pubdate,
            series,
            series_index,
            rating,
            file_format,
            file_path,
            language,
            tags,
            added_date,
            shelves,
            reading_progress,
        });
    }

    // Export based on format
    match options.format {
        ExportFormat::Csv => export_as_csv(&exported_books, &options.file_path)?,
        ExportFormat::Json => export_as_json(&exported_books, &options.file_path)?,
        ExportFormat::Markdown => export_as_markdown(&exported_books, &options.file_path)?,
    }

    Ok(options.file_path)
}

fn get_authors_string(conn: &rusqlite::Connection, book_id: i64) -> Result<String> {
    let mut stmt = conn.prepare(
        "SELECT a.name FROM authors a 
         JOIN books_authors ba ON a.id = ba.author_id 
         WHERE ba.book_id = ?1
         ORDER BY ba.author_id",
    )?;

    let authors: Vec<String> = stmt
        .query_map(params![book_id], |row| row.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(authors.join(", "))
}

fn get_tags_string(conn: &rusqlite::Connection, book_id: i64) -> Result<String> {
    let mut stmt = conn.prepare(
        "SELECT t.name FROM tags t 
         JOIN books_tags bt ON t.id = bt.tag_id 
         WHERE bt.book_id = ?1
         ORDER BY t.name",
    )?;

    let tags: Vec<String> = stmt
        .query_map(params![book_id], |row| row.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(tags.join(", "))
}

fn get_shelves_string(conn: &rusqlite::Connection, book_id: i64) -> Result<String> {
    let mut stmt = conn.prepare(
        "SELECT c.name FROM shelves c 
         JOIN shelf_books cb ON c.id = cb.shelf_id 
         WHERE cb.book_id = ?1
         ORDER BY c.name",
    )?;

    let shelves: Vec<String> = stmt
        .query_map(params![book_id], |row| row.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(shelves.join(", "))
}

fn get_reading_progress(conn: &rusqlite::Connection, book_id: i64) -> Result<Option<f64>> {
    match conn.query_row(
        "SELECT progress_percent FROM reading_progress WHERE book_id = ?1 ORDER BY last_read DESC LIMIT 1",
        params![book_id],
        |row| row.get(0),
    ) {
        Ok(progress) => Ok(Some(progress)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn export_as_csv(books: &[ExportedBook], file_path: &str) -> Result<()> {
    let mut wtr = csv::Writer::from_path(file_path)?;

    // Write headers
    wtr.write_record(&[
        "Title",
        "Authors",
        "ISBN",
        "Publisher",
        "Published Date",
        "Series",
        "Series Index",
        "Rating",
        "Format",
        "File Path",
        "Language",
        "Tags",
        "Added Date",
        "Shelfs",
        "Reading Progress",
    ])?;

    // Write books
    for book in books {
        wtr.write_record(&[
            &book.title,
            &book.authors,
            book.isbn.as_deref().unwrap_or(""),
            book.publisher.as_deref().unwrap_or(""),
            book.pubdate.as_deref().unwrap_or(""),
            book.series.as_deref().unwrap_or(""),
            &book.series_index.map(|v| v.to_string()).unwrap_or_default(),
            &book.rating.map(|v| v.to_string()).unwrap_or_default(),
            &book.file_format,
            &book.file_path,
            &book.language,
            &book.tags,
            &book.added_date,
            book.shelves.as_deref().unwrap_or(""),
            &book
                .reading_progress
                .map(|v| format!("{:.1}%", v))
                .unwrap_or_default(),
        ])?;
    }

    wtr.flush()?;
    Ok(())
}

fn export_as_json(books: &[ExportedBook], file_path: &str) -> Result<()> {
    let json = serde_json::to_string_pretty(books)?;
    let mut file = File::create(file_path)?;
    file.write_all(json.as_bytes())?;
    Ok(())
}

fn export_as_markdown(books: &[ExportedBook], file_path: &str) -> Result<()> {
    let mut content = String::from("# Library Export\n\n");
    content.push_str(&format!("Total Books: {}\n\n", books.len()));
    content.push_str("---\n\n");

    for book in books {
        content.push_str(&format!("## {}\n\n", book.title));
        content.push_str(&format!("**Authors:** {}\n\n", book.authors));

        if let Some(ref series) = book.series {
            content.push_str(&format!(
                "**Series:** {} #{}\n\n",
                series,
                book.series_index.map(|v| v.to_string()).unwrap_or_default()
            ));
        }

        if let Some(rating) = book.rating {
            content.push_str(&format!("**Rating:** {}/5\n\n", rating));
        }

        if let Some(ref publisher) = book.publisher {
            content.push_str(&format!("**Publisher:** {}\n\n", publisher));
        }

        if !book.tags.is_empty() {
            content.push_str(&format!("**Tags:** {}\n\n", book.tags));
        }

        content.push_str(&format!(
            "**Format:** {}\n\n",
            book.file_format.to_uppercase()
        ));
        content.push_str(&format!("**Language:** {}\n\n", book.language));
        content.push_str(&format!("**Added:** {}\n\n", book.added_date));

        if let Some(ref shelves) = book.shelves {
            if !shelves.is_empty() {
                content.push_str(&format!("**Shelfs:** {}\n\n", shelves));
            }
        }

        if let Some(progress) = book.reading_progress {
            content.push_str(&format!("**Reading Progress:** {:.1}%\n\n", progress));
        }

        content.push_str("---\n\n");
    }

    let mut file = File::create(file_path)?;
    file.write_all(content.as_bytes())?;
    Ok(())
}
