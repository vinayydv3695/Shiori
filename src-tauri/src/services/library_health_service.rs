use crate::{db::Database, error::Result};
use serde::Serialize;
use std::{fs::File, io::ErrorKind, path::Path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthBook {
    pub id: i64,
    pub title: String,
    pub file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnreadableBook {
    #[serde(flatten)]
    pub book: HealthBook,
    pub reason: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryHealthReport {
    pub checked: usize,
    pub skipped: usize,
    pub missing: Vec<HealthBook>,
    pub unreadable: Vec<UnreadableBook>,
}

pub fn check_library_health(db: &Database) -> Result<LibraryHealthReport> {
    let books = {
        let conn = db.get_connection()?;
        let mut stmt = conn.prepare("SELECT id, title, file_path, in_trash, is_wishlist FROM books")?;
        let rows = stmt.query_map([], |row| {
            Ok((HealthBook { id: row.get(0)?, title: row.get(1)?, file_path: row.get(2)? },
                row.get::<_, bool>(3)?, row.get::<_, bool>(4)?))
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()?
    };
    Ok(inspect_books(books))
}

fn inspect_books(books: Vec<(HealthBook, bool, bool)>) -> LibraryHealthReport {
    let mut report = LibraryHealthReport::default();
    for (book, trashed, wishlist) in books {
        let path = &book.file_path;
        if trashed || wishlist || path.is_empty() || path.contains("://")
            || path.starts_with("content:") || path.starts_with("online:")
        {
            report.skipped += 1;
            continue;
        }
        report.checked += 1;
        let reason = match std::fs::metadata(Path::new(path)) {
            Err(error) if error.kind() == ErrorKind::NotFound => {
                report.missing.push(book);
                continue;
            }
            Err(_) => Some("File metadata is inaccessible"),
            Ok(metadata) if !metadata.is_file() => Some("Path is not a regular file"),
            Ok(_) => File::open(path).err().map(|_| "File cannot be opened for reading"),
        };
        if let Some(reason) = reason {
            report.unreadable.push(UnreadableBook { book, reason: reason.into() });
        }
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn reports_unreadable_files_when_permissions_are_enforced() {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().join(format!("shiori-health-{}", uuid::Uuid::new_v4()));
        std::fs::write(&path, []).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0)).unwrap();
        let permissions_enforced = File::open(&path).is_err();
        let report = inspect_books(vec![(HealthBook { id: 1, title: "Book".into(), file_path: path.to_string_lossy().into_owned() }, false, false)]);
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(report.unreadable.len(), usize::from(permissions_enforced));
    }

    #[test]
    fn checks_local_files_and_skips_nonlocal_entries() {
        let root = std::env::temp_dir().join(format!("shiori-health-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let readable = root.join("readable.epub");
        std::fs::write(&readable, []).unwrap();
        let entry = |id, path: String, trash, wishlist| (HealthBook { id, title: "Book".into(), file_path: path }, trash, wishlist);
        let report = inspect_books(vec![
            entry(1, readable.to_string_lossy().into_owned(), false, false),
            entry(2, root.join("missing").to_string_lossy().into_owned(), false, false),
            entry(3, root.to_string_lossy().into_owned(), false, false),
            entry(4, "missing-trash".into(), true, false),
            entry(5, "https://example.com/book".into(), false, false),
            entry(6, "content://provider/book".into(), false, false),
            entry(7, "missing-wishlist".into(), false, true),
        ]);
        assert_eq!((report.checked, report.skipped), (3, 4));
        assert_eq!(report.missing[0].id, 2);
        assert_eq!(report.unreadable[0].book.id, 3);
        assert_eq!((report.missing.len(), report.unreadable.len()), (1, 1));
        std::fs::remove_dir_all(root).unwrap();
    }
}
