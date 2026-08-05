//! "Open with Shiori" managed ingestion (Slice 2).
//!
//! A book file opened from a file manager ("Open with → Shiori") is copied
//! into the managed library root (`app_data_dir/Library`, see
//! [`crate::services::library_root`]), indexed as a managed book
//! (`is_managed = 1, origin = 'open_with'`), and — because it is managed —
//! permanently deleting it later removes the file from the library root
//! instead of leaving a tombstone.
//!
//! The pipeline is platform-agnostic: it consumes a *local* readable file
//! (`source_path`) plus the original url/name for extension detection. The
//! Android content:// → local-file resolution happens in the command layer
//! (via the local android-saf plugin's `copy_document`); desktop passes the
//! filesystem path straight through.
//!
//! The pipeline is free of `AppHandle` — it takes `db`, `covers_dir` and
//! `app_data_dir` so it is unit-testable.

use std::path::Path;

use crate::db::Database;
use crate::error::{Result, ShioriError};
use crate::models::{Author, Book, IngestResult};
use crate::services::{library_root, library_service, metadata_service};
use crate::utils::file::{calculate_file_hash, get_file_size};
use rusqlite::params;
use uuid::Uuid;

/// Extensions the "open with" pipeline accepts. Everything else is reported
/// as `unsupported` (we validate in-app — the Android manifest MIME is not
/// trusted, it often arrives as `application/octet-stream` over content://).
pub const SUPPORTED_INGEST_EXTS: &[&str] = &["epub", "pdf", "cbz", "mobi", "azw3", "fb2"];

/// Domain assigned after import, by format. CBZ is a comic archive — it
/// lands in the comics tab (mirrors the "Comic (CBZ)" file association name).
fn domain_for_ext(ext: &str) -> &'static str {
    if ext == "cbz" {
        "comics"
    } else {
        "books"
    }
}

/// Derive a candidate file name from an "open with" url.
///
/// On Android the url is a `content://` URI. Some providers (FileProvider)
/// embed the real file name in the last path segment; others (MediaStore,
/// DownloadsProvider) only expose an opaque id — the name then has no
/// extension and the pipeline falls back to magic-byte sniffing.
pub fn candidate_name_from_url(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(segment) = parsed.path_segments().and_then(|mut segs| segs.next_back()) {
            if let Ok(decoded) = urlencoding::decode(segment) {
                if !decoded.is_empty() {
                    return decoded.into_owned();
                }
            }
        }
    }
    // Fall back to the raw last path segment of the plain string (desktop
    // paths, unparseable urls), then a generic placeholder.
    url.rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("book")
        .to_string()
}

/// Detect the format of an opened file.
///
/// 1. If the name carries an extension: it decides. A supported extension
///    wins; any *other* extension is `unsupported` (explicit — no sniffing).
/// 2. If the name has no extension (opaque content:// ids on Android): sniff
///    the first bytes.
pub fn detect_format(name: &str, first_bytes: &[u8]) -> Option<String> {
    match Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
    {
        Some(ext) if SUPPORTED_INGEST_EXTS.contains(&ext.as_str()) => Some(ext),
        Some(_) => None, // explicit non-book extension → unsupported
        None => sniff_book_format(first_bytes).map(String::from),
    }
}

/// Detect a book format from magic bytes (cheap prefix scan).
///
/// ZIP containers are disambiguated: an EPUB stores a `mimetype` entry
/// *first* (stored, uncompressed); a CBZ is a plain zip of images.
pub fn sniff_book_format(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(b"%PDF") {
        return Some("pdf");
    }
    if data.starts_with(b"PK\x03\x04") {
        return if first_zip_entry_is_mimetype(data) {
            Some("epub")
        } else {
            Some("cbz")
        };
    }
    if data.len() >= 68 && (&data[60..68] == b"BOOKMOBI" || &data[60..68] == b"TEXtREAd") {
        return Some("mobi");
    }
    // Raw \xe3\x8b\xb6 marker seen at offset 60 on some MOBI variants.
    if data.len() >= 63 && data[60] == 0xe3 && data[61] == 0x8b && data[62] == 0xb6 {
        return Some("mobi");
    }
    let head = if data.starts_with(b"\xEF\xBB\xBF") {
        &data[3..]
    } else {
        data
    };
    let head = &head[..head.len().min(512)];
    let lower = String::from_utf8_lossy(head).to_ascii_lowercase();
    if lower.contains("<fictionbook") {
        return Some("fb2");
    }
    None
}

