/**
 * React hook for Text-to-Speech orchestration with sentence-level reading
 * Manages TTS state machine, voice selection, and DOM highlighting
 * 
 * On desktop and Android: Uses native OS TTS by default (tauri-plugin-tts)
 * Fallback: Uses Web Speech API purely as a last resort (e.g., plain web builds)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ttsEngine, TTSEngine } from '@/lib/ttsEngine';
import { logger } from '@/lib/logger';
import type { TTSState } from '@/lib/ttsEngine';
import { splitSentences } from '@/lib/sentenceSplitter';
import { highlightSentence, clearAllHighlights } from '@/lib/sentenceHighlighter';
import { api, isTauri, isAndroid, isLinux } from '@/lib/tauri';
import type { VoiceInfo } from '@/lib/tauri';
import { buildVoicePickerItems } from '@/lib/voicePicker';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useToastStore } from '@/store/toastStore';
import { extractTextFromDOM } from '@/lib/textExtractor';
import { convertFileSrc } from '@tauri-apps/api/core';
import { synthesizeEdgeSpeech, POPULAR_EDGE_VOICES } from '@/lib/edgeTTS';
// Native TTS support (Tauri plugin)
import { speak as nativeSpeak, stop as nativeStop, getVoices as nativeGetVoices, onSpeechEvent, pauseSpeaking } from 'tauri-plugin-tts-api';

// Module-level cache for Piper voices in the reader picker. Tolerates
// failure silently: a Piper outage must never break the native voice list.
let piperVoicesCache: VoiceInfo[] | null = null;
let piperVoicesPromise: Promise<VoiceInfo[]> | null = null;
function loadPiperVoicesForPicker(): Promise<VoiceInfo[]> {
  // Piper is compiled out of the Android/iOS backend — never invoke it there.
  if (!isTauri || isAndroid) return Promise.resolve([]);
  if (piperVoicesCache) return Promise.resolve(piperVoicesCache);
  if (!piperVoicesPromise) {
    piperVoicesPromise = api
      .getAvailableVoices()
      .then((voices) => {
        piperVoicesCache = voices;
        return voices;
      })
      .catch((error) => {
        logger.debug('[TTS] Piper voices unavailable for reader picker:', error);
        return [];
      });
  }
  return piperVoicesPromise;
}

export interface UseTTSOptions {
  contentRef: React.RefObject<HTMLElement | null>;
  onChapterEnd?: () => void;
  contentKey?: string | number;
}

export interface UseTTSReturn {
  isAvailable: boolean;
  noVoices: boolean;
  state: TTSState;
  currentSentenceIndex: number;
  totalSentences: number;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  nextSentence: () => void;
  prevSentence: () => void;
  setVoice: (voice: SpeechSynthesisVoice) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  speakText: (text: string) => void;
}

const cleanupAudioElement = (audio: HTMLAudioElement | null) => {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch {}
};

/** Strip cloud/local URI prefixes so native engines only ever receive plain voice ids. */
const resolveNativeVoiceId = (voice: string | null | undefined): string | null => {
  if (!voice || voice === 'default') return null;
  if (voice.startsWith('edge:') || voice.startsWith('piper:')) return null;
  return voice;
};

/** Revoke a tracked blob object URL (safe to call repeatedly / after revocation). */
const revokeTrackedBlobUrl = (ref: { current: string | null }): void => {
  if (ref.current) {
    try {
      URL.revokeObjectURL(ref.current);
    } catch {
      // already revoked or invalid — nothing else to do
    }
    ref.current = null;
  }
};

