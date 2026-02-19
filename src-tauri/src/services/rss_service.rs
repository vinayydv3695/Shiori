use std::path::{Path, PathBuf};
use std::sync::Arc;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use feed_rs::parser;
use reqwest::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use ammonia::clean;

use super::epub_builder::{EpubBuilder, EpubMetadata};

/// RSS feed metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RssFeed {
    pub id: i64,
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub last_checked: Option<DateTime<Utc>>,
    pub next_check: Option<DateTime<Utc>>,
    pub check_interval_hours: i32,
    pub failure_count: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

/// RSS article metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RssArticle {
    pub id: i64,
    pub feed_id: i64,
    pub title: String,
    pub author: Option<String>,
    pub url: Option<String>,
    pub content: String,
    pub summary: Option<String>,
    pub published: Option<DateTime<Utc>>,
    pub guid: String,
    pub is_read: bool,
    pub epub_book_id: Option<i64>,
    pub created_at: DateTime<Utc>,
}

/// Options for generating daily EPUB
#[derive(Debug, Clone)]
pub struct DailyEpubOptions {
    pub title: String,
    pub author: String,
    pub max_articles: Option<usize>,
    pub min_articles: Option<usize>,
    pub feeds: Option<Vec<i64>>, // Specific feeds, or None for all
}

impl Default for DailyEpubOptions {
    fn default() -> Self {
        Self {
            title: format!("Daily Reading - {}", Utc::now().format("%Y-%m-%d")),
            author: "Shiori RSS".to_string(),
            max_articles: Some(50),
            min_articles: Some(1),
            feeds: None,
        }
    }
}

/// RSS feed management service
pub struct RssService {
    db_path: PathBuf,
    client: Client,
    storage_path: PathBuf,
}

// Helper functions for DateTime conversion
fn parse_datetime(s: Option<String>) -> Option<DateTime<Utc>> {
    s.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc)))
}

fn parse_datetime_required(s: String) -> rusqlite::Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(&s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| rusqlite::Error::InvalidQuery)
}

