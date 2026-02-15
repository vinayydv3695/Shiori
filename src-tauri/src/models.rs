use chrono::{DateTime, Utc};
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
