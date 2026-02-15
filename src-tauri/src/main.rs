// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod error;
mod models;
mod services;
mod utils;

use error::Result;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    db: Mutex<db::Database>,
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .setup(|app| {
            // Initialize database
            let app_dir = app.path_resolver()
                .app_data_dir()
                .expect("Failed to get app data directory");
            
            std::fs::create_dir_all(&app_dir)?;
            
            let db_path = app_dir.join("library.db");
            let database = db::Database::new(&db_path)?;
            
            app.manage(AppState {
                db: Mutex::new(database),
            });

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
            commands::search::search_books,
            commands::metadata::extract_metadata,
            commands::tags::get_tags,
            commands::tags::create_tag,
            commands::tags::add_tag_to_book,
            commands::tags::remove_tag_from_book,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
