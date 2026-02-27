/// Cover Management Service
/// 
/// Handles cover extraction, generation, and caching with three resolution levels.
/// Implements geometric pattern generation for books without covers.

use image::{DynamicImage, Rgba, RgbaImage};
use imageproc::drawing::{draw_filled_circle_mut, draw_filled_rect_mut, draw_text_mut};
use imageproc::rect::Rect;
use lru::LruCache;
use ab_glyph::{FontArc, PxScale};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::num::NonZeroUsize;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::services::format_adapter::{BookMetadata, CoverImage, FormatResult};

const THUMBNAIL_WIDTH: u32 = 200;
const THUMBNAIL_HEIGHT: u32 = 300;
const MEDIUM_WIDTH: u32 = 400;
const MEDIUM_HEIGHT: u32 = 600;

/// Set of cover images at different resolutions
#[derive(Clone, Debug)]
pub struct CoverSet {
    pub uuid: Uuid,
    pub thumbnail: PathBuf,   // 200x300px
    pub medium: PathBuf,       // 400x600px
    pub full: PathBuf,         // Original resolution
}

/// Color scheme for generated covers
#[derive(Debug, Clone)]
struct ColorScheme {
    primary: Rgba<u8>,
    secondary: Rgba<u8>,
    text_color: Rgba<u8>,
}

/// Pattern templates for geometric covers
#[derive(Debug, Clone, Copy)]
pub enum PatternTemplate {
    CircularWaves,
    GeometricGrid,
    DiagonalStripes,
    Polygons,
    Gradient,
}

/// Cover generation service
pub struct CoverGenerator {
    font: Option<FontArc>,
}

/// DejaVu Sans font embedded at compile time (Bitstream Vera / Arev license — free to bundle)
const EMBEDDED_FONT: &[u8] = include_bytes!("../../assets/fonts/DejaVuSans.ttf");

impl CoverGenerator {
    /// Create a new cover generator with the embedded font
    pub fn new() -> FormatResult<Self> {
        let font = FontArc::try_from_slice(EMBEDDED_FONT).map_err(|e| {
            crate::services::format_adapter::FormatError::ConversionError(
                format!("Failed to load embedded font: {}", e),
            )
        })?;
        
        Ok(Self { font: Some(font) })
    }
    
    /// Create a new generator with fallback (no text if font fails to load)
    pub fn new_with_fallback() -> Self {
        match FontArc::try_from_slice(EMBEDDED_FONT) {
            Ok(font) => {
                log::info!("Cover generator created with embedded DejaVu Sans font");
                Self { font: Some(font) }
            }
            Err(e) => {
                log::warn!("Cover generator: failed to load embedded font ({e}), covers will be pattern-only");
                Self { font: None }
            }
        }
    }
    
    /// Generate a geometric pattern cover
    pub fn create_geometric_cover(&self, metadata: &BookMetadata) -> FormatResult<CoverImage> {
        // Generate color scheme from title hash
        let colors = self.generate_color_scheme(&metadata.title);
        
        // Select pattern based on title/author hash
        let pattern = self.select_pattern(metadata);
        
        // Create canvas (400x600)
        let mut img = RgbaImage::new(MEDIUM_WIDTH, MEDIUM_HEIGHT);
        
        // Draw background pattern
        self.draw_pattern(&mut img, pattern, &colors);
        
        // Draw text overlay
        self.draw_title(&mut img, &metadata.title, &colors);
        
        if !metadata.authors.is_empty() {
            let authors = metadata.authors.join(", ");
            self.draw_author(&mut img, &authors, &colors);
        }
        
        Ok(CoverImage::new(DynamicImage::ImageRgba8(img)))
    }
    
