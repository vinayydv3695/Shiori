/**
 * Microsoft Edge Neural Text-to-Speech client
 * Provides 100% free, studio-grade neural voice synthesis without API keys.
 *
 * Employs Sec-MS-GEC v2 authentication token generation and Edge browser
 * identity emulation via the Tauri backend (or direct WebSocket fallback).
 */

import { logger } from './logger';
import { api, isTauri } from './tauri';

export interface EdgeVoice {
  id: string;
  name: string;
  shortName: string;
  gender: 'Male' | 'Female';
  locale: string;
  language: string;
  accent?: string;
}

export const POPULAR_EDGE_VOICES: EdgeVoice[] = [
  { id: 'en-US-GuyNeural', name: 'Guy (US Audiobook Narrator)', shortName: 'en-US-GuyNeural', gender: 'Male', locale: 'en-US', language: 'English', accent: 'United States' },
  { id: 'en-US-JennyNeural', name: 'Jenny (US Natural Conversational)', shortName: 'en-US-JennyNeural', gender: 'Female', locale: 'en-US', language: 'English', accent: 'United States' },
  { id: 'en-US-AriaNeural', name: 'Aria (US Expressive)', shortName: 'en-US-AriaNeural', gender: 'Female', locale: 'en-US', language: 'English', accent: 'United States' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher (US Deep Baritone)', shortName: 'en-US-ChristopherNeural', gender: 'Male', locale: 'en-US', language: 'English', accent: 'United States' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (UK British)', shortName: 'en-GB-RyanNeural', gender: 'Male', locale: 'en-GB', language: 'English', accent: 'United Kingdom' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (UK British Storyteller)', shortName: 'en-GB-SoniaNeural', gender: 'Female', locale: 'en-GB', language: 'English', accent: 'United Kingdom' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha (Australian)', shortName: 'en-AU-NatashaNeural', gender: 'Female', locale: 'en-AU', language: 'English', accent: 'Australia' },
  { id: 'en-IN-NeerjaNeural', name: 'Neerja (Indian English)', shortName: 'en-IN-NeerjaNeural', gender: 'Female', locale: 'en-IN', language: 'English', accent: 'India' },
  { id: 'ja-JP-NanamiNeural', name: 'Nanami (Japanese)', shortName: 'ja-JP-NanamiNeural', gender: 'Female', locale: 'ja-JP', language: 'Japanese' },
  { id: 'ja-JP-KeitaNeural', name: 'Keita (Japanese)', shortName: 'ja-JP-KeitaNeural', gender: 'Male', locale: 'ja-JP', language: 'Japanese' },
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (Chinese Mandarin)', shortName: 'zh-CN-XiaoxiaoNeural', gender: 'Female', locale: 'zh-CN', language: 'Chinese' },
  { id: 'zh-CN-YunxiNeural', name: 'Yunxi (Chinese Mandarin Story)', shortName: 'zh-CN-YunxiNeural', gender: 'Male', locale: 'zh-CN', language: 'Chinese' },
  { id: 'es-ES-AlvaroNeural', name: 'Alvaro (Spanish Castilian)', shortName: 'es-ES-AlvaroNeural', gender: 'Male', locale: 'es-ES', language: 'Spanish' },
  { id: 'es-ES-ElviraNeural', name: 'Elvira (Spanish Castilian)', shortName: 'es-ES-ElviraNeural', gender: 'Female', locale: 'es-ES', language: 'Spanish' },
  { id: 'fr-FR-DeniseNeural', name: 'Denise (French)', shortName: 'fr-FR-DeniseNeural', gender: 'Female', locale: 'fr-FR', language: 'French' },
  { id: 'fr-FR-HenriNeural', name: 'Henri (French)', shortName: 'fr-FR-HenriNeural', gender: 'Male', locale: 'fr-FR', language: 'French' },
  { id: 'de-DE-KatjaNeural', name: 'Katja (German)', shortName: 'de-DE-KatjaNeural', gender: 'Female', locale: 'de-DE', language: 'German' },
  { id: 'de-DE-ConradNeural', name: 'Conrad (German)', shortName: 'de-DE-ConradNeural', gender: 'Male', locale: 'de-DE', language: 'German' },
  { id: 'it-IT-ElsaNeural', name: 'Elsa (Italian)', shortName: 'it-IT-ElsaNeural', gender: 'Female', locale: 'it-IT', language: 'Italian' },
  { id: 'pt-BR-FranciscaNeural', name: 'Francisca (Portuguese Brazil)', shortName: 'pt-BR-FranciscaNeural', gender: 'Female', locale: 'pt-BR', language: 'Portuguese' },
  { id: 'ko-KR-SunHiNeural', name: 'Sun-Hi (Korean)', shortName: 'ko-KR-SunHiNeural', gender: 'Female', locale: 'ko-KR', language: 'Korean' },
  { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi)', shortName: 'hi-IN-SwaraNeural', gender: 'Female', locale: 'hi-IN', language: 'Hindi' },
];

