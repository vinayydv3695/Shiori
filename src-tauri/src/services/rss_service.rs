use ammonia::clean;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use feed_rs::parser;
use reqwest::Client;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::epub_builder::{EpubBuilder, EpubMetadata};
use crate::db::Database;

/// Upper bound for frontend-supplied LIMIT values; anything above is clamped.
const MAX_LIMIT: i64 = 1000;

/// Build a SQL LIMIT clause from a frontend-supplied limit, clamped to
/// [0, MAX_LIMIT]. `None` keeps the current no-LIMIT behavior.
fn limit_clause(limit: Option<usize>) -> String {
    limit
        .map(|l| format!(" LIMIT {}", (l as i64).clamp(0, MAX_LIMIT)))
        .unwrap_or_default()
}

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

/// Online discovered RSS feed search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredFeedResult {
    pub title: String,
    pub description: Option<String>,
    pub url: String,
    pub website: Option<String>,
    pub visual_url: Option<String>,
    pub subscribers: Option<i64>,
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
    db: Database,
    client: Client,
    storage_path: PathBuf,
}

// Helper functions for DateTime conversion
fn parse_datetime_str(s: &str) -> Option<DateTime<Utc>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Some(DateTime::from_naive_utc_and_offset(naive, Utc));
    }
    None
}

fn parse_datetime(s: Option<String>) -> Option<DateTime<Utc>> {
    s.and_then(|s| parse_datetime_str(&s))
}

fn parse_datetime_required(s: String) -> rusqlite::Result<DateTime<Utc>> {
    parse_datetime_str(&s).ok_or(rusqlite::Error::InvalidQuery)
}

