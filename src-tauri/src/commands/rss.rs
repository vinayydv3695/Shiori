use std::sync::Arc;
use tauri::State;

use crate::services::rss_service::{RssService, RssFeed, RssArticle, DailyEpubOptions};
use crate::services::rss_scheduler::RssScheduler;

/// Add a new RSS feed
#[tauri::command]
pub async fn add_rss_feed(
    service: State<'_, Arc<RssService>>,
    url: String,
    check_interval_hours: Option<i32>,
) -> Result<i64, String> {
    service.add_feed(&url, check_interval_hours.unwrap_or(24))
        .await
        .map_err(|e| e.to_string())
}

/// Get feed by ID
#[tauri::command]
pub async fn get_rss_feed(
    service: State<'_, Arc<RssService>>,
    feed_id: i64,
) -> Result<Option<RssFeed>, String> {
    service.get_feed(feed_id)
        .map_err(|e| e.to_string())
}

/// List all RSS feeds
#[tauri::command]
pub async fn list_rss_feeds(
    service: State<'_, Arc<RssService>>,
    active_only: Option<bool>,
) -> Result<Vec<RssFeed>, String> {
    service.list_feeds(active_only.unwrap_or(false))
        .map_err(|e| e.to_string())
}

/// Update feed metadata
#[tauri::command]
pub async fn update_rss_feed(
    service: State<'_, Arc<RssService>>,
    feed_id: i64,
    title: Option<String>,
    check_interval_hours: Option<i32>,
) -> Result<(), String> {
    service.update_feed(feed_id, title, check_interval_hours)
        .map_err(|e| e.to_string())
}

/// Delete an RSS feed
#[tauri::command]
pub async fn delete_rss_feed(
    service: State<'_, Arc<RssService>>,
    feed_id: i64,
) -> Result<(), String> {
    service.delete_feed(feed_id)
        .map_err(|e| e.to_string())
}

/// Toggle feed active status
#[tauri::command]
pub async fn toggle_rss_feed(
    service: State<'_, Arc<RssService>>,
    feed_id: i64,
) -> Result<bool, String> {
    service.toggle_feed(feed_id)
        .map_err(|e| e.to_string())
}

/// Update a specific feed (fetch new articles)
#[tauri::command]
pub async fn update_rss_feed_articles(
    service: State<'_, Arc<RssService>>,
    feed_id: i64,
) -> Result<usize, String> {
    service.update_feed_articles(feed_id)
        .await
        .map_err(|e| e.to_string())
}

/// Update all active feeds
#[tauri::command]
pub async fn update_all_rss_feeds(
    service: State<'_, Arc<RssService>>,
) -> Result<Vec<(i64, bool, String)>, String> {
    let results = service.update_all_feeds()
        .await
        .map_err(|e| e.to_string())?;

    Ok(results.into_iter().map(|(id, result)| {
        match result {
            Ok(count) => (id, true, format!("{} new articles", count)),
            Err(e) => (id, false, e.to_string()),
        }
    }).collect())
}

/// Get unread articles
#[tauri::command]
pub async fn get_unread_articles(
    service: State<'_, Arc<RssService>>,
    feed_id: Option<i64>,
    limit: Option<usize>,
) -> Result<Vec<RssArticle>, String> {
    service.get_unread_articles(feed_id, limit)
        .map_err(|e| e.to_string())
}

/// Mark article as read
#[tauri::command]
pub async fn mark_article_read(
    service: State<'_, Arc<RssService>>,
    article_id: i64,
) -> Result<(), String> {
    service.mark_article_read(article_id)
        .map_err(|e| e.to_string())
}

/// Generate daily EPUB from unread articles
#[tauri::command]
pub async fn generate_daily_epub(
    service: State<'_, Arc<RssService>>,
    title: Option<String>,
    author: Option<String>,
    max_articles: Option<usize>,
    feeds: Option<Vec<i64>>,
) -> Result<String, String> {
    let options = DailyEpubOptions {
        title: title.unwrap_or_else(|| format!("Daily Reading - {}", chrono::Utc::now().format("%Y-%m-%d"))),
        author: author.unwrap_or_else(|| "Shiori RSS".to_string()),
        max_articles,
        min_articles: Some(1),
        feeds,
    };

    let path = service.generate_daily_epub(options)
        .await
        .map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

/// Manually trigger feed update via scheduler
#[tauri::command]
pub async fn trigger_feed_update(
    scheduler: State<'_, Arc<tokio::sync::Mutex<RssScheduler>>>,
) -> Result<(), String> {
    let scheduler = scheduler.lock().await;
    scheduler.trigger_feed_update()
        .await
        .map_err(|e| e.to_string())
}

/// Manually trigger daily EPUB generation via scheduler
#[tauri::command]
pub async fn trigger_daily_epub_generation(
    scheduler: State<'_, Arc<tokio::sync::Mutex<RssScheduler>>>,
) -> Result<String, String> {
    let scheduler = scheduler.lock().await;
    let path = scheduler.trigger_daily_epub(None)
        .await
        .map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}
