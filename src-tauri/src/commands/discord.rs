use crate::error::Result;
use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct DiscordPresence {
    pub state: String,
    pub details: String,
    pub large_image_key: Option<String>,
    pub large_image_text: Option<String>,
}

#[tauri::command]
pub fn discord_connect(state: State<'_, AppState>) -> Result<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(discord) = &state.discord {
            discord
                .connect()
                .map_err(|e| crate::error::ShioriError::Other(e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn discord_disconnect(state: State<'_, AppState>) -> Result<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(discord) = &state.discord {
            discord
                .disconnect()
                .map_err(|e| crate::error::ShioriError::Other(e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn discord_set_activity(presence: DiscordPresence, state: State<'_, AppState>) -> Result<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(discord) = &state.discord {
            discord
                .set_activity(
                    &presence.state,
                    &presence.details,
                    presence.large_image_key.as_deref(),
                    presence.large_image_text.as_deref(),
                )
                .map_err(|e| crate::error::ShioriError::Other(e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn discord_clear_activity(state: State<'_, AppState>) -> Result<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(discord) = &state.discord {
            discord
                .clear_activity()
                .map_err(|e| crate::error::ShioriError::Other(e))?;
        }
    }
    Ok(())
}