/// Whether the first local file header of a ZIP archive is the EPUB
/// `mimetype` entry (which signals an EPUB container, not a CBZ).
fn first_zip_entry_is_mimetype(data: &[u8]) -> bool {
    // Local file header: 4-byte signature, ... name len @26 (u16 LE),
    // extra len @28 (u16 LE), file name @30.
    if data.len() < 30 {
        return false;
    }
    let name_len = u16::from_le_bytes([data[26], data[27]]) as usize;
    let extra_len = u16::from_le_bytes([data[28], data[29]]) as usize;
    let name_start = 30;
    let name_end = name_start + name_len;
    if name_end > data.len() {
        return false;
    }
    let _ = extra_len; // not needed for the decision
    &data[name_start..name_end] == b"mimetype"
}

/// Ingest one "open with" file into the managed library.
///
/// Returns an [`IngestResult`] — the pipeline *never* errors for
/// unsupported/duplicate/previously-deleted inputs; those are statuses. Hard
/// failures (io, database, metadata extraction) still surface as
/// [`ShioriError`] so the frontend can show a generic failure toast.
///
/// `cleanup_source` removes the temporary local copy (the Android
/// content:// staging file) after a successful import or a definitive
/// status; the managed dest file is removed on any error path so a failed
/// ingest never leaves an orphan in the library root.
pub fn ingest_opened_file(
    db: &Database,
    covers_dir: &Path,
    app_data_dir: &Path,
    url: &str,
    source_path: &Path,
    source_name: &str,
    cleanup_source: bool,
) -> Result<IngestResult> {
    // ── extension / format gate (in-app validation — never trust the MIME) ──
    let mut first_bytes = [0u8; 512];
    let bytes_read = std::fs::File::open(source_path)
        .and_then(|mut f| {
            use std::io::Read;
            f.read(&mut first_bytes)
        })
        .map_err(|e| {
            ShioriError::Io(std::io::Error::new(
                e.kind(),
                format!("failed to read opened file {}: {}", source_path.display(), e),
            ))
        })?;
    let Some(ext) = detect_format(source_name, &first_bytes[..bytes_read]) else {
        best_effort_cleanup(source_path, cleanup_source);
        return Ok(IngestResult {
            status: "unsupported".to_string(),
            path: url.to_string(),
            book_id: None,
            title: None,
        });
    };

    // ── hash + dedup/tombstone check (same semantics as slice 1) ──
    let file_hash = calculate_file_hash(source_path.to_string_lossy().as_ref())?;

    let conn = db.get_connection()?;
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM books WHERE (file_hash != '' AND file_hash = ?1) OR file_path = ?2)",
        params![file_hash, url],
        |row| row.get(0),
    )?;
    if exists {
        best_effort_cleanup(source_path, cleanup_source);
        return Ok(IngestResult {
            status: "duplicate".to_string(),
            path: url.to_string(),
            book_id: None,
            title: None,
        });
    }

    // A tombstone means this exact file was permanently deleted before —
    // surface it as `previously_deleted`; the frontend decides whether to
    // call clear_tombstone. Never auto-clear here.
    let tombstoned: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM deleted_books WHERE (file_hash != '' AND file_hash = ?1) OR file_path = ?2)",
        params![file_hash, url],
        |row| row.get(0),
    )?;
    if tombstoned {
        best_effort_cleanup(source_path, cleanup_source);
        return Ok(IngestResult {
            status: "previously_deleted".to_string(),
            path: url.to_string(),
            book_id: None,
            title: None,
        });
    }

    // ── copy into the managed library root as <uuid>.<ext> ──
    let root = library_root::resolve_library_root(db, app_data_dir)?;
    let book_uuid = Uuid::new_v4().to_string();
    let managed_relpath = format!("{}.{}", book_uuid, ext);
    let dest = root.join(&managed_relpath);

    std::fs::copy(source_path, &dest).map_err(|e| {
        ShioriError::Io(std::io::Error::new(
            e.kind(),
            format!(
                "failed to copy opened file into library root ({}): {}",
                dest.display(),
                e
            ),
        ))
    })?;

    // From here on, any failure must not leave an orphan managed file behind.
    // The closure returns (book_id, resolved_title) on success.
    let run = (|| -> Result<(i64, String)> {
        let dest_str = dest.to_string_lossy().to_string();

        // Metadata + cover extraction mirror import_single_book, but run on
        // the managed copy so extraction and file_path agree.
        let metadata = metadata_service::extract_from_file(&dest_str)?;
        let cover_path = metadata_service::extract_cover(&dest_str, &book_uuid, covers_dir)
            .ok()
            .flatten();
        let needs_online_cover = cover_path.is_none();
        let book_title = metadata
            .title
            .clone()
            .unwrap_or_else(|| "Unknown Title".to_string());
        let book_authors = metadata.authors.clone();
        let book_isbn = metadata.isbn.clone();
        let dest_size = get_file_size(&dest_str)?;

        let book = Book {
            id: None,
            uuid: book_uuid.clone(),
            title: book_title.clone(),
            sort_title: None,
            isbn: metadata.isbn,
            isbn13: None,
            publisher: metadata.publisher,
            pubdate: metadata.pubdate,
            series: metadata.series,
            series_index: metadata.series_index,
            rating: None,
            file_path: dest_str,
            file_format: ext.to_string(),
            file_size: Some(dest_size),
            file_hash: Some(file_hash),
            cover_path,
            page_count: metadata.page_count,
            word_count: None,
            language: metadata.language.unwrap_or_else(|| "eng".to_string()),
            added_date: chrono::Utc::now().to_rfc3339(),
            modified_date: chrono::Utc::now().to_rfc3339(),
            last_opened: None,
            notes: None,
            authors: metadata
                .authors
                .iter()
                .map(|name| Author {
                    id: None,
                    name: name.clone(),
                    sort_name: None,
                    link: None,
                })
                .collect(),
            tags: vec![],
            online_metadata_fetched: false,
            metadata_source: None,
            metadata_last_sync: None,
            anilist_id: None,
            is_favorite: false,
            is_wishlist: false,
            in_trash: false,
            deleted_at: None,
            reading_status: "planning".to_string(),
            domain: None,
            metadata_locked: None,
            // Managed book: Shiori owns the file inside the library root.
            is_managed: true,
            origin: Some("open_with".to_string()),
            managed_relpath: Some(managed_relpath.clone()),
        };

        let book_id = library_service::add_book(db, book)?;

        // Route into the right tab: books formats → Books, cbz → Comics.
        let conn = db.get_connection()?;
        conn.execute(
            "UPDATE books SET domain = ?1 WHERE id = ?2",
            params![domain_for_ext(&ext), book_id],
        )?;

        // No embedded cover → background online lookup, exactly like
        // import_single_book does after INSERT.
        if needs_online_cover {
            library_service::spawn_online_cover_lookup_for_book(
                db,
                covers_dir,
                book_id,
                &book_uuid,
                &book_title,
                &book_authors,
                book_isbn.as_deref(),
            );
        }

        Ok((book_id, book_title))
    })();

    let (book_id, title) = match run {
        Ok(ok) => ok,
        Err(ShioriError::DuplicateBook(_)) => {
            let _ = std::fs::remove_file(&dest);
            best_effort_cleanup(source_path, cleanup_source);
            return Ok(IngestResult {
                status: "duplicate".to_string(),
                path: url.to_string(),
                book_id: None,
                title: None,
            });
        }
        Err(ShioriError::TombstonedBook(_)) => {
            let _ = std::fs::remove_file(&dest);
            best_effort_cleanup(source_path, cleanup_source);
            return Ok(IngestResult {
                status: "previously_deleted".to_string(),
                path: url.to_string(),
                book_id: None,
                title: None,
            });
        }
        Err(e) => {
            // Hard failure — don't leave an orphan managed file behind.
            let _ = std::fs::remove_file(&dest);
            best_effort_cleanup(source_path, cleanup_source);
            return Err(e);
        }
    };

    best_effort_cleanup(source_path, cleanup_source);

    log::info!(
        "[ingest] imported opened file {:?} → {} (book {})",
        url,
        dest.display(),
        book_id
    );

    Ok(IngestResult {
        status: "imported".to_string(),
        path: url.to_string(),
        book_id: Some(book_id),
        title: Some(title),
    })
}

