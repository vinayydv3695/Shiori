//! Microsoft Edge Neural TTS service with Sec-MS-GEC v2 authentication
//!
//! Provides free, studio-grade neural speech synthesis using Microsoft Edge's Read Aloud
//! endpoint with DRM v2 authentication and Edge browser identity emulation.

use std::time::{Duration, SystemTime, UNIX_EPOCH};
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::{HeaderValue, CACHE_CONTROL, ORIGIN, PRAGMA, USER_AGENT};
use tokio_tungstenite::tungstenite::protocol::Message;
use uuid::Uuid;

use crate::error::ShioriError;

pub const TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
pub const BASE_URL: &str = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
pub const CHROMIUM_FULL_VERSION: &str = "143.0.3650.75";
pub const SEC_MS_GEC_VERSION: &str = "2-143.0.3650.75";
pub const WIN_EPOCH: f64 = 11644473600.0;
pub const S_TO_NS: f64 = 1e9;

const SHA256_INITIAL: [u32; 8] = [
    0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
    0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
];
const SHA256_STATE: [u32; 8] = [
    0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A,
    0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2,
];
const SHA256_SCHEDULE: [u32; 14] = [
    0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA,
    0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6,
    0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33,
    0xD258B060, 0x72766564,
];
const SHA256_ROUND_CONSTANTS: [u32; 64] = [
    0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
    0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
    0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
    0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
    0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
    0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
    0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
    0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
];
const SHA256_ADJUSTMENT: u32 = 0xC9DC06A7;
const SHA256_SIGMA0_ADJUSTMENT: u32 = 0x059C0B80;
const SHA256_SIGMA1_ADJUSTMENT: u32 = 0x000B92C0;

const CS64_COEFFICIENTS: [(u32, u32); 14] = [
    (0xE82E91B1, 0xB32700D0), (0x44DE24C6, 0x88DFF51D), (0x3BEB65BC, 0x29514038),
    (0xC89C5933, 0xB328CBDF), (0x8D1EC211, 0xD405B4D5), (0x314EF5D5, 0x26E55F3C),
    (0xE92491B1, 0x607801C6), (0xF0A5B9D5, 0x82B2C1FB), (0x06064CF3, 0xFA51A3DA),
    (0xDA79FA60, 0x207CC464), (0xBED20560, 0x3C3C74F3), (0x89F9C9F8, 0xD2D14B61),
    (0x35FA38C6, 0xBB04A2C1), (0xCB49E3C6, 0xC5626167),
];
const CS64_FACTOR: u32 = 0x82893933;
const CS64_ADJUSTMENT0: u32 = 0xF2F90B1A;
const CS64_ADJUSTMENT1: u32 = 0x0B1A0000;

#[inline]
fn rol16(v: u32) -> u32 {
    v.rotate_left(16)
}

