/// Conversion Engine
/// 
/// Handles format conversion with worker queue and job tracking.
/// Supports conversions between all format pairs using pure Rust implementations.

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use uuid::Uuid;
use printpdf::*;
use std::fs::File;
use std::io::BufWriter;

use crate::services::epub_builder::{split_text_into_chapters, EpubBuilder, EpubMetadata};
use crate::services::format_adapter::{BookFormatAdapter, FormatError, FormatResult};
use crate::services::format_detection::detect_format;
use crate::services::adapters::*;

/// Conversion job status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConversionStatus {
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

/// Conversion job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionJob {
    pub id: Uuid,
    pub source_path: PathBuf,
    pub target_path: PathBuf,
    pub source_format: String,
    pub target_format: String,
    pub status: ConversionStatus,
    pub progress: f32,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

/// Conversion queue
type ConversionQueue = VecDeque<ConversionJob>;

/// Conversion engine with worker pool
pub struct ConversionEngine {
    queue: Arc<Mutex<ConversionQueue>>,
    job_tracker: Arc<DashMap<Uuid, ConversionJob>>,
    shutdown: Arc<Mutex<bool>>,
    worker_count: usize,
    workers_started: std::sync::Mutex<bool>,
}

impl ConversionEngine {
    /// Create a new conversion engine with specified worker count.
    /// Workers are spawned lazily when the first job is submitted.
    pub fn new(worker_count: usize) -> Self {
        let queue = Arc::new(Mutex::new(VecDeque::new()));
        let job_tracker = Arc::new(DashMap::new());
        let shutdown = Arc::new(Mutex::new(false));
        
        log::info!("[ConversionEngine] Created with {} workers (lazy start)", worker_count);
        
        Self {
            queue,
            job_tracker,
            shutdown,
            worker_count,
            workers_started: std::sync::Mutex::new(false),
        }
    }
    
    /// Ensure workers are spawned (must be called from async context)
    fn ensure_workers(&self) {
        let mut started = self.workers_started.lock().unwrap();
        if !*started {
            for worker_id in 0..self.worker_count {
                let queue_clone = self.queue.clone();
                let tracker_clone = self.job_tracker.clone();
                let shutdown_clone = self.shutdown.clone();
                
                tokio::spawn(async move {
                    Self::worker_loop(worker_id, queue_clone, tracker_clone, shutdown_clone).await;
                });
            }
            *started = true;
            log::info!("[ConversionEngine] Workers started");
        }
    }
    
    /// Submit a conversion job
    pub async fn submit_conversion(
        &self,
        source: PathBuf,
        target_format: &str,
        output_dir: Option<PathBuf>,
    ) -> FormatResult<Uuid> {
        // Lazily start workers on first job submission
        self.ensure_workers();
        // Detect source format
        let source_format_info = detect_format(&source).await?;
        let source_format = source_format_info.format.clone();
        
        // Generate target path
        let target_path = if let Some(dir) = output_dir {
            let filename = source.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("converted");
            dir.join(format!("{}.{}", filename, target_format))
        } else {
            source.with_extension(target_format)
        };
        
        let job_id = Uuid::new_v4();
        let job = ConversionJob {
            id: job_id,
            source_path: source,
            target_path,
            source_format,
            target_format: target_format.to_string(),
            status: ConversionStatus::Queued,
            progress: 0.0,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            error: None,
        };
        
        // Add to tracker and queue
        self.job_tracker.insert(job_id, job.clone());
        
        // Store format info before moving job
        let source_fmt = job.source_format.clone();
        self.queue.lock().await.push_back(job);
        
        log::info!(
            "[ConversionEngine] Job {} queued: {} -> {}",
            job_id,
            source_fmt,
            target_format
        );
        
        Ok(job_id)
    }
    
    /// Get job status
    pub fn get_job_status(&self, job_id: &Uuid) -> Option<ConversionJob> {
        self.job_tracker.get(job_id).map(|r| r.value().clone())
    }
    
    /// Cancel a job
    pub async fn cancel_job(&self, job_id: &Uuid) -> FormatResult<()> {
        if let Some(mut job) = self.job_tracker.get_mut(job_id) {
            if job.status == ConversionStatus::Queued {
                job.status = ConversionStatus::Cancelled;
                job.error = Some("Cancelled by user".to_string());
                return Ok(());
            }
        }
        Err(FormatError::ConversionError(
            "Job not found or already processing".to_string(),
        ))
    }
    
    /// Get all jobs
    pub fn get_all_jobs(&self) -> Vec<ConversionJob> {
        self.job_tracker
            .iter()
            .map(|r| r.value().clone())
            .collect()
    }
    
