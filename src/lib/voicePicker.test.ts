import { describe, it, expect } from 'vitest';
import { buildVoicePickerItems } from '@/lib/voicePicker';
import type { VoiceInfo } from '@/lib/tauri';

function nativeVoice(voiceURI: string, name: string, lang = 'en-US'): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService: true,
    name,
    voiceURI,
  } as SpeechSynthesisVoice;
}

function piperVoice(id: string, name: string, lang = 'en-US'): VoiceInfo {
  return {
    id,
    name,
    lang,
    quality: 'medium',
    download_url_onnx: `https://example.com/${id}.onnx`,
    download_url_json: `https://example.com/${id}.json`,
    is_downloaded: true,
  };
}

describe('buildVoicePickerItems', () => {
  it('returns native voices unchanged when there are no Piper voices', () => {
    const native = [nativeVoice('native-1', 'Native One')];
    const items = buildVoicePickerItems(native, []);
    expect(items).toHaveLength(1);
    expect(items[0].voiceURI).toBe('native-1');
    expect(items[0].name).toBe('Native One');
  });

  it('appends Piper entries after native voices with the piper: prefix', () => {
    const native = [nativeVoice('native-1', 'Native One')];
    const piper = [piperVoice('piper-id-1', 'Piper Voice One')];
    const items = buildVoicePickerItems(native, piper);

    expect(items).toHaveLength(2);
    expect(items[0].voiceURI).toBe('native-1');
    expect(items[1].voiceURI).toBe('piper:piper-id-1');
    expect(items[1].name).toBe('Piper — Piper Voice One');
    expect(items[1].lang).toBe('en-US');
    expect(items[1].localService).toBe(true);
  });

  it('keeps each Piper voice selectable with a unique picker id', () => {
    const piper = [piperVoice('a', 'A'), piperVoice('b', 'B')];
    const items = buildVoicePickerItems([], piper);
    expect(items.map((v) => v.voiceURI)).toEqual(['piper:a', 'piper:b']);
  });

  it('falls back to en-US for Piper voices without a language', () => {
    const piper = [piperVoice('x', 'X', '')];
    const [item] = buildVoicePickerItems([], piper);
    expect(item.lang).toBe('en-US');
  });
});
