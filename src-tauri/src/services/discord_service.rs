use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;

pub struct DiscordService {
    client: Mutex<Option<DiscordIpcClient>>,
    client_id: String,
}

impl DiscordService {
    pub fn new(client_id: &str) -> Self {
        Self {
            client: Mutex::new(None),
            client_id: client_id.to_string(),
        }
    }

    pub fn connect(&self) -> Result<(), String> {
        let mut client_lock = self.client.lock().map_err(|e| e.to_string())?;

        // If already connected, do nothing
        if client_lock.is_some() {
            return Ok(());
        }

        let mut client = DiscordIpcClient::new(&self.client_id);

        if let Err(e) = client.connect() {
            return Err(format!("Failed to connect to Discord: {}", e));
        }

        *client_lock = Some(client);
        log::info!("Successfully connected to Discord RPC");
        
        Ok(())
    }

    pub fn disconnect(&self) -> Result<(), String> {
        let mut client_lock = self.client.lock().map_err(|e| e.to_string())?;
        
        if let Some(mut client) = client_lock.take() {
            let _ = client.close();
            log::info!("Disconnected from Discord RPC");
        }

        Ok(())
    }

    pub fn set_activity(
        &self,
        state: &str,
        details: &str,
        large_image_key: Option<&str>,
        large_image_text: Option<&str>,
    ) -> Result<(), String> {
        let mut client_lock = self.client.lock().map_err(|e| e.to_string())?;

        let client = match client_lock.as_mut() {
            Some(c) => c,
            None => return Err("Discord client not connected".to_string()),
        };

        let mut assets = activity::Assets::new();
        if let Some(key) = large_image_key {
            assets = assets.large_image(key);
        } else {
            // Default large image if none provided
            assets = assets.large_image("shiori_logo");
        }
        
        if let Some(text) = large_image_text {
            assets = assets.large_text(text);
        } else {
            assets = assets.large_text("Shiori");
        }

        let activity = activity::Activity::new()
            .state(state)
            .details(details)
            .assets(assets)
            // .timestamps(activity::Timestamps::new().start(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64))
            ;

        if let Err(e) = client.set_activity(activity) {
            return Err(format!("Failed to set Discord activity: {}", e));
        }

        Ok(())
    }

    pub fn clear_activity(&self) -> Result<(), String> {
        let mut client_lock = self.client.lock().map_err(|e| e.to_string())?;

        let client = match client_lock.as_mut() {
            Some(c) => c,
            None => return Err("Discord client not connected".to_string()),
        };

        if let Err(e) = client.clear_activity() {
            return Err(format!("Failed to clear Discord activity: {}", e));
        }

        Ok(())
    }
}