    /// Generate color scheme from seed string
    fn generate_color_scheme(&self, seed: &str) -> ColorScheme {
        let mut hasher = DefaultHasher::new();
        seed.hash(&mut hasher);
        let hash = hasher.finish();
        
        // Generate hue from hash
        let hue = (hash % 360) as f32;
        let saturation = 0.7;
        let lightness = 0.5;
        
        // Convert HSL to RGB for primary color
        let primary = self.hsl_to_rgba(hue, saturation, lightness);
        
        // Complementary color (opposite on color wheel)
        let secondary = self.hsl_to_rgba((hue + 180.0) % 360.0, saturation * 0.85, lightness * 1.2);
        
        // Text color (black or white based on primary brightness)
        let text_color = if self.is_dark(&primary) {
            Rgba([255, 255, 255, 255])
        } else {
            Rgba([30, 30, 30, 255])
        };
        
        ColorScheme {
            primary,
            secondary,
            text_color,
        }
    }
    
    /// Convert HSL to RGBA
    fn hsl_to_rgba(&self, h: f32, s: f32, l: f32) -> Rgba<u8> {
        let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
        let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
        let m = l - c / 2.0;
        
        let (r, g, b) = match h as u32 {
            0..=59 => (c, x, 0.0),
            60..=119 => (x, c, 0.0),
            120..=179 => (0.0, c, x),
            180..=239 => (0.0, x, c),
            240..=299 => (x, 0.0, c),
            _ => (c, 0.0, x),
        };
        
        Rgba([
            ((r + m) * 255.0) as u8,
            ((g + m) * 255.0) as u8,
            ((b + m) * 255.0) as u8,
            255,
        ])
    }
    
    /// Check if color is dark
    fn is_dark(&self, color: &Rgba<u8>) -> bool {
        let r = color[0] as f32;
        let g = color[1] as f32;
        let b = color[2] as f32;
        
        // Calculate relative luminance
        let luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
        luminance < 0.5
    }
    
    /// Select pattern based on metadata
    fn select_pattern(&self, metadata: &BookMetadata) -> PatternTemplate {
        let mut hasher = DefaultHasher::new();
        
        // Hash title + first author
        metadata.title.hash(&mut hasher);
        if let Some(author) = metadata.authors.first() {
            author.hash(&mut hasher);
        }
        
        let hash = hasher.finish();
        
        // Select pattern based on hash modulo
        match hash % 5 {
            0 => PatternTemplate::CircularWaves,
            1 => PatternTemplate::GeometricGrid,
            2 => PatternTemplate::DiagonalStripes,
            3 => PatternTemplate::Polygons,
            _ => PatternTemplate::Gradient,
        }
    }
    
    /// Draw pattern on canvas
    fn draw_pattern(&self, img: &mut RgbaImage, pattern: PatternTemplate, colors: &ColorScheme) {
        match pattern {
            PatternTemplate::CircularWaves => self.draw_circular_waves(img, colors),
            PatternTemplate::GeometricGrid => self.draw_geometric_grid(img, colors),
            PatternTemplate::DiagonalStripes => self.draw_diagonal_stripes(img, colors),
            PatternTemplate::Polygons => self.draw_polygons(img, colors),
            PatternTemplate::Gradient => self.draw_gradient(img, colors),
        }
    }
    
    /// Draw circular waves pattern
    fn draw_circular_waves(&self, img: &mut RgbaImage, colors: &ColorScheme) {
        let (width, height) = img.dimensions();
        
        // Fill background with primary color
        for pixel in img.pixels_mut() {
            *pixel = colors.primary;
        }
        
        // Draw concentric circles
        let center_x = width as i32 / 2;
        let center_y = height as i32 / 3;
        
        for i in (0..10).rev() {
            let radius = i * 60 + 30;
            let color = if i % 2 == 0 {
                colors.secondary
            } else {
                colors.primary
            };
            
            draw_filled_circle_mut(img, (center_x, center_y), radius, color);
        }
    }
    