impl RssService {
    /// Create a new RSS service
    pub fn new(db: Database, storage_path: PathBuf) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Shiori/2.3.51")
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self {
            db,
            client,
            storage_path,
        })
    }

    /// Get a database connection from the shared pool
    fn get_connection(
        &self,
    ) -> Result<r2d2::PooledConnection<r2d2_sqlite::SqliteConnectionManager>> {
        self.db
            .get_connection()
            .map_err(|e| anyhow::anyhow!("{}", e))
    }

    /// Add a new RSS feed
    pub async fn add_feed(&self, url: &str, check_interval_hours: i32) -> Result<i64> {
        // Validate feed by fetching it
        let feed_data = self
            .fetch_feed_data(url)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to fetch feed from '{}': {:#}", url, e))?;

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
             FROM rss_feeds WHERE id = ?1",
        )?;

        let feed = stmt
            .query_row(params![feed_id], |row| {
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
            })
            .optional()?;

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
        let feeds = stmt
            .query_map([], |row| {
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
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(feeds)
    }

    /// Update feed metadata
    pub fn update_feed(
        &self,
        feed_id: i64,
        title: Option<String>,
        check_interval_hours: Option<i32>,
    ) -> Result<()> {
        let conn = self.get_connection()?;

        if let Some(t) = title {
            conn.execute(
                "UPDATE rss_feeds SET title = ?1 WHERE id = ?2",
                params![t, feed_id],
            )?;
        }

        if let Some(interval) = check_interval_hours {
            conn.execute(
                "UPDATE rss_feeds SET check_interval_hours = ?1 WHERE id = ?2",
                params![interval, feed_id],
            )?;
        }

        Ok(())
    }

    /// Delete a feed and its articles
    pub fn delete_feed(&self, feed_id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        // Delete articles first (foreign key constraint)
        conn.execute(
            "DELETE FROM rss_articles WHERE feed_id = ?1",
            params![feed_id],
        )?;
        conn.execute("DELETE FROM rss_feeds WHERE id = ?1", params![feed_id])?;

        Ok(())
    }

    /// Toggle feed active status
    pub fn toggle_feed(&self, feed_id: i64) -> Result<bool> {
        let conn = self.get_connection()?;

        let current: bool = conn.query_row(
            "SELECT is_active FROM rss_feeds WHERE id = ?1",
            params![feed_id],
            |row| row.get(0),
        )?;

        let new_status = !current;
        conn.execute(
            "UPDATE rss_feeds SET is_active = ?1 WHERE id = ?2",
            params![new_status, feed_id],
        )?;

        Ok(new_status)
    }

    /// Search online feed directory (via Feedly API) for any topic or keyword
    pub async fn search_online_feeds(&self, query: &str, count: usize) -> Result<Vec<DiscoveredFeedResult>> {
        let encoded_query = urlencoding::encode(query.trim());
        let api_url = format!(
            "https://cloud.feedly.com/v3/search/feeds?query={}&count={}",
            encoded_query,
            count.clamp(1, 50)
        );

        let response = self
            .client
            .get(&api_url)
            .header("User-Agent", "Shiori/2.3.51 (RSS Reader)")
            .send()
            .await
            .context("Failed to query Feedly RSS search API")?;

        let json_val: serde_json::Value = response
            .json()
            .await
            .context("Failed to parse Feedly JSON response")?;

        let mut results = Vec::new();
        if let Some(items) = json_val.get("results").and_then(|r| r.as_array()) {
            for item in items {
                let title = item.get("title").and_then(|t| t.as_str()).unwrap_or("Untitled Feed").to_string();
                let description = item.get("description").and_then(|d| d.as_str()).map(|s| s.to_string());
                let website = item.get("website").and_then(|w| w.as_str()).map(|s| s.to_string());
                let visual_url = item
                    .get("visualUrl")
                    .or_else(|| item.get("coverUrl"))
                    .or_else(|| item.get("iconUrl"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let subscribers = item.get("subscribers").and_then(|s| s.as_i64());

                let raw_feed_id = item
                    .get("feedId")
                    .or_else(|| item.get("id"))
                    .and_then(|f| f.as_str())
                    .unwrap_or("");

                let feed_url = if raw_feed_id.starts_with("feed/") {
                    raw_feed_id.strip_prefix("feed/").unwrap().to_string()
                } else {
                    raw_feed_id.to_string()
                };

                if !feed_url.is_empty() && (feed_url.starts_with("http://") || feed_url.starts_with("https://")) {
                    results.push(DiscoveredFeedResult {
                        title,
                        description,
                        url: feed_url,
                        website,
                        visual_url,
                        subscribers,
                    });
                }
            }
        }

        Ok(results)
    }

    /// Helper to fetch raw content bytes from remote URL or local path
    async fn fetch_raw_bytes(&self, url: &str) -> Result<Vec<u8>> {
        if url.starts_with("file://") || std::path::Path::new(url).is_absolute() {
            let path_str = if url.starts_with("file://") {
                url.strip_prefix("file://").unwrap()
            } else {
                url
            };

            let path_str = if cfg!(windows)
                && path_str.starts_with('/')
                && path_str.len() > 2
                && path_str.chars().nth(2) == Some(':')
            {
                &path_str[1..]
            } else {
                path_str
            };

            std::fs::read(path_str)
                .with_context(|| format!("Failed to read local feed file: {}", path_str))
        } else {
            let response = self
                .client
                .get(url)
                .header(reqwest::header::ACCEPT, "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8")
                .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
                .send()
                .await
                .with_context(|| format!("HTTP request to '{}' failed", url))?;

            if !response.status().is_success() {
                return Err(anyhow::anyhow!("HTTP status {} for URL: {}", response.status(), url));
            }

            let bytes = response
                .bytes()
                .await
                .with_context(|| format!("Failed to read body from {}", url))?
                .to_vec();
            Ok(bytes)
        }
    }

    /// Extract feed URL from HTML `<link rel="alternate" type="application/rss+xml" href="...">` tags
    fn extract_feed_link_from_html(html: &str, base_url: &str) -> Option<String> {
        let lower = html.to_lowercase();
        let link_types = ["application/rss+xml", "application/atom+xml", "application/feed+json"];

        for link_type in &link_types {
            if let Some(pos) = lower.find(link_type) {
                // Find tag boundaries around link_type
                let tag_start = html[..pos].rfind('<')?;
                let tag_end = html[pos..].find('>').map(|p| pos + p)?;
                let tag = &html[tag_start..tag_end];

                if tag.to_lowercase().contains("rel=") && tag.to_lowercase().contains("alternate") {
                    if let Some(href_pos) = tag.to_lowercase().find("href=") {
                        let after_href = &tag[href_pos + 5..];
                        let quote = after_href.chars().next()?;
                        let href_val = if quote == '"' || quote == '\'' {
                            after_href[1..].split(quote).next()?
                        } else {
                            after_href.split_whitespace().next()?
                        };

                        if href_val.starts_with("http://") || href_val.starts_with("https://") {
                            return Some(href_val.to_string());
                        } else if href_val.starts_with('/') {
                            if let Ok(parsed_base) = url::Url::parse(base_url) {
                                let origin = format!("{}://{}", parsed_base.scheme(), parsed_base.host_str().unwrap_or(""));
                                return Some(format!("{}{}", origin, href_val));
                            }
                        } else if let Ok(parsed_base) = url::Url::parse(base_url) {
                            if let Ok(joined) = parsed_base.join(href_val) {
                                return Some(joined.to_string());
                            }
                        }
                    }
                }
            }
        }
        None
    }

    /// Fetch and parse feed data from URL, local file, or auto-discover from website HTML
    async fn fetch_feed_data(&self, url: &str) -> Result<feed_rs::model::Feed> {
        let content = self.fetch_raw_bytes(url).await?;

        // 1. Try direct XML/Atom feed parsing
        if let Ok(feed) = parser::parse(&content[..]) {
            return Ok(feed);
        }

        // 2. If direct parse fails, check if URL returned HTML with feed auto-discovery links
        let html_str = String::from_utf8_lossy(&content[..]);
        if let Some(discovered_url) = Self::extract_feed_link_from_html(&html_str, url) {
            if let Ok(disc_bytes) = self.fetch_raw_bytes(&discovered_url).await {
                if let Ok(feed) = parser::parse(&disc_bytes[..]) {
                    return Ok(feed);
                }
            }
        }

        // 3. Check if it's HTML (site exists but no RSS feed at that path)
        let is_html = html_str.trim_start().starts_with("<!DOCTYPE")
            || html_str.trim_start().starts_with("<html")
            || html_str.contains("<head")
            || html_str.contains("<body");

        // 4. Try common feed endpoint suffixes as fallback (only if not obviously HTML of a base domain)
        let base_url = url.trim_end_matches('/');
        let suffixes = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"];
        for suffix in &suffixes {
            let candidate = format!("{}{}", base_url, suffix);
            if candidate != url {
                if let Ok(disc_bytes) = self.fetch_raw_bytes(&candidate).await {
                    if let Ok(feed) = parser::parse(&disc_bytes[..]) {
                        return Ok(feed);
                    }
                }
            }
        }

        if is_html {
            Err(anyhow::anyhow!(
                "This URL returns a webpage, not an RSS feed. \
                 The site may have removed their RSS feed, or you may need a different URL. \
                 Try searching for '{} RSS feed' or check the site's footer/settings for a feed link.",
                url::Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.to_string())).unwrap_or_else(|| url.to_string())
            ))
        } else {
            Err(anyhow::anyhow!("No valid RSS/Atom feed found at '{}'. The URL may be incorrect or the feed may no longer exist.", url))
        }
    }

    /// Update a specific feed (fetch new articles)
    pub async fn update_feed_articles(&self, feed_id: i64) -> Result<usize> {
        let feed = self
            .get_feed(feed_id)?
            .ok_or_else(|| anyhow::anyhow!("Feed not found"))?;

        // Fetch feed data
        let feed_data = match self.fetch_feed_data(&feed.url).await {
            Ok(data) => {
                // Reset failure count on success
                let conn = self.get_connection()?;
                conn.execute(
                    "UPDATE rss_feeds SET failure_count = 0, last_checked = ?1 WHERE id = ?2",
                    params![Utc::now().to_rfc3339(), feed_id],
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
            conn.execute(
                "UPDATE rss_feeds SET title = ?1 WHERE id = ?2",
                params![title.content, feed_id],
            )?;
        }
        if let Some(description) = feed_data.description {
            conn.execute(
                "UPDATE rss_feeds SET description = ?1 WHERE id = ?2",
                params![description.content, feed_id],
            )?;
        }

        // Process articles
        let mut new_count = 0;
        for entry in feed_data.entries {
            let guid = entry.id.clone();

            // Check if article already exists
            let exists: bool = conn.query_row(
                "SELECT COUNT(*) FROM rss_articles WHERE feed_id = ?1 AND guid = ?2",
                params![feed_id, guid],
                |row| Ok(row.get::<_, i64>(0)? > 0),
            )?;

            if exists {
                continue;
            }

            let title = entry
                .title
                .map(|t| t.content)
                .unwrap_or_else(|| "Untitled".to_string());
            let author = entry.authors.first().map(|a| a.name.clone());
            let url = entry.links.first().map(|l| l.href.clone());

            // Get content (prefer content over summary)
            let mut content = if let Some(content) = entry.content {
                clean(&content.body.unwrap_or_default())
            } else if let Some(summary) = &entry.summary {
                clean(&summary.content)
            } else {
                String::new()
            };

            // Inject media thumbnail if content doesn't have an image
            if !content.contains("<img") {
                if let Some(media) = entry.media.first() {
                    if let Some(thumb) = media.thumbnails.first() {
                        let src = crate::conversion::oeb::escape_xml(&thumb.image.uri);
                        content = format!("<img src=\"{}\" alt=\"Thumbnail\"/>\n{}", src, content);
                    } else if let Some(content_obj) = media.content.first() {
                        if let Some(url) = &content_obj.url {
                            let url_str = url.as_str();
                            if url_str.ends_with(".jpg")
                                || url_str.ends_with(".png")
                                || url_str.ends_with(".webp")
                                || url_str.ends_with(".gif")
                            {
                                let src = crate::conversion::oeb::escape_xml(url_str);
                                content = format!(
                                    "<img src=\"{}\" alt=\"Thumbnail\"/>\n{}",
                                    src, content
                                );
                            }
                        }
                    }
                }
            }

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

    /// Update all active feeds using a high-throughput concurrent worker pool.
    /// Effortlessly scales to 1,000+ feeds in parallel.
    pub async fn update_all_feeds(&self) -> Result<Vec<(i64, Result<usize>)>> {
        use futures::stream::{self, StreamExt};

        let feeds = self.list_feeds(true)?;
        if feeds.is_empty() {
            return Ok(Vec::new());
        }

        // Run 16 concurrent HTTP fetches in parallel
        let results = stream::iter(feeds)
            .map(|feed| async move {
                let result = self.update_feed_articles(feed.id).await;
                (feed.id, result)
            })
            .buffer_unordered(16)
            .collect::<Vec<_>>()
            .await;

        Ok(results)
    }

    /// Add multiple RSS feeds in batch with parallel validation and DB insertion
    pub async fn add_feeds_batch(&self, urls: &[String], check_interval_hours: i32) -> Result<Vec<(String, Result<i64>)>> {
        use futures::stream::{self, StreamExt};

        let urls_vec: Vec<String> = urls.iter().cloned().collect();
        let results = stream::iter(urls_vec)
            .map(|url| async move {
                let res = self.add_feed(&url, check_interval_hours).await;
                (url, res)
            })
            .buffer_unordered(16)
            .collect::<Vec<_>>()
            .await;

        Ok(results)
    }

    /// Get unread articles for a feed
    pub fn get_unread_articles(
        &self,
        feed_id: Option<i64>,
        limit: Option<usize>,
    ) -> Result<Vec<RssArticle>> {
        let conn = self.get_connection()?;

        let (query, params_vec): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(fid) =
            feed_id
        {
            let limit_clause = limit_clause(limit);
            (
                format!("SELECT id, feed_id, title, author, url, content, summary, published, guid, is_read, epub_book_id, created_at
                         FROM rss_articles WHERE feed_id = ?1 AND is_read = 0 ORDER BY published DESC{}", limit_clause),
                vec![Box::new(fid)]
            )
        } else {
            let limit_clause = limit_clause(limit);
            (
                format!("SELECT id, feed_id, title, author, url, content, summary, published, guid, is_read, epub_book_id, created_at
                         FROM rss_articles WHERE is_read = 0 ORDER BY published DESC{}", limit_clause),
                vec![]
            )
        };

        let mut stmt = conn.prepare(&query)?;
        let articles = stmt
            .query_map(
                params_vec
                    .iter()
                    .map(|p| p.as_ref())
                    .collect::<Vec<_>>()
                    .as_slice(),
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
                },
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(articles)
    }

    /// Mark article as read
    pub fn mark_article_read(&self, article_id: i64) -> Result<()> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE rss_articles SET is_read = 1 WHERE id = ?1",
            params![article_id],
        )?;
        Ok(())
    }

    /// Mark all articles as read (optionally filtered by feed_id)
    pub fn mark_all_articles_read(&self, feed_id: Option<i64>) -> Result<()> {
        let conn = self.get_connection()?;
        if let Some(fid) = feed_id {
            conn.execute(
                "UPDATE rss_articles SET is_read = 1 WHERE feed_id = ?1",
                params![fid],
            )?;
        } else {
            conn.execute("UPDATE rss_articles SET is_read = 1", [])?;
        }
        Ok(())
    }

    /// Generate daily EPUB from unread articles
    pub async fn generate_daily_epub(&self, options: DailyEpubOptions) -> Result<PathBuf> {
        // Get unread articles
        let articles = if let Some(feed_ids) = &options.feeds {
            let mut all_articles = Vec::new();
            for feed_id in feed_ids {
                let mut articles =
                    self.get_unread_articles(Some(*feed_id), options.max_articles)?;
                all_articles.append(&mut articles);
            }
            all_articles
        } else {
            self.get_unread_articles(None, options.max_articles)?
        };

        // Check minimum articles
        if let Some(min) = options.min_articles {
            if articles.len() < min {
                anyhow::bail!(
                    "Not enough unread articles (found {}, need {})",
                    articles.len(),
                    min
                );
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
                content.push_str(&format!(
                    "<p><em>By {}</em></p>\n",
                    crate::conversion::oeb::escape_xml(author)
                ));
            }
            if let Some(published) = article.published {
                content.push_str(&format!(
                    "<p><em>{}</em></p>\n",
                    published.format("%B %d, %Y %H:%M")
                ));
            }
            if let Some(url) = &article.url {
                let escaped = crate::conversion::oeb::escape_xml(url);
                content.push_str(&format!("<p><a href=\"{}\">{}</a></p>\n", escaped, escaped));
            }

            content.push_str("<hr/>\n");
            content.push_str(&article.content);

            builder.add_html_chapter(chapter_title, content);
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

        // Import the EPUB into the library
        let now_str = Utc::now().to_rfc3339();

        // Add to database
        let new_book = crate::models::Book {
            id: None,
            uuid: uuid::Uuid::new_v4().to_string(),
            title: options.title.clone(),
            sort_title: None,
            isbn: None,
            isbn13: None,
            publisher: None,
            pubdate: None,
            series: None,
            series_index: None,
            rating: None,
            file_path: output_path.to_string_lossy().to_string(),
            file_format: "epub".to_string(),
            file_size: std::fs::metadata(&output_path).ok().map(|m| m.len() as i64),
            file_hash: None,
            cover_path: None,
            page_count: None,
            word_count: None,
            language: "eng".to_string(),
            added_date: now_str.clone(),
            modified_date: now_str,
            last_opened: None,
            notes: None,
            online_metadata_fetched: false,
            metadata_source: None,
            metadata_last_sync: None,
            anilist_id: None,
            is_favorite: false,
            is_wishlist: false,
            in_trash: false,
            deleted_at: None,
            reading_status: "Unread".to_string(),
            domain: Some("books".to_string()),
            authors: vec![],
            tags: vec![],
            metadata_locked: None,
            // ponytail: slice 2/3 will populate is_managed/origin/managed_relpath.
            is_managed: false,
            origin: None,
            managed_relpath: None,
        };

        if let Ok(book_id) = crate::services::library_service::add_book(&self.db, new_book) {
            // Try to assign the RSS tag
            if let Ok(conn) = self.db.get_connection() {
                // Ensure tag exists
                let _ = conn.execute("INSERT OR IGNORE INTO tags (name) VALUES ('RSS')", []);
                if let Ok(tag_id) =
                    conn.query_row("SELECT id FROM tags WHERE name = 'RSS'", [], |row| {
                        row.get::<_, i64>(0)
                    })
                {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO books_tags (book_id, tag_id) VALUES (?1, ?2)",
                        rusqlite::params![book_id, tag_id],
                    );
                }
            }
        }

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
             ORDER BY last_checked",
        )?;

        let feeds = stmt
            .query_map(params![now.to_rfc3339()], |row| {
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
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(feeds)
    }

    /// Schedule next check for a feed
    pub fn schedule_next_check(&self, feed_id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        let check_interval: i32 = conn.query_row(
            "SELECT check_interval_hours FROM rss_feeds WHERE id = ?1",
            params![feed_id],
            |row| row.get(0),
        )?;

        let next_check = Utc::now() + chrono::Duration::hours(check_interval as i64);

        conn.execute(
            "UPDATE rss_feeds SET next_check = ?1 WHERE id = ?2",
            params![next_check.to_rfc3339(), feed_id],
        )?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[tokio::test]
    async fn test_rss_service_creation() {
        let temp_dir = std::env::temp_dir().join("shiori-test-rss");
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db = Database::new(&temp_dir.join("test.db")).unwrap();
        let service = RssService::new(db, temp_dir);

        assert!(service.is_ok());
    }

    #[test]
    fn test_limit_clause_clamps() {
        // None keeps the no-LIMIT behavior; over-limit values are clamped to
        // MAX_LIMIT; 0 is preserved.
        assert_eq!(limit_clause(None), "");
        assert_eq!(limit_clause(Some(5000)), " LIMIT 1000");
        assert_eq!(limit_clause(Some(1000)), " LIMIT 1000");
        assert_eq!(limit_clause(Some(0)), " LIMIT 0");
    }

    #[test]
    fn test_daily_epub_options_default() {
        let options = DailyEpubOptions::default();
        assert_eq!(options.author, "Shiori RSS");
        assert_eq!(options.max_articles, Some(50));
        assert_eq!(options.min_articles, Some(1));
    }

    #[tokio::test]
    async fn test_daily_epub_generates_valid_epub() {
        let temp_dir =
            std::env::temp_dir().join(format!("shiori-test-rss-epub-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db = Database::new(&temp_dir.join("test.db")).unwrap();
        let service = RssService::new(db, temp_dir.clone()).unwrap();

        // Insert one feed + one unread article directly.
        {
            let conn = service.get_connection().unwrap();
            conn.execute(
                "INSERT INTO rss_feeds (url, title) VALUES (?1, ?2)",
                params!["https://example.com/feed.xml", "Test Feed"],
            )
            .unwrap();
            let feed_id = conn.last_insert_rowid();
            conn.execute(
                "INSERT INTO rss_articles (feed_id, title, content, guid, published)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    feed_id,
                    "Article One",
                    "<p>Hello <b>world</b> &amp; friends<br>next line</p>",
                    "guid-1",
                    "2026-01-01T00:00:00Z"
                ],
            )
            .unwrap();
        }

        let options = DailyEpubOptions {
            title: "Daily Test".to_string(),
            author: "Shiori".to_string(),
            max_articles: Some(10),
            min_articles: Some(1),
            feeds: None,
        };
        let path = service.generate_daily_epub(options).await.unwrap();
        assert!(path.exists(), "daily epub not written");

        // The generated EPUB must open and contain the article.
        let mut doc = ::epub::doc::EpubDoc::new(&path).unwrap();
        assert!(doc.get_num_chapters() >= 1, "expected at least one chapter");
        let title = doc.get_title().unwrap_or_default();
        assert_eq!(title, "Daily Test", "epub title from options");

        doc.set_current_chapter(0);
        let (content, _mime) = doc.get_current_str().unwrap();
        assert!(content.contains("Article One"));
        assert!(content.contains("Hello"));

        // Chapter XHTML must be well-formed XML (void elements self-closed).
        let file = std::fs::File::open(&path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut chapter_xml = String::new();
        archive
            .by_name("OEBPS/ch0001.xhtml")
            .unwrap()
            .read_to_string(&mut chapter_xml)
            .unwrap();
        let mut reader = quick_xml::Reader::from_str(&chapter_xml);
        reader.config_mut().check_end_names = true;
        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(quick_xml::events::Event::Eof) => break,
                Ok(_) => {}
                Err(e) => panic!("chapter XHTML is not well-formed XML: {}", e),
            }
            buf.clear();
        }
        assert!(
            chapter_xml.contains("<br/>"),
            "void elements must be self-closed"
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_fetch_local_feed_data() {
        let temp_dir = std::env::temp_dir().join("shiori-test-local-feed");
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db = Database::new(&temp_dir.join("test.db")).unwrap();
        let service = RssService::new(db, temp_dir.clone()).unwrap();

        let xml_content = r#"<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>Local Test Feed Test</title>
  <link>http://localhost</link>
  <description>A test feed</description>
  <item>
    <title>Test Item 1</title>
    <link>http://localhost/1</link>
    <description>Test description 1</description>
  </item>
</channel>
</rss>"#;

        let file_path = temp_dir.join("test_feed.xml");
        std::fs::write(&file_path, xml_content).unwrap();

        let url = format!("file://{}", file_path.to_string_lossy());
        let feed = service.fetch_feed_data(&url).await.unwrap();

        assert_eq!(feed.title.unwrap().content, "Local Test Feed Test");
        assert_eq!(feed.entries.len(), 1);
        assert_eq!(
            feed.entries[0].title.as_ref().unwrap().content,
            "Test Item 1"
        );
    }
}