/// Best-effort removal of the staging copy (Android content:// temp file).
/// Never fatal — a leftover temp file is harmless.
fn best_effort_cleanup(source_path: &Path, cleanup_source: bool) {
    if cleanup_source {
        if let Err(e) = std::fs::remove_file(source_path) {
            log::warn!(
                "[ingest] failed to remove staging file {:?}: {}",
                source_path,
                e
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidate_name_from_fileprovider_uri() {
        assert_eq!(
            candidate_name_from_url(
                "content://io.github.vinayydv3695.shiori.fileprovider/books/My%20Book.epub"
            ),
            "My Book.epub"
        );
    }

    #[test]
    fn candidate_name_from_opaque_uri_falls_back() {
        // MediaStore / DownloadsProvider expose opaque ids, not names.
        assert_eq!(
            candidate_name_from_url(
                "content://com.android.providers.downloads.documents/document/msf%3A27"
            ),
            "msf:27"
        );
        assert_eq!(
            candidate_name_from_url("content://media/external/file/12345"),
            "12345"
        );
        assert_eq!(candidate_name_from_url("content://"), "book");
    }

    #[test]
    fn candidate_name_from_desktop_path() {
        assert_eq!(
            candidate_name_from_url("/home/user/Books/My Book.epub"),
            "My Book.epub"
        );
    }

    #[test]
    fn detect_format_prefers_supported_extension() {
        assert_eq!(detect_format("book.epub", b"%PDF"), Some("epub".to_string()));
        assert_eq!(detect_format("book.pdf", b"PK\x03\x04"), Some("pdf".to_string()));
    }

    #[test]
    fn detect_format_rejects_unknown_extension_without_sniffing() {
        // An explicit non-book extension is unsupported — never sniffed.
        assert_eq!(detect_format("book.txt", b"%PDF"), None);
        assert_eq!(detect_format("book.docx", b"PK\x03\x04"), None);
    }

    #[test]
    fn detect_format_sniffs_when_no_extension() {
        // Opaque content:// id with no dot → magic-byte fallback.
        assert_eq!(detect_format("msf:27", b"%PDF-1.4"), Some("pdf".to_string()));
        // Proper EPUB local file header: first entry is named "mimetype".
        let mut epub = Vec::new();
        epub.extend_from_slice(b"PK\x03\x04");
        epub.extend_from_slice(&[0u8; 22]);
        epub.extend_from_slice(&8u16.to_le_bytes()); // name len
        epub.extend_from_slice(&0u16.to_le_bytes()); // extra len
        epub.extend_from_slice(b"mimetype");
        assert_eq!(detect_format("12345", &epub), Some("epub".to_string()));
        let mut mobi = vec![0u8; 68];
        mobi[60..68].copy_from_slice(b"BOOKMOBI");
        assert_eq!(detect_format("12345", &mobi), Some("mobi".to_string()));
        assert_eq!(
            detect_format("12345", b"<?xml version=\"1.0\"?><FictionBook>"),
            Some("fb2".to_string())
        );
        assert_eq!(detect_format("12345", b"\x00\x01\x02\x03"), None);
    }

    #[test]
    fn sniff_disambiguates_epub_vs_cbz() {
        // Real EPUB: first local file header names "mimetype".
        let mut epub = Vec::new();
        epub.extend_from_slice(b"PK\x03\x04");
        epub.extend_from_slice(&[0u8; 22]);
        epub.extend_from_slice(&8u16.to_le_bytes()); // name len
        epub.extend_from_slice(&0u16.to_le_bytes()); // extra len
        epub.extend_from_slice(b"mimetype");
        assert_eq!(sniff_book_format(&epub), Some("epub"));

        // CBZ: first entry is an image.
        let mut cbz = Vec::new();
        cbz.extend_from_slice(b"PK\x03\x04");
        cbz.extend_from_slice(&[0u8; 22]);
        cbz.extend_from_slice(&10u16.to_le_bytes()); // name len
        cbz.extend_from_slice(&0u16.to_le_bytes());
        cbz.extend_from_slice(b"00001.jpg");
        assert_eq!(sniff_book_format(&cbz), Some("cbz"));
    }
}
