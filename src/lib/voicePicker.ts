import type { VoiceInfo } from '@/lib/tauri';
import { POPULAR_EDGE_VOICES, type EdgeVoice } from './edgeTTS';
import type { ElevenLabsVoice } from './elevenLabs';

/**
 * Build the reader voice-picker list:
 * 1. ElevenLabs AI voices (studio-grade neural audiobooks)
 * 2. Edge Neural voices (cloud, human-quality audiobooks)
 * 3. Native/WebSpeech voices
 * 4. Piper voices (offline neural)
 */
export function buildVoicePickerItems(
  native: SpeechSynthesisVoice[],
  piper: VoiceInfo[],
  edgeVoices: EdgeVoice[] = [],
  elevenLabsVoices: ElevenLabsVoice[] = [],
): SpeechSynthesisVoice[] {
  const elevenItems: SpeechSynthesisVoice[] = elevenLabsVoices.map((v) => ({
    default: false,
    lang: v.labels?.accent || 'en-US',
    localService: false,
    name: `ElevenLabs — ${v.name}${v.category === 'cloned' ? ' (Cloned)' : ''}`,
    voiceURI: `elevenlabs:${v.voice_id}`,
  }));

  const edgeItems: SpeechSynthesisVoice[] = edgeVoices.map((v) => ({
    default: false,
    lang: v.locale,
    localService: false,
    name: `Edge Neural — ${v.name}`,
    voiceURI: `edge:${v.id}`,
  }));

  const downloadedPiper = piper.filter((v) => v.is_downloaded);
  const piperItems: SpeechSynthesisVoice[] = downloadedPiper.map((v) => ({
    default: false,
    lang: v.lang || 'en-US',
    localService: true,
    name: `Piper — ${v.name}`,
    voiceURI: `piper:${v.id}`,
  }));

  return [...elevenItems, ...edgeItems, ...native, ...piperItems];
}
