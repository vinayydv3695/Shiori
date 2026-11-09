/**
 * ElevenLabs API Service
 * Handles authentication, subscription quota tracking, voice listing,
 * and high-fidelity speech synthesis with character timestamps.
 */

import { logger } from './logger';

export interface ElevenLabsSubscription {
  tier: string;
  character_count: number;
  character_limit: number;
  can_extend_character_limit: boolean;
  allowed_to_extend_character_limit: boolean;
  next_character_count_reset_unix: number;
  status: string;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
  preview_url?: string;
  labels?: Record<string, string>;
}

export interface ElevenLabsModel {
  id: string;
  name: string;
  costFactor: number;
  description: string;
  badge?: string;
}

export const ELEVENLABS_MODELS: ElevenLabsModel[] = [
  {
    id: 'eleven_flash_v2_5',
    name: 'Eleven Flash v2.5',
    costFactor: 0.5,
    description: 'Ultra-fast (~75ms latency) & consumes 50% fewer credits — ideal for the 10k free tier.',
    badge: 'Free Tier Saver',
  },
  {
    id: 'eleven_turbo_v2_5',
    name: 'Eleven Turbo v2.5',
    costFactor: 0.5,
    description: 'High quality with ultra-low latency across 32 languages.',
    badge: 'Fast',
  },
  {
    id: 'eleven_multilingual_v2',
    name: 'Eleven Multilingual v2',
    costFactor: 1.0,
    description: 'Maximum emotional depth, natural pauses, and nuanced dramatic narration.',
    badge: 'Studio Quality',
  },
];

export const DEFAULT_ELEVENLABS_MODEL = 'eleven_flash_v2_5';
export const ELEVENLABS_SIGNUP_URL = 'https://elevenlabs.io/app/sign-up';

const BASE_URL = 'https://api.elevenlabs.io/v1';

/**
 * Fetch subscription status and remaining character quota
 */
export async function fetchElevenLabsSubscription(apiKey: string): Promise<ElevenLabsSubscription> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error('ElevenLabs API key is missing');

  const res = await fetch(`${BASE_URL}/user/subscription`, {
    headers: {
      'xi-api-key': trimmed,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid ElevenLabs API key');
    throw new Error(`Failed to fetch ElevenLabs subscription (HTTP ${res.status})`);
  }

  const data = await res.json();
  return {
    tier: data.tier || 'free',
    character_count: data.character_count ?? 0,
    character_limit: data.character_limit ?? 10000,
    can_extend_character_limit: Boolean(data.can_extend_character_limit),
    allowed_to_extend_character_limit: Boolean(data.allowed_to_extend_character_limit),
    next_character_count_reset_unix: data.next_character_count_reset_unix ?? 0,
    status: data.status || 'active',
  };
}

/**
 * Fetch available voices (premade, cloned, and generated)
 */
export async function fetchElevenLabsVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const trimmed = apiKey.trim();
  if (!trimmed) return [];

  const res = await fetch(`${BASE_URL}/voices`, {
    headers: {
      'xi-api-key': trimmed,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid ElevenLabs API key');
    throw new Error(`Failed to fetch ElevenLabs voices (HTTP ${res.status})`);
  }

  const data = await res.json();
  const rawVoices: any[] = data.voices || [];

  return rawVoices.map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category || 'premade',
    description: v.description || '',
    preview_url: v.preview_url || undefined,
    labels: v.labels || {},
  }));
}

/**
 * Synthesize raw audio (ArrayBuffer of MP3)
 */
export async function synthesizeElevenLabsAudio(params: {
  text: string;
  voiceId: string;
  modelId?: string;
  apiKey: string;
  rate?: number;
}): Promise<ArrayBuffer> {
  const { text, voiceId, modelId = DEFAULT_ELEVENLABS_MODEL, apiKey } = params;
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) throw new Error('ElevenLabs API key is missing');
  if (!text.trim()) throw new Error('Text to synthesize is empty');

  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': trimmedKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error('ElevenLabs API key is invalid or unauthorized');
    }
    if (res.status === 429 || errorBody.toLowerCase().includes('quota') || errorBody.toLowerCase().includes('character limit')) {
      const err = new Error('ElevenLabs character quota exceeded');
      (err as any).isQuotaExceeded = true;
      throw err;
    }
    throw new Error(`ElevenLabs TTS error (HTTP ${res.status}): ${errorBody || res.statusText}`);
  }

  return await res.arrayBuffer();
}

export interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Synthesize audio with character-level alignment timestamps for word karaoke tracking
 */
export async function synthesizeElevenLabsWithTimestamps(params: {
  text: string;
  voiceId: string;
  modelId?: string;
  apiKey: string;
}): Promise<{ audioBlob: Blob; alignment?: ElevenLabsAlignment }> {
  const { text, voiceId, modelId = DEFAULT_ELEVENLABS_MODEL, apiKey } = params;
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) throw new Error('ElevenLabs API key is missing');
  if (!text.trim()) throw new Error('Text to synthesize is empty');

  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}/with-timestamps`, {
    method: 'POST',
    headers: {
      'xi-api-key': trimmedKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error('ElevenLabs API key is invalid or unauthorized');
    }
    if (res.status === 429 || errorBody.toLowerCase().includes('quota') || errorBody.toLowerCase().includes('character limit')) {
      const err = new Error('ElevenLabs character quota exceeded');
      (err as any).isQuotaExceeded = true;
      throw err;
    }
    throw new Error(`ElevenLabs TTS error (HTTP ${res.status}): ${errorBody || res.statusText}`);
  }

  const data = await res.json();
  const rawBase64 = data.audio_base64;
  if (!rawBase64) throw new Error('ElevenLabs response did not contain audio data');

  // Convert base64 to Blob
  const byteChars = atob(rawBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const audioBlob = new Blob([byteArray], { type: 'audio/mp3' });

  return {
    audioBlob,
    alignment: data.alignment,
  };
}

/**
 * Determine if an error is due to ElevenLabs quota exhaustion
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  if ((error as any).isQuotaExceeded) return true;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('quota') ||
    lower.includes('character limit') ||
    lower.includes('credit limit') ||
    lower.includes('429')
  );
}

/**
 * Helper to calculate quota metrics
 */
export function formatQuotaProgress(used: number, limit: number): {
  percent: number;
  remaining: number;
  formatted: string;
  isNearLimit: boolean;
  isExceeded: boolean;
} {
  const safeLimit = Math.max(1, limit);
  const safeUsed = Math.max(0, used);
  const remaining = Math.max(0, safeLimit - safeUsed);
  const percent = Math.min(100, Math.round((safeUsed / safeLimit) * 100));
  const isNearLimit = percent >= 85 && percent < 100;
  const isExceeded = safeUsed >= safeLimit;

  return {
    percent,
    remaining,
    formatted: `${remaining.toLocaleString()} / ${safeLimit.toLocaleString()} characters remaining (${100 - percent}%)`,
    isNearLimit,
    isExceeded,
  };
}