    /// Shutdown the engine gracefully
    pub async fn shutdown(&self) {
        *self.shutdown.lock().await = true;
        log::info!("[ConversionEngine] Shutdown signal sent");
    }
    
    /// Worker loop
    async fn worker_loop(
        worker_id: usize,
        queue: Arc<Mutex<ConversionQueue>>,
        tracker: Arc<DashMap<Uuid, ConversionJob>>,
        shutdown: Arc<Mutex<bool>>,
    ) {
        log::info!("[ConversionWorker-{}] Started", worker_id);
        
        loop {
            // Check shutdown signal
            if *shutdown.lock().await {
                log::info!("[ConversionWorker-{}] Shutting down", worker_id);
                break;
            }
            
            // Get next job from queue
            let job = {
                let mut q = queue.lock().await;
                q.pop_front()
            };
            
            if let Some(job) = job {
                // Skip cancelled jobs
                if job.status == ConversionStatus::Cancelled {
                    continue;
                }
                
                log::info!(
                    "[ConversionWorker-{}] Processing job {} ({} -> {})",
                    worker_id,
                    job.id,
                    job.source_format,
                    job.target_format
                );
                
                // Update status to processing
                if let Some(mut tracked_job) = tracker.get_mut(&job.id) {
                    tracked_job.status = ConversionStatus::Processing;
                    tracked_job.started_at = Some(Utc::now());
                    tracked_job.progress = 10.0;
                }
                
                // Execute conversion
                let result = Self::execute_conversion(&job).await;
                
                // Update job status
                if let Some(mut tracked_job) = tracker.get_mut(&job.id) {
                    match result {
                        Ok(_) => {
                            tracked_job.status = ConversionStatus::Completed;
                            tracked_job.progress = 100.0;
                            tracked_job.completed_at = Some(Utc::now());
                            log::info!("[ConversionWorker-{}] Job {} completed", worker_id, job.id);
                        }
                        Err(e) => {
                            tracked_job.status = ConversionStatus::Failed;
                            tracked_job.error = Some(e.to_string());
                            log::error!(
                                "[ConversionWorker-{}] Job {} failed: {}",
                                worker_id,
                                job.id,
                                e
                            );
                        }
                    }
                }
            } else {
                // Queue empty, sleep briefly
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }
    
    /// Execute conversion based on format pair
    async fn execute_conversion(job: &ConversionJob) -> FormatResult<()> {
        match (job.source_format.as_str(), job.target_format.as_str()) {
            // TXT conversions
            ("txt", "epub") => Self::txt_to_epub(&job.source_path, &job.target_path).await,
            
            // HTML conversions
            ("html", "epub") => Self::html_to_epub(&job.source_path, &job.target_path).await,
            ("html", "txt") => Self::html_to_txt(&job.source_path, &job.target_path).await,
            
            // MOBI/AZW3 conversions
            ("mobi", "epub") | ("azw3", "epub") => {
                Self::mobi_to_epub(&job.source_path, &job.target_path).await
            }
            
            // DOCX conversions
            ("docx", "epub") => Self::docx_to_epub(&job.source_path, &job.target_path).await,
            ("docx", "txt") => Self::docx_to_txt(&job.source_path, &job.target_path).await,
            
            // FB2 conversions
            ("fb2", "epub") => Self::fb2_to_epub(&job.source_path, &job.target_path).await,
            ("fb2", "txt") => Self::fb2_to_txt(&job.source_path, &job.target_path).await,
            
            // PDF conversions
            ("pdf", "epub") => Self::pdf_to_epub(&job.source_path, &job.target_path).await,
            ("pdf", "txt") => Self::pdf_to_txt(&job.source_path, &job.target_path).await,

            // EPUB -> PDF
            ("epub", "pdf") => Self::epub_to_pdf(&job.source_path, &job.target_path).await,

            // Unsupported
            _ => Err(FormatError::ConversionNotSupported {
                from: job.source_format.clone(),
                to: job.target_format.clone(),
            }),
        }
    }
    
    /// Convert TXT to EPUB
    async fn txt_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = TxtFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        let content = tokio::fs::read_to_string(source).await?;
        
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            ..Default::default()
        });
        
        // Split into chapters
        let chapters = split_text_into_chapters(&content);
        for (title, content) in chapters {
            builder.add_chapter(title, content);
        }
        
        builder.generate(target).await?;
        
