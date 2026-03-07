/**
 * TTS Engine abstraction over Web Speech API
 * Provides a clean interface for text-to-speech operations with proper state management
 */

export type TTSState = 'idle' | 'speaking' | 'paused';

export interface TTSOptions {
  /** Speech rate: 0.5 to 4.0, default 1.0 */
  rate?: number;
  /** Volume: 0.0 to 1.0, default 1.0 */
  volume?: number;
  /** Voice to use for speech synthesis */
  voice?: SpeechSynthesisVoice;
  /** Callback fired when speech ends */
  onEnd?: () => void;
  /** Callback fired at word boundaries during speech */
  onBoundary?: (event: SpeechSynthesisEvent) => void;
  /** Callback fired on speech synthesis errors */
  onError?: (event: SpeechSynthesisErrorEvent) => void;
}

export class TTSEngine {
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  /**
   * Check if Web Speech API is available in the current environment
   */
  static isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /**
   * Get available speech synthesis voices
   * Note: May return empty array initially, call after 'voiceschanged' event for full list
   */
  getVoices(): SpeechSynthesisVoice[] {
    if (!TTSEngine.isAvailable()) {
      return [];
    }
    return window.speechSynthesis.getVoices();
  }

  /**
   * Speak the given text with optional configuration
   * Handles Chrome bug where speaking must be cancelled before new utterance
   */
  speak(text: string, options?: TTSOptions): void {
    if (!TTSEngine.isAvailable()) {
      console.warn('Speech synthesis not available');
      return;
    }

    // Handle Chrome bug: cancel any ongoing speech before starting new
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set explicit volume and pitch defaults
    utterance.volume = options?.volume !== undefined ? Math.max(0, Math.min(1, options.volume)) : 1.0;
    utterance.pitch = 1.0;
    
    // Apply options
    if (options?.rate !== undefined) {
      utterance.rate = Math.max(0.5, Math.min(4.0, options.rate));
    }
    if (options?.voice) {
      utterance.voice = options.voice;
    }
    
    // Set up event handlers
    if (options?.onEnd) {
      utterance.onend = options.onEnd;
    }
    if (options?.onBoundary) {
      utterance.onboundary = options.onBoundary;
    }
    if (options?.onError) {
      utterance.onerror = options.onError;
    }

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Pause ongoing speech synthesis
   */
  pause(): void {
    if (!TTSEngine.isAvailable()) {
      return;
    }
    window.speechSynthesis.pause();
  }

  /**
   * Resume paused speech synthesis
   */
  resume(): void {
    if (!TTSEngine.isAvailable()) {
      return;
    }
    window.speechSynthesis.resume();
  }

  /**
   * Stop and cancel all speech synthesis
   */
  stop(): void {
    if (!TTSEngine.isAvailable()) {
      return;
    }
    window.speechSynthesis.cancel();
    this.currentUtterance = null;
  }

  /**
   * Check if speech synthesis is currently active
   */
  isSpeaking(): boolean {
    if (!TTSEngine.isAvailable()) {
      return false;
    }
    return window.speechSynthesis.speaking;
  }

  /**
   * Check if speech synthesis is currently paused
   */
  isPaused(): boolean {
    if (!TTSEngine.isAvailable()) {
      return false;
    }
    return window.speechSynthesis.paused;
  }

  /**
   * Get current TTS state
   */
  getState(): TTSState {
    if (this.isPaused()) {
      return 'paused';
    }
    if (this.isSpeaking()) {
      return 'speaking';
    }
    return 'idle';
  }
}

// Export singleton instance for convenience
export const ttsEngine = new TTSEngine();