export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
export const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';
export const CHROMIUM_FULL_VERSION = '143.0.3650.75';
export const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
export const WIN_EPOCH = 11644473600;
export const S_TO_NS = 1e9;

export const EDGE_WS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

// ── DRM v2 (Sec-MS-GEC v2) bitwise digest helpers ───────────────────

const _SHA256_INITIAL = [
  0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
  0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
];
const _SHA256_STATE = [
  0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A,
  0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2,
];
const _SHA256_SCHEDULE = [
  0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA,
  0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6,
  0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33,
  0xD258B060, 0x72766564,
];
const _SHA256_ROUND_CONSTANTS = [
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
];
const _SHA256_ADJUSTMENT = 0xC9DC06A7;
const _SHA256_BLOCK_CONSTANTS = [
  ..._SHA256_ROUND_CONSTANTS.slice(0, 14),
  _SHA256_ADJUSTMENT,
  ..._SHA256_ROUND_CONSTANTS.slice(15),
];
const _SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80;
const _SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0;

const _CS64_COEFFICIENTS = [
  [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038],
  [0xC89C5933, 0xB328CBDF], [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C],
  [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB], [0x06064CF3, 0xFA51A3DA],
  [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
  [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167],
];
const _CS64_FACTOR = 0x82893933;
const _CS64_ADJUSTMENT0 = 0xF2F90B1A;
const _CS64_ADJUSTMENT1 = 0x0B1A0000;

function _u32(val: number | bigint): number {
  return Number(BigInt(val) & 0xFFFFFFFFn);
}

function _rol16(value: number): number {
  const v = _u32(value);
  return _u32((v << 16) | (v >>> 16));
}

function _words_le4_even(data: Uint8Array): number[] {
  const rem = (-data.length) % 4;
  const padLen = rem < 0 ? rem + 4 : rem;
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  if (padded.length === 0) return [];
  const words: number[] = [];
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  for (let i = 0; i < padded.length; i += 4) {
    words.push(view.getUint32(i, true));
  }
  if (words.length % 2 !== 0) {
    words.push(0);
  }
  return words;
}

function _sigma0(v: number): number {
  const val = _u32(v);
  return _u32((val >>> 7) ^ (val << 25) ^ (val >>> 18) ^ (val << 14) ^ (val >>> 3));
}

function _sigma1(v: number): number {
  const val = _u32(v);
  return _u32((val >>> 17) ^ (val << 15) ^ (val >>> 19) ^ (val << 13) ^ (val >>> 10));
}

function _rotr(v: number, n: number): number {
  const val = _u32(v);
  return _u32((val >>> n) ^ (val << (32 - n)));
}

function _sha256_rounds(state: number[], words: number[], firstRound = 0): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? _SHA256_BLOCK_CONSTANTS : _SHA256_ROUND_CONSTANTS;
  const aligned = Math.min(64, Math.ceil(firstRound / 8) * 8);

  for (let i = firstRound; i < aligned; i++) {
    const s1 = _u32(_rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25));
    const ch = _u32((e & f) ^ ((~e) & g));
    const temp1 = _u32(h + s1 + ch + constants[i] + words[i]);
    const s0 = _u32(_rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22));
    const maj = _u32((a & b) ^ (a & c) ^ (b & c));
    const temp2 = _u32(s0 + maj);

    h = g;
    g = f;
    f = e;
    e = _u32(d + temp1);
    d = c;
    c = b;
    b = a;
    a = _u32(temp1 + temp2);
  }

  for (let i = aligned; i < 64; i += 8) {
    for (let r = 0; r < 8; r++) {
      const idx = i + r;
      const s1 = _u32(_rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25));
      const ch = _u32((e & f) ^ ((~e) & g));
      const temp1 = _u32(h + s1 + ch + constants[idx] + words[idx]);
      const s0 = _u32(_rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22));
      const maj = _u32((a & b) ^ (a & c) ^ (b & c));
      const temp2 = _u32(s0 + maj);

      h = g;
      g = f;
      f = e;
      e = _u32(d + temp1);
      d = c;
      c = b;
      b = a;
      a = _u32(temp1 + temp2);
    }
  }
  return [a, b, c, d, e, f, g, h];
}