    /// Draw geometric grid pattern
    fn draw_geometric_grid(&self, img: &mut RgbaImage, colors: &ColorScheme) {
        let (width, height) = img.dimensions();
        
        // Fill background
        for pixel in img.pixels_mut() {
            *pixel = colors.primary;
        }
        
        // Draw grid of rectangles
        let cell_size = 60;
        for y in (0..height).step_by(cell_size as usize) {
            for x in (0..width).step_by(cell_size as usize) {
                let color = if (x / cell_size + y / cell_size) % 2 == 0 {
                    colors.secondary
                } else {
                    colors.primary
                };
                
                let rect = Rect::at(x as i32, y as i32)
                    .of_size(cell_size - 2, cell_size - 2);
                draw_filled_rect_mut(img, rect, color);
            }
        }
    }
    
    /// Draw diagonal stripes pattern
    fn draw_diagonal_stripes(&self, img: &mut RgbaImage, colors: &ColorScheme) {
        let (width, height) = img.dimensions();
        
        for y in 0..height {
            for x in 0..width {
                let diagonal = (x + y) / 40;
                let color = if diagonal % 2 == 0 {
                    colors.primary
                } else {
                    colors.secondary
                };
                img.put_pixel(x, y, color);
            }
        }
    }
    
    /// Draw polygons pattern
    fn draw_polygons(&self, img: &mut RgbaImage, colors: &ColorScheme) {
        // Fill background
        for pixel in img.pixels_mut() {
            *pixel = colors.primary;
        }
        
        // Draw triangular pattern
        let (width, height) = img.dimensions();
        let size = 80;
        
        for y in (0..height as i32).step_by(size as usize) {
            for x in (0..width as i32).step_by(size as usize) {
                let color = if (x / size + y / size) % 2 == 0 {
                    colors.secondary
                } else {
                    colors.primary
                };
                
                // Draw diamond shape
                for dy in 0..size {
                    for dx in 0..size {
                        if (dx - size / 2).abs() + (dy - size / 2).abs() < size / 2 {
                            let px = (x + dx) as u32;
                            let py = (y + dy) as u32;
                            if px < width && py < height {
                                img.put_pixel(px, py, color);
                            }
                        }
                    }
                }
            }
        }
    }
    
    /// Draw gradient pattern
    fn draw_gradient(&self, img: &mut RgbaImage, colors: &ColorScheme) {
        let (width, height) = img.dimensions();
        
        for y in 0..height {
            let t = y as f32 / height as f32;
            
            // Interpolate between primary and secondary
            let r = (colors.primary[0] as f32 * (1.0 - t) + colors.secondary[0] as f32 * t) as u8;
            let g = (colors.primary[1] as f32 * (1.0 - t) + colors.secondary[1] as f32 * t) as u8;
            let b = (colors.primary[2] as f32 * (1.0 - t) + colors.secondary[2] as f32 * t) as u8;
            
            let color = Rgba([r, g, b, 255]);
            
            for x in 0..width {
                img.put_pixel(x, y, color);
            }
        }
    }
    
    /// Draw title text with shadow (word-wrapped)
    fn draw_title(&self, img: &mut RgbaImage, title: &str, colors: &ColorScheme) {
        // Skip text drawing if no font available
        let font = match &self.font {
            Some(f) => f,
            None => return,
        };
        
        let max_width = MEDIUM_WIDTH - 40; // 20px padding on each side
        let font_size = self.calculate_font_size_wrapped(title, max_width, font, 48.0, 20.0);
        let scale = PxScale::from(font_size);
        let line_height = (font_size * 1.3) as i32;
        
        // Word-wrap title
        let lines = self.wrap_text(title, max_width, scale, font);
        
        // Center vertically around 45% of image height
        let total_text_height = lines.len() as i32 * line_height;
        let start_y = (MEDIUM_HEIGHT as f32 * 0.45) as i32 - total_text_height / 2;
        
        for (i, line) in lines.iter().enumerate() {
            let y_pos = start_y + i as i32 * line_height;
            
            // Draw shadow
            let shadow_color = Rgba([0, 0, 0, 100]);
            draw_text_mut(img, shadow_color, 22, y_pos + 2, scale, font, line);
            
            // Draw text
            draw_text_mut(img, colors.text_color, 20, y_pos, scale, font, line);
        }
    }
    
