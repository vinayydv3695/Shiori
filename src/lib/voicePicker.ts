import type { VoiceInfo } from '@/lib/tauri';
import { POPULAR_EDGE_VOICES, type EdgeVoice } from './edgeTTS';

/**
 * Build the reader voice-picker list:
 * 1. Edge Neural voices (cloud, human-quality audiobooks)
 * 2. Native/WebSpeech voices
 * 3. Piper voices (offline neural)
 */
export function buildVoicePickerItems(
  native: SpeechSynthesisVoice[],
  piper: VoiceInfo[],
  edgeVoices: EdgeVoice[] = [],
): SpeechSynthesisVoice[] {
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

  return [...edgeItems, ...native, ...piperItems];
}
