use crate::error::Result;
use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct DiscordPresence {
    pub state: String,
    pub details: String,
    pub large_image_key: Option<String>,
    pub large_image_text: Option<String>,
}

#[tauri::command]
pub fn discord_connect(_state: State<'_, AppState>) -> Result<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(discord) = &_state.discord {
            discord
                .connect()
                .map_err(|e| crate::error::ShioriError::Other(e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn discord_disconnect(_state: State<'_, AppState>) -> Result<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(discord) = &_state.discord {
            discord
                .disconnect()
                .map_err(|e| crate::error::ShioriError::Other(e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn discord_set_activity(_presence: DiscordPresence, _state: State<'_, AppState>) -> Result<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(discord) = &_state.discord {
            discord
                .set_activity(
                    &_presence.state,
                    &_presence.details,
                    _presence.large_image_key.as_deref(),
                    _presence.large_image_text.as_deref(),
                )
                .map_err(|e| crate::error::ShioriError::Other(e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn discord_clear_activity(_state: State<'_, AppState>) -> Result<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(discord) = &_state.discord {
            discord
                .clear_activity()
                .map_err(|e| crate::error::ShioriError::Other(e))?;
        }
    }
    Ok(())
}
