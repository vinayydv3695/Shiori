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
import type { TTSState, TTSOptions } from '@/lib/ttsEngine';
import { splitSentences } from '@/lib/sentenceSplitter';
import { highlightSentence, clearAllHighlights } from '@/lib/sentenceHighlighter';
import { isAndroid, isTauri, api } from '@/lib/tauri';
import { usePreferencesStore } from '@/store/preferencesStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { extractTextFromDOM } from '@/lib/textExtractor';
// Native TTS support (Tauri plugin)
import { speak as nativeSpeak, stop as nativeStop, getVoices as nativeGetVoices } from 'tauri-plugin-tts-api';

export interface UseTTSOptions {
  contentRef: React.RefObject<HTMLElement | null>;
  onChapterEnd?: () => void;
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

export function useTTS({ contentRef, onChapterEnd }: UseTTSOptions): UseTTSReturn {
  const [state, setState] = useState<TTSState>('idle');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [sentences, setSentences] = useState<string[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [noVoices, setNoVoices] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRateState] = useState<number>(1.0);
  const [pitch, setPitchState] = useState<number>(1.0);
  const [useNativeTTS, setUseNativeTTS] = useState<boolean>(false);

  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef<number>(0);
  const piperAudioRef = useRef<HTMLAudioElement | null>(null);
  const cleanupHighlightRef = useRef<(() => void) | null>(null);
  const speakSentenceAtIndexRef = useRef<(index: number, sentenceArray?: string[]) => void>(() => {});
  const nativeTTSTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAvailable = TTSEngine.isAvailable() || useNativeTTS;

  // Always try to detect native TTS first if running in Tauri.
  // We can't use isAvailable to gate checkNativeTTS because Web Speech API might be entirely absent (e.g., on Android WebView)
  useEffect(() => {
     const checkNativeTTS = async () => {
       try {
         logger.debug('[TTS] Checking native TTS plugin availability...');
         await nativeStop();
         logger.debug('[TTS] Native TTS plugin detected and available');
         setUseNativeTTS(true);
       } catch (error) {
         logger.debug('[TTS] Native TTS plugin not available, falling back to Web Speech API:', error);
         setUseNativeTTS(false);
       }
     };

    checkNativeTTS();
  }, []);

  useEffect(() => {
    if (!isAvailable) {
      return;
    }

    const loadVoices = async () => {
      let availableVoices: SpeechSynthesisVoice[] = [];
      
      if (useNativeTTS) {
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

  useEffect(() => {
    const contentEl = contentRef.current;
    return () => {
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
    const isPiper = preferredVoice && preferredVoice.startsWith('piper:');

    if (isPiper) {
      const voiceId = preferredVoice.replace('piper:', '');
      setState('speaking');
      setCurrentSentenceIndex(index);
      currentIndexRef.current = index;

      api.synthesizeSpeech(sentence, voiceId)
        .then((audioUrl) => {
          const url = convertFileSrc(audioUrl);
          const audio = new Audio(url);
          audio.playbackRate = rate;
          piperAudioRef.current = audio;
          
          audio.onended = () => {
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
            logger.error('Piper audio error:', e);
            setState('idle');
          };
          
          audio.play().catch(e => {
            logger.error('Piper playback failed:', e);
            setState('idle');
          });
        })
        .catch(error => {
          logger.error('Piper synthesis failed:', error);
          setState('idle');
        });

    } else if (useNativeTTS) {
      const estimatedDuration = (sentence.length / 15) * (1.0 / rate) * 1000;
      
       nativeSpeak({
         text: sentence,
         language: null,
         voiceId: preferredVoice && preferredVoice !== 'default' ? preferredVoice : null,
         rate,
         pitch: null,
         volume: null,
         queueMode: null,
       }).catch((error) => {
         logger.error('Native TTS error:', error);
         setState('idle');
       });

      setState('speaking');
      setCurrentSentenceIndex(index);
      currentIndexRef.current = index;

      nativeTTSTimeoutRef.current = setTimeout(() => {
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
        voiceId: selectedVoice?.voiceURI || null,
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