fn words_le4_even(data: &[u8]) -> Vec<u32> {
    let rem = (-(data.len() as isize)).rem_euclid(4) as usize;
    let mut padded = Vec::with_capacity(data.len() + rem);
    padded.extend_from_slice(data);
    padded.resize(data.len() + rem, 0);

    let mut words = Vec::with_capacity(padded.len() / 4 + 1);
    for chunk in padded.chunks_exact(4) {
        words.push(u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    if words.len() % 2 != 0 {
        words.push(0);
    }
    words
}

#[inline]
fn sigma0(val: u32) -> u32 {
    val.rotate_right(7) ^ val.rotate_right(18) ^ (val >> 3)
}

#[inline]
fn sigma1(val: u32) -> u32 {
    val.rotate_right(17) ^ val.rotate_right(19) ^ (val >> 10)
}

fn sha256_rounds(state: [u32; 8], words: &[u32], first_round: usize) -> [u32; 8] {
    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = state;
    let mut constants = SHA256_ROUND_CONSTANTS;
    if first_round == 14 {
        constants[14] = SHA256_ADJUSTMENT;
    }

    let aligned = 64usize.min(((first_round + 7) / 8) * 8);

    for i in first_round..aligned {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ ((!e) & g);
        let temp1 = h
            .wrapping_add(s1)
            .wrapping_add(ch)
            .wrapping_add(constants[i])
            .wrapping_add(words[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let temp2 = s0.wrapping_add(maj);

        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(temp1);
        d = c;
        c = b;
        b = a;
        a = temp1.wrapping_add(temp2);
    }

    for i in (aligned..64).step_by(8) {
        for r in 0..8 {
            let idx = i + r;
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(constants[idx])
                .wrapping_add(words[idx]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
    }

    [a, b, c, d, e, f, g, h]
}

fn expand_sha256_schedule(words: &mut Vec<u32>, first_word: usize) {
    for i in first_word..64 {
        let s1 = sigma1(words[i - 2]);
        let s0 = sigma0(words[i - 15]);
        let w = s1
            .wrapping_add(words[i - 7])
            .wrapping_add(s0)
            .wrapping_add(words[i - 16]);
        if i < words.len() {
            words[i] = w;
        } else {
            words.push(w);
        }
    }
}

fn sha256_init(data: &[u8]) -> [u32; 8] {
    let mut words = vec![0u32; 16];
    words[14] = ((data[0] as u32) << 16) | ((data[1] as u32) << 8) | (data[2] as u32);
    words[15] = ((data[3] as u32) << 24)
        | ((data[4] as u32) << 16)
        | ((data[5] as u32) << 8)
        | (data[6] as u32);

    for i in 16..30 {
        let mut value = SHA256_SCHEDULE[i - 16];
        if i >= 16 {
            let s1 = sigma1(words[i - 2]);
            value = value.wrapping_add(if i == 16 {
                s1 ^ SHA256_SIGMA1_ADJUSTMENT
            } else {
                s1
            });
        }
        if i >= 21 {
            value = value.wrapping_add(words[i - 7]);
        }
        if i >= 29 {
            let s0 = sigma0(words[i - 15]);
            value = value.wrapping_add(if i == 29 {
                s0 ^ SHA256_SIGMA0_ADJUSTMENT
            } else {
                s0
            });
        }
        words.push(value);
    }

    let w30 = sigma1(words[28])
        .wrapping_add(words[23])
        .wrapping_add(sigma0(words[15]))
        .wrapping_add(words[14])
        .wrapping_add(SHA256_ADJUSTMENT)
        .wrapping_sub(SHA256_ROUND_CONSTANTS[14]);
    words.push(w30);

    expand_sha256_schedule(&mut words, 31);
    let working = sha256_rounds(SHA256_STATE, &words, 14);

    let mut result = [0u32; 8];
    for i in 0..8 {
        result[i] = SHA256_INITIAL[i].wrapping_add(working[i]);
    }
    result
}

fn sha256_digest(data: &[u8]) -> [u8; 32] {
    let length = 57 + data.len();
    let rem = (55isize - length as isize).rem_euclid(64) as usize;

    let mut padded = Vec::with_capacity(data.len() - 7 + 1 + rem + 8);
    padded.extend_from_slice(&data[7..]);
    padded.push(0x80);
    padded.resize(padded.len() + rem, 0);

    let bit_len = (length as u64) * 8;
    padded.extend_from_slice(&bit_len.to_be_bytes());

    let mut state = sha256_init(&data[..7]);

    for chunk in padded.chunks_exact(64) {
        let mut words = Vec::with_capacity(64);
        for i in 0..16 {
            words.push(u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]));
        }
        expand_sha256_schedule(&mut words, 16);
        let working = sha256_rounds(state, &words, 0);
        for i in 0..8 {
            state[i] = state[i].wrapping_add(working[i]);
        }
    }

    let mut digest = [0u8; 32];
    for (i, word) in state.iter().enumerate() {
        digest[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    digest
}

fn cs64_digest(data: &[u8], digest: &[u8; 32]) -> (u32, u32) {
    let key_a = u32::from_le_bytes([digest[0], digest[1], digest[2], digest[3]]) | 1;
    let key_b = u32::from_le_bytes([digest[4], digest[5], digest[6], digest[7]]) | 1;

    let factors = [
        key_a.wrapping_mul(CS64_FACTOR),
        key_b.wrapping_mul(CS64_FACTOR),
    ];

    let mut terms = Vec::with_capacity(CS64_COEFFICIENTS.len() + 32);
    let mut offsets = Vec::with_capacity(CS64_COEFFICIENTS.len() + 32);

    for (idx, (coeff, offset)) in CS64_COEFFICIENTS.iter().enumerate() {
        terms.push(coeff.wrapping_mul(factors[idx % 2]));
        offsets.push(*offset);
    }

    let mut zero_prefixed = Vec::with_capacity(1 + data.len());
    zero_prefixed.push(0);
    zero_prefixed.extend_from_slice(data);
    let words = words_le4_even(&zero_prefixed);

    for (idx, word) in words.into_iter().enumerate() {
        let mut term = word.wrapping_mul(if idx % 2 == 0 { key_a } else { key_b });
        let mut offset = rol16(word).wrapping_mul(if idx % 2 == 0 { 0xEF0569FB } else { 0xC31713DB });
        if idx == 0 {
            term = term.wrapping_add(CS64_ADJUSTMENT0.wrapping_mul(factors[0]));
            offset = offset.wrapping_add(CS64_ADJUSTMENT1);
        }
        terms.push(term);
        offsets.push(offset);
    }

    let mut swap_acc = 0u32;
    let mut swap_last = 0u32;
    let mut state = 0u32;
    let mut acc = 0u32;

    for i in (0..terms.len()).step_by(2) {
        let x = terms[i];
        let y = terms[i + 1];

        let mut t = rol16(offsets[i].wrapping_add(x));
        let mut q = t.wrapping_mul(0x76F50F34);
        swap_acc = swap_acc
            .wrapping_add(rol16(q).wrapping_mul(0xC3EFEA97))
            .wrapping_add(q);

        t = rol16(offsets[i + 1].wrapping_add(y));
        q = t.wrapping_mul(0x1881CE3C);
        swap_last = rol16(q).wrapping_mul(0x35BD1EC9).wrapping_add(q);
        swap_acc = swap_acc.wrapping_add(swap_last);

        state = state.wrapping_mul(key_a).wrapping_add(x);
        state = rol16(state).wrapping_mul(0xCF98B111);
        state = rol16(state).wrapping_mul(0x87085B9F);
        state = rol16(state).wrapping_mul(0x12CEB96D);
        state = rol16(state).wrapping_mul(0x257E1D83);
        acc = acc.wrapping_add(state);

        t = state.wrapping_mul(key_b).wrapping_add(y);
        t = rol16(t).wrapping_mul(0xA27416F5);
        t = rol16(t).wrapping_mul(0xD38396FF);
        state = rol16(rol16(t).wrapping_mul(0x7C932B89)).wrapping_mul(0xBFA49F69);
        acc = acc.wrapping_add(state);
    }

    (swap_last ^ state, swap_acc ^ acc)
}

/// Generates a v2 Sec-MS-GEC auth token for Microsoft Edge TTS
pub fn generate_sec_ms_gec_v2(unix_timestamp: Option<f64>) -> String {
    let ts = unix_timestamp.unwrap_or_else(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64()
    });

    let mut ticks = ts + WIN_EPOCH;
    ticks -= ticks % 300.0;
    ticks *= S_TO_NS / 100.0;

    let str_to_hash = format!("{:.0}{}", ticks, TRUSTED_CLIENT_TOKEN);
    let data = str_to_hash.as_bytes();

    let digest = sha256_digest(data);
    let (cs64_0, cs64_1) = cs64_digest(data, &digest);

    let mut cs64_bytes = [0u8; 8];
    cs64_bytes[0..4].copy_from_slice(&cs64_0.to_le_bytes());
    cs64_bytes[4..8].copy_from_slice(&cs64_1.to_le_bytes());

    let cs64_hex = hex::encode_upper(cs64_bytes);
    let sha256_hex = hex::encode_upper(digest);

    format!("{}-{}", cs64_hex, sha256_hex)
}

fn escape_xml(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 16);
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

fn format_rate(rate: Option<f32>) -> String {
    let r = rate.unwrap_or(1.0);
    let pct = ((r - 1.0) * 100.0).round() as i32;
    if pct >= 0 {
        format!("+{}%", pct)
    } else {
        format!("{}%", pct)
    }
}

fn format_pitch(pitch: Option<f32>) -> String {
    let p = pitch.unwrap_or(1.0);
    let hz = ((p - 1.0) * 50.0).round() as i32;
    if hz >= 0 {
        format!("+{}Hz", hz)
    } else {
        format!("{}Hz", hz)
    }
}

pub fn build_ssml(text: &str, voice: Option<&str>, rate: Option<f32>, pitch: Option<f32>) -> String {
    let v = voice.unwrap_or("en-US-GuyNeural");
    let rate_str = format_rate(rate);
    let pitch_str = format_pitch(pitch);
    let escaped = escape_xml(text);

    format!(
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>\
        <voice name='{v}'>\
        <prosody rate='{rate_str}' pitch='{pitch_str}'>{escaped}</prosody>\
        </voice>\
        </speak>"
    )
}

/// Synthesizes text into MP3 audio bytes using Microsoft Edge Neural TTS
pub async fn synthesize_edge_speech(
    text: &str,
    voice: Option<&str>,
    rate: Option<f32>,
    pitch: Option<f32>,
) -> Result<Vec<u8>, ShioriError> {
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }

    let token = generate_sec_ms_gec_v2(None);
    let conn_id = Uuid::new_v4().simple().to_string();
    let req_id = Uuid::new_v4().simple().to_string();

    let url_str = format!(
        "wss://{BASE_URL}/edge/v1?TrustedClientToken={TRUSTED_CLIENT_TOKEN}&ConnectionId={conn_id}&Sec-MS-GEC={token}&Sec-MS-GEC-Version={SEC_MS_GEC_VERSION}"
    );

    let mut request = url_str
        .into_client_request()
        .map_err(|e| ShioriError::Other(format!("Failed to create Edge TTS request: {}", e)))?;

    let headers = request.headers_mut();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
        ),
    );
    headers.insert(
        ORIGIN,
        HeaderValue::from_static("chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"),
    );
    headers.insert(PRAGMA, HeaderValue::from_static("no-cache"));
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-cache"));

    let connect_future = tokio_tungstenite::connect_async(request);
    let (ws_stream, _) = tokio::time::timeout(Duration::from_secs(10), connect_future)
        .await
        .map_err(|_| ShioriError::Other("Edge TTS connection timed out (10s)".to_string()))?
        .map_err(|e| ShioriError::Other(format!("Edge TTS handshake failed: {}", e)))?;

    let (mut write, mut read) = ws_stream.split();

    // 1. Send speech.config
    let config_payload = serde_json::json!({
        "context": {
            "synthesis": {
                "audio": {
                    "metadataoptions": {
                        "sentenceBoundaryEnabled": "false",
                        "wordBoundaryEnabled": "false"
                    },
                    "outputFormat": "audio-24khz-48kbitrate-mono-mp3"
                }
            }
        }
    })
    .to_string();

    let config_msg = format!(
        "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{}",
        config_payload
    );
    write
        .send(Message::Text(config_msg.into()))
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to send Edge TTS config: {}", e)))?;

    // 2. Send SSML
    let ssml = build_ssml(text, voice, rate, pitch);
    let ssml_msg = format!(
        "X-RequestId:{req_id}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n{ssml}"
    );
    write
        .send(Message::Text(ssml_msg.into()))
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to send SSML: {}", e)))?;

    // 3. Read audio chunks with timeout
    let mut audio_chunks: Vec<u8> = Vec::with_capacity(32 * 1024);

    let read_loop = async {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if text.contains("Path:turn.end") {
                        break;
                    }
                }
                Ok(Message::Binary(bin)) => {
                    if bin.len() > 2 {
                        let header_len = u16::from_be_bytes([bin[0], bin[1]]) as usize;
                        if bin.len() > 2 + header_len {
                            audio_chunks.extend_from_slice(&bin[2 + header_len..]);
                        }
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(e) => {
                    log::warn!("Edge TTS read warning: {}", e);
                    break;
                }
                _ => {}
            }
        }
        audio_chunks
    };

    let result = tokio::time::timeout(Duration::from_secs(30), read_loop)
        .await
        .map_err(|_| ShioriError::Other("Edge TTS audio synthesis timed out (30s)".to_string()))?;

    if result.is_empty() {
        return Err(ShioriError::Other("Edge TTS returned no audio data".to_string()));
    }

    Ok(result)
}

#[tauri::command]
pub async fn synthesize_edge_tts(
    text: String,
    voice: Option<String>,
    rate: Option<f32>,
    pitch: Option<f32>,
) -> Result<Vec<u8>, ShioriError> {
    synthesize_edge_speech(&text, voice.as_deref(), rate, pitch).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sec_ms_gec_v2_vectors() {
        let token1 = generate_sec_ms_gec_v2(Some(1730000000.0));
        assert_eq!(
            token1,
            "50065ABF67B90F95-49BDAF24D28ECEB38DAEEC84DEAA71E91F92945EA8A47921C58FB4F8F79A4F5E"
        );

        let token2 = generate_sec_ms_gec_v2(Some(1762666543.0));
        assert_eq!(
            token2,
            "30D4D419D6D307F0-5D7909674D8080AA13B8D1C3D21F6ADDCB7B440856982A05C15291FE9BAE18CD"
        );
    }

    #[test]
    fn test_build_ssml() {
        let ssml = build_ssml("Hello & World <test>", Some("en-US-JennyNeural"), Some(1.2), Some(1.0));
        assert!(ssml.contains("en-US-JennyNeural"));
        assert!(ssml.contains("rate='+20%'"));
        assert!(ssml.contains("Hello &amp; World &lt;test&gt;"));
    }

    #[tokio::test]
    async fn test_live_synthesize_edge_speech() {
        let audio = synthesize_edge_speech("Testing live Edge TTS", Some("en-US-GuyNeural"), None, None).await;
        assert!(audio.is_ok(), "Live synthesis failed: {:?}", audio.err());
        let bytes = audio.unwrap();
        assert!(!bytes.is_empty(), "Audio bytes empty!");
        assert!(bytes.len() > 1000, "Audio too small: {} bytes", bytes.len());
    }
}
