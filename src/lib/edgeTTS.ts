/**
 * Microsoft Edge Neural Text-to-Speech client
 * Provides 100% free, studio-grade neural voice synthesis without API keys.
 */

import { logger } from './logger';

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

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600; // Seconds between 1601-01-01 (Windows epoch) and 1970-01-01
const SEC_MS_GEC_VERSION = '1-130.0.2849.68';

const EDGE_WS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readahead/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

/**
 * Generates the Sec-MS-GEC auth token Microsoft now requires for Edge TTS
 * (same algorithm as the edge-tts upstream client): SHA-256 of the Windows
 * tick count (rounded down to a 5-minute boundary) plus the trusted client
 * token, hex-encoded uppercase.
 */
async function generateSecMsGec(): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Edge TTS requires WebCrypto (crypto.subtle) to generate the Sec-MS-GEC token');
  }
  const ticks = Math.floor(Date.now() / 1000 + WIN_EPOCH) * 10_000_000;
  const alignedTicks = ticks - (ticks % 3_000_000_000);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${alignedTicks}${TRUSTED_CLIENT_TOKEN}`)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
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

function buildSSML(text: string, options: EdgeSynthesizeOptions): string {
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
 * Synthesizes text to an MP3 Audio Blob using Microsoft Edge Speech WebSocket.
 */
export async function synthesizeEdgeSpeech(
  text: string,
  options: EdgeSynthesizeOptions = {}
): Promise<Blob> {
  if (!text.trim()) {
    return new Blob([], { type: 'audio/mp3' });
  }

  const secMsGec = await generateSecMsGec();
  // Browsers cannot attach headers to the WebSocket handshake, so the auth is
  // carried in the URL query (as edge-tts upstream does). Edge itself sends
  // X-Timestamp / Sec-MS-GEC / Sec-MS-GEC-Version as headers; a header-capable
  // transport could set them here instead.
  const wsUrl = `${EDGE_WS_URL}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

  return new Promise<Blob>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    const audioChunks: Uint8Array[] = [];
    const reqId = generateRequestId();
    let isCompleted = false;

    const timeout = setTimeout(() => {
      if (!isCompleted) {
        isCompleted = true;
        try { ws.close(); } catch {}
        reject(new Error('Edge TTS request timed out'));
      }
    }, 15000);

    ws.onopen = () => {
      // 1. Send speech.config
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

      // 2. Send SSML payload
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
