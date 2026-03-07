/**
 * React hook for Text-to-Speech orchestration with sentence-level reading
 * Manages TTS state machine, voice selection, and DOM highlighting
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ttsEngine, TTSEngine } from '@/lib/ttsEngine';
import type { TTSState, TTSOptions } from '@/lib/ttsEngine';
import { splitSentences } from '@/lib/sentenceSplitter';
import { highlightSentence, clearAllHighlights } from '@/lib/sentenceHighlighter';
import { extractTextFromDOM } from '@/lib/textExtractor';
import { usePreferencesStore } from '@/store/preferencesStore';

export interface UseTTSOptions {
  contentRef: React.RefObject<HTMLElement | null>;
  onChapterEnd?: () => void;
}

export interface UseTTSReturn {
  isAvailable: boolean;
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
  // State
  const [state, setState] = useState<TTSState>('idle');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [sentences, setSentences] = useState<string[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRateState] = useState<number>(1.0);

  // Refs
  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef<number>(0);
  const cleanupHighlightRef = useRef<(() => void) | null>(null);
  const speakSentenceAtIndexRef = useRef<(index: number, sentenceArray?: string[]) => void>(() => {});

  // Check availability
  const isAvailable = TTSEngine.isAvailable();

  // Load voices on mount
  useEffect(() => {
    if (!isAvailable) {
      return;
    }

    const loadVoices = () => {
      const availableVoices = ttsEngine.getVoices();
      setVoices(availableVoices);

      // Load preferred voice from preferences
      const preferences = usePreferencesStore.getState().preferences;
      const preferredVoiceURI = preferences?.tts?.voice;

      if (preferredVoiceURI && preferredVoiceURI !== 'default') {
        const voice = availableVoices.find(v => v.voiceURI === preferredVoiceURI);
        if (voice) {
          setSelectedVoice(voice);
        }
      }

      // Load preferred rate
      const preferredRate = preferences?.tts?.rate;
      if (preferredRate !== undefined) {
        setRateState(preferredRate);
      }
    };

    // Load immediately
    loadVoices();

    // Listen for voiceschanged event (some browsers load voices async)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, [isAvailable]);

  // Cleanup on unmount
  useEffect(() => {
    const contentEl = contentRef.current;
    return () => {
      ttsEngine.stop();
      if (cleanupHighlightRef.current) {
        cleanupHighlightRef.current();
        cleanupHighlightRef.current = null;
      }
      if (contentEl) {
        clearAllHighlights(contentEl);
      }
    };
  }, [contentRef]);

  /**
   * Speak a sentence at the given index
   */
  const speakSentenceAtIndex = useCallback((index: number, sentenceArray?: string[]) => {
    const currentSentences = sentenceArray || sentencesRef.current;
    
    if (index < 0 || index >= currentSentences.length || !contentRef.current) {
      return;
    }

    // Clean up previous highlight
    if (cleanupHighlightRef.current) {
      cleanupHighlightRef.current();
      cleanupHighlightRef.current = null;
    }

    const sentence = currentSentences[index];

    // Highlight sentence in DOM
    const cleanup = highlightSentence(contentRef.current, sentence);
    cleanupHighlightRef.current = cleanup;

    // Speak sentence
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
  }, [contentRef, rate, selectedVoice, onChapterEnd]);

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

  /**
   * Pause ongoing speech
   */
  const pause = useCallback(() => {
    if (!isAvailable) {
      return;
    }

    ttsEngine.pause();
    setState('paused');
  }, [isAvailable]);

  /**
   * Resume paused speech
   */
  const resume = useCallback(() => {
    if (!isAvailable) {
      return;
    }

    ttsEngine.resume();
    setState('speaking');
  }, [isAvailable]);

  /**
   * Stop speech and reset
   */
  const stop = useCallback(() => {
    if (!isAvailable) {
      return;
    }

    ttsEngine.stop();
    setState('idle');
    setCurrentSentenceIndex(0);
    currentIndexRef.current = 0;

    // Clean up highlight
    if (cleanupHighlightRef.current) {
      cleanupHighlightRef.current();
      cleanupHighlightRef.current = null;
    }

    if (contentRef.current) {
      clearAllHighlights(contentRef.current);
    }
  }, [isAvailable, contentRef]);

  /**
   * Skip to next sentence
   */
  const nextSentence = useCallback(() => {
    const currentSentences = sentencesRef.current;
    if (!isAvailable || currentSentences.length === 0) {
      return;
    }

    const nextIndex = Math.min(currentIndexRef.current + 1, currentSentences.length - 1);
    
    // Stop current speech
    ttsEngine.stop();

    // Speak next sentence
    speakSentenceAtIndex(nextIndex);
  }, [isAvailable, speakSentenceAtIndex]);

  /**
   * Skip to previous sentence
   */
  const prevSentence = useCallback(() => {
    const currentSentences = sentencesRef.current;
    if (!isAvailable || currentSentences.length === 0) {
      return;
    }

    const prevIndex = Math.max(currentIndexRef.current - 1, 0);
    
    // Stop current speech
    ttsEngine.stop();

    // Speak previous sentence
    speakSentenceAtIndex(prevIndex);
  }, [isAvailable, speakSentenceAtIndex]);

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
   * Speak arbitrary text (for "Speak Selection" feature)
   * Does not update sentence tracking
   */
  const speakText = useCallback((text: string) => {
    if (!isAvailable) {
      return;
    }

    const options: TTSOptions = {
      rate,
      volume: 1.0,
      voice: selectedVoice || undefined,
    };

    ttsEngine.speak(text, options);
  }, [isAvailable, rate, selectedVoice]);

  return {
    isAvailable,
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
