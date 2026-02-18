// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod error;
mod models;
mod services;
mod utils;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    db: Mutex<db::Database>,
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize database
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            std::fs::create_dir_all(&app_dir)?;

            let db_path = app_dir.join("library.db");
            let database = db::Database::new(&db_path)?;

            app.manage(AppState {
                db: Mutex::new(database),
            });

            // Initialize rendering service with 100MB cache
            app.manage(commands::rendering::RenderingState::new(100));

            log::info!("Shiori initialized with database at {:?}", db_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::get_books,
            commands::library::get_book,
            commands::library::add_book,
            commands::library::update_book,
            commands::library::delete_book,
            commands::library::import_books,
            commands::library::scan_folder_for_books,
            commands::search::search_books,
            commands::metadata::extract_metadata,
            commands::tags::get_tags,
            commands::tags::create_tag,
            commands::tags::add_tag_to_book,
            commands::tags::remove_tag_from_book,
            commands::reader::get_reading_progress,
            commands::reader::save_reading_progress,
            commands::reader::get_annotations,
            commands::reader::create_annotation,
            commands::reader::update_annotation,
            commands::reader::delete_annotation,
            commands::reader::get_reader_settings,
            commands::reader::save_reader_settings,
            commands::reader::get_book_file_path,
            commands::reader::detect_book_format,
            commands::reader::validate_book_file,
            commands::reader::get_error_details,
            commands::rendering::open_book_renderer,
            commands::rendering::close_book_renderer,
            commands::rendering::get_book_toc,
            commands::rendering::get_book_chapter,
            commands::rendering::get_book_chapter_count,
            commands::rendering::search_in_book,
            commands::rendering::get_renderer_cache_stats,
            commands::rendering::clear_renderer_cache,
            commands::collections::get_collections,
            commands::collections::get_collection,
            commands::collections::create_collection,
            commands::collections::update_collection,
            commands::collections::delete_collection,
            commands::collections::add_book_to_collection,
            commands::collections::remove_book_from_collection,
            commands::collections::add_books_to_collection,
            commands::collections::get_collection_books,
            commands::collections::get_nested_collections,
            commands::export::export_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
