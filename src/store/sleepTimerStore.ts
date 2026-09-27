/**
 * sleepTimerStore.ts — Central reading sleep timer with gentle audio fade and bedtime veil.
 *
 * Coordinates sleep countdowns, smooth audio fadeouts for Ambient Soundscapes
 * and TTS audio, and presents a bedtime veil with extension options.
 */

import { create } from 'zustand';
import { soundscapeEngine } from '@/lib/audio/soundscapes';
import { ttsEngine } from '@/lib/ttsEngine';
import { logger } from '@/lib/logger';
import { hapticTick } from '@/lib/haptics';

export type SleepTimerDuration = 15 | 30 | 45 | 60 | 'chapter';

interface SleepTimerState {
  isActive: boolean;
  duration: SleepTimerDuration | null;
  remainingSeconds: number | null;
  isNightVeilActive: boolean;
  isCompleted: boolean;
  sessionMinutes: number;

  // Actions
  startTimer: (duration: SleepTimerDuration) => void;
  extendTimer: (minutes: number) => void;
  cancelTimer: () => void;
  notifyChapterChanged: () => void;
  triggerTimerExpired: () => void;
  dismissNightVeil: () => void;
  incrementSessionMinute: () => void;
}

let timerIntervalId: ReturnType<typeof setInterval> | null = null;

function clearTimerInterval() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

export const useSleepTimerStore = create<SleepTimerState>((set, get) => ({
  isActive: false,
  duration: null,
  remainingSeconds: null,
  isNightVeilActive: false,
  isCompleted: false,
  sessionMinutes: 0,

  startTimer: (duration: SleepTimerDuration) => {
    clearTimerInterval();
    hapticTick();

    if (duration === 'chapter') {
      set({
        isActive: true,
        duration: 'chapter',
        remainingSeconds: null,
        isNightVeilActive: false,
        isCompleted: false,
      });
      return;
    }

    const totalSeconds = duration * 60;
    set({
      isActive: true,
      duration,
      remainingSeconds: totalSeconds,
      isNightVeilActive: false,
      isCompleted: false,
    });

    timerIntervalId = setInterval(() => {
      const state = get();
      if (!state.isActive || state.remainingSeconds === null) {
        clearTimerInterval();
        return;
      }

      if (state.remainingSeconds <= 1) {
        clearTimerInterval();
        get().triggerTimerExpired();
      } else {
        set({ remainingSeconds: state.remainingSeconds - 1 });
      }
    }, 1000);
  },

  extendTimer: (minutes: number) => {
    hapticTick();
    const currentRemaining = get().remainingSeconds ?? 0;
    const addedSeconds = minutes * 60;
    const newRemaining = currentRemaining + addedSeconds;

    clearTimerInterval();

    set({
      isActive: true,
      duration: minutes as SleepTimerDuration,
      remainingSeconds: newRemaining,
      isNightVeilActive: false,
      isCompleted: false,
    });

    timerIntervalId = setInterval(() => {
      const state = get();
      if (!state.isActive || state.remainingSeconds === null) {
        clearTimerInterval();
        return;
      }

      if (state.remainingSeconds <= 1) {
        clearTimerInterval();
        get().triggerTimerExpired();
      } else {
        set({ remainingSeconds: state.remainingSeconds - 1 });
      }
    }, 1000);
  },

  cancelTimer: () => {
    clearTimerInterval();
    hapticTick();
    set({
      isActive: false,
      duration: null,
      remainingSeconds: null,
      isNightVeilActive: false,
      isCompleted: false,
    });
  },

  notifyChapterChanged: () => {
    const { isActive, duration } = get();
    if (isActive && duration === 'chapter') {
      get().triggerTimerExpired();
    }
  },

  triggerTimerExpired: () => {
    clearTimerInterval();
    logger.info('[SleepTimer] Timer reached zero. Initiating bedtime fadeout.');

    // 1. Gentle fade out of ambient soundscapes over 2.5 seconds
    try {
      if (soundscapeEngine.getIsRunning()) {
        soundscapeEngine.setMasterVolume(0.35);
        setTimeout(() => soundscapeEngine.setMasterVolume(0.1), 1000);
        setTimeout(() => {
          soundscapeEngine.stopAll();
          soundscapeEngine.setMasterVolume(0.7); // reset volume for next session
        }, 2400);
      }
    } catch (e) {
      logger.error('[SleepTimer] Error fading soundscape:', e);
    }

    // 2. Pause Text-To-Speech if active
    try {
      ttsEngine.stop();
    } catch (e) {
      logger.error('[SleepTimer] Error pausing TTS:', e);
    }

    // 3. Activate bedtime night veil & completion overlay
    set({
      isActive: false,
      duration: null,
      remainingSeconds: null,
      isNightVeilActive: true,
      isCompleted: true,
    });
  },

  dismissNightVeil: () => {
    hapticTick();
    set({
      isNightVeilActive: false,
      isCompleted: false,
    });
  },

  incrementSessionMinute: () => {
    set(state => ({ sessionMinutes: state.sessionMinutes + 1 }));
  },
}));
