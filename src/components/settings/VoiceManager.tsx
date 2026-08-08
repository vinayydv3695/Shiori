import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ttsEngine } from '@/lib/ttsEngine';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useToastStore } from '@/store/toastStore';
import { Settings2, Volume2, Globe, ExternalLink, Download, Loader2, Search, Sparkles, Check, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isAndroid, isTauri, isLinux, api, VoiceInfo } from '@/lib/tauri';
import { getErrorMessage } from '@/lib/errors';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { getVoices as nativeGetVoices } from 'tauri-plugin-tts-api';

import { listen } from '@tauri-apps/api/event';

function formatLanguageName(code?: string): string {
  if (!code || code === 'all') return 'All Languages';
  try {
    const clean = code.replace('_', '-');
    const parts = clean.split('-');
    const lang = parts[0];
    const region = parts[1];
    const langName = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) || lang;
    if (region) {
      const regionName = new Intl.DisplayNames(['en'], { type: 'region' }).of(region);
      if (regionName) return `${langName} (${regionName})`;
    }
    return langName;
  } catch {
    return code.replace('_', ' ');
  }
}

interface PiperDownloadProgressPayload {
  voiceId: string;
  fileName: string;
  downloadedBytes: number;
  totalBytes: number;
}

export function VoiceManager() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const preferences = usePreferencesStore(s => s.preferences);
  const updateTtsDefaults = usePreferencesStore(s => s.updateTtsDefaults);
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [piperSearchQuery, setPiperSearchQuery] = useState<string>('');
  const [piperLanguageFilter, setPiperLanguageFilter] = useState<string>('all');
  const [piperTabFilter, setPiperTabFilter] = useState<'all' | 'installed' | 'available'>('all');

  useEffect(() => {
    const loadVoices = async () => {
      if (isTauri && !isLinux) {
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
  const [piperLoadError, setPiperLoadError] = useState<string | null>(null);
  const [downloadingVoice, setDownloadingVoice] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { downloadedBytes: number; totalBytes: number }>>({});
  const [testingVoice, setTestingVoice] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri || isAndroid) return;
    let unlisten: (() => void) | undefined;
    listen<PiperDownloadProgressPayload>('piper:download-progress', (event) => {
      const { voiceId, downloadedBytes, totalBytes } = event.payload;
      setDownloadProgress((prev) => ({
        ...prev,
        [voiceId]: { downloadedBytes, totalBytes },
      }));
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const loadPiperVoices = useCallback(async () => {
    // Piper is compiled out of the Android backend — never fetch (or show the section) there.
    if (!isTauri || isAndroid) return;
    try {
      const list = await api.getAvailableVoices();
      setPiperVoices(list);
      setPiperLoadError(null);
    } catch (e) {
      console.error('Failed to load Piper voices:', e);
      setPiperLoadError(getErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadPiperVoices();
  }, [loadPiperVoices]);

  const handleDownloadPiperVoice = async (voice: VoiceInfo) => {
    if (downloadingVoice) return;
    setDownloadingVoice(voice.id);
    setDownloadProgress((prev) => ({ ...prev, [voice.id]: { downloadedBytes: 0, totalBytes: 0 } }));
    try {
      await api.downloadVoice(voice);
      // Refresh list to show as downloaded
      const updated = await api.getAvailableVoices();
      setPiperVoices(updated);
      useToastStore.getState().addToast({
        title: 'Voice downloaded',
        description: `${voice.name} is ready to use.`,
        variant: 'success',
      });
    } catch (e) {
      console.error('Failed to download voice:', e);
      useToastStore.getState().addToast({
        title: 'Voice download failed',
        description: getErrorMessage(e),
        variant: 'error',
      });
    } finally {
      setDownloadingVoice(null);
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[voice.id];
        return next;
      });
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
    if (isTauri && !isLinux) {
      try {
        const { speak: nativeSpeak } = await import('tauri-plugin-tts-api');
        await nativeSpeak({
          text: 'This is a test of the selected voice.',
          language: voice.lang || null,
          voiceId: voice.voiceURI,
          rate: preferences?.tts?.rate || 1.0,
          pitch: null,
          volume: null,
          queueMode: null
        });
        return;
      } catch (e) {
        console.error('Native TTS test failed, falling back to Web Speech API', e);
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

  const piperLanguages = useMemo(() => {
    const langs = new Set<string>();
    piperVoices.forEach(v => {
      if (v.lang) {
        langs.add(v.lang.replace('_', '-').split('-')[0].toLowerCase());
      }
    });
    return Array.from(langs).sort();
  }, [piperVoices]);

  const filteredPiperVoices = useMemo(() => {
    return piperVoices.filter(v => {
      // Tab filter
      if (piperTabFilter === 'installed' && !v.is_downloaded) return false;
      if (piperTabFilter === 'available' && v.is_downloaded) return false;

      // Language filter
      if (piperLanguageFilter !== 'all' && !v.lang.toLowerCase().startsWith(piperLanguageFilter.toLowerCase())) {
        return false;
      }

      // Search query
      if (piperSearchQuery.trim()) {
        const q = piperSearchQuery.toLowerCase();
        const matchesName = v.name.toLowerCase().includes(q);
        const matchesLang = v.lang.toLowerCase().includes(q);
        const matchesId = v.id.toLowerCase().includes(q);
        const matchesQuality = v.quality.toLowerCase().includes(q);
        if (!matchesName && !matchesLang && !matchesId && !matchesQuality) {
          return false;
        }
      }

      return true;
    });
  }, [piperVoices, piperTabFilter, piperLanguageFilter, piperSearchQuery]);

  const installedPiperCount = useMemo(() => piperVoices.filter(v => v.is_downloaded).length, [piperVoices]);

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
          <Select
            value={selectedLanguage}
            onValueChange={setSelectedLanguage}
          >
            <SelectTrigger className="w-full mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              {languages.map(lang => (
                <SelectItem key={lang} value={lang}>
                  {formatLanguageName(lang)} ({lang})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      {isTauri && !isAndroid && (piperVoices.length > 0 || piperLoadError !== null) && (
        <div className="mt-8 space-y-4">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
            <div>
              <h3 className="text-base font-semibold tracking-tight flex items-center gap-2 text-foreground">
                <Volume2 className="w-4 h-4 text-primary" />
                Offline Neural Voices (Piper)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fast on-device neural TTS models for high quality offline reading.
              </p>
            </div>
            {piperVoices.length > 0 && (
              <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border/40 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setPiperTabFilter('all')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    piperTabFilter === 'all'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All ({piperVoices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPiperTabFilter('installed')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    piperTabFilter === 'installed'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Installed ({installedPiperCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPiperTabFilter('available')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    piperTabFilter === 'available'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Available ({piperVoices.length - installedPiperCount})
                </button>
              </div>
            )}
          </div>

          {/* Search & Language Filter Controls */}
          {piperVoices.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={piperSearchQuery}
                  onChange={(e) => setPiperSearchQuery(e.target.value)}
                  placeholder="Search voices by name, language, or code..."
                  className="w-full pl-9 pr-8 py-1.5 text-xs font-medium rounded-xl bg-secondary/30 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-1 focus:ring-ring shadow-2xs"
                />
                {piperSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setPiperSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={piperLanguageFilter}
                  onValueChange={setPiperLanguageFilter}
                >
                  <SelectTrigger className="w-full sm:w-[180px] h-8 rounded-xl bg-secondary/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Languages ({piperLanguages.length})</SelectItem>
                    {piperLanguages.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {formatLanguageName(lang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Voice Cards Container */}
          <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden shadow-2xs">
            <div className="max-h-[460px] overflow-y-auto custom-scrollbar p-2.5 space-y-1.5">
              {piperLoadError !== null && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-xs">Failed to load offline voices</span>
                    <span className="text-[11px] text-destructive/80 truncate mt-0.5">{piperLoadError}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void loadPiperVoices()} className="h-7 text-xs border-destructive/30 hover:bg-destructive hover:text-destructive-foreground">
                    Retry
                  </Button>
                </div>
              )}

              {filteredPiperVoices.length === 0 && piperLoadError === null ? (
                <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                  <Volume2 className="w-7 h-7 text-muted-foreground/30 mb-2" />
                  <p className="text-xs font-semibold text-foreground">No matching voices found</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Try searching with a different language or query.</p>
                </div>
              ) : (
                filteredPiperVoices.map(voice => {
                  const isSelected = currentVoiceUri === `piper:${voice.id}`;
                  const isDownloading = downloadingVoice === voice.id;

                  return (
                    <div 
                      key={voice.id} 
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-colors gap-3 ${
                        isSelected 
                          ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20' 
                          : 'bg-secondary/15 hover:bg-secondary/35 border-border/30'
                      }`}
                    >
                      {/* Left info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground truncate">{voice.name}</span>
                            {isSelected && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-primary/15 text-primary border border-primary/25">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            <span>{voice.lang}</span>
                            <span>•</span>
                            <span className="capitalize">{voice.quality.replace('_', ' ')} quality</span>
                            {voice.is_downloaded ? (
                              <>
                                <span>•</span>
                                <span className="text-emerald-500 font-medium flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Installed
                                </span>
                              </>
                            ) : (
                              <>
                                <span>•</span>
                                <span className="text-muted-foreground/80">~15 MB</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {voice.is_downloaded ? (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              disabled={testingVoice !== null}
                              className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                              onClick={async () => {
                                try {
                                  setTestingVoice(voice.id);
                                  const audioUrl = await api.synthesizeSpeech('Testing 1 2 3.', voice.id);
                                  const isDataUri = audioUrl.startsWith('data:');
                                  const url = isDataUri
                                    ? audioUrl
                                    : (await import('@tauri-apps/api/core')).convertFileSrc(audioUrl);
                                  const audio = new Audio(url);
                                  await audio.play();
                                } catch (e) {
                                  console.error('Synthesize failed:', e);
                                  useToastStore.getState().addToast({
                                    title: 'Voice test failed',
                                    description: getErrorMessage(e),
                                    variant: 'error',
                                  });
                                } finally {
                                  setTestingVoice(null);
                                }
                              }}
                            >
                              {testingVoice === voice.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Volume2 className="w-3.5 h-3.5 mr-1" />}
                              Test
                            </Button>
                            <Button 
                              variant={isSelected ? "default" : "outline"} 
                              size="sm"
                              className={`h-8 px-3.5 text-xs font-semibold rounded-lg transition-all ${
                                isSelected 
                                  ? 'bg-primary text-primary-foreground shadow-xs' 
                                  : 'border-border/60 hover:bg-secondary text-foreground'
                              }`}
                              onClick={() => updateTtsDefaults({ voice: `piper:${voice.id}` })}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </Button>
                          </>
                        ) : isDownloading ? (
                          (() => {
                            const progress = downloadProgress[voice.id];
                            const downloadedMB = progress ? (progress.downloadedBytes / (1024 * 1024)).toFixed(1) : '0.0';
                            const hasTotal = progress && progress.totalBytes > 0;
                            const totalMB = hasTotal ? (progress.totalBytes / (1024 * 1024)).toFixed(1) : null;
                            const pct = hasTotal ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100)) : null;

                            return (
                              <div className="flex flex-col items-end gap-1 min-w-[190px]">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>
                                    {pct !== null ? `${pct}% (${downloadedMB} / ${totalMB} MB)` : `Downloading… (${downloadedMB} MB)`}
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-secondary/80 rounded-full overflow-hidden border border-border/40">
                                  <div
                                    className="h-full bg-primary transition-all duration-300 rounded-full"
                                    style={{ width: pct !== null && pct > 0 ? `${pct}%` : '100%' }}
                                  />
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={downloadingVoice !== null}
                            className="h-8 px-3 text-xs font-medium border-border/60 hover:bg-secondary text-foreground rounded-lg transition-colors"
                            onClick={() => handleDownloadPiperVoice(voice)}
                          >
                            <Download className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                            Download
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      {isAndroid && (
        <div className="mt-8 rounded-md border bg-card/50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Android uses your system text-to-speech engine — manage voices in system settings.
          </p>
          <Button variant="link" className="shrink-0 px-0" onClick={handleManageSystemVoices}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open settings
          </Button>
        </div>
      )}
    </div>
  );
}