function _expand_sha256_schedule(words: number[], firstWord = 16): void {
  for (let i = firstWord; i < 64; i++) {
    const s1 = _sigma1(words[i - 2]);
    const s0 = _sigma0(words[i - 15]);
    words[i] = _u32(s1 + words[i - 7] + s0 + words[i - 16]);
  }
}

function _sha256_init(data: Uint8Array): number[] {
  const words = new Array(64).fill(0);
  words[14] = ((data[0] << 16) | (data[1] << 8) | data[2]) >>> 0;
  words[15] = ((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]) >>> 0;

  for (let i = 16; i < 30; i++) {
    let value = _SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) {
      value += i === 16 ? (_sigma1(words[i - 2]) ^ _SHA256_SIGMA1_ADJUSTMENT) : _sigma1(words[i - 2]);
    }
    if (i - 7 >= 14) {
      value += words[i - 7];
    }
    if (i - 15 >= 14) {
      value += i === 29 ? (_sigma0(words[i - 15]) ^ _SHA256_SIGMA0_ADJUSTMENT) : _sigma0(words[i - 15]);
    }
    words[i] = _u32(value);
  }
  words[30] = _u32(
    _sigma1(words[28]) + words[23] + _sigma0(words[15]) + words[14] + _SHA256_ADJUSTMENT - _SHA256_ROUND_CONSTANTS[14]
  );
  _expand_sha256_schedule(words, 31);
  const working = _sha256_rounds(_SHA256_STATE, words, 14);
  return _SHA256_INITIAL.map((x, idx) => _u32(x + working[idx]));
}

function _sha256_digest(data: Uint8Array): Uint8Array {
  if (data.length < 7) {
    throw new Error('Token salt must contain at least seven bytes');
  }
  const length = 57 + data.length;
  const rem = (55 - length) % 64;
  const padZeros = rem < 0 ? rem + 64 : rem;

  const padded = new Uint8Array(data.length - 7 + 1 + padZeros + 8);
  padded.set(data.subarray(7), 0);
  padded[data.length - 7] = 0x80;
  const bitLen = BigInt(length) * 8n;
  const dv = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  dv.setBigUint64(padded.length - 8, bitLen, false);

  let state = _sha256_init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words: number[] = [];
    for (let i = 0; i < 64; i += 4) {
      words.push(dv.getUint32(offset + i, false));
    }
    _expand_sha256_schedule(words);
    const working = _sha256_rounds(state, words);
    state = state.map((x, idx) => _u32(x + working[idx]));
  }
  const digestBytes = new Uint8Array(32);
  const digestDv = new DataView(digestBytes.buffer);
  state.forEach((w, i) => digestDv.setUint32(i * 4, w, false));
  return digestBytes;
}