        log::info!("[Conversion] TXT -> EPUB completed: {}", target.display());
        Ok(())
    }
    
    /// Convert HTML to EPUB
    async fn html_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = HtmlFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        let content = tokio::fs::read_to_string(source).await?;
        
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            description: metadata.description.clone(),
            ..Default::default()
        });
        
        // Add as single chapter (HTML is usually one document)
        builder.add_chapter(metadata.title.clone(), content);
        
        builder.generate(target).await?;
        
        log::info!("[Conversion] HTML -> EPUB completed: {}", target.display());
        Ok(())
    }
    
    /// Convert HTML to TXT
    async fn html_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let content = tokio::fs::read_to_string(source).await?;
        
        // Simple HTML tag removal (in production, use html2text crate)
        let text = content
            .replace("<br>", "\n")
            .replace("<br/>", "\n")
            .replace("<p>", "\n")
            .replace("</p>", "\n");
        
        let text = regex::Regex::new(r"<[^>]*>")
            .unwrap()
            .replace_all(&text, "");
        
        tokio::fs::write(target, text.as_bytes()).await?;
        
        log::info!("[Conversion] HTML -> TXT completed: {}", target.display());
        Ok(())
    }
    
    /// Convert MOBI to EPUB
    async fn mobi_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = MobiFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        
        // Read MOBI content using public adapter method
        let content = MobiFormatAdapter::extract_content(source).await?;
        
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            publisher: metadata.publisher.clone(),
            description: metadata.description.clone(),
            isbn: metadata.isbn.clone(),
            ..Default::default()
        });
        
        // Add content as single chapter (MOBI content is HTML)
        builder.add_chapter(metadata.title.clone(), content);
        
        builder.generate(target).await?;
        
        log::info!("[Conversion] MOBI -> EPUB completed: {}", target.display());
        Ok(())
    }
    
    /// Convert DOCX to EPUB
    async fn docx_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = DocxFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        
        // Read DOCX content
        let file_data = tokio::fs::read(source).await?;
        let doc = docx_rs::read_docx(&file_data)
            .map_err(|e| FormatError::ConversionError(format!("Failed to parse DOCX: {}", e)))?;
        
        // Extract text (simplified - in production, preserve formatting)
        let mut content = String::new();
        for child in &doc.document.children {
            if let docx_rs::DocumentChild::Paragraph(para) = child {
                for child in &para.children {
                    if let docx_rs::ParagraphChild::Run(run) = child {
                        for child in &run.children {
                            if let docx_rs::RunChild::Text(t) = child {
                                content.push_str(&t.text);
                                content.push(' ');
                            }
                        }
                    }
                }
                content.push_str("\n\n");
            }
        }
        
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            description: metadata.description.clone(),
            ..Default::default()
        });
        
        // Split into chapters
        let chapters = split_text_into_chapters(&content);
        for (title, content) in chapters {
            builder.add_chapter(title, content);
        }
        
        builder.generate(target).await?;
        
        log::info!("[Conversion] DOCX -> EPUB completed: {}", target.display());
        Ok(())
    }
    
    /// Convert DOCX to TXT
    async fn docx_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let file_data = tokio::fs::read(source).await?;
        let doc = docx_rs::read_docx(&file_data)
            .map_err(|e| FormatError::ConversionError(format!("Failed to parse DOCX: {}", e)))?;
        
        let mut content = String::new();
        for child in &doc.document.children {
            if let docx_rs::DocumentChild::Paragraph(para) = child {
                for child in &para.children {
                    if let docx_rs::ParagraphChild::Run(run) = child {
                        for child in &run.children {
                            if let docx_rs::RunChild::Text(t) = child {
                                content.push_str(&t.text);
                                content.push(' ');
                            }
                        }
                    }
                }
                content.push('\n');
            }
        }
        
        tokio::fs::write(target, content).await?;
        
        log::info!("[Conversion] DOCX -> TXT completed: {}", target.display());
        Ok(())
    }
    
    /// Convert FB2 to EPUB
    async fn fb2_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = Fb2FormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        let content = tokio::fs::read_to_string(source).await?;
        
        // Extract text from FB2 XML (simplified)
        let text = Fb2FormatAdapter::extract_text(&content);
        
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            publisher: metadata.publisher.clone(),
            description: metadata.description.clone(),
            isbn: metadata.isbn.clone(),
            ..Default::default()
        });
        
        // Add as single chapter
        builder.add_chapter(metadata.title.clone(), text);
        
        builder.generate(target).await?;
        
        log::info!("[Conversion] FB2 -> EPUB completed: {}", target.display());
        Ok(())
    }
    
    /// Convert FB2 to TXT
    async fn fb2_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let content = tokio::fs::read_to_string(source).await?;
        let text = Fb2FormatAdapter::extract_text(&content);
        
        tokio::fs::write(target, text).await?;
        
        log::info!("[Conversion] FB2 -> TXT completed: {}", target.display());
        Ok(())
    }
    /// Convert PDF to EPUB
    async fn pdf_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let text = PdfFormatAdapter::extract_content(source)?;
        
        let adapter = PdfFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title,
            authors: metadata.authors,
            language: "en".to_string(),
            description: metadata.description,
            ..Default::default()
        });
        
        // Add content as one chapter
        builder.add_chapter("Content".to_string(), text);
        
        builder.generate(target).await?;
        
        log::info!("[Conversion] PDF -> EPUB completed: {}", target.display());
        Ok(())
    }

    /// Convert PDF to TXT
    async fn pdf_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let text = PdfFormatAdapter::extract_content(source)?;
        tokio::fs::write(target, text).await?;
        log::info!("[Conversion] PDF -> TXT completed: {}", target.display());
        Ok(())
    }

    /// Convert EPUB to PDF
    async fn epub_to_pdf(source: &Path, target: &Path) -> FormatResult<()> {
        use ::epub::doc::EpubDoc;

        // Open EPUB
        // Use std::fs::File for EpubDoc as it is synchronous
        // But EpubDoc::new takes a path
        let mut doc = EpubDoc::new(source)
            .map_err(|e| FormatError::ConversionError(format!("Failed to open EPUB: {}", e)))?;
        
        let title = source.file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or("Untitled".to_string());
        
        // Create PDF
        let (pdf_doc, page1, layer1) = PdfDocument::new(title, Mm(210.0), Mm(297.0), "Layer 1");
        let font = pdf_doc.add_builtin_font(BuiltinFont::TimesRoman)
            .map_err(|e| FormatError::ConversionError(format!("Font error: {}", e)))?;
            
        let mut current_layer = pdf_doc.get_page(page1).get_layer(layer1);
        let mut current_y = Mm(280.0);
        let left_margin = Mm(10.0);
        let font_size = 11.0;
        let line_height = Mm(5.0);
        
        // Helper to strip HTML
        let strip_html = |html: &str| -> String {
            let text = html.replace("<br>", "\n").replace("</p>", "\n\n").replace("<p>", "");
            regex::Regex::new(r"<[^>]*>").unwrap().replace_all(&text, "").to_string()
        };

        // Extract and Render Text
        // We'll process the current chapter loops
        let mut chapters_processed = 0;
        
        // Process current (first) chapter if any
        // Note: epub crate behavior: new() loads valid doc.
        // We iterate through spine using methods
        
        // Reset to start just in case
        // properties of EpubDoc don't allow "reset" easily, but newly opened is at start.
        
        // Loop all chapters
        let _len = doc.get_num_chapters();
        let mut i = 0;
        while i < doc.get_num_chapters() {
            let _ = doc.set_current_chapter(i);
            if let Some((content, _)) = doc.get_current_str() {
                let text = strip_html(&content);
                
                for line in text.lines() {
                    // Simple wrap logic
                    let max_chars = 95; // approx for 11pt font on A4
                    let chars: Vec<char> = line.chars().collect();
                    
                    if chars.is_empty() {
                         current_y -= line_height;
                    } else {
                        for chunk in chars.chunks(max_chars) {
                            let chunk_str: String = chunk.iter().collect();
                            if !chunk_str.trim().is_empty() {
                                current_layer.use_text(chunk_str, font_size, left_margin, current_y, &font);
                                current_y -= line_height;
                                
                                if current_y < Mm(20.0) {
                                    let (page, layer) = pdf_doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
                                    current_layer = pdf_doc.get_page(page).get_layer(layer);
                                    current_y = Mm(280.0);
                                }
                            }
                        }
                    }
                }
                // Chapter break
                current_y -= line_height * 2.0;
                
                 if current_y < Mm(20.0) {
                    let (page, layer) = pdf_doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
                    current_layer = pdf_doc.get_page(page).get_layer(layer);
                    current_y = Mm(280.0);
                }
            }
            i += 1;
            chapters_processed += 1;
        }

        if chapters_processed == 0 {
             // Try getting resources if spine iteration failed
             // But usually spine iteration works
        }

        let file = File::create(target)?;
        let mut writer = BufWriter::new(file);
        pdf_doc.save(&mut writer)
             .map_err(|e| FormatError::ConversionError(format!("Failed to save PDF: {}", e)))?;

        log::info!("[Conversion] EPUB -> PDF completed: {}", target.display());
        Ok(())
    }
}

impl Default for ConversionEngine {
    fn default() -> Self {
        Self::new(4) // 4 workers by default
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_conversion_engine_creation() {
        let engine = ConversionEngine::new(2);
        assert_eq!(engine.worker_count, 2);
        engine.shutdown().await;
    }
    
    #[tokio::test]
    async fn test_job_tracking() {
        let engine = ConversionEngine::new(1);
        
        let source = PathBuf::from("test.txt");
        let job_id = engine
            .submit_conversion(source, "epub", None)
            .await;
        
        // Job submission will fail because file doesn't exist,
        // but this tests the API
        assert!(job_id.is_err());
        
        engine.shutdown().await;
    }
}
