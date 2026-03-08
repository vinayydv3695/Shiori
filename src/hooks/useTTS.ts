/**
 * React hook for Text-to-Speech orchestration with sentence-level reading
 * Manages TTS state machine, voice selection, and DOM highlighting
 * 
 * On Linux: Uses native TTS via tauri-plugin-tts (speech-dispatcher)
 * On other platforms: Falls back to Web Speech API
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ttsEngine, TTSEngine } from '@/lib/ttsEngine';
import type { TTSState, TTSOptions } from '@/lib/ttsEngine';
import { splitSentences } from '@/lib/sentenceSplitter';
import { highlightSentence, clearAllHighlights } from '@/lib/sentenceHighlighter';
import { extractTextFromDOM } from '@/lib/textExtractor';
import { usePreferencesStore } from '@/store/preferencesStore';

// Native TTS support (Tauri plugin)
import { speak as nativeSpeak, stop as nativeStop } from 'tauri-plugin-tts-api';

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
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  nextSentence: () => void;
  prevSentence: () => void;
  setVoice: (voice: SpeechSynthesisVoice) => void;
  setRate: (rate: number) => void;
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
  const [useNativeTTS, setUseNativeTTS] = useState<boolean>(false);

  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef<number>(0);
  const cleanupHighlightRef = useRef<(() => void) | null>(null);
  const speakSentenceAtIndexRef = useRef<(index: number, sentenceArray?: string[]) => void>(() => {});
  const nativeTTSTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAvailable = TTSEngine.isAvailable() || useNativeTTS;

  useEffect(() => {
    if (!isAvailable) {
      return;
    }

    const checkNativeTTS = async () => {
      try {
        console.log('[TTS] Checking native TTS plugin availability...');
        await nativeStop();
        console.log('[TTS] Native TTS plugin detected and available');
        setUseNativeTTS(true);
        return;
      } catch (error) {
        console.log('[TTS] Native TTS plugin not available, falling back to Web Speech API:', error);
        setUseNativeTTS(false);
      }
    };

    checkNativeTTS();

    const loadVoices = () => {
      const availableVoices = ttsEngine.getVoices();
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
    };

    loadVoices();

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, [isAvailable]);

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

    const sentence = currentSentences[index];

    const cleanup = highlightSentence(contentRef.current, sentence);
    cleanupHighlightRef.current = cleanup;

    if (useNativeTTS) {
      const estimatedDuration = (sentence.length / 15) * (1.0 / rate) * 1000;
      
      nativeSpeak({
        text: sentence,
        language: null,
        voiceId: null,
        rate,
        pitch: null,
        volume: null,
        queueMode: null,
      }).catch((error) => {
        console.error('Native TTS error:', error);
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
      const options: TTSOptions = {
        rate,
        volume: 1.0,
        voice: selectedVoice || undefined,
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
          console.error('TTS error:', event);
          setState('idle');
        },
      };

      ttsEngine.speak(sentence, options);
      setState('speaking');
      setCurrentSentenceIndex(index);
      currentIndexRef.current = index;
    }
  }, [contentRef, rate, selectedVoice, onChapterEnd, useNativeTTS]);

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
      console.warn('No text content found to speak');
      return;
    }

    // Split into sentences
    const sentenceList = splitSentences(text);
    if (sentenceList.length === 0) {
      console.warn('No sentences found in content');
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
    if (!isAvailable) {
      return;
    }

    if (useNativeTTS) {
      if (nativeTTSTimeoutRef.current) {
        clearTimeout(nativeTTSTimeoutRef.current);
        nativeTTSTimeoutRef.current = null;
      }
      nativeStop().catch(() => {});
    } else {
      ttsEngine.pause();
    }
    setState('paused');
  }, [isAvailable, useNativeTTS]);

  const resume = useCallback(() => {
    if (!isAvailable) {
      return;
    }

    if (useNativeTTS) {
      speakSentenceAtIndex(currentIndexRef.current);
    } else {
      ttsEngine.resume();
    }
    setState('speaking');
  }, [isAvailable, useNativeTTS, speakSentenceAtIndex]);

  const stop = useCallback(() => {
    if (!isAvailable) {
      return;
    }

    if (useNativeTTS) {
      if (nativeTTSTimeoutRef.current) {
        clearTimeout(nativeTTSTimeoutRef.current);
        nativeTTSTimeoutRef.current = null;
      }
      nativeStop().catch(() => {});
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

  const speakText = useCallback((text: string) => {
    if (!isAvailable) {
      return;
    }

    if (useNativeTTS) {
      nativeSpeak({
        text,
        language: null,
        voiceId: null,
        rate,
        pitch: null,
        volume: null,
        queueMode: null,
      }).catch((error) => {
        console.error('Native TTS error:', error);
      });
    } else {
      const options: TTSOptions = {
        rate,
        volume: 1.0,
        voice: selectedVoice || undefined,
      };

      ttsEngine.speak(text, options);
    }
  }, [isAvailable, rate, selectedVoice, useNativeTTS]);

  return {
    isAvailable,
    noVoices,
    state,
    currentSentenceIndex,
    totalSentences: sentences.length,
    voices,
    selectedVoice,
    rate,
    play,
    pause,
    resume,
    stop,
    nextSentence,
    prevSentence,
    setVoice,
    setRate,
    speakText,
  };
}
