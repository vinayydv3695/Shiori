/// Preferences IPC Commands
///
/// Handles user preferences, theme, and per-book overrides

use serde::{Deserialize, Serialize};
use tauri::State;
use crate::error::Result;
use crate::AppState;

// ═══════════════════════════════════════════════════════════════
// REQUEST/RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserPreferences {
    pub theme: String,
    pub book: BookPreferences,
    pub manga: MangaPreferences,
    pub auto_start: bool,
    pub default_import_path: String,
    pub ui_density: String,
    pub accent_color: String,
    pub preferred_content_type: String,
    pub ui_scale: f32,
    pub performance_mode: String,
    pub metadata_mode: String,
    pub auto_scan_enabled: bool,
    pub default_manga_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookPreferences {
    pub font_family: String,
    pub font_size: i32,
    pub line_height: f32,
    pub page_width: i32,
    pub scroll_mode: String,
    pub justification: String,
    pub paragraph_spacing: i32,
    pub animation_speed: i32,
    pub hyphenation: bool,
    pub custom_css: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MangaPreferences {
    pub mode: String,
    pub direction: String,
    pub margin_size: i32,
    pub fit_width: bool,
    pub background_color: String,
    pub progress_bar: String,
    pub image_smoothing: bool,
    pub preload_count: i32,
    pub gpu_acceleration: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PreferenceOverride {
    pub book_id: i32,
    pub preferences: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OnboardingState {
    pub completed: bool,
    pub completed_at: Option<String>,
    pub version: i32,
    pub skipped_steps: Vec<String>,
}

// ═══════════════════════════════════════════════════════════════
// IPC COMMANDS
// ═══════════════════════════════════════════════════════════════

/// Get all user preferences (called once on app start)
#[tauri::command]
pub async fn get_user_preferences(state: State<'_, AppState>) -> Result<UserPreferences> {
    let conn = state.db.get_connection()?;
    let prefs = conn.query_row(
        "SELECT 
            theme,
            book_font_family, book_font_size, book_line_height, book_page_width,
            book_scroll_mode, book_justification, book_paragraph_spacing, 
            book_animation_speed, book_hyphenation, book_custom_css,
            manga_mode, manga_direction, manga_margin_size, manga_fit_width,
            manga_background_color, manga_progress_bar, manga_image_smoothing,
            manga_preload_count, manga_gpu_acceleration,
            auto_start, default_import_path, ui_density, accent_color,
            preferred_content_type, ui_scale, performance_mode, 
            metadata_mode, auto_scan_enabled, default_manga_path
        FROM user_preferences WHERE id = 1",
        [],
        |row| {
            Ok(UserPreferences {
                theme: row.get(0)?,
                book: BookPreferences {
                    font_family: row.get(1)?,
                    font_size: row.get(2)?,
                    line_height: row.get(3)?,
                    page_width: row.get(4)?,
                    scroll_mode: row.get(5)?,
                    justification: row.get(6)?,
                    paragraph_spacing: row.get(7)?,
                    animation_speed: row.get(8)?,
                    hyphenation: row.get(9)?,
                    custom_css: row.get(10)?,
                },
                manga: MangaPreferences {
                    mode: row.get(11)?,
                    direction: row.get(12)?,
                    margin_size: row.get(13)?,
                    fit_width: row.get(14)?,
                    background_color: row.get(15)?,
                    progress_bar: row.get(16)?,
                    image_smoothing: row.get(17)?,
                    preload_count: row.get(18)?,
                    gpu_acceleration: row.get(19)?,
                },
                auto_start: row.get(20)?,
                default_import_path: row.get(21)?,
                ui_density: row.get(22)?,
                accent_color: row.get(23)?,
                preferred_content_type: row.get(24).unwrap_or_else(|_| "both".to_string()),
                ui_scale: row.get(25).unwrap_or(1.0),
                performance_mode: row.get(26).unwrap_or_else(|_| "standard".to_string()),
                metadata_mode: row.get(27).unwrap_or_else(|_| "online".to_string()),
                auto_scan_enabled: row.get(28).unwrap_or(true),
                default_manga_path: row.get(29).unwrap_or(None),
            })
        },
    )?;
    
    Ok(prefs)
}

/// Get theme synchronously (for no-flash initialization)
#[tauri::command]
pub async fn get_theme_sync(state: State<'_, AppState>) -> Result<String> {
    let conn = state.db.get_connection()?;
    let theme: String = conn.query_row(
        "SELECT theme FROM user_preferences WHERE id = 1",
        [],
        |row| row.get(0)
    )?;
    
    Ok(theme)
}

/// Update user preferences (partial update)
#[tauri::command]
pub async fn update_user_preferences(
    state: State<'_, AppState>,
    updates: serde_json::Value,
) -> Result<()> {
    let conn = state.db.get_connection()?;
    let mut set_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    
    // Theme
    if let Some(theme) = updates.get("theme").and_then(|v| v.as_str()) {
        set_clauses.push("theme = ?".to_string());
        params.push(Box::new(theme.to_string()));
    }
    
    // Book preferences
    if let Some(book) = updates.get("book") {
        if let Some(font_family) = book.get("fontFamily").and_then(|v| v.as_str()) {
            set_clauses.push("book_font_family = ?".to_string());
            params.push(Box::new(font_family.to_string()));
        }
        if let Some(font_size) = book.get("fontSize").and_then(|v| v.as_i64()) {
            set_clauses.push("book_font_size = ?".to_string());
            params.push(Box::new(font_size as i32));
        }
        if let Some(line_height) = book.get("lineHeight").and_then(|v| v.as_f64()) {
            set_clauses.push("book_line_height = ?".to_string());
            params.push(Box::new(line_height as f32));
        }
        if let Some(page_width) = book.get("pageWidth").and_then(|v| v.as_i64()) {
            set_clauses.push("book_page_width = ?".to_string());
            params.push(Box::new(page_width as i32));
        }
        if let Some(scroll_mode) = book.get("scrollMode").and_then(|v| v.as_str()) {
            set_clauses.push("book_scroll_mode = ?".to_string());
            params.push(Box::new(scroll_mode.to_string()));
        }
        if let Some(justification) = book.get("justification").and_then(|v| v.as_str()) {
            set_clauses.push("book_justification = ?".to_string());
            params.push(Box::new(justification.to_string()));
        }
        if let Some(paragraph_spacing) = book.get("paragraphSpacing").and_then(|v| v.as_i64()) {
            set_clauses.push("book_paragraph_spacing = ?".to_string());
            params.push(Box::new(paragraph_spacing as i32));
        }
        if let Some(animation_speed) = book.get("animationSpeed").and_then(|v| v.as_i64()) {
            set_clauses.push("book_animation_speed = ?".to_string());
            params.push(Box::new(animation_speed as i32));
        }
        if let Some(hyphenation) = book.get("hyphenation").and_then(|v| v.as_bool()) {
            set_clauses.push("book_hyphenation = ?".to_string());
            params.push(Box::new(hyphenation));
        }
        if let Some(custom_css) = book.get("customCSS").and_then(|v| v.as_str()) {
            set_clauses.push("book_custom_css = ?".to_string());
            params.push(Box::new(custom_css.to_string()));
        }
    }
    
    // Manga preferences
    if let Some(manga) = updates.get("manga") {
        if let Some(mode) = manga.get("mode").and_then(|v| v.as_str()) {
            set_clauses.push("manga_mode = ?".to_string());
            params.push(Box::new(mode.to_string()));
        }
        if let Some(direction) = manga.get("direction").and_then(|v| v.as_str()) {
            set_clauses.push("manga_direction = ?".to_string());
            params.push(Box::new(direction.to_string()));
        }
        if let Some(margin_size) = manga.get("marginSize").and_then(|v| v.as_i64()) {
            set_clauses.push("manga_margin_size = ?".to_string());
            params.push(Box::new(margin_size as i32));
        }
        if let Some(fit_width) = manga.get("fitWidth").and_then(|v| v.as_bool()) {
            set_clauses.push("manga_fit_width = ?".to_string());
            params.push(Box::new(fit_width));
        }
        if let Some(background_color) = manga.get("backgroundColor").and_then(|v| v.as_str()) {
            set_clauses.push("manga_background_color = ?".to_string());
            params.push(Box::new(background_color.to_string()));
        }
        if let Some(progress_bar) = manga.get("progressBar").and_then(|v| v.as_str()) {
            set_clauses.push("manga_progress_bar = ?".to_string());
            params.push(Box::new(progress_bar.to_string()));
        }
        if let Some(image_smoothing) = manga.get("imageSmoothing").and_then(|v| v.as_bool()) {
            set_clauses.push("manga_image_smoothing = ?".to_string());
            params.push(Box::new(image_smoothing));
        }
        if let Some(preload_count) = manga.get("preloadCount").and_then(|v| v.as_i64()) {
            set_clauses.push("manga_preload_count = ?".to_string());
            params.push(Box::new(preload_count as i32));
        }
        if let Some(gpu_acceleration) = manga.get("gpuAcceleration").and_then(|v| v.as_bool()) {
            set_clauses.push("manga_gpu_acceleration = ?".to_string());
            params.push(Box::new(gpu_acceleration));
        }
    }
    
    // General settings
    if let Some(auto_start) = updates.get("autoStart").and_then(|v| v.as_bool()) {
        set_clauses.push("auto_start = ?".to_string());
        params.push(Box::new(auto_start));
    }
    if let Some(default_import_path) = updates.get("defaultImportPath").and_then(|v| v.as_str()) {
        set_clauses.push("default_import_path = ?".to_string());
        params.push(Box::new(default_import_path.to_string()));
    }
    if let Some(ui_density) = updates.get("uiDensity").and_then(|v| v.as_str()) {
        set_clauses.push("ui_density = ?".to_string());
        params.push(Box::new(ui_density.to_string()));
    }
    if let Some(accent_color) = updates.get("accentColor").and_then(|v| v.as_str()) {
        set_clauses.push("accent_color = ?".to_string());
        params.push(Box::new(accent_color.to_string()));
    }
    
    // Onboarding configs
    if let Some(preferred_content_type) = updates.get("preferredContentType").and_then(|v| v.as_str()) {
        set_clauses.push("preferred_content_type = ?".to_string());
        params.push(Box::new(preferred_content_type.to_string()));
    }
    if let Some(ui_scale) = updates.get("uiScale").and_then(|v| v.as_f64()) {
        set_clauses.push("ui_scale = ?".to_string());
        params.push(Box::new(ui_scale as f32));
    }
    if let Some(performance_mode) = updates.get("performanceMode").and_then(|v| v.as_str()) {
        set_clauses.push("performance_mode = ?".to_string());
        params.push(Box::new(performance_mode.to_string()));
    }
    if let Some(metadata_mode) = updates.get("metadataMode").and_then(|v| v.as_str()) {
        set_clauses.push("metadata_mode = ?".to_string());
        params.push(Box::new(metadata_mode.to_string()));
    }
    if let Some(auto_scan_enabled) = updates.get("autoScanEnabled").and_then(|v| v.as_bool()) {
        set_clauses.push("auto_scan_enabled = ?".to_string());
        params.push(Box::new(auto_scan_enabled));
    }
    if let Some(default_manga_path) = updates.get("defaultMangaPath").and_then(|v| {
        if v.is_null() { Some(None) } else { v.as_str().map(|s| Some(s.to_string())) }
    }) {
        set_clauses.push("default_manga_path = ?".to_string());
        params.push(Box::new(default_manga_path));
    }
    
    if set_clauses.is_empty() {
        return Ok(());
    }
    
    // Build and execute query
    let sql = format!(
        "UPDATE user_preferences SET {} WHERE id = 1",
        set_clauses.join(", ")
    );
    
    // Convert Box<dyn ToSql> to &dyn ToSql
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    
    conn.execute(&sql, param_refs.as_slice())?;
    
    Ok(())
}

/// Get book-specific overrides
#[tauri::command]
pub async fn get_book_preference_overrides(
    state: State<'_, AppState>,
) -> Result<Vec<PreferenceOverride>> {
    let conn = state.db.get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT book_id, 
            font_family, font_size, line_height, page_width,
            scroll_mode, justification, paragraph_spacing, animation_speed,
            hyphenation, custom_css
        FROM book_preference_overrides"
    )?;
    
    let overrides = stmt.query_map([], |row| {
        let book_id: i32 = row.get(0)?;
        
        let mut prefs = serde_json::Map::new();
        
        if let Ok(Some(val)) = row.get::<_, Option<String>>(1) {
            prefs.insert("fontFamily".to_string(), serde_json::Value::String(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<i32>>(2) {
            prefs.insert("fontSize".to_string(), serde_json::Value::Number(val.into()));
        }
        if let Ok(Some(val)) = row.get::<_, Option<f32>>(3) {
            if let Some(num) = serde_json::Number::from_f64(val as f64) {
                prefs.insert("lineHeight".to_string(), serde_json::Value::Number(num));
            }
        }
        if let Ok(Some(val)) = row.get::<_, Option<i32>>(4) {
            prefs.insert("pageWidth".to_string(), serde_json::Value::Number(val.into()));
        }
        if let Ok(Some(val)) = row.get::<_, Option<String>>(5) {
            prefs.insert("scrollMode".to_string(), serde_json::Value::String(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<String>>(6) {
            prefs.insert("justification".to_string(), serde_json::Value::String(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<i32>>(7) {
            prefs.insert("paragraphSpacing".to_string(), serde_json::Value::Number(val.into()));
        }
        if let Ok(Some(val)) = row.get::<_, Option<i32>>(8) {
            prefs.insert("animationSpeed".to_string(), serde_json::Value::Number(val.into()));
        }
        if let Ok(Some(val)) = row.get::<_, Option<bool>>(9) {
            prefs.insert("hyphenation".to_string(), serde_json::Value::Bool(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<String>>(10) {
            prefs.insert("customCSS".to_string(), serde_json::Value::String(val));
        }
        
        Ok(PreferenceOverride {
            book_id,
            preferences: serde_json::Value::Object(prefs),
        })
    })?
    .collect::<rusqlite::Result<Vec<_>>>()?;
    
    Ok(overrides)
}

/// Set book-specific override
#[tauri::command]
pub async fn set_book_preference_override(
    state: State<'_, AppState>,
    book_id: i32,
    overrides: serde_json::Value,
) -> Result<()> {
    let conn = state.db.get_connection()?;
    // Upsert book override entry
    conn.execute(
        "INSERT INTO book_preference_overrides (book_id) VALUES (?)
         ON CONFLICT(book_id) DO NOTHING",
        [book_id],
    )?;
    
    // Update fields
    let mut set_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    
    if let Some(font_family) = overrides.get("fontFamily").and_then(|v| v.as_str()) {
        set_clauses.push("font_family = ?");
        params.push(Box::new(font_family.to_string()));
    }
    if let Some(font_size) = overrides.get("fontSize").and_then(|v| v.as_i64()) {
        set_clauses.push("font_size = ?");
        params.push(Box::new(font_size as i32));
    }
    if let Some(line_height) = overrides.get("lineHeight").and_then(|v| v.as_f64()) {
        set_clauses.push("line_height = ?");
        params.push(Box::new(line_height as f32));
    }
    if let Some(page_width) = overrides.get("pageWidth").and_then(|v| v.as_i64()) {
        set_clauses.push("page_width = ?");
        params.push(Box::new(page_width as i32));
    }
    if let Some(scroll_mode) = overrides.get("scrollMode").and_then(|v| v.as_str()) {
        set_clauses.push("scroll_mode = ?");
        params.push(Box::new(scroll_mode.to_string()));
    }
    if let Some(justification) = overrides.get("justification").and_then(|v| v.as_str()) {
        set_clauses.push("justification = ?");
        params.push(Box::new(justification.to_string()));
    }
    if let Some(paragraph_spacing) = overrides.get("paragraphSpacing").and_then(|v| v.as_i64()) {
        set_clauses.push("paragraph_spacing = ?");
        params.push(Box::new(paragraph_spacing as i32));
    }
    if let Some(animation_speed) = overrides.get("animationSpeed").and_then(|v| v.as_i64()) {
        set_clauses.push("animation_speed = ?");
        params.push(Box::new(animation_speed as i32));
    }
    if let Some(hyphenation) = overrides.get("hyphenation").and_then(|v| v.as_bool()) {
        set_clauses.push("hyphenation = ?");
        params.push(Box::new(hyphenation));
    }
    if let Some(custom_css) = overrides.get("customCSS").and_then(|v| v.as_str()) {
        set_clauses.push("custom_css = ?");
        params.push(Box::new(custom_css.to_string()));
    }
    
    if set_clauses.is_empty() {
        return Ok(());
    }
    
    let sql = format!(
        "UPDATE book_preference_overrides SET {} WHERE book_id = ?",
        set_clauses.join(", ")
    );
    
    params.push(Box::new(book_id));
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    
    conn.execute(&sql, param_refs.as_slice())?;
    
    Ok(())
}

/// Clear book-specific override
#[tauri::command]
pub async fn clear_book_preference_override(
    state: State<'_, AppState>,
    book_id: i32,
) -> Result<()> {
    let conn = state.db.get_connection()?;
    conn.execute(
        "DELETE FROM book_preference_overrides WHERE book_id = ?",
        [book_id],
    )?;
    
    Ok(())
}

/// Get manga preference overrides
#[tauri::command]
pub async fn get_manga_preference_overrides(
    state: State<'_, AppState>,
) -> Result<Vec<PreferenceOverride>> {
    let conn = state.db.get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT book_id, 
            mode, direction, margin_size, fit_width,
            background_color, progress_bar, image_smoothing, preload_count,
            gpu_acceleration
        FROM manga_preference_overrides"
    )?;
    
    let overrides = stmt.query_map([], |row| {
        let book_id: i32 = row.get(0)?;
        
        let mut prefs = serde_json::Map::new();
        
        if let Ok(Some(val)) = row.get::<_, Option<String>>(1) {
            prefs.insert("mode".to_string(), serde_json::Value::String(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<String>>(2) {
            prefs.insert("direction".to_string(), serde_json::Value::String(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<i32>>(3) {
            prefs.insert("marginSize".to_string(), serde_json::Value::Number(val.into()));
        }
        if let Ok(Some(val)) = row.get::<_, Option<bool>>(4) {
            prefs.insert("fitWidth".to_string(), serde_json::Value::Bool(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<String>>(5) {
            prefs.insert("backgroundColor".to_string(), serde_json::Value::String(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<String>>(6) {
            prefs.insert("progressBar".to_string(), serde_json::Value::String(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<bool>>(7) {
            prefs.insert("imageSmoothing".to_string(), serde_json::Value::Bool(val));
        }
        if let Ok(Some(val)) = row.get::<_, Option<i32>>(8) {
            prefs.insert("preloadCount".to_string(), serde_json::Value::Number(val.into()));
        }
        if let Ok(Some(val)) = row.get::<_, Option<bool>>(9) {
            prefs.insert("gpuAcceleration".to_string(), serde_json::Value::Bool(val));
        }
        
        Ok(PreferenceOverride {
            book_id,
            preferences: serde_json::Value::Object(prefs),
        })
    })?
    .collect::<rusqlite::Result<Vec<_>>>()?;
    
    Ok(overrides)
}

/// Set manga-specific override
#[tauri::command]
pub async fn set_manga_preference_override(
    state: State<'_, AppState>,
    book_id: i32,
    overrides: serde_json::Value,
) -> Result<()> {
    let conn = state.db.get_connection()?;
    // Upsert manga override entry
    conn.execute(
        "INSERT INTO manga_preference_overrides (book_id) VALUES (?)
         ON CONFLICT(book_id) DO NOTHING",
        [book_id],
    )?;
    
    let mut set_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    
    if let Some(mode) = overrides.get("mode").and_then(|v| v.as_str()) {
        set_clauses.push("mode = ?");
        params.push(Box::new(mode.to_string()));
    }
    if let Some(direction) = overrides.get("direction").and_then(|v| v.as_str()) {
        set_clauses.push("direction = ?");
        params.push(Box::new(direction.to_string()));
    }
    if let Some(margin_size) = overrides.get("marginSize").and_then(|v| v.as_i64()) {
        set_clauses.push("margin_size = ?");
        params.push(Box::new(margin_size as i32));
    }
    if let Some(fit_width) = overrides.get("fitWidth").and_then(|v| v.as_bool()) {
        set_clauses.push("fit_width = ?");
        params.push(Box::new(fit_width));
    }
    if let Some(background_color) = overrides.get("backgroundColor").and_then(|v| v.as_str()) {
        set_clauses.push("background_color = ?");
        params.push(Box::new(background_color.to_string()));
    }
    if let Some(progress_bar) = overrides.get("progressBar").and_then(|v| v.as_str()) {
        set_clauses.push("progress_bar = ?");
        params.push(Box::new(progress_bar.to_string()));
    }
    if let Some(image_smoothing) = overrides.get("imageSmoothing").and_then(|v| v.as_bool()) {
        set_clauses.push("image_smoothing = ?");
        params.push(Box::new(image_smoothing));
    }
    if let Some(preload_count) = overrides.get("preloadCount").and_then(|v| v.as_i64()) {
        set_clauses.push("preload_count = ?");
        params.push(Box::new(preload_count as i32));
    }
    if let Some(gpu_acceleration) = overrides.get("gpuAcceleration").and_then(|v| v.as_bool()) {
        set_clauses.push("gpu_acceleration = ?");
        params.push(Box::new(gpu_acceleration));
    }
    
    if set_clauses.is_empty() {
        return Ok(());
    }
    
    let sql = format!(
        "UPDATE manga_preference_overrides SET {} WHERE book_id = ?",
        set_clauses.join(", ")
    );
    
    params.push(Box::new(book_id));
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    
    conn.execute(&sql, param_refs.as_slice())?;
    
    Ok(())
}

/// Clear manga-specific override
#[tauri::command]
pub async fn clear_manga_preference_override(
    state: State<'_, AppState>,
    book_id: i32,
) -> Result<()> {
    let conn = state.db.get_connection()?;
    conn.execute(
        "DELETE FROM manga_preference_overrides WHERE book_id = ?",
        [book_id],
    )?;
    
    Ok(())
}

/// Get onboarding state
#[tauri::command]
pub async fn get_onboarding_state(state: State<'_, AppState>) -> Result<OnboardingState> {
    let conn = state.db.get_connection()?;
    let onboarding_state = conn.query_row(
        "SELECT completed, completed_at, version, skipped_steps FROM onboarding_state WHERE id = 1",
        [],
        |row| {
            let skipped_json: String = row.get(3)?;
            let skipped_steps: Vec<String> = serde_json::from_str(&skipped_json)
                .unwrap_or_else(|_| Vec::new());
            
            Ok(OnboardingState {
                completed: row.get(0)?,
                completed_at: row.get(1)?,
                version: row.get(2)?,
                skipped_steps,
            })
        },
    )?;
    
    Ok(onboarding_state)
}

/// Complete onboarding
#[tauri::command]
pub async fn complete_onboarding(
    state: State<'_, AppState>,
    skipped_steps: Vec<String>,
) -> Result<()> {
    let conn = state.db.get_connection()?;
    let skipped_json = serde_json::to_string(&skipped_steps)
        .unwrap_or_else(|_| "[]".to_string());
    
    conn.execute(
        "UPDATE onboarding_state 
         SET completed = 1, completed_at = CURRENT_TIMESTAMP, skipped_steps = ?
         WHERE id = 1",
        [skipped_json],
    )?;
    
    Ok(())
}

/// Reset onboarding state to allow re-checking the onboarding experience
#[tauri::command]
pub async fn reset_onboarding(state: State<'_, AppState>) -> Result<()> {
    let conn = state.db.get_connection()?;
    conn.execute(
        "UPDATE onboarding_state 
         SET completed = 0, completed_at = NULL, skipped_steps = '[]'
         WHERE id = 1",
        [],
    )?;
    
    Ok(())
}
