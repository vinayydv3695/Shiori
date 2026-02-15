use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: Option<i64>,
    pub uuid: String,
    pub title: String,
    pub sort_title: Option<String>,
    pub isbn: Option<String>,
    pub isbn13: Option<String>,
    pub publisher: Option<String>,
    pub pubdate: Option<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub rating: Option<i32>,
    pub file_path: String,
    pub file_format: String,
    pub file_size: Option<i64>,
    pub file_hash: Option<String>,
    pub cover_path: Option<String>,
    pub page_count: Option<i32>,
    pub word_count: Option<i32>,
    pub language: String,
    pub added_date: String,
    pub modified_date: String,
    pub last_opened: Option<String>,
    pub notes: Option<String>,
    pub authors: Vec<Author>,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Author {
    pub id: Option<i64>,
    pub name: String,
    pub sort_name: Option<String>,
    pub link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: Option<i64>,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub books: Vec<Book>,
    pub total: usize,
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub query: Option<String>,
    pub authors: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub formats: Option<Vec<String>>,
    pub series: Option<String>,
    pub min_rating: Option<i32>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: Vec<String>,
    pub failed: Vec<(String, String)>, // (path, error_message)
    pub duplicates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    pub title: Option<String>,
    pub authors: Vec<String>,
    pub isbn: Option<String>,
    pub publisher: Option<String>,
    pub pubdate: Option<String>,
    pub language: Option<String>,
    pub description: Option<String>,
    pub page_count: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub id: Option<i64>,
    pub book_id: i64,
    pub current_location: String,
    pub progress_percent: f64,
    pub current_page: Option<i32>,
    pub total_pages: Option<i32>,
    pub last_read: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    pub id: Option<i64>,
    pub book_id: i64,
    pub annotation_type: String, // "highlight", "note", "bookmark"
    pub location: String,
    pub cfi_range: Option<String>,
    pub selected_text: Option<String>,
    pub note_content: Option<String>,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReaderSettings {
    pub id: Option<i64>,
    pub user_id: String,
    pub font_family: String,
    pub font_size: i32,
    pub line_height: f64,
    pub theme: String,
    pub page_mode: String,
    pub margin_size: i32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub parent_id: Option<i64>,
    pub is_smart: bool,
    pub smart_rules: Option<String>, // JSON string of SmartRule[]
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    pub book_count: Option<i64>,   // Not in DB, calculated
    pub children: Vec<Collection>, // Not in DB, for nested collections
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartRule {
    pub field: String, // "author", "tag", "format", "rating", "series", "added_date", etc.
    pub operator: String, // "equals", "contains", "greater_than", "less_than", "in_last"
    pub value: String,
    pub match_type: String, // "all" or "any"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionWithBooks {
    pub collection: Collection,
    pub books: Vec<Book>,
}

// Export models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: String, // "csv", "json", "markdown"
    pub include_metadata: bool,
    pub include_collections: bool,
    pub include_reading_progress: bool,
    pub file_path: String,
}