impl RssService {
    /// Create a new RSS service
    pub fn new(db_path: PathBuf, storage_path: PathBuf) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("Shiori/2.0 RSS Reader")
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self {
            db_path,
            client,
            storage_path,
        })
    }

    /// Get a database connection
    fn get_connection(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON")?;
        Ok(conn)
    }

    /// Add a new RSS feed
    pub async fn add_feed(&self, url: &str, check_interval_hours: i32) -> Result<i64> {
        // Validate feed by fetching it
        let feed_data = self.fetch_feed_data(url).await
            .context("Failed to fetch feed - ensure URL is valid")?;

        let conn = self.get_connection()?;
        let title = feed_data.title.map(|t| t.content);
        let description = feed_data.description.map(|d| d.content);

        conn.execute(
            "INSERT INTO rss_feeds (url, title, description, check_interval_hours, is_active)
             VALUES (?1, ?2, ?3, ?4, 1)",
            params![url, title, description, check_interval_hours],
        )?;

        Ok(conn.last_insert_rowid())
    }

    /// Get feed by ID
    pub fn get_feed(&self, feed_id: i64) -> Result<Option<RssFeed>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, url, title, description, last_checked, next_check,
                    check_interval_hours, failure_count, is_active, created_at
             FROM rss_feeds WHERE id = ?1"
        )?;

        let feed = stmt.query_row(params![feed_id], |row| {
            Ok(RssFeed {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                last_checked: parse_datetime(row.get(4)?),
                next_check: parse_datetime(row.get(5)?),
                check_interval_hours: row.get(6)?,
                failure_count: row.get(7)?,
                is_active: row.get(8)?,
                created_at: parse_datetime_required(row.get(9)?)?,
            })
        }).optional()?;

        Ok(feed)
    }

    /// List all feeds
    pub fn list_feeds(&self, active_only: bool) -> Result<Vec<RssFeed>> {
        let conn = self.get_connection()?;
        let query = if active_only {
            "SELECT id, url, title, description, last_checked, next_check,
                    check_interval_hours, failure_count, is_active, created_at
             FROM rss_feeds WHERE is_active = 1 ORDER BY title"
        } else {
            "SELECT id, url, title, description, last_checked, next_check,
                    check_interval_hours, failure_count, is_active, created_at
             FROM rss_feeds ORDER BY title"
        };

        let mut stmt = conn.prepare(query)?;
        let feeds = stmt.query_map([], |row| {
            Ok(RssFeed {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                last_checked: parse_datetime(row.get(4)?),
                next_check: parse_datetime(row.get(5)?),
                check_interval_hours: row.get(6)?,
                failure_count: row.get(7)?,
                is_active: row.get(8)?,
                created_at: parse_datetime_required(row.get(9)?)?,
            })
        })?.collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(feeds)
    }

    /// Update feed metadata
    pub fn update_feed(&self, feed_id: i64, title: Option<String>, check_interval_hours: Option<i32>) -> Result<()> {
        let conn = self.get_connection()?;
        
        if let Some(t) = title {
            conn.execute("UPDATE rss_feeds SET title = ?1 WHERE id = ?2", params![t, feed_id])?;
        }
        
        if let Some(interval) = check_interval_hours {
            conn.execute("UPDATE rss_feeds SET check_interval_hours = ?1 WHERE id = ?2", params![interval, feed_id])?;
        }

        Ok(())
    }

    /// Delete a feed and its articles
    pub fn delete_feed(&self, feed_id: i64) -> Result<()> {
        let conn = self.get_connection()?;
        
        // Delete articles first (foreign key constraint)
        conn.execute("DELETE FROM rss_articles WHERE feed_id = ?1", params![feed_id])?;
        conn.execute("DELETE FROM rss_feeds WHERE id = ?1", params![feed_id])?;

        Ok(())
    }

    /// Toggle feed active status
    pub fn toggle_feed(&self, feed_id: i64) -> Result<bool> {
        let conn = self.get_connection()?;
        
        let current: bool = conn.query_row(
            "SELECT is_active FROM rss_feeds WHERE id = ?1",
            params![feed_id],
            |row| row.get(0)
        )?;

        let new_status = !current;
        conn.execute(
            "UPDATE rss_feeds SET is_active = ?1 WHERE id = ?2",
            params![new_status, feed_id]
        )?;

        Ok(new_status)
    }

    /// Fetch and parse feed data from URL
    async fn fetch_feed_data(&self, url: &str) -> Result<feed_rs::model::Feed> {
        let response = self.client.get(url)
            .send()
            .await
            .context("HTTP request failed")?;

        let content = response.bytes().await.context("Failed to read response body")?;
        let feed = parser::parse(&content[..]).context("Failed to parse feed")?;

        Ok(feed)
    }

    /// Update a specific feed (fetch new articles)
    pub async fn update_feed_articles(&self, feed_id: i64) -> Result<usize> {
        let feed = self.get_feed(feed_id)?
            .ok_or_else(|| anyhow::anyhow!("Feed not found"))?;

        // Fetch feed data
        let feed_data = match self.fetch_feed_data(&feed.url).await {
            Ok(data) => {
                // Reset failure count on success
                let conn = self.get_connection()?;
                conn.execute(
                    "UPDATE rss_feeds SET failure_count = 0, last_checked = ?1 WHERE id = ?2",
                    params![Utc::now().to_rfc3339(), feed_id]
                )?;
                data
            }
            Err(e) => {
                // Increment failure count
                let conn = self.get_connection()?;
                conn.execute(
                    "UPDATE rss_feeds SET failure_count = failure_count + 1, last_checked = ?1 WHERE id = ?2",
                    params![Utc::now().to_rfc3339(), feed_id]
                )?;
                return Err(e);
            }
        };

        // Update feed metadata
        let conn = self.get_connection()?;
        if let Some(title) = feed_data.title {
            conn.execute("UPDATE rss_feeds SET title = ?1 WHERE id = ?2", params![title.content, feed_id])?;
        }
        if let Some(description) = feed_data.description {
            conn.execute("UPDATE rss_feeds SET description = ?1 WHERE id = ?2", params![description.content, feed_id])?;
        }

        // Process articles
        let mut new_count = 0;
        for entry in feed_data.entries {
            let guid = entry.id.clone();
            
            // Check if article already exists
            let exists: bool = conn.query_row(
                "SELECT COUNT(*) FROM rss_articles WHERE feed_id = ?1 AND guid = ?2",
                params![feed_id, guid],
                |row| Ok(row.get::<_, i64>(0)? > 0)
            )?;

            if exists {
                continue;
            }

            let title = entry.title.map(|t| t.content).unwrap_or_else(|| "Untitled".to_string());
            let author = entry.authors.first().map(|a| a.name.clone());
            let url = entry.links.first().map(|l| l.href.clone());
            
            // Get content (prefer content over summary)
            let content = if let Some(content) = entry.content {
                clean(&content.body.unwrap_or_default())
            } else if let Some(summary) = &entry.summary {
                clean(&summary.content)
            } else {
                String::new()
            };

            let summary = entry.summary.map(|s| clean(&s.content));
            let published = entry.published.or(entry.updated);

            conn.execute(
                "INSERT INTO rss_articles (feed_id, title, author, url, content, summary, published, guid)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![feed_id, title, author, url, content, summary, published.map(|dt| dt.to_rfc3339()), guid]
            )?;

            new_count += 1;
        }

        Ok(new_count)
    }

    /// Update all active feeds
    pub async fn update_all_feeds(&self) -> Result<Vec<(i64, Result<usize>)>> {
        let feeds = self.list_feeds(true)?;
        let mut results = Vec::new();

        for feed in feeds {
            let result = self.update_feed_articles(feed.id).await;
            results.push((feed.id, result));
        }

        Ok(results)
    }

    /// Get unread articles for a feed
    pub fn get_unread_articles(&self, feed_id: Option<i64>, limit: Option<usize>) -> Result<Vec<RssArticle>> {
        let conn = self.get_connection()?;
        
        let (query, params_vec): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(fid) = feed_id {
            let limit_clause = limit.map(|l| format!(" LIMIT {}", l)).unwrap_or_default();
            (
                format!("SELECT id, feed_id, title, author, url, content, summary, published, guid, is_read, epub_book_id, created_at
                         FROM rss_articles WHERE feed_id = ?1 AND is_read = 0 ORDER BY published DESC{}", limit_clause),
                vec![Box::new(fid)]
            )
        } else {
            let limit_clause = limit.map(|l| format!(" LIMIT {}", l)).unwrap_or_default();
            (
                format!("SELECT id, feed_id, title, author, url, content, summary, published, guid, is_read, epub_book_id, created_at
                         FROM rss_articles WHERE is_read = 0 ORDER BY published DESC{}", limit_clause),
                vec![]
            )
        };

        let mut stmt = conn.prepare(&query)?;
        let articles = stmt.query_map(
            params_vec.iter().map(|p| p.as_ref()).collect::<Vec<_>>().as_slice(),
            |row| {
                Ok(RssArticle {
                    id: row.get(0)?,
                    feed_id: row.get(1)?,
                    title: row.get(2)?,
                    author: row.get(3)?,
                    url: row.get(4)?,
                    content: row.get(5)?,
                    summary: row.get(6)?,
                    published: parse_datetime(row.get(7)?),
                    guid: row.get(8)?,
                    is_read: row.get(9)?,
                    epub_book_id: row.get(10)?,
                    created_at: parse_datetime_required(row.get(11)?)?,
                })
            }
        )?.collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(articles)
    }

    /// Mark article as read
    pub fn mark_article_read(&self, article_id: i64) -> Result<()> {
        let conn = self.get_connection()?;
        conn.execute("UPDATE rss_articles SET is_read = 1 WHERE id = ?1", params![article_id])?;
        Ok(())
    }

    /// Generate daily EPUB from unread articles
    pub async fn generate_daily_epub(&self, options: DailyEpubOptions) -> Result<PathBuf> {
        // Get unread articles
        let articles = if let Some(feed_ids) = &options.feeds {
            let mut all_articles = Vec::new();
            for feed_id in feed_ids {
                let mut articles = self.get_unread_articles(Some(*feed_id), options.max_articles)?;
                all_articles.append(&mut articles);
            }
            all_articles
        } else {
            self.get_unread_articles(None, options.max_articles)?
        };

        // Check minimum articles
        if let Some(min) = options.min_articles {
            if articles.len() < min {
                anyhow::bail!("Not enough unread articles (found {}, need {})", articles.len(), min);
            }
        }

        if articles.is_empty() {
            anyhow::bail!("No unread articles found");
        }

        // Build EPUB
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: options.title.clone(),
            authors: vec![options.author.clone()],
            language: "en".to_string(),
            ..Default::default()
        });

        // Add each article as a chapter
        for article in &articles {
            let chapter_title = article.title.clone();
            let mut content = String::new();

            // Add metadata
            if let Some(author) = &article.author {
                content.push_str(&format!("<p><em>By {}</em></p>\n", author));
            }
            if let Some(published) = article.published {
                content.push_str(&format!("<p><em>{}</em></p>\n", published.format("%B %d, %Y %H:%M")));
            }
            if let Some(url) = &article.url {
                content.push_str(&format!("<p><a href=\"{}\">{}</a></p>\n", url, url));
            }

            content.push_str("<hr/>\n");
            content.push_str(&article.content);

            builder.add_chapter(chapter_title, content);
        }

        // Generate file path
        let filename = format!("daily-{}.epub", Utc::now().format("%Y%m%d-%H%M%S"));
        let output_path = self.storage_path.join("rss").join(&filename);
        
        // Ensure directory exists
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Build EPUB
        builder.generate(&output_path).await?;

        // TODO: Optionally add to library
        // This would require importing the EPUB using the library service

        Ok(output_path)
    }

    /// Get feeds that need updating
    pub fn get_feeds_due_for_update(&self) -> Result<Vec<RssFeed>> {
        let conn = self.get_connection()?;
        let now = Utc::now();

        let mut stmt = conn.prepare(
            "SELECT id, url, title, description, last_checked, next_check,
                    check_interval_hours, failure_count, is_active, created_at
             FROM rss_feeds 
             WHERE is_active = 1 
               AND (next_check IS NULL OR next_check <= ?1)
               AND failure_count < 5
             ORDER BY last_checked"
        )?;

        let feeds = stmt.query_map(params![now.to_rfc3339()], |row| {
            Ok(RssFeed {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                last_checked: parse_datetime(row.get(4)?),
                next_check: parse_datetime(row.get(5)?),
                check_interval_hours: row.get(6)?,
                failure_count: row.get(7)?,
                is_active: row.get(8)?,
                created_at: parse_datetime_required(row.get(9)?)?,
            })
        })?.collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(feeds)
    }

    /// Schedule next check for a feed
    pub fn schedule_next_check(&self, feed_id: i64) -> Result<()> {
        let conn = self.get_connection()?;
        
        let check_interval: i32 = conn.query_row(
            "SELECT check_interval_hours FROM rss_feeds WHERE id = ?1",
            params![feed_id],
            |row| row.get(0)
        )?;

        let next_check = Utc::now() + chrono::Duration::hours(check_interval as i64);
        
        conn.execute(
            "UPDATE rss_feeds SET next_check = ?1 WHERE id = ?2",
            params![next_check.to_rfc3339(), feed_id]
        )?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rss_service_creation() {
        let temp_dir = std::env::temp_dir().join("shiori-test-rss");
        std::fs::create_dir_all(&temp_dir).unwrap();
        
        let db_path = temp_dir.join("test.db");
        let service = RssService::new(db_path, temp_dir);
        
        assert!(service.is_ok());
    }

    #[test]
    fn test_daily_epub_options_default() {
        let options = DailyEpubOptions::default();
        assert_eq!(options.author, "Shiori RSS");
        assert_eq!(options.max_articles, Some(50));
        assert_eq!(options.min_articles, Some(1));
    }
}
