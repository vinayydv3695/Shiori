/// CBZ (Comic Book ZIP) → OEB converter.
///
/// CBZ is a ZIP archive of image files (JPEG, PNG, WebP, GIF) in page order.
/// We produce one XHTML chapter per image page, with a comic-page layout.
/// Optionally reads metadata from ComicInfo.xml if present.

use std::io::Read;
use std::path::Path;

use crate::conversion::error::ConversionError;
use crate::conversion::epub_builder::comic_stylesheet;
use crate::conversion::oeb::{OebBook, OebChapter, OebImage};

// Image file extensions we consider valid comic pages
const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "tif"];

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ──────────────────────────────────────────────────────────────────────────

/// Parse a CBZ file and produce an OebBook.
pub fn parse(path: &Path) -> Result<OebBook, ConversionError> {
    let file = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| ConversionError::ParseError {
        format: "CBZ".to_string(),
        detail: e.to_string(),
    })?;

    // Collect all image file names (sorted naturally)
    let mut image_names: Vec<String> = (0..archive.len())
        .filter_map(|i| {
            let entry = archive.by_index(i).ok()?;
            let name = entry.name().to_string();
            let ext = name.rsplit('.').next()?.to_lowercase();
            if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    // Natural sort: page_001 < page_002 < page_010
    image_names.sort_by(|a, b| natord::compare(a, b));

    if image_names.is_empty() {
        return Err(ConversionError::EmptyContent);
    }

    // Try to parse ComicInfo.xml for metadata
    let (title, author, language) = parse_comic_info(&mut archive, path);

    let mut book = OebBook::new(title);
    book.authors = author.into_iter().collect();
    book.language = language;
    book.custom_stylesheet = Some(comic_stylesheet().to_string());

    // Process images: stream through ZIP entries in natural order
    let mut first = true;
    for (page_num, name) in image_names.iter().enumerate() {
        let mut entry = archive.by_name(name).map_err(|e| ConversionError::ParseError {
            format: "CBZ".to_string(),
            detail: format!("Cannot read '{}': {}", name, e),
        })?;

        let mut data = Vec::new();
        entry.read_to_end(&mut data)?;

        if data.is_empty() {
            continue;
        }

        let ext = name.rsplit('.').next().unwrap_or("jpg").to_lowercase();
        let mime_type = mime_type_for_ext(&ext);
        let filename = format!("img_{:04}.{}", page_num + 1, ext);
        let id = format!("img_{:04}", page_num + 1);

        if first {
            // First image becomes cover
            book.cover_image = Some(OebImage {
                id: "cover-image".to_string(),
                filename: format!("cover.{}", ext),
                mime_type: mime_type.to_string(),
                data: data.clone(),
            });
            first = false;
        }

        // Add image to resource list
        book.images.push(OebImage {
            id: id.clone(),
            filename: filename.clone(),
            mime_type: mime_type.to_string(),
            data,
        });

        // One chapter per page
        let html = format!(
            "<div class=\"comic-page\">\n  <img src=\"../Images/{filename}\" alt=\"Page {page}\" />\n</div>",
            filename = filename,
            page = page_num + 1,
        );
        book.chapters.push(OebChapter {
            id: format!("page_{:04}", page_num + 1),
            title: Some(format!("Page {}", page_num + 1)),
            html,
        });
    }

    Ok(book)
}

/// Parse images from an already-extracted directory (used by CBR parser).
pub fn parse_image_dir(dir: &Path) -> Result<OebBook, ConversionError> {
    // Collect all image files
    let mut image_paths: Vec<std::path::PathBuf> = walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| IMAGE_EXTENSIONS.contains(&x.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .map(|e| e.path().to_path_buf())
        .collect();

    // Natural sort by file name
    image_paths.sort_by(|a, b| {
        let na = a.file_name().and_then(|x| x.to_str()).unwrap_or("");
        let nb = b.file_name().and_then(|x| x.to_str()).unwrap_or("");
        natord::compare(na, nb)
    });

    if image_paths.is_empty() {
        return Err(ConversionError::EmptyContent);
    }

    let title = dir
        .file_name()
        .and_then(|x| x.to_str())
        .unwrap_or("Comic")
        .to_string();

    let mut book = OebBook::new(title);
    book.custom_stylesheet = Some(comic_stylesheet().to_string());

    let mut first = true;
    for (page_num, path) in image_paths.iter().enumerate() {
        let data = std::fs::read(path)?;
        if data.is_empty() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("jpg")
            .to_lowercase();
        let mime_type = mime_type_for_ext(&ext);
        let filename = format!("img_{:04}.{}", page_num + 1, ext);
        let id = format!("img_{:04}", page_num + 1);

        if first {
            book.cover_image = Some(OebImage {
                id: "cover-image".to_string(),
                filename: format!("cover.{}", ext),
                mime_type: mime_type.to_string(),
                data: data.clone(),
            });
            first = false;
        }

        book.images.push(OebImage {
            id: id.clone(),
            filename: filename.clone(),
            mime_type: mime_type.to_string(),
            data,
        });

        let html = format!(
            "<div class=\"comic-page\">\n  <img src=\"../Images/{filename}\" alt=\"Page {page}\" />\n</div>",
            filename = filename,
            page = page_num + 1,
        );
        book.chapters.push(OebChapter {
            id: format!("page_{:04}", page_num + 1),
            title: Some(format!("Page {}", page_num + 1)),
            html,
        });
    }

    Ok(book)
}

// ──────────────────────────────────────────────────────────────────────────
// ComicInfo.xml METADATA
// ──────────────────────────────────────────────────────────────────────────

/// Try to read title/author/language from `ComicInfo.xml` inside the archive.
/// Returns (title, Option<author>, language).
fn parse_comic_info(
    archive: &mut zip::ZipArchive<std::fs::File>,
    fallback_path: &Path,
) -> (String, Option<String>, String) {
    let default_title = || {
        fallback_path
            .file_stem()
            .and_then(|x| x.to_str())
            .unwrap_or("Comic")
            .to_string()
    };

    // Try case-insensitive lookup
    let xml_entry = (0..archive.len()).find(|&i| {
        archive
            .by_index(i)
            .map(|e| e.name().to_lowercase() == "comicinfo.xml")
            .unwrap_or(false)
    });

    let xml_entry_idx = match xml_entry {
        Some(i) => i,
        None => return (default_title(), None, "en".to_string()),
    };

    let mut entry = match archive.by_index(xml_entry_idx) {
        Ok(e) => e,
        Err(_) => return (default_title(), None, "en".to_string()),
    };

    let mut xml_content = String::new();
    if entry.read_to_string(&mut xml_content).is_err() {
        return (default_title(), None, "en".to_string());
    }

    let series = extract_xml_tag(&xml_content, "Series");
    let number = extract_xml_tag(&xml_content, "Number");
    let writer = extract_xml_tag(&xml_content, "Writer");
    let language = extract_xml_tag(&xml_content, "LanguageISO")
        .unwrap_or_else(|| "en".to_string());

    let title = match (series, number) {
        (Some(s), Some(n)) => format!("{} Vol. {}", s, n),
        (Some(s), None) => s,
        _ => default_title(),
    };

    (title, writer, language)
}

/// Extract the inner text of a simple XML element like `<Tag>value</Tag>`.
fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let value = xml[start..end].trim().to_string();
    if value.is_empty() { None } else { Some(value) }
}

// ──────────────────────────────────────────────────────────────────────────
// MIME TYPE HELPERS
// ──────────────────────────────────────────────────────────────────────────

fn mime_type_for_ext(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "tiff" | "tif" => "image/tiff",
        _ => "image/jpeg",
    }
}
