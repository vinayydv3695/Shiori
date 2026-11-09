import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchElevenLabsSubscription,
  fetchElevenLabsVoices,
  synthesizeElevenLabsAudio,
  synthesizeElevenLabsWithTimestamps,
  isQuotaExceededError,
  formatQuotaProgress,
  ELEVENLABS_MODELS,
  DEFAULT_ELEVENLABS_MODEL,
} from '@/lib/elevenLabs';
import { buildVoicePickerItems } from '@/lib/voicePicker';

describe('ElevenLabs Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Model Configurations', () => {
    it('defaults to eleven_flash_v2_5 for free tier credit efficiency', () => {
      expect(DEFAULT_ELEVENLABS_MODEL).toBe('eleven_flash_v2_5');
      const flashModel = ELEVENLABS_MODELS.find((m) => m.id === 'eleven_flash_v2_5');
      expect(flashModel).toBeDefined();
      expect(flashModel?.costFactor).toBe(0.5);
    });
  });

  describe('formatQuotaProgress', () => {
    it('correctly formats quota progress and remaining values', () => {
      const q = formatQuotaProgress(1500, 10000);
      expect(q.percent).toBe(15);
      expect(q.remaining).toBe(8500);
      expect(q.isNearLimit).toBe(false);
      expect(q.isExceeded).toBe(false);
      expect(q.formatted).toContain('8,500 / 10,000');
    });

    it('identifies near-limit states', () => {
      const q = formatQuotaProgress(9000, 10000);
      expect(q.percent).toBe(90);
      expect(q.isNearLimit).toBe(true);
      expect(q.isExceeded).toBe(false);
    });

    it('identifies exceeded limit states', () => {
      const q = formatQuotaProgress(10500, 10000);
      expect(q.isExceeded).toBe(true);
      expect(q.remaining).toBe(0);
    });
  });

  describe('isQuotaExceededError', () => {
    it('detects 429 and quota keywords', () => {
      expect(isQuotaExceededError(new Error('Character limit reached'))).toBe(true);
      expect(isQuotaExceededError(new Error('429 Too Many Requests'))).toBe(true);
      expect(isQuotaExceededError(new Error('Monthly quota exceeded'))).toBe(true);
      expect(isQuotaExceededError(new Error('Network error'))).toBe(false);
    });
  });

  describe('fetchElevenLabsSubscription', () => {
    it('throws if api key is missing', async () => {
      await expect(fetchElevenLabsSubscription('')).rejects.toThrow('API key is missing');
    });

    it('fetches subscription details successfully', async () => {
      const mockResponse = {
        tier: 'free',
        character_count: 2400,
        character_limit: 10000,
        status: 'active',
        next_character_count_reset_unix: 1735000000,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const sub = await fetchElevenLabsSubscription('xi-test-key');
      expect(sub.tier).toBe('free');
      expect(sub.character_count).toBe(2400);
      expect(sub.character_limit).toBe(10000);
    });

    it('handles 401 unauthorized correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(fetchElevenLabsSubscription('xi-bad-key')).rejects.toThrow('Invalid ElevenLabs API key');
    });
  });

  describe('fetchElevenLabsVoices', () => {
    it('maps voices correctly', async () => {
      const mockResponse = {
        voices: [
          {
            voice_id: 'v1',
            name: 'Rachel',
            category: 'premade',
            description: 'Calm and narrative',
            labels: { accent: 'American', gender: 'female' },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const voices = await fetchElevenLabsVoices('xi-test-key');
      expect(voices).toHaveLength(1);
      expect(voices[0].name).toBe('Rachel');
      expect(voices[0].voice_id).toBe('v1');
    });
  });

  describe('buildVoicePickerItems', () => {
    it('includes ElevenLabs voices alongside Edge and Piper voices', () => {
      const nativeVoices: SpeechSynthesisVoice[] = [];
      const piperVoices = [];
      const edgeVoices = [{ id: 'en-US-GuyNeural', name: 'Guy', shortName: 'en-US-GuyNeural', gender: 'Male' as const, locale: 'en-US', language: 'English' }];
      const elevenVoices = [{ voice_id: 'rachel-id', name: 'Rachel', category: 'premade', labels: { accent: 'American' } }];

      const items = buildVoicePickerItems(nativeVoices, piperVoices, edgeVoices, elevenVoices);
      expect(items).toHaveLength(2);
      expect(items[0].voiceURI).toBe('elevenlabs:rachel-id');
      expect(items[0].name).toBe('ElevenLabs — Rachel');
      expect(items[1].voiceURI).toBe('edge:en-US-GuyNeural');
    });
  });
});