    /// Draw author text
    fn draw_author(&self, img: &mut RgbaImage, author: &str, colors: &ColorScheme) {
        // Skip text drawing if no font available
        let font = match &self.font {
            Some(f) => f,
            None => return,
        };
        
        let max_width = MEDIUM_WIDTH - 40;
        let font_size = self.calculate_font_size_wrapped(author, max_width, font, 24.0, 16.0);
        let scale = PxScale::from(font_size);
        let y_pos = (MEDIUM_HEIGHT as f32 * 0.70) as i32;
        
        // Word-wrap author if needed
        let lines = self.wrap_text(author, max_width, scale, font);
        let line_height = (font_size * 1.3) as i32;
        
        for (i, line) in lines.iter().enumerate() {
            let y = y_pos + i as i32 * line_height;
            
            // Draw shadow
            let shadow_color = Rgba([0, 0, 0, 100]);
            draw_text_mut(img, shadow_color, 22, y + 2, scale, font, &line);
            
            // Draw text
            draw_text_mut(img, colors.text_color, 20, y, scale, font, &line);
        }
    }
    
    /// Calculate font size that fits text within max_width (accounting for wrapping up to ~3 lines)
    fn calculate_font_size_wrapped(
        &self,
        text: &str,
        max_width: u32,
        font: &FontArc,
        max_size: f32,
        min_size: f32,
    ) -> f32 {
        let mut size = max_size;
        
        while size > min_size {
            let scale = PxScale::from(size);
            let lines = self.wrap_text(text, max_width, scale, font);
            
            // Accept if it fits in 3 lines or fewer
            if lines.len() <= 3 {
                return size;
            }
            
            size -= 2.0;
        }
        
        min_size
    }
    
    /// Word-wrap text to fit within max_width pixels
    fn wrap_text(&self, text: &str, max_width: u32, scale: PxScale, font: &FontArc) -> Vec<String> {
        let words: Vec<&str> = text.split_whitespace().collect();
        if words.is_empty() {
            return vec![text.to_string()];
        }
        
        let mut lines: Vec<String> = Vec::new();
        let mut current_line = String::new();
        
        for word in words {
            let test_line = if current_line.is_empty() {
                word.to_string()
            } else {
                format!("{} {}", current_line, word)
            };
            
            let width = self.measure_text_width(&test_line, scale, font);
            
            if width > max_width as i32 && !current_line.is_empty() {
                lines.push(current_line);
                current_line = word.to_string();
            } else {
                current_line = test_line;
            }
        }
        
        if !current_line.is_empty() {
            lines.push(current_line);
        }
        
        if lines.is_empty() {
            lines.push(text.to_string());
        }
        
        lines
    }
    
    /// Measure text width at given scale
    fn measure_text_width(&self, text: &str, scale: PxScale, font: &FontArc) -> i32 {
        use ab_glyph::{Font, ScaleFont};
        
        let scaled_font = font.as_scaled(scale);
        
        let width = text
            .chars()
            .filter_map(|c| {
                let glyph_id = font.glyph_id(c);
                Some(scaled_font.h_advance(glyph_id))
            })
            .sum::<f32>();
        
        width.ceil() as i32
    }
}

impl Default for CoverGenerator {
    fn default() -> Self {
        Self::new_with_fallback()
    }
}

/// Cover service with caching
pub struct CoverService {
    cache: Arc<Mutex<LruCache<Uuid, CoverSet>>>,
    storage_path: PathBuf,
    generator: CoverGenerator,
}

impl CoverService {
    /// Create a new cover service
    pub fn new(storage_path: PathBuf) -> FormatResult<Self> {
        let cache_size = NonZeroUsize::new(500).unwrap(); // Cache up to 500 cover sets
        let cache = Arc::new(Mutex::new(LruCache::new(cache_size)));
        let generator = CoverGenerator::new()?;
        
        Ok(Self {
            cache,
            storage_path,
            generator,
        })
    }
    
