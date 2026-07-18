import React, { useState, useEffect, useMemo } from 'react';
import { ttsEngine } from '@/lib/ttsEngine';
import { usePreferencesStore } from '@/store/preferencesStore';
import { Settings2, Volume2, Globe, ExternalLink, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isAndroid, isTauri, api, VoiceInfo } from '@/lib/tauri';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { getVoices as nativeGetVoices } from 'tauri-plugin-tts-api';

export function VoiceManager() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const preferences = usePreferencesStore(s => s.preferences);
  const updateTtsDefaults = usePreferencesStore(s => s.updateTtsDefaults);
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');

  useEffect(() => {
    const loadVoices = async () => {
      if (isTauri) {
        try {
          const nativeVoices = await nativeGetVoices();
          const mapped = nativeVoices.map(v => ({
            default: false,
            lang: v.language || 'en-US',
            localService: true,
            name: v.name || v.id,
            voiceURI: v.id,
          }) as SpeechSynthesisVoice);
          setVoices(mapped);
          return;
        } catch (e) {
          console.error('Failed to get native voices, falling back to Web Speech API', e);
        }
      }
      setVoices(ttsEngine.getVoices());
    };
    loadVoices();
    if (!isTauri && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    }
  }, []);

  const [piperVoices, setPiperVoices] = useState<VoiceInfo[]>([]);
  const [downloadingVoice, setDownloadingVoice] = useState<string | null>(null);
  const [testingVoice, setTestingVoice] = useState<string | null>(null);

  useEffect(() => {
    if (isTauri) {
      api.getAvailableVoices().then(setPiperVoices).catch(console.error);
    }
  }, []);

  const handleDownloadPiperVoice = async (voice: VoiceInfo) => {
    if (downloadingVoice) return;
    setDownloadingVoice(voice.id);
    try {
      await api.downloadVoice(voice);
      // Refresh list to show as downloaded
      const updated = await api.getAvailableVoices();
      setPiperVoices(updated);
    } catch (e) {
      console.error('Failed to download voice:', e);
    } finally {
      setDownloadingVoice(null);
    }
  };

  const languages = useMemo(() => {
    const langs = new Set<string>();
    voices.forEach(v => {
      if (v.lang) {
        langs.add(v.lang.replace('_', '-').split('-')[0].toLowerCase());
      }
    });
    return Array.from(langs).sort();
  }, [voices]);

  const filteredVoices = useMemo(() => {
    if (selectedLanguage === 'all') return voices;
    return voices.filter(v => v.lang.toLowerCase().startsWith(selectedLanguage));
  }, [voices, selectedLanguage]);

  const currentVoiceUri = preferences?.tts?.voice || 'default';

  const handleTestVoice = async (voice: SpeechSynthesisVoice) => {
    if (isTauri) {
      try {
        const { speak: nativeSpeak } = await import('tauri-plugin-tts-api');
        await nativeSpeak({
          text: 'This is a test of the selected voice.',
          language: null,
          voiceId: voice.voiceURI,
          rate: preferences?.tts?.rate || 1.0,
          pitch: null,
          volume: null,
          queueMode: null
        });
        return;
      } catch (e) {
        console.error('Native TTS test failed', e);
      }
    }

    ttsEngine.speak('This is a test of the selected voice.', {
      voice,
      rate: preferences?.tts?.rate || 1.0,
      volume: 1.0
    });
  };

  const handleManageSystemVoices = async () => {
    if (isAndroid) {
      // Android intent for TTS settings
      await openUrl('intent:#Intent;action=com.android.settings.TTS_SETTINGS;end');
    } else if (isTauri) {
      // Windows TTS settings ms-settings:easeofaccess-narrator or ms-settings:speech
      await openUrl('ms-settings:speech');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-primary" />
          Text to Speech
        </h3>
        <p className="text-sm text-muted-foreground">
          Configure voices and playback speed for reading aloud.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border">
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <label>Speed</label>
            <span>{(preferences?.tts?.rate || 1.0).toFixed(1)}x</span>
          </div>
          <input 
            type="range" 
            min="0.5" 
            max="2.0" 
            step="0.1" 
            value={preferences?.tts?.rate || 1.0}
            onChange={(e) => updateTtsDefaults({ rate: parseFloat(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <label>Pitch</label>
            <span>{(preferences?.tts?.pitch || 1.0).toFixed(1)}</span>
          </div>
          <input 
            type="range" 
            min="0.5" 
            max="2.0" 
            step="0.1" 
            value={preferences?.tts?.pitch || 1.0}
            onChange={(e) => updateTtsDefaults({ pitch: parseFloat(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-1">
          <label className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Filter by Language
          </label>
          <select
            id="language"
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All Languages</option>
            {(() => {
              let displayNames: Intl.DisplayNames | null = null;
              try {
                displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
              } catch (e) {
                // Not supported in this environment
              }
              
              return languages.map(lang => {
                let langName = lang;
                if (displayNames) {
                  try {
                    langName = displayNames.of(lang) || lang;
                  } catch (e) {
                    // Ignore invalid language codes
                  }
                }
                return (
                  <option key={lang} value={lang}>
                    {langName} ({lang})
                  </option>
                );
              });
            })()}
          </select>
        </div>

        <div className="flex-1 space-y-1">
          <label className="text-sm font-medium flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            System Voices
          </label>
          <Button variant="outline" className="w-full" onClick={handleManageSystemVoices}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Manage OS Voices
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card/50 overflow-hidden">
        <div className="max-h-[300px] overflow-y-auto p-0">
          {filteredVoices.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No voices found. Ensure your OS has TTS voices installed.
            </div>
          ) : (
            <div className="divide-y">
              {filteredVoices.map(voice => {
                const isSelected = currentVoiceUri === voice.voiceURI;
                return (
                  <div key={voice.voiceURI} className={`flex items-center justify-between p-3 transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{voice.name}</span>
                      <span className="text-xs text-muted-foreground">{voice.lang} {voice.localService ? '(Local)' : '(Network)'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleTestVoice(voice)}>
                        Test
                      </Button>
                      <Button 
                        variant={isSelected ? "default" : "outline"} 
                        size="sm"
                        onClick={() => updateTtsDefaults({ voice: voice.voiceURI })}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isTauri && piperVoices.length > 0 && (
        <div className="mt-8 space-y-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-primary" />
              High Quality Voices (Piper)
            </h3>
            <p className="text-sm text-muted-foreground">
              Download these local AI voices for superior offline reading quality.
            </p>
          </div>

          <div className="rounded-md border bg-card/50 overflow-hidden">
            <div className="divide-y">
              {piperVoices.map(voice => {
                const isSelected = currentVoiceUri === `piper:${voice.id}`;
                const isDownloading = downloadingVoice === voice.id;
                return (
                  <div key={voice.id} className={`flex items-center justify-between p-3 transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{voice.name}</span>
                      <span className="text-xs text-muted-foreground">{voice.lang} • {voice.quality} quality</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {voice.is_downloaded ? (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            disabled={testingVoice !== null}
                            onClick={async () => {
                              try {
                                setTestingVoice(voice.id);
                                const audioUrl = await api.synthesizeSpeech('Testing 1 2 3.', voice.id);
                                // The audioUrl is a local file path, but tauri cannot play it directly via HTMLAudioElement without asset protocol.
                                // It can be played using window.__TAURI__.convertFileSrc(audioUrl) if imported
                                const { convertFileSrc } = await import('@tauri-apps/api/core');
                                const url = convertFileSrc(audioUrl);
                                const audio = new Audio(url);
                                audio.play().catch(e => console.error("Audio playback blocked:", e));
                              } catch (e) {
                                console.error('Synthesize failed:', e);
                              } finally {
                                setTestingVoice(null);
                              }
                            }}
                          >
                            {testingVoice === voice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
                          </Button>
                          <Button 
                            variant={isSelected ? "default" : "outline"} 
                            size="sm"
                            onClick={() => updateTtsDefaults({ voice: `piper:${voice.id}` })}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </Button>
                        </>
                      ) : (
                        <Button 
                          variant="secondary" 
                          size="sm"
                          disabled={downloadingVoice !== null}
                          onClick={() => handleDownloadPiperVoice(voice)}
                        >
                          {isDownloading ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Downloading...</>
                          ) : (
                            <><Download className="w-4 h-4 mr-2" /> Download (approx 15MB)</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
