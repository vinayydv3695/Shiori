use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::AndroidSaf;
#[cfg(mobile)]
use mobile::AndroidSaf;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the android-saf APIs.
pub trait AndroidSafExt<R: Runtime> {
  fn android_saf(&self) -> &AndroidSaf<R>;
}

impl<R: Runtime, T: Manager<R>> crate::AndroidSafExt<R> for T {
  fn android_saf(&self) -> &AndroidSaf<R> {
    self.state::<AndroidSaf<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("android-saf")
    .invoke_handler(tauri::generate_handler![commands::select_folder, commands::select_files, commands::solve_cloudflare])
    .setup(|app, api| {
      #[cfg(mobile)]
      let android_saf = mobile::init(app, api)?;
      #[cfg(desktop)]
      let android_saf = desktop::init(app, api)?;
      app.manage(android_saf);
      Ok(())
    })
    .build()
}
