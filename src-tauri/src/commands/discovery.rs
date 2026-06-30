use tauri::State;
use log::error;
use serde::Serialize;
use crate::AppState;
use crate::services::discovery_service::CompanionInstance;

#[derive(Serialize)]
pub struct LocalIpResponse {
    pub ip: String,
}

#[tauri::command]
pub async fn start_companion_broadcast(
    state: State<'_, AppState>,
    port: u16,
) -> Result<(), String> {
    state
        .discovery_service
        .start_broadcast(port)
        .await
        .map_err(|e| {
            error!("Failed to start mDNS broadcast: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn stop_companion_broadcast(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .discovery_service
        .stop_broadcast()
        .await
        .map_err(|e| {
            error!("Failed to stop mDNS broadcast: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn scan_for_companions(
    state: State<'_, AppState>,
) -> Result<Vec<CompanionInstance>, String> {
    state
        .discovery_service
        .scan_companions()
        .await
        .map_err(|e| {
            error!("Failed to scan for companions: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub fn get_local_ips() -> Result<Vec<LocalIpResponse>, String> {
    let mut ips = Vec::new();
    if let Ok(ip) = local_ip_address::local_ip() {
        ips.push(LocalIpResponse { ip: ip.to_string() });
    }
    
    // Attempt to get all interface IPs if necessary
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (_name, ip) in interfaces {
            if !ip.is_loopback() {
                let ip_str = ip.to_string();
                if !ips.iter().any(|r| r.ip == ip_str) {
                    ips.push(LocalIpResponse { ip: ip_str });
                }
            }
        }
    }
    Ok(ips)
}

#[tauri::command]
pub fn generate_pairing_qr(ip: String, port: u16) -> Result<String, String> {
    let payload = format!("shiori://companion?ip={}&port={}", ip, port);
    
    use qrcode::QrCode;
    use qrcode::render::svg;

    let code = QrCode::new(payload.as_bytes()).map_err(|e| format!("Failed to create QR code: {}", e))?;
    
    let svg_xml = code.render()
        .min_dimensions(200, 200)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .build();

    Ok(svg_xml)
}