export function useTTS({ contentRef, onChapterEnd, contentKey }: UseTTSOptions): UseTTSReturn {
  const [state, setState] = useState<TTSState>('idle');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [sentences, setSentences] = useState<string[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [noVoices, setNoVoices] = useState<boolean>(false);
  const [piperAvailable, setPiperAvailable] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRateState] = useState<number>(1.0);
  const [pitch, setPitchState] = useState<number>(1.0);
  const [useNativeTTS, setUseNativeTTS] = useState<boolean>(false);

  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef<number>(0);
  const piperAudioRef = useRef<HTMLAudioElement | null>(null);
  const piperFallbackRef = useRef(false);
  const edgeFallbackRef = useRef(false);
  const generationRef = useRef<number>(0);
  const blobUrlRef = useRef<string | null>(null);
  const cleanupHighlightRef = useRef<(() => void) | null>(null);
  const speakSentenceAtIndexRef = useRef<(index: number, sentenceArray?: string[]) => void>(() => {});
  const nativeTTSTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Android: the native plugin emits speech:start / speech:finish / speech:error
  // events. Drive sentence advance from speech:finish and surface real errors
  // instead of timing out blindly (which made the UI “read” sentences while no
  // audio played). Desktop engines do not emit events — the timer stays.
  const audioStartConfirmedRef = useRef(false);
  const audioGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeErrorReportedRef = useRef(false);
  const finishAdvanceRef = useRef<() => void>(() => {});

  const isAvailable = TTSEngine.isAvailable() || useNativeTTS || piperAvailable || (isTauri && !isAndroid);

  // Always try to detect native TTS first if running in Tauri.
  // We can't use isAvailable to gate checkNativeTTS because Web Speech API might be entirely absent (e.g., on Android WebView)
  useEffect(() => {
     const checkNativeTTS = async () => {
       if (isLinux) {
         // On Linux, use Web Speech / Piper neural voices directly.
         setUseNativeTTS(false);
         return;
       }
       try {
         logger.debug('[TTS] Checking native TTS plugin availability...');
         await nativeStop();
         logger.debug('[TTS] Native TTS plugin detected and available');
         setUseNativeTTS(true);
       } catch (error) {
         logger.debug('[TTS] Native TTS plugin not available, falling back to Web Speech API / Piper:', error);
         setUseNativeTTS(false);
       }
     };

    checkNativeTTS();
  }, []);

  // Piper is compiled into the desktop backend (not Android/iOS); its
  // availability is async (voice query). Default unavailable, flip on when the
  // query resolves so Linux (no Web Speech, no native plugin) still enables TTS.
  useEffect(() => {
    if (!isTauri || isAndroid) return;
    let mounted = true;
    loadPiperVoicesForPicker().then((piper) => {
      if (mounted && piper.length > 0) {
        setPiperAvailable(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Android: subscribe to plugin speech events so sentence advance follows real
  // audio finish and engine errors surface instead of silent timeouts.
  useEffect(() => {
    if (!useNativeTTS || !isAndroid) return;
    let mounted = true;
    const unlisteners: (() => void)[] = [];

    const subscribe = (event: 'speech:start' | 'speech:finish' | 'speech:error', cb: (payload: unknown) => void) => {
      onSpeechEvent(event, () => cb(null))
        .then((unlisten) => {
          if (mounted) unlisteners.push(unlisten);
          else unlisten();
        })
        .catch((e) => logger.warn(`[TTS] subscribe ${event} failed`, e));
    };

    subscribe('speech:start', () => {
      audioStartConfirmedRef.current = true;
      if (audioGuardTimerRef.current) {
        clearTimeout(audioGuardTimerRef.current);
        audioGuardTimerRef.current = null;
      }
    });

    subscribe('speech:finish', () => {
      audioStartConfirmedRef.current = true;
      if (audioGuardTimerRef.current) {
        clearTimeout(audioGuardTimerRef.current);
        audioGuardTimerRef.current = null;
      }
      if (mounted) finishAdvanceRef.current();
    });

    subscribe('speech:error', () => {
      if (!mounted) return;
      if (audioGuardTimerRef.current) {
        clearTimeout(audioGuardTimerRef.current);
        audioGuardTimerRef.current = null;
      }
      if (nativeTTSTimeoutRef.current) {
        clearTimeout(nativeTTSTimeoutRef.current);
        nativeTTSTimeoutRef.current = null;
      }
      nativeStop().catch(() => {});
      setState('idle');
      if (cleanupHighlightRef.current) {
        cleanupHighlightRef.current();
        cleanupHighlightRef.current = null;
      }
      if (!nativeErrorReportedRef.current) {
        nativeErrorReportedRef.current = true;
        useToastStore.getState().addToast({
          title: 'TTS stopped',
          description: 'Speech synthesis reported an error — check the TTS engine and voice data.',
          variant: 'error',
          duration: 4000,
        });
      }
    });

    return () => {
      mounted = false;
      unlisteners.forEach((u) => u());
      if (audioGuardTimerRef.current) {
        clearTimeout(audioGuardTimerRef.current);
        audioGuardTimerRef.current = null;
      }
    };
  }, [useNativeTTS, isAndroid]);

  useEffect(() => {
    if (!isAvailable) {
      return;
    }

    const loadVoices = async () => {
      let availableVoices: SpeechSynthesisVoice[] = [];
      
      if (useNativeTTS && !isLinux) {
        try {
          const nativeVoices = await nativeGetVoices();
          availableVoices = nativeVoices.map(v => ({
            default: false,
            lang: v.language || 'en-US',
            localService: true,
            name: v.name || v.id,
            voiceURI: v.id,
          }) as SpeechSynthesisVoice);
        } catch (error) {
          logger.error('Failed to get native voices', error);
          availableVoices = ttsEngine.getVoices();
        }
      } else {
        availableVoices = ttsEngine.getVoices();
      }

      let piper: VoiceInfo[] = [];
      if (isTauri && !isAndroid) {
        piper = await loadPiperVoicesForPicker();
      }
      availableVoices = buildVoicePickerItems(availableVoices, piper, POPULAR_EDGE_VOICES);

      setVoices(availableVoices);
      setNoVoices(availableVoices.length === 0);

      const preferences = usePreferencesStore.getState().preferences;
      const preferredVoiceURI = preferences?.tts?.voice;

      if (preferredVoiceURI && preferredVoiceURI !== 'default') {
        const voice = availableVoices.find(v => v.voiceURI === preferredVoiceURI);
        if (voice) {
          setSelectedVoice(voice);
        }
      }

      const preferredRate = preferences?.tts?.rate;
      if (preferredRate !== undefined) {
        setRateState(preferredRate);
      }
      const preferredPitch = preferences?.tts?.pitch;
      if (preferredPitch !== undefined) {
        setPitchState(preferredPitch);
      }
    };

    loadVoices();

    if (!useNativeTTS && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, [isAvailable, useNativeTTS]);

  // Reset TTS state when the content changes (e.g., chapter navigation)
  useEffect(() => {
    // Invalidate any in-flight Edge/Piper synthesis and drop its object URL.
    generationRef.current += 1;
    revokeTrackedBlobUrl(blobUrlRef);
    setState('idle');
    setCurrentSentenceIndex(0);
    currentIndexRef.current = 0;
    setSentences([]);
    sentencesRef.current = [];
    
    if (piperAudioRef.current) {
      cleanupAudioElement(piperAudioRef.current);
      piperAudioRef.current = null;
    }

    if (useNativeTTS) {
      nativeStop().catch(() => {});
      if (nativeTTSTimeoutRef.current) {
        clearTimeout(nativeTTSTimeoutRef.current);
      }
    } else {
      ttsEngine.stop();
    }

    if (cleanupHighlightRef.current) {
      cleanupHighlightRef.current();
      cleanupHighlightRef.current = null;
    }

    if (contentRef.current) {
      clearAllHighlights(contentRef.current);
    }
  }, [contentKey]);

  // Called by Android speech:finish (and as a fallback by the time-budget timer
  // on desktop where no events are emitted). Shared tail: advance or finish.
  useEffect(() => {
    finishAdvanceRef.current = () => {
      if (nativeTTSTimeoutRef.current) {
        clearTimeout(nativeTTSTimeoutRef.current);
        nativeTTSTimeoutRef.current = null;
      }
      const nextIndex = currentIndexRef.current + 1;
      if (nextIndex < sentencesRef.current.length) {
        speakSentenceAtIndexRef.current(nextIndex);
      } else {
        setState('idle');
        setCurrentSentenceIndex(0);
        currentIndexRef.current = 0;
        if (cleanupHighlightRef.current) {
          cleanupHighlightRef.current();
          cleanupHighlightRef.current = null;
        }
        onChapterEnd?.();
      }
    };
  }, [onChapterEnd]);

  useEffect(() => {
    const contentEl = contentRef.current;
    return () => {
      // Invalidate in-flight synthesis and release the tracked object URL.
      generationRef.current += 1;
      revokeTrackedBlobUrl(blobUrlRef);
      if (useNativeTTS) {
        nativeStop().catch(() => {});
        if (nativeTTSTimeoutRef.current) {
          clearTimeout(nativeTTSTimeoutRef.current);
        }
      } else {
        ttsEngine.stop();
      }
      if (cleanupHighlightRef.current) {
        cleanupHighlightRef.current();
        cleanupHighlightRef.current = null;
      }
      if (contentEl) {
        clearAllHighlights(contentEl);
      }
    };
  }, [contentRef, useNativeTTS]);

  const speakSentenceAtIndex = useCallback((index: number, sentenceArray?: string[]) => {
    const currentSentences = sentenceArray || sentencesRef.current;
    
    if (index < 0 || index >= currentSentences.length || !contentRef.current) {
      return;
    }

    // Bump the generation counter so any in-flight Edge/Piper synthesis from a
    // previous sentence, skip or stop bails out before it creates/plays audio.
    const gen = generationRef.current + 1;
    generationRef.current = gen;

    if (cleanupHighlightRef.current) {
      cleanupHighlightRef.current();
      cleanupHighlightRef.current = null;
    }

    // Stop previous Piper audio if running
    if (piperAudioRef.current) {
      piperAudioRef.current.pause();
      piperAudioRef.current.src = '';
      piperAudioRef.current = null;
    }

    const sentence = currentSentences[index];

    const cleanup = highlightSentence(contentRef.current, sentence);
    cleanupHighlightRef.current = cleanup;

    const preferences = usePreferencesStore.getState().preferences;
    const preferredVoice = preferences?.tts?.voice;
    const isEdge = preferredVoice && preferredVoice.startsWith('edge:');
    const isPiper = preferredVoice && preferredVoice.startsWith('piper:');

    if (isEdge) {
      const voiceId = preferredVoice.replace('edge:', '');
      setState('speaking');
      setCurrentSentenceIndex(index);
      currentIndexRef.current = index;

      synthesizeEdgeSpeech(sentence, { voice: voiceId, rate, pitch })
        .then((blob) => {
          if (gen !== generationRef.current) return;

          revokeTrackedBlobUrl(blobUrlRef);
          const audioUrl = URL.createObjectURL(blob);
          blobUrlRef.current = audioUrl;
          const audio = new Audio(audioUrl);
          // Edge SSML already carries the rate (prosody) — no playbackRate here
          // or 1.5× would be applied twice (2.25×).
          piperAudioRef.current = audio;

          audio.onended = () => {
            if (blobUrlRef.current === audioUrl) blobUrlRef.current = null;
            URL.revokeObjectURL(audioUrl);
            if (gen !== generationRef.current) return;
            const nextIndex = currentIndexRef.current + 1;
            if (nextIndex < sentencesRef.current.length) {
              speakSentenceAtIndexRef.current(nextIndex);
            } else {
              setState('idle');
              setCurrentSentenceIndex(0);
              currentIndexRef.current = 0;
              if (cleanupHighlightRef.current) {
                cleanupHighlightRef.current();
                cleanupHighlightRef.current = null;
              }
              onChapterEnd?.();
            }
          };

          audio.onerror = (e) => {
            if (blobUrlRef.current === audioUrl) blobUrlRef.current = null;
            URL.revokeObjectURL(audioUrl);
            if (gen !== generationRef.current) return;
            logger.warn('Edge TTS playback error, falling back to Web Speech:', e);
            piperAudioRef.current = null;
            if (TTSEngine.isAvailable()) {
              ttsEngine.speak(sentence, {
                rate,
                onEnd: () => {
                  const nextIndex = currentIndexRef.current + 1;
                  if (nextIndex < sentencesRef.current.length) {
                    speakSentenceAtIndexRef.current(nextIndex);
                  } else {
                    setState('idle');
                  }
                },
                onError: () => setState('idle'),
              });
            } else {
              setState('idle');
            }
          };

          audio.play().catch((e) => {
            if (blobUrlRef.current === audioUrl) blobUrlRef.current = null;
            URL.revokeObjectURL(audioUrl);
            if (gen !== generationRef.current) return;
            logger.warn('Edge TTS audio play() rejected, falling back to Web Speech:', e);
            piperAudioRef.current = null;
            if (TTSEngine.isAvailable()) {
              ttsEngine.speak(sentence, {
                rate,
                onEnd: () => {
                  const nextIndex = currentIndexRef.current + 1;
                  if (nextIndex < sentencesRef.current.length) {
                    speakSentenceAtIndexRef.current(nextIndex);
                  } else {
                    setState('idle');
                  }
                },
                onError: () => setState('idle'),
              });
            } else {
              setState('idle');
              useToastStore.getState().addToast({
                title: 'TTS unavailable',
                description: 'Edge audio could not start and no fallback TTS engine is available.',
                variant: 'error',
                duration: 4000,
              });
            }
          });
        })
        .catch((err) => {
          if (gen !== generationRef.current) return;
          logger.warn('Edge TTS synthesis failed:', err);
          setState('idle');
        });
      return;
    }

    if (isPiper) {
      const voiceId = preferredVoice.replace('piper:', '');
      setState('speaking');
      setCurrentSentenceIndex(index);
      currentIndexRef.current = index;

      api.synthesizeSpeech(sentence, voiceId)
        .then((rawUrl) => {
          if (gen !== generationRef.current) {
            if (rawUrl && rawUrl.startsWith('blob:')) {
              try {
                URL.revokeObjectURL(rawUrl);
              } catch {
                // already revoked or invalid — nothing else to do
              }
            }
            return;
          }
          let audioUrl = rawUrl;
          if (rawUrl && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:') && !rawUrl.startsWith('http')) {
            try {
              audioUrl = convertFileSrc(rawUrl);
            } catch {
              audioUrl = rawUrl;
            }
          }
          const audio = new Audio(audioUrl);
          audio.playbackRate = rate;
          piperAudioRef.current = audio;
          
          audio.onended = () => {
            if (gen !== generationRef.current) return;
            const nextIndex = currentIndexRef.current + 1;
            if (nextIndex < sentencesRef.current.length) {
              speakSentenceAtIndexRef.current(nextIndex);
            } else {
              setState('idle');
              setCurrentSentenceIndex(0);
              currentIndexRef.current = 0;
              if (cleanupHighlightRef.current) {
                cleanupHighlightRef.current();
                cleanupHighlightRef.current = null;
              }
              onChapterEnd?.();
            }
          };
          
          audio.onerror = (e) => {
            if (gen !== generationRef.current) return;
            logger.warn('Piper audio playback error, falling back to Web Speech:', e);
            piperAudioRef.current = null;
            if (TTSEngine.isAvailable()) {
              ttsEngine.speak(sentence, {
                rate,
                onEnd: () => {
                  const nextIndex = currentIndexRef.current + 1;
                  if (nextIndex < sentencesRef.current.length) {
                    speakSentenceAtIndexRef.current(nextIndex);
                  } else {
                    setState('idle');
                  }
                },
                onError: () => setState('idle')
              });
            } else {
              setState('idle');
            }
          };
          
          audio.play().catch(e => {
            if (gen !== generationRef.current) return;
            logger.warn('Piper play() promise rejected, falling back to Web Speech:', e);
            if (TTSEngine.isAvailable()) {
              ttsEngine.speak(sentence, {
                rate,
                onEnd: () => {
                  const nextIndex = currentIndexRef.current + 1;
                  if (nextIndex < sentencesRef.current.length) {
                    speakSentenceAtIndexRef.current(nextIndex);
                  } else {
                    setState('idle');
                  }
                },
                onError: () => setState('idle')
              });
            } else {
              setState('idle');
            }
          });
        })
        .catch(error => {
          if (gen !== generationRef.current) return;
          logger.warn('Piper synthesis failed, falling back to Web Speech:', error);
          if (TTSEngine.isAvailable()) {
            ttsEngine.speak(sentence, {
              rate,
              onEnd: () => {
                const nextIndex = currentIndexRef.current + 1;
                if (nextIndex < sentencesRef.current.length) {
                  speakSentenceAtIndexRef.current(nextIndex);
                } else {
                  setState('idle');
                }
              },
              onError: () => setState('idle')
            });
          } else {
            setState('idle');
          }
        });

    } else if (useNativeTTS) {
      // Calculate realistic duration considering Android TTS initialization overhead
      const charsPerSec = 14 * Math.max(0.5, rate);
      const estimatedDuration = Math.max(1500, Math.ceil((sentence.length / charsPerSec) * 1000));

      // Android: expect the engine to fire speech:start soon. If it never does,
      // the voice/engine/language is silently unusable — surface it and stop
      // instead of advancing through sentences with no audio.
      if (isAndroid) {
        audioStartConfirmedRef.current = false;
        if (audioGuardTimerRef.current) {
          clearTimeout(audioGuardTimerRef.current);
          audioGuardTimerRef.current = null;
        }
        audioGuardTimerRef.current = setTimeout(() => {
          audioGuardTimerRef.current = null;
          if (audioStartConfirmedRef.current) return;
          if (nativeTTSTimeoutRef.current) {
            clearTimeout(nativeTTSTimeoutRef.current);
            nativeTTSTimeoutRef.current = null;
          }
          nativeStop().catch(() => {});
          setState('idle');
          if (cleanupHighlightRef.current) {
            cleanupHighlightRef.current();
            cleanupHighlightRef.current = null;
          }
          if (!nativeErrorReportedRef.current) {
            nativeErrorReportedRef.current = true;
            useToastStore.getState().addToast({
              title: 'No TTS audio',
              description: 'The selected voice produced no audio — check TTS engine, voice language data and media volume.',
              variant: 'error',
              duration: 4000,
            });
          }
        }, 1800);
      }

      nativeSpeak({
        text: sentence,
        language: selectedVoice?.lang || null,
        voiceId: resolveNativeVoiceId(preferredVoice),
        rate,
        pitch: null,
        volume: null,
        queueMode: null,
      }).catch((error) => {
        logger.warn('Native TTS encountered an error:', error);
        if (audioGuardTimerRef.current) {
          clearTimeout(audioGuardTimerRef.current);
          audioGuardTimerRef.current = null;
        }
        if (isAndroid) {
          // Android WebView speechSynthesis is frequently absent/silent — do not
          // fall back to it. Stop and tell the user instead.
          nativeStop().catch(() => {});
          setState('idle');
          if (cleanupHighlightRef.current) {
            cleanupHighlightRef.current();
            cleanupHighlightRef.current = null;
          }
          if (!nativeErrorReportedRef.current) {
            nativeErrorReportedRef.current = true;
            useToastStore.getState().addToast({
              title: 'TTS failed',
              description: String(error && typeof error === 'object' && 'message' in error ? (error as { message?: string }).message : error),
              variant: 'error',
              duration: 4000,
            });
          }
        } else {
          ttsEngine.speak(sentence, {
            voice: selectedVoice || undefined,
            rate,
            pitch,
            onEnd: () => {
              if (nativeTTSTimeoutRef.current) {
                clearTimeout(nativeTTSTimeoutRef.current);
                nativeTTSTimeoutRef.current = null;
              }
              finishAdvanceRef.current();
            },
            onError: (event) => {
              logger.error('TTS error:', event);
              setState('idle');
            }
          });
        }
      });

      setState('speaking');
      setCurrentSentenceIndex(index);
      currentIndexRef.current = index;

      // Advance on Android via speech:finish (fast, real). The time budget below
      // is the safety net for engines that never emit events, and the primary
      // driver on desktop.
      nativeTTSTimeoutRef.current = setTimeout(() => {
        nativeTTSTimeoutRef.current = null;
        finishAdvanceRef.current();
      }, estimatedDuration);
    } else {
      ttsEngine.speak(sentence, {
        voice: selectedVoice || undefined,
        rate,
        pitch,
        onEnd: () => {
          const nextIndex = currentIndexRef.current + 1;

          if (nextIndex < sentencesRef.current.length) {
            speakSentenceAtIndexRef.current(nextIndex);
          } else {
            setState('idle');
            setCurrentSentenceIndex(0);
            currentIndexRef.current = 0;
            
            if (cleanupHighlightRef.current) {
              cleanupHighlightRef.current();
              cleanupHighlightRef.current = null;
            }

            onChapterEnd?.();
          }
        },
         onError: (event) => {
           logger.error('TTS error:', event);
          setState('idle');
        },
      });
      setState('speaking');
      setCurrentSentenceIndex(index);
      currentIndexRef.current = index;
    }
  }, [contentRef, rate, pitch, selectedVoice, onChapterEnd, useNativeTTS]);

  // Keep ref in sync
  useEffect(() => {
    speakSentenceAtIndexRef.current = speakSentenceAtIndex;
  }, [speakSentenceAtIndex]);

  /**
   * Start playing from the beginning
   */
  const play = useCallback(() => {
    if (!isAvailable || !contentRef.current) {
      return;
    }

     // Extract text from DOM
     const text = extractTextFromDOM(contentRef.current);
     if (!text) {
       logger.warn('No text content found to speak');
       return;
     }

     // Split into sentences
     const sentenceList = splitSentences(text);
     if (sentenceList.length === 0) {
       logger.warn('No sentences found in content');
       return;
     }

    // Update state
    setSentences(sentenceList);
    sentencesRef.current = sentenceList;
    setCurrentSentenceIndex(0);
    currentIndexRef.current = 0;
    // Fresh session: allow one error/silence toast per play, re-arm audio guard.
    audioStartConfirmedRef.current = false;
    nativeErrorReportedRef.current = false;

    // Start speaking from sentence 0
    speakSentenceAtIndex(0, sentenceList);
  }, [isAvailable, contentRef, speakSentenceAtIndex]);

  const pause = useCallback(() => {
    setState('paused');
    
    if (piperAudioRef.current) {
      piperAudioRef.current.pause();
    }

    if (useNativeTTS) {
      if (nativeTTSTimeoutRef.current) {
        clearTimeout(nativeTTSTimeoutRef.current);
        nativeTTSTimeoutRef.current = null;
      }
      if (audioGuardTimerRef.current) {
        clearTimeout(audioGuardTimerRef.current);
        audioGuardTimerRef.current = null;
      }
      if (!isAndroid) {
        // tauri-plugin-tts only supports pauseSpeaking on iOS; on desktop the
        // engine keeps talking after a timer-clear, so stop it for real —
        // resume() re-speaks the current sentence exactly once.
        pauseSpeaking()
          .then((result) => {
            if (!result.success) {
              nativeStop().catch(() => {});
            }
          })
          .catch(() => {
            nativeStop().catch(() => {});
          });
      }
    } else {
      ttsEngine.pause();
    }
  }, [useNativeTTS]);

  /**
   * Resume paused TTS
   */
  const resume = useCallback(() => {
    if (state !== 'paused') return;

    if (piperAudioRef.current) {
      setState('speaking');
      piperAudioRef.current.play().catch(e => logger.error('Failed to resume piper', e));
      return;
    }

    if (useNativeTTS) {
      speakSentenceAtIndex(currentIndexRef.current);
    } else {
      ttsEngine.resume();
      setState('speaking');
    }
  }, [state, useNativeTTS, speakSentenceAtIndex]);

  const stop = useCallback(async () => {
    // Invalidate in-flight Edge/Piper synthesis and release its object URL
    // before it can start playing up to 15s later.
    generationRef.current += 1;
    revokeTrackedBlobUrl(blobUrlRef);
    setState('idle');
    
    if (piperAudioRef.current) {
      piperAudioRef.current.pause();
      piperAudioRef.current.src = '';
      piperAudioRef.current = null;
    }

    if (useNativeTTS) {
      if (nativeTTSTimeoutRef.current) {
        clearTimeout(nativeTTSTimeoutRef.current);
        nativeTTSTimeoutRef.current = null;
      }
      if (audioGuardTimerRef.current) {
        clearTimeout(audioGuardTimerRef.current);
        audioGuardTimerRef.current = null;
      }
      try {
        await nativeStop();
      } catch (e) {
        logger.error('Failed to stop native TTS', e);
      }
    } else {
      ttsEngine.stop();
    }
    
    setState('idle');
    setCurrentSentenceIndex(0);
    currentIndexRef.current = 0;

    if (cleanupHighlightRef.current) {
      cleanupHighlightRef.current();
      cleanupHighlightRef.current = null;
    }

    if (contentRef.current) {
      clearAllHighlights(contentRef.current);
    }
  }, [isAvailable, contentRef, useNativeTTS]);

  const nextSentence = useCallback(() => {
    const currentSentences = sentencesRef.current;
    if (!isAvailable || currentSentences.length === 0) {
      return;
    }

    const nextIndex = Math.min(currentIndexRef.current + 1, currentSentences.length - 1);
    
    if (useNativeTTS) {
      if (nativeTTSTimeoutRef.current) {
        clearTimeout(nativeTTSTimeoutRef.current);
        nativeTTSTimeoutRef.current = null;
      }
      nativeStop().catch(() => {});
    } else {
      ttsEngine.stop();
    }

    speakSentenceAtIndex(nextIndex);
  }, [isAvailable, speakSentenceAtIndex, useNativeTTS]);

  const prevSentence = useCallback(() => {
    const currentSentences = sentencesRef.current;
    if (!isAvailable || currentSentences.length === 0) {
      return;
    }

    const prevIndex = Math.max(currentIndexRef.current - 1, 0);
    
    if (useNativeTTS) {
      if (nativeTTSTimeoutRef.current) {
        clearTimeout(nativeTTSTimeoutRef.current);
        nativeTTSTimeoutRef.current = null;
      }
      nativeStop().catch(() => {});
    } else {
      ttsEngine.stop();
    }

    speakSentenceAtIndex(prevIndex);
  }, [isAvailable, speakSentenceAtIndex, useNativeTTS]);

  /**
   * Change voice and save to preferences
   */
  const setVoice = useCallback((voice: SpeechSynthesisVoice) => {
    setSelectedVoice(voice);

    // Save to preferences
    usePreferencesStore.getState().updateTtsDefaults({
      voice: voice.voiceURI,
    });
  }, []);

  /**
   * Change speech rate and save to preferences
   */
  const setRate = useCallback((newRate: number) => {
    setRateState(newRate);

    // Save to preferences
    usePreferencesStore.getState().updateTtsDefaults({
      rate: newRate,
    });
  }, []);

  /**
   * Change speech pitch and save to preferences
   */
  const setPitch = useCallback((newPitch: number) => {
    setPitchState(newPitch);

    // Save to preferences
    usePreferencesStore.getState().updateTtsDefaults({
      pitch: newPitch,
    });
  }, []);

  const speakText = useCallback((text: string) => {
    if (!isAvailable) {
      return;
    }

    if (useNativeTTS) {
      nativeSpeak({
        text,
        language: null,
        voiceId: resolveNativeVoiceId(selectedVoice?.voiceURI),
        rate,
        pitch,
        volume: null,
        queueMode: null,
       }).catch((error) => {
         logger.error('Native TTS error:', error);
       });
    } else {
      ttsEngine.speak(text, {
        voice: selectedVoice || undefined,
        rate,
        pitch,
      });
    }
  }, [isAvailable, rate, pitch, selectedVoice, useNativeTTS]);

  return {
    isAvailable,
    noVoices,
    state,
    currentSentenceIndex,
    totalSentences: sentences.length,
    voices,
    selectedVoice,
    rate,
    pitch,
    play,
    pause,
    resume,
    stop,
    nextSentence,
    prevSentence,
    setVoice,
    setRate,
    setPitch,
    speakText,
  };
}
