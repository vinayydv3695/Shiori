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
use desktop::AndroidAuth;
#[cfg(mobile)]
use mobile::AndroidAuth;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the android-auth APIs.
pub trait AndroidAuthExt<R: Runtime> {
  fn android_auth(&self) -> &AndroidAuth<R>;
}

impl<R: Runtime, T: Manager<R>> crate::AndroidAuthExt<R> for T {
  fn android_auth(&self) -> &AndroidAuth<R> {
    self.state::<AndroidAuth<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("android-auth")
    .invoke_handler(tauri::generate_handler![commands::ping])
    .setup(|app, api| {
      #[cfg(mobile)]
      let android_auth = mobile::init(app, api)?;
      #[cfg(desktop)]
      let android_auth = desktop::init(app, api)?;
      app.manage(android_auth);
      Ok(())
    })
    .build()
}