function _cs64_digest(data: Uint8Array, digest: Uint8Array): [number, number] {
  const dv = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const key_a = _u32(dv.getUint32(0, true) | 1);
  const key_b = _u32(dv.getUint32(4, true) | 1);

  const factor_a = _u32(BigInt(key_a) * BigInt(_CS64_FACTOR));
  const factor_b = _u32(BigInt(key_b) * BigInt(_CS64_FACTOR));
  const factors = [factor_a, factor_b];

  const terms = _CS64_COEFFICIENTS.map(([coeff], idx) =>
    _u32(BigInt(coeff) * BigInt(factors[idx % 2]))
  );
  const offsets = _CS64_COEFFICIENTS.map(([, offset]) => offset);

  const zeroPrefixed = new Uint8Array(1 + data.length);
  zeroPrefixed.set(data, 1);
  const words = _words_le4_even(zeroPrefixed);

  words.forEach((word, idx) => {
    let term = _u32(BigInt(word) * BigInt(idx % 2 === 0 ? key_a : key_b));
    let offset = _u32(BigInt(_rol16(word)) * BigInt(idx % 2 === 0 ? 0xEF0569FB : 0xC31713DB));
    if (idx === 0) {
      term = _u32(BigInt(term) + BigInt(_CS64_ADJUSTMENT0) * BigInt(factors[0]));
      offset = _u32(offset + _CS64_ADJUSTMENT1);
    }
    terms.push(term);
    offsets.push(offset);
  });

  let swap_acc = 0;
  let swap_last = 0;
  let state = 0;
  let acc = 0;

  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];

    let t = _rol16(_u32(offsets[i] + x));
    let q = _u32(BigInt(t) * 0x76F50F34n);
    swap_acc = _u32(BigInt(swap_acc) + BigInt(_rol16(q)) * 0xC3EFEA97n + BigInt(q));

    t = _rol16(_u32(offsets[i + 1] + y));
    q = _u32(BigInt(t) * 0x1881CE3Cn);
    swap_last = _u32(BigInt(_rol16(q)) * 0x35BD1EC9n + BigInt(q));
    swap_acc = _u32(swap_acc + swap_last);

    state = _u32(BigInt(state) * BigInt(key_a) + BigInt(x));
    state = _u32(BigInt(_rol16(state)) * 0xCF98B111n);
    state = _u32(BigInt(_rol16(state)) * 0x87085B9Fn);
    state = _u32(BigInt(_rol16(state)) * 0x12CEB96Dn);
    state = _u32(BigInt(_rol16(state)) * 0x257E1D83n);
    acc = _u32(acc + state);

    t = _u32(BigInt(state) * BigInt(key_b) + BigInt(y));
    t = _u32(BigInt(_rol16(t)) * 0xA27416F5n);
    t = _u32(BigInt(_rol16(t)) * 0xD38396FFn);
    state = _u32(BigInt(_rol16(_u32(BigInt(_rol16(t)) * 0x7C932B89n))) * 0xBFA49F69n);
    acc = _u32(acc + state);
  }

  return [_u32(swap_last ^ state), _u32(swap_acc ^ acc)];
}

/**
 * Generates the Sec-MS-GEC v2 auth token required by Microsoft Edge's Read Aloud service.
 * Matches upstream edge-tts format: `<16 hex CS64>-<64 hex SHA256>`.
 */
export function generateSecMsGecV2(unixTimestamp?: number): string {
  const ts = unixTimestamp !== undefined ? Number(unixTimestamp) : Date.now() / 1000;
  let ticks = ts + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;
  const strToHash = `${Math.round(ticks)}${TRUSTED_CLIENT_TOKEN}`;
  const data = new TextEncoder().encode(strToHash);

  const digest = _sha256_digest(data);
  const [cs64_0, cs64_1] = _cs64_digest(data, digest);

  const cs64Buf = new Uint8Array(8);
  const cs64Dv = new DataView(cs64Buf.buffer);
  cs64Dv.setUint32(0, cs64_0, true);
  cs64Dv.setUint32(4, cs64_1, true);

  const cs64Hex = Array.from(cs64Buf).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const sha256Hex = Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  return `${cs64Hex}-${sha256Hex}`;
}