    /// Get or generate cover set for a book
    pub async fn get_or_generate_cover(
        &self,
        book_id: Uuid,
        cover_image: Option<CoverImage>,
        metadata: &BookMetadata,
    ) -> FormatResult<CoverSet> {
        // Check cache first
        {
            let mut cache = self.cache.lock().await;
            if let Some(cover_set) = cache.get(&book_id) {
                return Ok(cover_set.clone());
            }
        }
        
        // Generate or use provided cover
        let image = match cover_image {
            Some(img) => img,
            None => self.generator.create_geometric_cover(metadata)?,
        };
        
        // Process and store
        self.process_and_store(book_id, image).await
    }
    
    /// Process cover image and create all resolutions
    async fn process_and_store(&self, book_id: Uuid, image: CoverImage) -> FormatResult<CoverSet> {
        // Create cover directory
        let cover_dir = self.storage_path.join(book_id.to_string());
        tokio::fs::create_dir_all(&cover_dir).await?;
        
        // Generate three resolutions
        let thumb = image::imageops::resize(
            &image.image,
            THUMBNAIL_WIDTH,
            THUMBNAIL_HEIGHT,
            image::imageops::FilterType::Lanczos3,
        );
        
        let medium = image::imageops::resize(
            &image.image,
            MEDIUM_WIDTH,
            MEDIUM_HEIGHT,
            image::imageops::FilterType::Lanczos3,
        );
        
        let full = image.image.clone();
        
        // Save to disk
        let thumb_path = cover_dir.join("thumb.jpg");
        let medium_path = cover_dir.join("medium.jpg");
        let full_path = cover_dir.join("full.jpg");
        
        thumb.save(&thumb_path)?;
        medium.save(&medium_path)?;
        full.save(&full_path)?;
        
        let cover_set = CoverSet {
            uuid: book_id,
            thumbnail: thumb_path,
            medium: medium_path,
            full: full_path,
        };
        
        // Add to cache
        {
            let mut cache = self.cache.lock().await;
            cache.put(book_id, cover_set.clone());
        }
        
        Ok(cover_set)
    }
    
    /// Clear the cover cache
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.lock().await;
        cache.clear();
        log::info!("Cover cache cleared");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_color_scheme_generation() {
        let generator = CoverGenerator::new_with_fallback();
        
        let scheme1 = generator.generate_color_scheme("Test Book");
        let scheme2 = generator.generate_color_scheme("Test Book");
        
        // Same input should give same colors
        assert_eq!(scheme1.primary[0], scheme2.primary[0]);
        
        let scheme3 = generator.generate_color_scheme("Different Book");
        
        // Different input should give different colors
        assert_ne!(scheme1.primary[0], scheme3.primary[0]);
    }
    
    #[test]
    fn test_pattern_selection() {
        let generator = CoverGenerator::new_with_fallback();
        
        let metadata = BookMetadata {
            title: "Test Book".to_string(),
            authors: vec!["Test Author".to_string()],
            ..Default::default()
        };
        
        let pattern = generator.select_pattern(&metadata);
        
        // Pattern should be deterministic
        let pattern2 = generator.select_pattern(&metadata);
        assert!(matches!(pattern, pattern2));
    }
    
    #[tokio::test]
    async fn test_cover_generation() {
        let generator = CoverGenerator::new_with_fallback();
        
        let metadata = BookMetadata {
            title: "The Great Gatsby".to_string(),
            authors: vec!["F. Scott Fitzgerald".to_string()],
            ..Default::default()
        };
        
        let result = generator.create_geometric_cover(&metadata);
        assert!(result.is_ok());
        
        let cover = result.unwrap();
        assert_eq!(cover.width, MEDIUM_WIDTH);
        assert_eq!(cover.height, MEDIUM_HEIGHT);
    }
}
