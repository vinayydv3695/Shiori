use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use reqwest::Client;
use std::fs;
use tokio::io::AsyncWriteExt;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub lang: String,
    pub quality: String,
    pub download_url_onnx: String,
    pub download_url_json: String,
    pub is_downloaded: bool,
}

pub struct PiperService {
    _app_handle: AppHandle,
    voices_dir: PathBuf,
    engine_cache: tokio::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<tokio::sync::Mutex<piper_rs::Piper>>>>,
    http_client: Client,
}

impl PiperService {
    pub fn new(app_handle: AppHandle) -> Self {
        let app_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
        let voices_dir = app_dir.join("piper_voices");
        
        if !voices_dir.exists() {
            let _ = fs::create_dir_all(&voices_dir);
        }
        let resource_dir = app_handle.path().resource_dir().unwrap_or_else(|_| PathBuf::from("."));
        let espeak_data_dir = resource_dir.join("resources");
        std::env::set_var("PIPER_ESPEAKNG_DATA_DIRECTORY", &espeak_data_dir);

        let http_client = Client::builder()
            .user_agent("Shiori-TTS/1.0")
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            _app_handle: app_handle,
            voices_dir,
            engine_cache: tokio::sync::Mutex::new(std::collections::HashMap::new()),
            http_client,
        }
    }

    pub fn get_voices_dir(&self) -> &Path {
        &self.voices_dir
    }

    // List of available voices to download
    pub fn get_available_voices(&self) -> Vec<VoiceInfo> {
        vec![
            VoiceInfo {
                id: "ar_JO-kareem-medium".to_string(),
                name: "kareem (Arabic)".to_string(),
                lang: "ar_JO".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ar_JO-kareem-medium"),
            },
            VoiceInfo {
                id: "ar_JO-kareem-low".to_string(),
                name: "kareem (Arabic)".to_string(),
                lang: "ar_JO".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ar_JO-kareem-low"),
            },
            VoiceInfo {
                id: "bg_BG-dimitar-medium".to_string(),
                name: "dimitar (Bulgarian)".to_string(),
                lang: "bg_BG".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/bg/bg_BG/dimitar/medium/bg_BG-dimitar-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/bg/bg_BG/dimitar/medium/bg_BG-dimitar-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("bg_BG-dimitar-medium"),
            },
            VoiceInfo {
                id: "bn_BD-google-medium".to_string(),
                name: "google (Bengali)".to_string(),
                lang: "bn_BD".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/bn/bn_BD/google/medium/bn_BD-google-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/bn/bn_BD/google/medium/bn_BD-google-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("bn_BD-google-medium"),
            },
            VoiceInfo {
                id: "ca_ES-upc_ona-medium".to_string(),
                name: "upc_ona (Catalan)".to_string(),
                lang: "ca_ES".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ca/ca_ES/upc_ona/medium/ca_ES-upc_ona-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ca/ca_ES/upc_ona/medium/ca_ES-upc_ona-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ca_ES-upc_ona-medium"),
            },
            VoiceInfo {
                id: "ca_ES-upc_ona-x_low".to_string(),
                name: "upc_ona (Catalan)".to_string(),
                lang: "ca_ES".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ca/ca_ES/upc_ona/x_low/ca_ES-upc_ona-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ca/ca_ES/upc_ona/x_low/ca_ES-upc_ona-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ca_ES-upc_ona-x_low"),
            },
            VoiceInfo {
                id: "ca_ES-upc_pau-x_low".to_string(),
                name: "upc_pau (Catalan)".to_string(),
                lang: "ca_ES".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ca/ca_ES/upc_pau/x_low/ca_ES-upc_pau-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ca/ca_ES/upc_pau/x_low/ca_ES-upc_pau-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ca_ES-upc_pau-x_low"),
            },
            VoiceInfo {
                id: "cs_CZ-jirka-medium".to_string(),
                name: "jirka (Czech)".to_string(),
                lang: "cs_CZ".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("cs_CZ-jirka-medium"),
            },
            VoiceInfo {
                id: "cs_CZ-jirka-low".to_string(),
                name: "jirka (Czech)".to_string(),
                lang: "cs_CZ".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/low/cs_CZ-jirka-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/low/cs_CZ-jirka-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("cs_CZ-jirka-low"),
            },
            VoiceInfo {
                id: "cy_GB-bu_tts-medium".to_string(),
                name: "bu_tts (Welsh)".to_string(),
                lang: "cy_GB".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/cy/cy_GB/bu_tts/medium/cy_GB-bu_tts-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/cy/cy_GB/bu_tts/medium/cy_GB-bu_tts-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("cy_GB-bu_tts-medium"),
            },
            VoiceInfo {
                id: "cy_GB-gwryw_gogleddol-medium".to_string(),
                name: "gwryw_gogleddol (Welsh)".to_string(),
                lang: "cy_GB".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/cy/cy_GB/gwryw_gogleddol/medium/cy_GB-gwryw_gogleddol-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/cy/cy_GB/gwryw_gogleddol/medium/cy_GB-gwryw_gogleddol-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("cy_GB-gwryw_gogleddol-medium"),
            },
            VoiceInfo {
                id: "da_DK-talesyntese-medium".to_string(),
                name: "talesyntese (Danish)".to_string(),
                lang: "da_DK".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/da/da_DK/talesyntese/medium/da_DK-talesyntese-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/da/da_DK/talesyntese/medium/da_DK-talesyntese-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("da_DK-talesyntese-medium"),
            },
            VoiceInfo {
                id: "de_DE-thorsten-high".to_string(),
                name: "thorsten (German)".to_string(),
                lang: "de_DE".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("de_DE-thorsten-high"),
            },
            VoiceInfo {
                id: "de_DE-mls-medium".to_string(),
                name: "mls (German)".to_string(),
                lang: "de_DE".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/mls/medium/de_DE-mls-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/mls/medium/de_DE-mls-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("de_DE-mls-medium"),
            },
            VoiceInfo {
                id: "de_DE-thorsten-medium".to_string(),
                name: "thorsten (German)".to_string(),
                lang: "de_DE".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("de_DE-thorsten-medium"),
            },
            VoiceInfo {
                id: "de_DE-thorsten_emotional-medium".to_string(),
                name: "thorsten_emotional (German)".to_string(),
                lang: "de_DE".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten_emotional/medium/de_DE-thorsten_emotional-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten_emotional/medium/de_DE-thorsten_emotional-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("de_DE-thorsten_emotional-medium"),
            },
            VoiceInfo {
                id: "de_DE-karlsson-low".to_string(),
                name: "karlsson (German)".to_string(),
                lang: "de_DE".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/karlsson/low/de_DE-karlsson-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/karlsson/low/de_DE-karlsson-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("de_DE-karlsson-low"),
            },
            VoiceInfo {
                id: "el_GR-joy-medium".to_string(),
                name: "joy (Greek)".to_string(),
                lang: "el_GR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/el/el_GR/joy/medium/el_GR-joy-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/el/el_GR/joy/medium/el_GR-joy-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("el_GR-joy-medium"),
            },
            VoiceInfo {
                id: "el_GR-rapunzelina-medium".to_string(),
                name: "rapunzelina (Greek)".to_string(),
                lang: "el_GR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/el/el_GR/rapunzelina/medium/el_GR-rapunzelina-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/el/el_GR/rapunzelina/medium/el_GR-rapunzelina-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("el_GR-rapunzelina-medium"),
            },
            VoiceInfo {
                id: "el_GR-rapunzelina-low".to_string(),
                name: "rapunzelina (Greek)".to_string(),
                lang: "el_GR".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/el/el_GR/rapunzelina/low/el_GR-rapunzelina-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/el/el_GR/rapunzelina/low/el_GR-rapunzelina-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("el_GR-rapunzelina-low"),
            },
            VoiceInfo {
                id: "en_GB-cori-high".to_string(),
                name: "cori (English)".to_string(),
                lang: "en_GB".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/en_GB-cori-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/en_GB-cori-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_GB-cori-high"),
            },
            VoiceInfo {
                id: "en_GB-alan-medium".to_string(),
                name: "alan (English)".to_string(),
                lang: "en_GB".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_GB-alan-medium"),
            },
            VoiceInfo {
                id: "en_GB-alba-medium".to_string(),
                name: "alba (English)".to_string(),
                lang: "en_GB".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_GB-alba-medium"),
            },
            VoiceInfo {
                id: "en_GB-aru-medium".to_string(),
                name: "aru (English)".to_string(),
                lang: "en_GB".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/aru/medium/en_GB-aru-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/aru/medium/en_GB-aru-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_GB-aru-medium"),
            },
            VoiceInfo {
                id: "en_GB-cori-medium".to_string(),
                name: "cori (English)".to_string(),
                lang: "en_GB".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/medium/en_GB-cori-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/medium/en_GB-cori-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_GB-cori-medium"),
            },
            VoiceInfo {
                id: "en_US-lessac-high".to_string(),
                name: "lessac (English)".to_string(),
                lang: "en_US".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_US-lessac-high"),
            },
            VoiceInfo {
                id: "en_US-libritts-high".to_string(),
                name: "libritts (English)".to_string(),
                lang: "en_US".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_US-libritts-high"),
            },
            VoiceInfo {
                id: "en_US-ljspeech-high".to_string(),
                name: "ljspeech (English)".to_string(),
                lang: "en_US".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_US-ljspeech-high"),
            },
            VoiceInfo {
                id: "en_US-ryan-high".to_string(),
                name: "ryan (English)".to_string(),
                lang: "en_US".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_US-ryan-high"),
            },
            VoiceInfo {
                id: "en_US-amy-medium".to_string(),
                name: "amy (English)".to_string(),
                lang: "en_US".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("en_US-amy-medium"),
            },
            VoiceInfo {
                id: "es_AR-daniela-high".to_string(),
                name: "daniela (Spanish)".to_string(),
                lang: "es_AR".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("es_AR-daniela-high"),
            },
            VoiceInfo {
                id: "es_ES-davefx-medium".to_string(),
                name: "davefx (Spanish)".to_string(),
                lang: "es_ES".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("es_ES-davefx-medium"),
            },
            VoiceInfo {
                id: "es_ES-sharvard-medium".to_string(),
                name: "sharvard (Spanish)".to_string(),
                lang: "es_ES".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("es_ES-sharvard-medium"),
            },
            VoiceInfo {
                id: "es_ES-mls_10246-low".to_string(),
                name: "mls_10246 (Spanish)".to_string(),
                lang: "es_ES".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("es_ES-mls_10246-low"),
            },
            VoiceInfo {
                id: "es_ES-mls_9972-low".to_string(),
                name: "mls_9972 (Spanish)".to_string(),
                lang: "es_ES".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("es_ES-mls_9972-low"),
            },
            VoiceInfo {
                id: "es_ES-carlfm-x_low".to_string(),
                name: "carlfm (Spanish)".to_string(),
                lang: "es_ES".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("es_ES-carlfm-x_low"),
            },
            VoiceInfo {
                id: "es_MX-claude-high".to_string(),
                name: "claude (Spanish)".to_string(),
                lang: "es_MX".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("es_MX-claude-high"),
            },
            VoiceInfo {
                id: "es_MX-ald-medium".to_string(),
                name: "ald (Spanish)".to_string(),
                lang: "es_MX".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("es_MX-ald-medium"),
            },
            VoiceInfo {
                id: "es_MX-ald-x_low".to_string(),
                name: "ald (Spanish)".to_string(),
                lang: "es_MX".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("es_MX-ald-x_low"),
            },
            VoiceInfo {
                id: "eu_ES-antton-medium".to_string(),
                name: "antton (Basque)".to_string(),
                lang: "eu_ES".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/eu/eu_ES/antton/medium/eu_ES-antton-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/eu/eu_ES/antton/medium/eu_ES-antton-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("eu_ES-antton-medium"),
            },
            VoiceInfo {
                id: "eu_ES-maider-medium".to_string(),
                name: "maider (Basque)".to_string(),
                lang: "eu_ES".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/eu/eu_ES/maider/medium/eu_ES-maider-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/eu/eu_ES/maider/medium/eu_ES-maider-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("eu_ES-maider-medium"),
            },
            VoiceInfo {
                id: "fa_IR-amir-medium".to_string(),
                name: "amir (Farsi)".to_string(),
                lang: "fa_IR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/amir/medium/fa_IR-amir-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/amir/medium/fa_IR-amir-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fa_IR-amir-medium"),
            },
            VoiceInfo {
                id: "fa_IR-ganji-medium".to_string(),
                name: "ganji (Farsi)".to_string(),
                lang: "fa_IR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/ganji/medium/fa_IR-ganji-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/ganji/medium/fa_IR-ganji-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fa_IR-ganji-medium"),
            },
            VoiceInfo {
                id: "fa_IR-ganji_adabi-medium".to_string(),
                name: "ganji_adabi (Farsi)".to_string(),
                lang: "fa_IR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/ganji_adabi/medium/fa_IR-ganji_adabi-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/ganji_adabi/medium/fa_IR-ganji_adabi-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fa_IR-ganji_adabi-medium"),
            },
            VoiceInfo {
                id: "fa_IR-gyro-medium".to_string(),
                name: "gyro (Farsi)".to_string(),
                lang: "fa_IR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fa_IR-gyro-medium"),
            },
            VoiceInfo {
                id: "fa_IR-reza_ibrahim-medium".to_string(),
                name: "reza_ibrahim (Farsi)".to_string(),
                lang: "fa_IR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/reza_ibrahim/medium/fa_IR-reza_ibrahim-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/reza_ibrahim/medium/fa_IR-reza_ibrahim-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fa_IR-reza_ibrahim-medium"),
            },
            VoiceInfo {
                id: "fi_FI-harri-medium".to_string(),
                name: "harri (Finnish)".to_string(),
                lang: "fi_FI".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fi/fi_FI/harri/medium/fi_FI-harri-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fi/fi_FI/harri/medium/fi_FI-harri-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fi_FI-harri-medium"),
            },
            VoiceInfo {
                id: "fi_FI-harri-low".to_string(),
                name: "harri (Finnish)".to_string(),
                lang: "fi_FI".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fi/fi_FI/harri/low/fi_FI-harri-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fi/fi_FI/harri/low/fi_FI-harri-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fi_FI-harri-low"),
            },
            VoiceInfo {
                id: "fr_FR-mls-medium".to_string(),
                name: "mls (French)".to_string(),
                lang: "fr_FR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/mls/medium/fr_FR-mls-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/mls/medium/fr_FR-mls-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fr_FR-mls-medium"),
            },
            VoiceInfo {
                id: "fr_FR-siwis-medium".to_string(),
                name: "siwis (French)".to_string(),
                lang: "fr_FR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fr_FR-siwis-medium"),
            },
            VoiceInfo {
                id: "fr_FR-tom-medium".to_string(),
                name: "tom (French)".to_string(),
                lang: "fr_FR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/tom/medium/fr_FR-tom-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/tom/medium/fr_FR-tom-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fr_FR-tom-medium"),
            },
            VoiceInfo {
                id: "fr_FR-upmc-medium".to_string(),
                name: "upmc (French)".to_string(),
                lang: "fr_FR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fr_FR-upmc-medium"),
            },
            VoiceInfo {
                id: "fr_FR-gilles-low".to_string(),
                name: "gilles (French)".to_string(),
                lang: "fr_FR".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/gilles/low/fr_FR-gilles-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/gilles/low/fr_FR-gilles-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("fr_FR-gilles-low"),
            },
            VoiceInfo {
                id: "hi_IN-pratham-medium".to_string(),
                name: "pratham (Hindi)".to_string(),
                lang: "hi_IN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("hi_IN-pratham-medium"),
            },
            VoiceInfo {
                id: "hi_IN-priyamvada-medium".to_string(),
                name: "priyamvada (Hindi)".to_string(),
                lang: "hi_IN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/priyamvada/medium/hi_IN-priyamvada-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/priyamvada/medium/hi_IN-priyamvada-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("hi_IN-priyamvada-medium"),
            },
            VoiceInfo {
                id: "hi_IN-rohan-medium".to_string(),
                name: "rohan (Hindi)".to_string(),
                lang: "hi_IN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/rohan/medium/hi_IN-rohan-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/rohan/medium/hi_IN-rohan-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("hi_IN-rohan-medium"),
            },
            VoiceInfo {
                id: "hu_HU-anna-medium".to_string(),
                name: "anna (Hungarian)".to_string(),
                lang: "hu_HU".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hu/hu_HU/anna/medium/hu_HU-anna-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hu/hu_HU/anna/medium/hu_HU-anna-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("hu_HU-anna-medium"),
            },
            VoiceInfo {
                id: "hu_HU-berta-medium".to_string(),
                name: "berta (Hungarian)".to_string(),
                lang: "hu_HU".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hu/hu_HU/berta/medium/hu_HU-berta-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hu/hu_HU/berta/medium/hu_HU-berta-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("hu_HU-berta-medium"),
            },
            VoiceInfo {
                id: "hu_HU-imre-medium".to_string(),
                name: "imre (Hungarian)".to_string(),
                lang: "hu_HU".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hu/hu_HU/imre/medium/hu_HU-imre-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/hu/hu_HU/imre/medium/hu_HU-imre-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("hu_HU-imre-medium"),
            },
            VoiceInfo {
                id: "id_ID-news_tts-medium".to_string(),
                name: "news_tts (Indonesian)".to_string(),
                lang: "id_ID".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("id_ID-news_tts-medium"),
            },
            VoiceInfo {
                id: "is_IS-bui-medium".to_string(),
                name: "bui (Icelandic)".to_string(),
                lang: "is_IS".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/is/is_IS/bui/medium/is_IS-bui-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/is/is_IS/bui/medium/is_IS-bui-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("is_IS-bui-medium"),
            },
            VoiceInfo {
                id: "is_IS-salka-medium".to_string(),
                name: "salka (Icelandic)".to_string(),
                lang: "is_IS".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/is/is_IS/salka/medium/is_IS-salka-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/is/is_IS/salka/medium/is_IS-salka-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("is_IS-salka-medium"),
            },
            VoiceInfo {
                id: "is_IS-steinn-medium".to_string(),
                name: "steinn (Icelandic)".to_string(),
                lang: "is_IS".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/is/is_IS/steinn/medium/is_IS-steinn-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/is/is_IS/steinn/medium/is_IS-steinn-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("is_IS-steinn-medium"),
            },
            VoiceInfo {
                id: "is_IS-ugla-medium".to_string(),
                name: "ugla (Icelandic)".to_string(),
                lang: "is_IS".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/is/is_IS/ugla/medium/is_IS-ugla-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/is/is_IS/ugla/medium/is_IS-ugla-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("is_IS-ugla-medium"),
            },
            VoiceInfo {
                id: "it_IT-paola-medium".to_string(),
                name: "paola (Italian)".to_string(),
                lang: "it_IT".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/paola/medium/it_IT-paola-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/paola/medium/it_IT-paola-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("it_IT-paola-medium"),
            },
            VoiceInfo {
                id: "it_IT-riccardo-x_low".to_string(),
                name: "riccardo (Italian)".to_string(),
                lang: "it_IT".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/riccardo/x_low/it_IT-riccardo-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/riccardo/x_low/it_IT-riccardo-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("it_IT-riccardo-x_low"),
            },
            VoiceInfo {
                id: "ka_GE-natia-medium".to_string(),
                name: "natia (Georgian)".to_string(),
                lang: "ka_GE".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ka/ka_GE/natia/medium/ka_GE-natia-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ka/ka_GE/natia/medium/ka_GE-natia-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ka_GE-natia-medium"),
            },
            VoiceInfo {
                id: "kk_KZ-issai-high".to_string(),
                name: "issai (Kazakh)".to_string(),
                lang: "kk_KZ".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("kk_KZ-issai-high"),
            },
            VoiceInfo {
                id: "kk_KZ-iseke-x_low".to_string(),
                name: "iseke (Kazakh)".to_string(),
                lang: "kk_KZ".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/iseke/x_low/kk_KZ-iseke-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/iseke/x_low/kk_KZ-iseke-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("kk_KZ-iseke-x_low"),
            },
            VoiceInfo {
                id: "kk_KZ-raya-x_low".to_string(),
                name: "raya (Kazakh)".to_string(),
                lang: "kk_KZ".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/raya/x_low/kk_KZ-raya-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/raya/x_low/kk_KZ-raya-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("kk_KZ-raya-x_low"),
            },
            VoiceInfo {
                id: "ku_TR-berfin_renas-medium".to_string(),
                name: "berfin_renas (Kurmanji Kurdish)".to_string(),
                lang: "ku_TR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ku/ku_TR/berfin_renas/medium/ku_TR-berfin_renas-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ku/ku_TR/berfin_renas/medium/ku_TR-berfin_renas-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ku_TR-berfin_renas-medium"),
            },
            VoiceInfo {
                id: "lb_LU-marylux-medium".to_string(),
                name: "marylux (Luxembourgish)".to_string(),
                lang: "lb_LU".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/lb/lb_LU/marylux/medium/lb_LU-marylux-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/lb/lb_LU/marylux/medium/lb_LU-marylux-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("lb_LU-marylux-medium"),
            },
            VoiceInfo {
                id: "lv_LV-aivars-medium".to_string(),
                name: "aivars (Latvian)".to_string(),
                lang: "lv_LV".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/lv/lv_LV/aivars/medium/lv_LV-aivars-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/lv/lv_LV/aivars/medium/lv_LV-aivars-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("lv_LV-aivars-medium"),
            },
            VoiceInfo {
                id: "ml_IN-arjun-medium".to_string(),
                name: "arjun (Malayalam)".to_string(),
                lang: "ml_IN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ml/ml_IN/arjun/medium/ml_IN-arjun-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ml/ml_IN/arjun/medium/ml_IN-arjun-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ml_IN-arjun-medium"),
            },
            VoiceInfo {
                id: "ml_IN-meera-medium".to_string(),
                name: "meera (Malayalam)".to_string(),
                lang: "ml_IN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ml/ml_IN/meera/medium/ml_IN-meera-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ml/ml_IN/meera/medium/ml_IN-meera-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ml_IN-meera-medium"),
            },
            VoiceInfo {
                id: "ne_NP-chitwan-medium".to_string(),
                name: "chitwan (Nepali)".to_string(),
                lang: "ne_NP".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ne/ne_NP/chitwan/medium/ne_NP-chitwan-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ne/ne_NP/chitwan/medium/ne_NP-chitwan-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ne_NP-chitwan-medium"),
            },
            VoiceInfo {
                id: "ne_NP-google-medium".to_string(),
                name: "google (Nepali)".to_string(),
                lang: "ne_NP".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ne/ne_NP/google/medium/ne_NP-google-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ne/ne_NP/google/medium/ne_NP-google-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ne_NP-google-medium"),
            },
            VoiceInfo {
                id: "ne_NP-google-x_low".to_string(),
                name: "google (Nepali)".to_string(),
                lang: "ne_NP".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ne/ne_NP/google/x_low/ne_NP-google-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ne/ne_NP/google/x_low/ne_NP-google-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ne_NP-google-x_low"),
            },
            VoiceInfo {
                id: "nl_BE-nathalie-medium".to_string(),
                name: "nathalie (Dutch)".to_string(),
                lang: "nl_BE".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("nl_BE-nathalie-medium"),
            },
            VoiceInfo {
                id: "nl_BE-rdh-medium".to_string(),
                name: "rdh (Dutch)".to_string(),
                lang: "nl_BE".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/rdh/medium/nl_BE-rdh-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/rdh/medium/nl_BE-rdh-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("nl_BE-rdh-medium"),
            },
            VoiceInfo {
                id: "nl_BE-nathalie-x_low".to_string(),
                name: "nathalie (Dutch)".to_string(),
                lang: "nl_BE".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/x_low/nl_BE-nathalie-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/x_low/nl_BE-nathalie-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("nl_BE-nathalie-x_low"),
            },
            VoiceInfo {
                id: "nl_BE-rdh-x_low".to_string(),
                name: "rdh (Dutch)".to_string(),
                lang: "nl_BE".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/rdh/x_low/nl_BE-rdh-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/rdh/x_low/nl_BE-rdh-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("nl_BE-rdh-x_low"),
            },
            VoiceInfo {
                id: "nl_NL-alex-medium".to_string(),
                name: "alex (Dutch)".to_string(),
                lang: "nl_NL".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/alex/medium/nl_NL-alex-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/alex/medium/nl_NL-alex-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("nl_NL-alex-medium"),
            },
            VoiceInfo {
                id: "nl_NL-mls-medium".to_string(),
                name: "mls (Dutch)".to_string(),
                lang: "nl_NL".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("nl_NL-mls-medium"),
            },
            VoiceInfo {
                id: "nl_NL-pim-medium".to_string(),
                name: "pim (Dutch)".to_string(),
                lang: "nl_NL".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/pim/medium/nl_NL-pim-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/pim/medium/nl_NL-pim-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("nl_NL-pim-medium"),
            },
            VoiceInfo {
                id: "nl_NL-ronnie-medium".to_string(),
                name: "ronnie (Dutch)".to_string(),
                lang: "nl_NL".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("nl_NL-ronnie-medium"),
            },
            VoiceInfo {
                id: "nl_NL-mls_5809-low".to_string(),
                name: "mls_5809 (Dutch)".to_string(),
                lang: "nl_NL".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls_5809/low/nl_NL-mls_5809-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls_5809/low/nl_NL-mls_5809-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("nl_NL-mls_5809-low"),
            },
            VoiceInfo {
                id: "no_NO-nvcc-medium".to_string(),
                name: "nvcc (Norwegian)".to_string(),
                lang: "no_NO".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/no/no_NO/nvcc/medium/no_NO-nvcc-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/no/no_NO/nvcc/medium/no_NO-nvcc-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("no_NO-nvcc-medium"),
            },
            VoiceInfo {
                id: "no_NO-talesyntese-medium".to_string(),
                name: "talesyntese (Norwegian)".to_string(),
                lang: "no_NO".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/no/no_NO/talesyntese/medium/no_NO-talesyntese-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/no/no_NO/talesyntese/medium/no_NO-talesyntese-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("no_NO-talesyntese-medium"),
            },
            VoiceInfo {
                id: "pl_PL-bass-high".to_string(),
                name: "bass (Polish)".to_string(),
                lang: "pl_PL".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/bass/high/pl_PL-bass-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/bass/high/pl_PL-bass-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pl_PL-bass-high"),
            },
            VoiceInfo {
                id: "pl_PL-darkman-medium".to_string(),
                name: "darkman (Polish)".to_string(),
                lang: "pl_PL".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/darkman/medium/pl_PL-darkman-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/darkman/medium/pl_PL-darkman-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pl_PL-darkman-medium"),
            },
            VoiceInfo {
                id: "pl_PL-gosia-medium".to_string(),
                name: "gosia (Polish)".to_string(),
                lang: "pl_PL".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/gosia/medium/pl_PL-gosia-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/gosia/medium/pl_PL-gosia-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pl_PL-gosia-medium"),
            },
            VoiceInfo {
                id: "pl_PL-mc_speech-medium".to_string(),
                name: "mc_speech (Polish)".to_string(),
                lang: "pl_PL".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/mc_speech/medium/pl_PL-mc_speech-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/mc_speech/medium/pl_PL-mc_speech-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pl_PL-mc_speech-medium"),
            },
            VoiceInfo {
                id: "pl_PL-mls_6892-low".to_string(),
                name: "mls_6892 (Polish)".to_string(),
                lang: "pl_PL".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/mls_6892/low/pl_PL-mls_6892-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/mls_6892/low/pl_PL-mls_6892-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pl_PL-mls_6892-low"),
            },
            VoiceInfo {
                id: "pt_BR-cadu-medium".to_string(),
                name: "cadu (Portuguese)".to_string(),
                lang: "pt_BR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/cadu/medium/pt_BR-cadu-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/cadu/medium/pt_BR-cadu-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pt_BR-cadu-medium"),
            },
            VoiceInfo {
                id: "pt_BR-faber-medium".to_string(),
                name: "faber (Portuguese)".to_string(),
                lang: "pt_BR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pt_BR-faber-medium"),
            },
            VoiceInfo {
                id: "pt_BR-jeff-medium".to_string(),
                name: "jeff (Portuguese)".to_string(),
                lang: "pt_BR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/jeff/medium/pt_BR-jeff-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/jeff/medium/pt_BR-jeff-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pt_BR-jeff-medium"),
            },
            VoiceInfo {
                id: "pt_BR-edresson-low".to_string(),
                name: "edresson (Portuguese)".to_string(),
                lang: "pt_BR".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/edresson/low/pt_BR-edresson-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/edresson/low/pt_BR-edresson-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pt_BR-edresson-low"),
            },
            VoiceInfo {
                id: "pt_PT-tugão-medium".to_string(),
                name: "tugão (Portuguese)".to_string(),
                lang: "pt_PT".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_PT/tugão/medium/pt_PT-tugão-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_PT/tugão/medium/pt_PT-tugão-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("pt_PT-tugão-medium"),
            },
            VoiceInfo {
                id: "ro_RO-mihai-medium".to_string(),
                name: "mihai (Romanian)".to_string(),
                lang: "ro_RO".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ro/ro_RO/mihai/medium/ro_RO-mihai-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ro/ro_RO/mihai/medium/ro_RO-mihai-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ro_RO-mihai-medium"),
            },
            VoiceInfo {
                id: "ru_RU-denis-medium".to_string(),
                name: "denis (Russian)".to_string(),
                lang: "ru_RU".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ru_RU-denis-medium"),
            },
            VoiceInfo {
                id: "ru_RU-dmitri-medium".to_string(),
                name: "dmitri (Russian)".to_string(),
                lang: "ru_RU".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ru_RU-dmitri-medium"),
            },
            VoiceInfo {
                id: "ru_RU-irina-medium".to_string(),
                name: "irina (Russian)".to_string(),
                lang: "ru_RU".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ru_RU-irina-medium"),
            },
            VoiceInfo {
                id: "ru_RU-ruslan-medium".to_string(),
                name: "ruslan (Russian)".to_string(),
                lang: "ru_RU".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ru_RU-ruslan-medium"),
            },
            VoiceInfo {
                id: "sk_SK-lili-medium".to_string(),
                name: "lili (Slovak)".to_string(),
                lang: "sk_SK".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sk/sk_SK/lili/medium/sk_SK-lili-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sk/sk_SK/lili/medium/sk_SK-lili-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("sk_SK-lili-medium"),
            },
            VoiceInfo {
                id: "sl_SI-artur-medium".to_string(),
                name: "artur (Slovenian)".to_string(),
                lang: "sl_SI".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sl/sl_SI/artur/medium/sl_SI-artur-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sl/sl_SI/artur/medium/sl_SI-artur-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("sl_SI-artur-medium"),
            },
            VoiceInfo {
                id: "sq_AL-edon-medium".to_string(),
                name: "edon (Albanian)".to_string(),
                lang: "sq_AL".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sq/sq_AL/edon/medium/sq_AL-edon-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sq/sq_AL/edon/medium/sq_AL-edon-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("sq_AL-edon-medium"),
            },
            VoiceInfo {
                id: "sr_RS-serbski_institut-medium".to_string(),
                name: "serbski_institut (Serbian)".to_string(),
                lang: "sr_RS".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sr/sr_RS/serbski_institut/medium/sr_RS-serbski_institut-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sr/sr_RS/serbski_institut/medium/sr_RS-serbski_institut-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("sr_RS-serbski_institut-medium"),
            },
            VoiceInfo {
                id: "sv_SE-alma-medium".to_string(),
                name: "alma (Swedish)".to_string(),
                lang: "sv_SE".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/alma/medium/sv_SE-alma-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/alma/medium/sv_SE-alma-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("sv_SE-alma-medium"),
            },
            VoiceInfo {
                id: "sv_SE-lisa-medium".to_string(),
                name: "lisa (Swedish)".to_string(),
                lang: "sv_SE".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/lisa/medium/sv_SE-lisa-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/lisa/medium/sv_SE-lisa-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("sv_SE-lisa-medium"),
            },
            VoiceInfo {
                id: "sv_SE-nst-medium".to_string(),
                name: "nst (Swedish)".to_string(),
                lang: "sv_SE".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("sv_SE-nst-medium"),
            },
            VoiceInfo {
                id: "sw_CD-lanfrica-medium".to_string(),
                name: "lanfrica (Swahili)".to_string(),
                lang: "sw_CD".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sw/sw_CD/lanfrica/medium/sw_CD-lanfrica-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/sw/sw_CD/lanfrica/medium/sw_CD-lanfrica-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("sw_CD-lanfrica-medium"),
            },
            VoiceInfo {
                id: "te_IN-maya-medium".to_string(),
                name: "maya (Telugu)".to_string(),
                lang: "te_IN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/te/te_IN/maya/medium/te_IN-maya-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/te/te_IN/maya/medium/te_IN-maya-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("te_IN-maya-medium"),
            },
            VoiceInfo {
                id: "te_IN-padmavathi-medium".to_string(),
                name: "padmavathi (Telugu)".to_string(),
                lang: "te_IN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/te/te_IN/padmavathi/medium/te_IN-padmavathi-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/te/te_IN/padmavathi/medium/te_IN-padmavathi-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("te_IN-padmavathi-medium"),
            },
            VoiceInfo {
                id: "te_IN-venkatesh-medium".to_string(),
                name: "venkatesh (Telugu)".to_string(),
                lang: "te_IN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/te/te_IN/venkatesh/medium/te_IN-venkatesh-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/te/te_IN/venkatesh/medium/te_IN-venkatesh-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("te_IN-venkatesh-medium"),
            },
            VoiceInfo {
                id: "tr_TR-dfki-medium".to_string(),
                name: "dfki (Turkish)".to_string(),
                lang: "tr_TR".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("tr_TR-dfki-medium"),
            },
            VoiceInfo {
                id: "uk_UA-mykyta-high".to_string(),
                name: "mykyta (Ukrainian)".to_string(),
                lang: "uk_UA".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/mykyta/high/uk_UA-mykyta-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/mykyta/high/uk_UA-mykyta-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("uk_UA-mykyta-high"),
            },
            VoiceInfo {
                id: "uk_UA-oleksa-high".to_string(),
                name: "oleksa (Ukrainian)".to_string(),
                lang: "uk_UA".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/oleksa/high/uk_UA-oleksa-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/oleksa/high/uk_UA-oleksa-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("uk_UA-oleksa-high"),
            },
            VoiceInfo {
                id: "uk_UA-tetiana-high".to_string(),
                name: "tetiana (Ukrainian)".to_string(),
                lang: "uk_UA".to_string(),
                quality: "high".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/tetiana/high/uk_UA-tetiana-high.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/tetiana/high/uk_UA-tetiana-high.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("uk_UA-tetiana-high"),
            },
            VoiceInfo {
                id: "uk_UA-ukrainian_tts-medium".to_string(),
                name: "ukrainian_tts (Ukrainian)".to_string(),
                lang: "uk_UA".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("uk_UA-ukrainian_tts-medium"),
            },
            VoiceInfo {
                id: "uk_UA-lada-x_low".to_string(),
                name: "lada (Ukrainian)".to_string(),
                lang: "uk_UA".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/lada/x_low/uk_UA-lada-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/lada/x_low/uk_UA-lada-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("uk_UA-lada-x_low"),
            },
            VoiceInfo {
                id: "ur_PK-fasih-medium".to_string(),
                name: "fasih (Urdu)".to_string(),
                lang: "ur_PK".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ur/ur_PK/fasih/medium/ur_PK-fasih-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ur/ur_PK/fasih/medium/ur_PK-fasih-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("ur_PK-fasih-medium"),
            },
            VoiceInfo {
                id: "vi_VN-vais1000-medium".to_string(),
                name: "vais1000 (Vietnamese)".to_string(),
                lang: "vi_VN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("vi_VN-vais1000-medium"),
            },
            VoiceInfo {
                id: "vi_VN-25hours_single-low".to_string(),
                name: "25hours_single (Vietnamese)".to_string(),
                lang: "vi_VN".to_string(),
                quality: "low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/25hours_single/low/vi_VN-25hours_single-low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/25hours_single/low/vi_VN-25hours_single-low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("vi_VN-25hours_single-low"),
            },
            VoiceInfo {
                id: "vi_VN-vivos-x_low".to_string(),
                name: "vivos (Vietnamese)".to_string(),
                lang: "vi_VN".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vivos/x_low/vi_VN-vivos-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vivos/x_low/vi_VN-vivos-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("vi_VN-vivos-x_low"),
            },
            VoiceInfo {
                id: "zh_CN-chaowen-medium".to_string(),
                name: "chaowen (Chinese)".to_string(),
                lang: "zh_CN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/chaowen/medium/zh_CN-chaowen-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/chaowen/medium/zh_CN-chaowen-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("zh_CN-chaowen-medium"),
            },
            VoiceInfo {
                id: "zh_CN-huayan-medium".to_string(),
                name: "huayan (Chinese)".to_string(),
                lang: "zh_CN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("zh_CN-huayan-medium"),
            },
            VoiceInfo {
                id: "zh_CN-xiao_ya-medium".to_string(),
                name: "xiao_ya (Chinese)".to_string(),
                lang: "zh_CN".to_string(),
                quality: "medium".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/xiao_ya/medium/zh_CN-xiao_ya-medium.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/xiao_ya/medium/zh_CN-xiao_ya-medium.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("zh_CN-xiao_ya-medium"),
            },
            VoiceInfo {
                id: "zh_CN-huayan-x_low".to_string(),
                name: "huayan (Chinese)".to_string(),
                lang: "zh_CN".to_string(),
                quality: "x_low".to_string(),
                download_url_onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/x_low/zh_CN-huayan-x_low.onnx?download=true".to_string(),
                download_url_json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/x_low/zh_CN-huayan-x_low.onnx.json?download=true".to_string(),
                is_downloaded: self.is_voice_downloaded("zh_CN-huayan-x_low"),
            },
        ]
    }

    pub fn is_voice_downloaded(&self, voice_id: &str) -> bool {
        let onnx_path = self.voices_dir.join(format!("{}.onnx", voice_id));
        let json_path = self.voices_dir.join(format!("{}.onnx.json", voice_id));
        onnx_path.exists() && json_path.exists()
    }

    pub async fn download_voice(&self, voice: &VoiceInfo) -> Result<(), String> {
        let onnx_path = self.voices_dir.join(format!("{}.onnx", voice.id));
        let json_path = self.voices_dir.join(format!("{}.onnx.json", voice.id));

        // Download JSON config
        let response = self.http_client.get(&voice.download_url_json).send().await
            .map_err(|e| format!("Failed to download config: {}", e))?
            .error_for_status()
            .map_err(|e| format!("Config HTTP Error: {}", e))?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let mut file = tokio::fs::File::create(&json_path).await.map_err(|e| e.to_string())?;
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;

        // Download ONNX model
        let response = self.http_client.get(&voice.download_url_onnx).send().await
            .map_err(|e| format!("Failed to download model: {}", e))?
            .error_for_status()
            .map_err(|e| format!("Model HTTP Error: {}", e))?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let mut file = tokio::fs::File::create(&onnx_path).await.map_err(|e| e.to_string())?;
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn synthesize(&self, text: &str, voice_id: &str) -> Result<String, String> {
        let onnx_path = self.voices_dir.join(format!("{}.onnx", voice_id));
        let json_path = self.voices_dir.join(format!("{}.onnx.json", voice_id));

        if !onnx_path.exists() || !json_path.exists() {
            return Err("Voice not downloaded".to_string());
        }

        // Initialize ort if needed (it initializes automatically in v2 usually, but we can safely ignore if it's already init)
        let _ = ort::init().with_name("shiori-piper").commit();

        let mut cache = self.engine_cache.lock().await;
        
        let engine = if let Some(engine) = cache.get(voice_id) {
            engine.clone()
        } else {
            let engine = tokio::task::block_in_place(|| {
                piper_rs::Piper::new(&onnx_path, &json_path)
            }).map_err(|e| format!("Failed to load Piper model: {}", e))?;
            
            let engine_arc = std::sync::Arc::new(tokio::sync::Mutex::new(engine));
            cache.insert(voice_id.to_string(), engine_arc.clone());
            engine_arc
        };

        let mut engine_lock = engine.lock().await;
        
        let text_owned = text.to_string();
        // create() can block, run in block_in_place
        let (samples, sample_rate) = tokio::task::block_in_place(move || {
            engine_lock.create(&text_owned, false, None, None, None, None)
        }).map_err(|e| format!("Failed to synthesize speech: {}", e))?;

        // Convert f32 samples to i16 for WAV
        let i16_samples: Vec<i16> = samples.into_iter()
            .map(|s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
            .collect();
            
        // Build WAV in memory
        let num_channels = 1u16;
        let bits_per_sample = 16u16;
        let byte_rate = sample_rate * num_channels as u32 * (bits_per_sample / 8) as u32;
        let block_align = num_channels * (bits_per_sample / 8);
        let data_size = (i16_samples.len() * 2) as u32;
        let file_size = 36 + data_size;

        let mut wav_bytes = Vec::with_capacity((44 + data_size) as usize);
        
        wav_bytes.extend_from_slice(b"RIFF");
        wav_bytes.extend_from_slice(&file_size.to_le_bytes());
        wav_bytes.extend_from_slice(b"WAVE");
        
        wav_bytes.extend_from_slice(b"fmt ");
        wav_bytes.extend_from_slice(&16u32.to_le_bytes()); // Subchunk1Size
        wav_bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM format
        wav_bytes.extend_from_slice(&num_channels.to_le_bytes());
        wav_bytes.extend_from_slice(&sample_rate.to_le_bytes());
        wav_bytes.extend_from_slice(&byte_rate.to_le_bytes());
        wav_bytes.extend_from_slice(&block_align.to_le_bytes());
        wav_bytes.extend_from_slice(&bits_per_sample.to_le_bytes());
        
        wav_bytes.extend_from_slice(b"data");
        wav_bytes.extend_from_slice(&data_size.to_le_bytes());
        
        // Write audio data
        for sample in i16_samples {
            wav_bytes.extend_from_slice(&sample.to_le_bytes());
        }
        
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);
        let data_uri = format!("data:audio/wav;base64,{}", b64);
        
        Ok(data_uri)
    }
}

#[tauri::command]
pub async fn get_available_voices(
    state: tauri::State<'_, Arc<tokio::sync::Mutex<PiperService>>>,
) -> Result<Vec<VoiceInfo>, String> {
    let service = state.lock().await;
    Ok(service.get_available_voices())
}

#[tauri::command]
pub async fn download_voice(
    voice: VoiceInfo,
    state: tauri::State<'_, Arc<tokio::sync::Mutex<PiperService>>>,
) -> Result<(), String> {
    let service = state.lock().await;
    service.download_voice(&voice).await
}

#[tauri::command]
pub async fn synthesize_speech(
    text: String,
    voice_id: String,
    state: tauri::State<'_, Arc<tokio::sync::Mutex<PiperService>>>,
) -> Result<String, String> {
    let service = state.lock().await;
    service.synthesize(&text, &voice_id).await
}