export interface EdgeSynthesizeOptions {
  voice?: string;
  rate?: number; // 0.5 to 2.0 (1.0 default)
  pitch?: number; // -50Hz to +50Hz
  volume?: number; // 0 to 100
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRate(rate = 1.0): string {
  const percentage = Math.round((rate - 1.0) * 100);
  return percentage >= 0 ? `+${percentage}%` : `${percentage}%`;
}

function formatPitch(pitch = 1.0): string {
  const hz = Math.round((pitch - 1.0) * 50);
  return hz >= 0 ? `+${hz}Hz` : `${hz}Hz`;
}

export function buildSSML(text: string, options: EdgeSynthesizeOptions = {}): string {
  const voice = options.voice || 'en-US-GuyNeural';
  const rateStr = formatRate(options.rate);
  const pitchStr = formatPitch(options.pitch);
  const escaped = escapeXml(text);

  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody rate='${rateStr}' pitch='${pitchStr}'>${escaped}</prosody>` +
    `</voice>` +
    `</speak>`
  );
}

function generateRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Synthesizes text to an MP3 Audio Blob using Microsoft Edge Neural TTS.
 * In Tauri environments (Desktop and Android), routes through the Rust backend
 * to provide authentic Microsoft Edge client headers and DRM v2 handshake.
 */
export async function synthesizeEdgeSpeech(
  text: string,
  options: EdgeSynthesizeOptions = {}
): Promise<Blob> {
  if (!text.trim()) {
    return new Blob([], { type: 'audio/mp3' });
  }

  // 1. Primary path: In Tauri (desktop Linux/Mac/Win & Android), use backend command
  if (isTauri) {
    try {
      const bytes = await api.synthesizeEdgeTts(
        text,
        options.voice,
        options.rate,
        options.pitch
      );
      return new Blob([new Uint8Array(bytes)], { type: 'audio/mp3' });
    } catch (err) {
      logger.warn('[EdgeTTS] Tauri command failed, trying direct browser fallback:', err);
    }
  }

  // 2. Fallback path: Direct WebSocket with Sec-MS-GEC v2 token
  const secMsGec = generateSecMsGecV2();
  const connId = generateRequestId().replace(/-/g, '');
  const wsUrl = `${EDGE_WS_URL}&ConnectionId=${connId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

  return new Promise<Blob>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    const audioChunks: Uint8Array[] = [];
    const reqId = generateRequestId().replace(/-/g, '');
    let isCompleted = false;

    const timeout = setTimeout(() => {
      if (!isCompleted) {
        isCompleted = true;
        try { ws.close(); } catch {}
        reject(new Error('Edge TTS request timed out'));
      }
    }, 20000);

    ws.onopen = () => {
      const configPayload = JSON.stringify({
        context: {
          synthesis: {
            audio: {
              metadataoptions: {
                sentenceBoundaryEnabled: 'false',
                wordBoundaryEnabled: 'false',
              },
              outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
            },
          },
        },
      });

      const configMsg =
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        configPayload;

      ws.send(configMsg);

      const ssml = buildSSML(text, options);
      const ssmlMsg =
        `X-RequestId:${reqId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;

      ws.send(ssmlMsg);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          isCompleted = true;
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          const blob = new Blob(audioChunks as BlobPart[], { type: 'audio/mp3' });
          resolve(blob);
        }
      } else if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        if (view.byteLength > 2) {
          const headerLength = view.getUint16(0);
          if (view.byteLength > 2 + headerLength) {
            const audioData = new Uint8Array(event.data, 2 + headerLength);
            audioChunks.push(audioData);
          }
        }
      }
    };

    ws.onerror = (err) => {
      if (!isCompleted) {
        isCompleted = true;
        clearTimeout(timeout);
        try { ws.close(); } catch {}
        reject(new Error(`Edge TTS connection error: ${JSON.stringify(err)}`));
      }
    };

    ws.onclose = () => {
      if (!isCompleted) {
        isCompleted = true;
        clearTimeout(timeout);
        if (audioChunks.length > 0) {
          logger.warn('Edge TTS connection closed before Path:turn.end — returning partial audio');
          const blob = new Blob(audioChunks as BlobPart[], { type: 'audio/mp3' });
          resolve(blob);
        } else {
          reject(new Error('Edge TTS connection closed before receiving audio'));
        }
      }
    };
  });
}
