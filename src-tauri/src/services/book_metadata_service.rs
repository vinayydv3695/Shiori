/// Book Metadata Service - Open Library API Integration
///
/// Fetches rich metadata for books from Open Library API including:
/// - Official cover artwork
/// - Description/synopsis
/// - Publisher information
/// - Authors with details
/// - Subjects/genres
/// - Publication dates
/// - ISBN information

use crate::error::{ShioriError, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

// ═══════════════════════════════════════════════════════════
// API TYPES
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookMetadata {
    pub open_library_id: String, // e.g., "OL123M" or "OL456W"
    pub title: String,
    pub subtitle: Option<String>,
    pub description: Option<String>,
    pub cover_url_small: Option<String>,
    pub cover_url_medium: Option<String>,
    pub cover_url_large: Option<String>,
    pub authors: Vec<AuthorInfo>,
    pub publishers: Vec<String>,
    pub publish_date: Option<String>,
    pub subjects: Vec<String>,
    pub isbn_10: Vec<String>,
    pub isbn_13: Vec<String>,
    pub number_of_pages: Option<i32>,
    pub languages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorInfo {
    pub name: String,
    pub key: Option<String>, // Open Library author key
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    docs: Vec<SearchDoc>,
    num_found: i32,
}

#[derive(Debug, Deserialize)]
struct SearchDoc {
    key: String,
    title: String,
    subtitle: Option<String>,
    author_name: Option<Vec<String>>,
    author_key: Option<Vec<String>>,
    isbn: Option<Vec<String>>,
    publisher: Option<Vec<String>>,
    publish_date: Option<Vec<String>>,
    number_of_pages_median: Option<i32>,
    subject: Option<Vec<String>>,
    language: Option<Vec<String>>,
    cover_i: Option<i64>, // Cover ID
}

#[derive(Debug, Deserialize)]
struct WorkResponse {
    title: String,
    description: Option<DescriptionField>,
    subjects: Option<Vec<String>>,
    covers: Option<Vec<i64>>,
    authors: Option<Vec<AuthorRef>>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum DescriptionField {
    String(String),
    Object { value: String },
}

#[derive(Debug, Deserialize)]
struct AuthorRef {
    author: AuthorKey,
}

#[derive(Debug, Deserialize)]
struct AuthorKey {
    key: String,
}

/// Response from /authors/{key}.json
#[derive(Debug, Deserialize)]
struct AuthorDetailResponse {
    name: Option<String>,
    personal_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EditionResponse {
    title: String,
    subtitle: Option<String>,
    publishers: Option<Vec<String>>,
    publish_date: Option<String>,
    number_of_pages: Option<i32>,
    isbn_10: Option<Vec<String>>,
    isbn_13: Option<Vec<String>>,
    covers: Option<Vec<i64>>,
    languages: Option<Vec<LanguageRef>>,
}

#[derive(Debug, Deserialize)]
struct LanguageRef {
    key: String, // e.g., "/languages/eng"
}

// ═══════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════

pub struct BookMetadataService {
    client: Client,
    base_url: String,
    covers_url: String,
}

/// Maximum response body size for JSON/API responses (2 MB)
const MAX_JSON_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
/// Maximum response body size for cover image downloads (10 MB)
const MAX_IMAGE_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

impl BookMetadataService {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Shiori/0.1.0 (https://github.com/yourusername/shiori)")
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client,
            base_url: "https://openlibrary.org".to_string(),
            covers_url: "https://covers.openlibrary.org".to_string(),
        })
    }

    /// Read a response body as JSON with a size limit to prevent memory exhaustion.
    async fn bounded_json<T: serde::de::DeserializeOwned>(
        response: reqwest::Response,
        max_bytes: usize,
        context: &str,
    ) -> Result<T> {
        let bytes = Self::bounded_bytes(response, max_bytes, context).await?;
        serde_json::from_slice(&bytes)
            .map_err(|e| ShioriError::Other(format!("Failed to parse {}: {}", context, e)))
    }

    /// Read a response body with a size limit to prevent memory exhaustion.
    async fn bounded_bytes(
        response: reqwest::Response,
        max_bytes: usize,
        context: &str,
    ) -> Result<Vec<u8>> {
        // Check Content-Length header first for an early reject
        if let Some(len) = response.content_length() {
            if len as usize > max_bytes {
                return Err(ShioriError::Other(format!(
                    "{} response too large: {} bytes (max {})",
                    context, len, max_bytes
                )));
            }
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed to read {}: {}", context, e)))?;
        if bytes.len() > max_bytes {
            return Err(ShioriError::Other(format!(
                "{} response too large: {} bytes (max {})",
                context,
                bytes.len(),
                max_bytes
            )));
        }
        Ok(bytes.to_vec())
    }

    /// Search for books by title and optional author
    pub async fn search_book(
        &self,
        title: &str,
        author: Option<&str>,
    ) -> Result<Vec<BookMetadata>> {
        log::info!("[BookMetadataService] Searching for: '{}'", title);

        let mut query_parts = vec![format!("title:{}", title)];
        if let Some(author_name) = author {
            query_parts.push(format!("author:{}", author_name));
        }

        let query = query_parts.join(" AND ");
        let url = format!(
            "{}/search.json?q={}&limit=5",
            self.base_url,
            urlencoding::encode(&query)
        );

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Open Library API request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(ShioriError::Other(format!(
                "Open Library API returned error: {}",
                response.status()
            )));
        }

        let result: SearchResponse = Self::bounded_json(
            response,
            MAX_JSON_RESPONSE_BYTES,
            "search response",
        )
        .await?;

        let metadata: Vec<BookMetadata> = result
            .docs
            .into_iter()
            .take(5)
            .map(|doc| self.convert_search_doc(doc))
            .collect();

        log::info!(
            "[BookMetadataService] Found {} matches for '{}'",
            metadata.len(),
            title
        );
        Ok(metadata)
    }

    /// Search by ISBN (most accurate)
    pub async fn search_by_isbn(&self, isbn: &str) -> Result<Option<BookMetadata>> {
        log::info!("[BookMetadataService] Searching by ISBN: {}", isbn);

        let url = format!("{}/isbn/{}.json", self.base_url, isbn);

        let response = self.client.get(&url).send().await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let edition: EditionResponse = Self::bounded_json(
                    resp,
                    MAX_JSON_RESPONSE_BYTES,
                    "ISBN response",
                )
                .await?;

                // Get work details for better metadata
                let metadata = self.convert_edition_to_metadata(edition).await?;
                Ok(Some(metadata))
            }
            Ok(resp) if resp.status() == 404 => {
                log::warn!("[BookMetadataService] No book found for ISBN: {}", isbn);
                Ok(None)
            }
            Ok(resp) => Err(ShioriError::Other(format!(
                "Open Library API error: {}",
                resp.status()
            ))),
            Err(e) => Err(ShioriError::Other(format!("Request failed: {}", e))),
        }
    }

    /// Get detailed book metadata by Open Library ID
    pub async fn get_book_by_id(&self, ol_id: &str) -> Result<BookMetadata> {
        log::info!("[BookMetadataService] Fetching book: {}", ol_id);

        // Determine if it's a work or edition ID
        let url = if ol_id.contains('W') {
            format!("{}/works/{}.json", self.base_url, ol_id)
        } else {
            format!("{}/books/{}.json", self.base_url, ol_id)
        };

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed to fetch book: {}", e)))?;

        if !response.status().is_success() {
            return Err(ShioriError::Other(format!(
                "Book {} not found",
                ol_id
            )));
        }

        if ol_id.contains('W') {
            let work: WorkResponse = Self::bounded_json(
                response,
                MAX_JSON_RESPONSE_BYTES,
                "work data",
            )
            .await?;
            self.convert_work_to_metadata(ol_id, work).await
        } else {
            let edition: EditionResponse = Self::bounded_json(
                response,
                MAX_JSON_RESPONSE_BYTES,
                "edition data",
            )
            .await?;
            self.convert_edition_to_metadata(edition).await
        }
    }

    /// Download cover image from Open Library
    pub async fn download_cover(&self, cover_id: i64, size: &str) -> Result<Vec<u8>> {
        // size can be "S" (small), "M" (medium), or "L" (large)
        let url = format!("{}/b/id/{}-{}.jpg", self.covers_url, cover_id, size);
        log::info!("[BookMetadataService] Downloading cover from: {}", url);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed to download cover: {}", e)))?;

        if !response.status().is_success() {
            return Err(ShioriError::Other(format!(
                "Failed to download cover: HTTP {}",
                response.status()
            )));
        }

        let bytes = Self::bounded_bytes(
            response,
            MAX_IMAGE_RESPONSE_BYTES,
            "cover image",
        )
        .await?;

        log::info!("[BookMetadataService] ✅ Downloaded {} bytes", bytes.len());
        Ok(bytes)
    }

    // ═══════════════════════════════════════════════════════════
    // CONVERSION HELPERS
    // ═══════════════════════════════════════════════════════════

    fn convert_search_doc(&self, doc: SearchDoc) -> BookMetadata {
        let authors = if let (Some(names), Some(keys)) = (doc.author_name, doc.author_key) {
            names
                .into_iter()
                .zip(keys.into_iter())
                .map(|(name, key)| AuthorInfo {
                    name,
                    key: Some(key),
                })
                .collect()
        } else {
            vec![]
        };

        // Separate ISBN-10 and ISBN-13
        let (isbn_10, isbn_13) = if let Some(isbns) = doc.isbn {
            let mut isbn10 = vec![];
            let mut isbn13 = vec![];
            for isbn in isbns {
                if isbn.len() == 10 {
                    isbn10.push(isbn);
                } else if isbn.len() == 13 {
                    isbn13.push(isbn);
                }
            }
            (isbn10, isbn13)
        } else {
            (vec![], vec![])
        };

        // Generate cover URLs
        let (cover_s, cover_m, cover_l) = if let Some(cover_id) = doc.cover_i {
            (
                Some(format!("{}/b/id/{}-S.jpg", self.covers_url, cover_id)),
                Some(format!("{}/b/id/{}-M.jpg", self.covers_url, cover_id)),
                Some(format!("{}/b/id/{}-L.jpg", self.covers_url, cover_id)),
            )
        } else {
            (None, None, None)
        };

        BookMetadata {
            open_library_id: doc.key.trim_start_matches("/works/").to_string(),
            title: doc.title,
            subtitle: doc.subtitle,
            description: None, // Not available in search results
            cover_url_small: cover_s,
            cover_url_medium: cover_m,
            cover_url_large: cover_l,
            authors,
            publishers: doc.publisher.unwrap_or_default(),
            publish_date: doc.publish_date.and_then(|dates| dates.first().cloned()),
            subjects: doc.subject.unwrap_or_default(),
            isbn_10,
            isbn_13,
            number_of_pages: doc.number_of_pages_median,
            languages: doc.language.unwrap_or_default(),
        }
    }

    async fn convert_work_to_metadata(
        &self,
        work_id: &str,
        work: WorkResponse,
    ) -> Result<BookMetadata> {
        let description = work.description.map(|desc| match desc {
            DescriptionField::String(s) => s,
            DescriptionField::Object { value } => value,
        });

        // Generate cover URLs
        let (cover_s, cover_m, cover_l) = if let Some(covers) = work.covers {
            if let Some(&cover_id) = covers.first() {
                (
                    Some(format!("{}/b/id/{}-S.jpg", self.covers_url, cover_id)),
                    Some(format!("{}/b/id/{}-M.jpg", self.covers_url, cover_id)),
                    Some(format!("{}/b/id/{}-L.jpg", self.covers_url, cover_id)),
                )
            } else {
                (None, None, None)
            }
        } else {
            (None, None, None)
        };

        // Resolve author references to actual names
        let authors = self.resolve_author_refs(&work.authors).await;

        Ok(BookMetadata {
            open_library_id: work_id.to_string(),
            title: work.title,
            subtitle: None,
            description,
            cover_url_small: cover_s,
            cover_url_medium: cover_m,
            cover_url_large: cover_l,
            authors,
            publishers: vec![],
            publish_date: None,
            subjects: work.subjects.unwrap_or_default(),
            isbn_10: vec![],
            isbn_13: vec![],
            number_of_pages: None,
            languages: vec![],
        })
    }

    /// Resolve author references (e.g. /authors/OL123A) to AuthorInfo with actual names.
    /// Makes one HTTP request per author. If a request fails, that author is silently skipped.
    async fn resolve_author_refs(&self, author_refs: &Option<Vec<AuthorRef>>) -> Vec<AuthorInfo> {
        let refs = match author_refs {
            Some(refs) if !refs.is_empty() => refs,
            _ => return vec![],
        };

        let mut authors = Vec::with_capacity(refs.len());
        for author_ref in refs {
            let key = &author_ref.author.key;
            // key is like "/authors/OL123A"
            let url = format!("{}{}.json", self.base_url, key);

            match self.client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(detail) = Self::bounded_json::<AuthorDetailResponse>(
                        resp,
                        MAX_JSON_RESPONSE_BYTES,
                        "author detail",
                    )
                    .await
                    {
                        // Prefer `name`, fall back to `personal_name`
                        let name = detail
                            .name
                            .or(detail.personal_name)
                            .unwrap_or_else(|| key.clone());
                        authors.push(AuthorInfo {
                            name,
                            key: Some(key.trim_start_matches("/authors/").to_string()),
                        });
                    }
                }
                Ok(resp) => {
                    log::warn!(
                        "[BookMetadataService] Author {} returned HTTP {}",
                        key,
                        resp.status()
                    );
                }
                Err(e) => {
                    log::warn!(
                        "[BookMetadataService] Failed to fetch author {}: {}",
                        key,
                        e
                    );
                }
            }
        }
        authors
    }

    async fn convert_edition_to_metadata(
        &self,
        edition: EditionResponse,
    ) -> Result<BookMetadata> {
        let (cover_s, cover_m, cover_l) = if let Some(covers) = edition.covers {
            if let Some(&cover_id) = covers.first() {
                (
                    Some(format!("{}/b/id/{}-S.jpg", self.covers_url, cover_id)),
                    Some(format!("{}/b/id/{}-M.jpg", self.covers_url, cover_id)),
                    Some(format!("{}/b/id/{}-L.jpg", self.covers_url, cover_id)),
                )
            } else {
                (None, None, None)
            }
        } else {
            (None, None, None)
        };

        let languages = edition
            .languages
            .map(|langs| {
                langs
                    .into_iter()
                    .map(|lang| {
                        lang.key
                            .trim_start_matches("/languages/")
                            .to_string()
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(BookMetadata {
            open_library_id: "".to_string(), // Edition doesn't have a clean ID in response
            title: edition.title,
            subtitle: edition.subtitle,
            description: None,
            cover_url_small: cover_s,
            cover_url_medium: cover_m,
            cover_url_large: cover_l,
            authors: vec![],
            publishers: edition.publishers.unwrap_or_default(),
            publish_date: edition.publish_date,
            subjects: vec![],
            isbn_10: edition.isbn_10.unwrap_or_default(),
            isbn_13: edition.isbn_13.unwrap_or_default(),
            number_of_pages: edition.number_of_pages,
            languages,
        })
    }
}

impl Default for BookMetadataService {
    fn default() -> Self {
        Self::new().expect("Failed to create BookMetadataService")
    }
}
