use anyhow::{Result, anyhow};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use log::info;
use std::time::Duration;

pub const MDNS_SERVICE_TYPE: &str = "_shiori._tcp.local.";

pub struct DiscoveryService {
    mdns: ServiceDaemon,
    registered_service: Arc<Mutex<Option<String>>>,
}

impl DiscoveryService {
    pub fn new() -> Result<Self> {
        let mdns = ServiceDaemon::new().map_err(|e| anyhow!("Failed to create mDNS daemon: {}", e))?;
        Ok(Self {
            mdns,
            registered_service: Arc::new(Mutex::new(None)),
        })
    }

    pub async fn start_broadcast(&self, port: u16) -> Result<()> {
        let mut registered = self.registered_service.lock().await;
        if registered.is_some() {
            return Ok(()); // Already broadcasting
        }

        // Get local IP
        let hostname = hostname::get()
            .unwrap_or_else(|_| "Shiori_Desktop".into())
            .to_string_lossy()
            .to_string();
        
        // Remove spaces and invalid chars for instance name
        let instance_name = hostname.replace(" ", "_");
        let full_name = format!("{}.{}", instance_name, MDNS_SERVICE_TYPE);

        let my_ip = local_ip_address::local_ip().map_err(|e| anyhow!("Could not get local IP: {}", e))?;
        
        let properties = HashMap::from([
            ("app".to_string(), "Shiori".to_string()),
            ("version".to_string(), env!("CARGO_PKG_VERSION").to_string()),
        ]);

        let service_info = ServiceInfo::new(
            MDNS_SERVICE_TYPE,
            &instance_name,
            &full_name,
            my_ip.to_string(),
            port,
            Some(properties),
        ).map_err(|e| anyhow!("Failed to create service info: {}", e))?;

        self.mdns.register(service_info).map_err(|e| anyhow!("Failed to register mDNS service: {}", e))?;
        *registered = Some(full_name);
        info!("mDNS broadcast started for {}", instance_name);

        Ok(())
    }

    pub async fn stop_broadcast(&self) -> Result<()> {
        let mut registered = self.registered_service.lock().await;
        if let Some(full_name) = registered.take() {
            self.mdns.unregister(&full_name).map_err(|e| anyhow!("Failed to unregister mDNS service: {}", e))?;
            info!("mDNS broadcast stopped for {}", full_name);
        }
        Ok(())
    }

    pub async fn scan_companions(&self) -> Result<Vec<CompanionInstance>> {
        let receiver = self.mdns.browse(MDNS_SERVICE_TYPE).map_err(|e| anyhow!("Failed to browse mDNS: {}", e))?;
        
        let mut instances = Vec::new();
        
        // Timeout after 2 seconds of scanning
        let timeout = tokio::time::sleep(Duration::from_secs(2));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                _ = &mut timeout => {
                    break;
                }
                event = receiver.recv_async() => {
                    if let Ok(event) = event {
                        match event {
                            ServiceEvent::ServiceResolved(info) => {
                                let ip = info.get_addresses().iter().next().map(|ip| ip.to_string()).unwrap_or_default();
                                instances.push(CompanionInstance {
                                    name: info.get_fullname().to_string(),
                                    ip,
                                    port: info.get_port(),
                                });
                            }
                            _ => {}
                        }
                    } else {
                        break;
                    }
                }
            }
        }

        // We can stop browsing
        let _ = self.mdns.stop_browse(MDNS_SERVICE_TYPE);

        Ok(instances)
    }
}

#[derive(serde::Serialize, Clone)]
pub struct CompanionInstance {
    pub name: String,
    pub ip: String,
    pub port: u16,
}
