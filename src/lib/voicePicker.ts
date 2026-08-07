import type { VoiceInfo } from '@/lib/tauri';

/**
 * Build the reader voice-picker list: native/WebSpeech voices first, then
 * Piper voices appended as entries whose `voiceURI` carries the `piper:`
 * prefix that `useTTS` playback routing expects (`startsWith('piper:')`).
 *
 * Selecting one of these entries stores `piper:<id>` in the TTS preference,
 * so the pref round-trip matches exactly what `speakSentenceAtIndex` routes.
 */
export function buildVoicePickerItems(
  native: SpeechSynthesisVoice[],
  piper: VoiceInfo[],
): SpeechSynthesisVoice[] {
  const downloadedPiper = piper.filter((v) => v.is_downloaded);
  const piperItems: SpeechSynthesisVoice[] = downloadedPiper.map((v) => ({
    default: false,
    lang: v.lang || 'en-US',
    localService: true,
    name: `Piper — ${v.name}`,
    voiceURI: `piper:${v.id}`,
  }));
  return [...native, ...piperItems];
}
