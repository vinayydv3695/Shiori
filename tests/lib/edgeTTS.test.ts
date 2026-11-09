import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateSecMsGecV2,
  buildSSML,
  POPULAR_EDGE_VOICES,
  synthesizeEdgeSpeech,
  BASE_URL,
  SEC_MS_GEC_VERSION,
} from '@/lib/edgeTTS';
import { api } from '@/lib/tauri';

vi.mock('@/lib/tauri', () => ({
  isTauri: true,
  api: {
    synthesizeEdgeTts: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Edge Neural TTS Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Sec-MS-GEC v2 Token Generation', () => {
    it('produces expected Sec-MS-GEC v2 format (<16 hex>-<64 hex>)', () => {
      const token = generateSecMsGecV2();
      expect(token).toMatch(/^[0-9A-F]{16}-[0-9A-F]{64}$/);
    });

    it('matches deterministic upstream DRM v2 test vector 1 (1730000000)', () => {
      const token = generateSecMsGecV2(1730000000.0);
      expect(token).toBe(
        '50065ABF67B90F95-49BDAF24D28ECEB38DAEEC84DEAA71E91F92945EA8A47921C58FB4F8F79A4F5E'
      );
    });

    it('matches deterministic upstream DRM v2 test vector 2 (1762666543)', () => {
      const token = generateSecMsGecV2(1762666543.0);
      expect(token).toBe(
        '30D4D419D6D307F0-5D7909674D8080AA13B8D1C3D21F6ADDCB7B440856982A05C15291FE9BAE18CD'
      );
    });

    it('uses readaloud endpoint and v2 Sec-MS-GEC version', () => {
      expect(BASE_URL).toContain('readaloud');
      expect(SEC_MS_GEC_VERSION).toMatch(/^2-/);
    });
  });

  describe('SSML Builder', () => {
    it('builds standard SSML with default voice and 1.0 rate', () => {
      const ssml = buildSSML('The quick brown fox');
      expect(ssml).toContain("<voice name='en-US-GuyNeural'>");
      expect(ssml).toContain("<prosody rate='+0%' pitch='+0Hz'>");
      expect(ssml).toContain('The quick brown fox');
    });

    it('correctly escapes XML characters in SSML', () => {
      const ssml = buildSSML('Tom & Jerry <cartoon> "funny" \'cats\'');
      expect(ssml).toContain('Tom &amp; Jerry &lt;cartoon&gt; &quot;funny&quot; &apos;cats&apos;');
    });

    it('computes correct prosody percentages for rates', () => {
      const fast = buildSSML('Fast text', { rate: 1.5, pitch: 1.2 });
      expect(fast).toContain("rate='+50%'");
      expect(fast).toContain("pitch='+10Hz'");

      const slow = buildSSML('Slow text', { rate: 0.75, pitch: 0.8 });
      expect(slow).toContain("rate='-25%'");
      expect(slow).toContain("pitch='-10Hz'");
    });
  });

  describe('Voice Catalog', () => {
    it('includes popular studio-grade voices', () => {
      const voiceIds = POPULAR_EDGE_VOICES.map((v) => v.id);
      expect(voiceIds).toContain('en-US-GuyNeural');
      expect(voiceIds).toContain('en-US-JennyNeural');
      expect(voiceIds).toContain('en-GB-RyanNeural');
      expect(voiceIds).toContain('ja-JP-NanamiNeural');
      expect(voiceIds).toContain('hi-IN-SwaraNeural');
    });
  });

  describe('Audio Synthesis', () => {
    it('returns empty blob immediately for empty or whitespace text', async () => {
      const blob = await synthesizeEdgeSpeech('   ');
      expect(blob.size).toBe(0);
      expect(api.synthesizeEdgeTts).not.toHaveBeenCalled();
    });

    it('invokes Tauri backend command when in Tauri environment', async () => {
      const mockBytes = [0xff, 0xfb, 0x90, 0x64]; // MP3 frame header mock
      vi.mocked(api.synthesizeEdgeTts).mockResolvedValueOnce(mockBytes);

      const blob = await synthesizeEdgeSpeech('Chapter One', {
        voice: 'en-US-JennyNeural',
        rate: 1.2,
        pitch: 1.0,
      });

      expect(api.synthesizeEdgeTts).toHaveBeenCalledWith(
        'Chapter One',
        'en-US-JennyNeural',
        1.2,
        1.0
      );
      expect(blob.type).toBe('audio/mp3');
      expect(blob.size).toBe(4);
    });
  });
});
