use std::sync::Arc;
use anyhow::Result;
use tokio_cron_scheduler::{Job, JobScheduler};
use log::{info, error, warn};

use super::rss_service::{RssService, DailyEpubOptions};

/// RSS feed update scheduler
pub struct RssScheduler {
    scheduler: JobScheduler,
    rss_service: Arc<RssService>,
    daily_epub_enabled: bool,
    daily_epub_time: String, // Cron format: "0 0 6 * * *" = 6 AM daily
}

impl RssScheduler {
    /// Create a new RSS scheduler
    pub async fn new(
        rss_service: Arc<RssService>,
        daily_epub_enabled: bool,
        daily_epub_time: Option<String>,
    ) -> Result<Self> {
        let scheduler = JobScheduler::new().await?;
        
        Ok(Self {
            scheduler,
            rss_service,
            daily_epub_enabled,
            daily_epub_time: daily_epub_time.unwrap_or_else(|| "0 0 6 * * *".to_string()),
        })
    }

    /// Start the scheduler with all jobs
    pub async fn start(&mut self) -> Result<()> {
        // Job 1: Update feeds every 30 minutes
        let rss_service = Arc::clone(&self.rss_service);
        let update_job = Job::new_async("0 */30 * * * *", move |_uuid, _lock| {
            let service = Arc::clone(&rss_service);
            Box::pin(async move {
                info!("RSS Scheduler: Starting feed update cycle");
                
                // Get feeds due for update
                match service.get_feeds_due_for_update() {
                    Ok(feeds) => {
                        info!("RSS Scheduler: Found {} feeds to update", feeds.len());
                        
                        for feed in feeds {
                            info!("RSS Scheduler: Updating feed {} - {}", feed.id, feed.title.as_deref().unwrap_or("Untitled"));
                            
                            match service.update_feed_articles(feed.id).await {
                                Ok(count) => {
                                    info!("RSS Scheduler: Feed {} updated - {} new articles", feed.id, count);
                                    
                                    // Schedule next check
                                    if let Err(e) = service.schedule_next_check(feed.id) {
                                        error!("RSS Scheduler: Failed to schedule next check for feed {}: {}", feed.id, e);
                                    }
                                }
                                Err(e) => {
                                    error!("RSS Scheduler: Failed to update feed {}: {}", feed.id, e);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!("RSS Scheduler: Failed to get feeds for update: {}", e);
                    }
                }
            })
        })?;

        self.scheduler.add(update_job).await?;
        info!("RSS Scheduler: Added feed update job (every 30 minutes)");

        // Job 2: Daily EPUB generation (if enabled)
        if self.daily_epub_enabled {
            let rss_service = Arc::clone(&self.rss_service);
            let cron_schedule = self.daily_epub_time.clone();
            
            let daily_epub_job = Job::new_async(cron_schedule.as_str(), move |_uuid, _lock| {
                let service = Arc::clone(&rss_service);
                Box::pin(async move {
                    info!("RSS Scheduler: Starting daily EPUB generation");
                    
                    let options = DailyEpubOptions::default();
                    match service.generate_daily_epub(options).await {
                        Ok(path) => {
                            info!("RSS Scheduler: Daily EPUB generated successfully at {:?}", path);
                        }
                        Err(e) => {
                            warn!("RSS Scheduler: Failed to generate daily EPUB: {}", e);
                        }
                    }
                })
            })?;

            self.scheduler.add(daily_epub_job).await?;
            info!("RSS Scheduler: Added daily EPUB job (schedule: {})", self.daily_epub_time);
        }

        // Start the scheduler
        self.scheduler.start().await?;
        info!("RSS Scheduler: Started successfully");

        Ok(())
    }

    /// Stop the scheduler
    pub async fn stop(&mut self) -> Result<()> {
        self.scheduler.shutdown().await?;
        info!("RSS Scheduler: Stopped");
        Ok(())
    }

    /// Enable/disable daily EPUB generation
    pub fn set_daily_epub_enabled(&mut self, enabled: bool) {
        self.daily_epub_enabled = enabled;
    }

    /// Update daily EPUB generation time
    pub fn set_daily_epub_time(&mut self, cron_schedule: String) {
        self.daily_epub_time = cron_schedule;
    }

    /// Manually trigger feed update (runs immediately)
    pub async fn trigger_feed_update(&self) -> Result<()> {
        info!("RSS Scheduler: Manual feed update triggered");
        
        let feeds = self.rss_service.get_feeds_due_for_update()?;
        info!("RSS Scheduler: Found {} feeds to update", feeds.len());
        
        for feed in feeds {
            match self.rss_service.update_feed_articles(feed.id).await {
                Ok(count) => {
                    info!("RSS Scheduler: Feed {} updated - {} new articles", feed.id, count);
                    self.rss_service.schedule_next_check(feed.id)?;
                }
                Err(e) => {
                    error!("RSS Scheduler: Failed to update feed {}: {}", feed.id, e);
                }
            }
        }

        Ok(())
    }

    /// Manually trigger daily EPUB generation (runs immediately)
    pub async fn trigger_daily_epub(&self, options: Option<DailyEpubOptions>) -> Result<std::path::PathBuf> {
        info!("RSS Scheduler: Manual daily EPUB generation triggered");
        
        let opts = options.unwrap_or_default();
        let path = self.rss_service.generate_daily_epub(opts).await?;
        
        info!("RSS Scheduler: Daily EPUB generated at {:?}", path);
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_scheduler_creation() {
        let temp_dir = std::env::temp_dir().join("shiori-test-scheduler");
        std::fs::create_dir_all(&temp_dir).unwrap();
        
        let db = Arc::new(Database::new(&temp_dir.join("test.db")).unwrap());
        let rss_service = Arc::new(RssService::new(db, temp_dir).unwrap());
        
        let scheduler = RssScheduler::new(rss_service, true, None).await;
        assert!(scheduler.is_ok());
    }

    #[test]
    fn test_cron_schedule_default() {
        // Just verify the format is valid
        let schedule = "0 0 6 * * *";
        assert_eq!(schedule.split_whitespace().count(), 6);
    }
}
