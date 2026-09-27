import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSleepTimerStore } from './sleepTimerStore';
import { soundscapeEngine } from '@/lib/audio/soundscapes';
import { ttsEngine } from '@/lib/ttsEngine';

vi.mock('@/lib/audio/soundscapes', () => ({
  soundscapeEngine: {
    getIsRunning: vi.fn(),
    setMasterVolume: vi.fn(),
    stopAll: vi.fn(),
  },
}));

vi.mock('@/lib/ttsEngine', () => ({
  ttsEngine: {
    stop: vi.fn(),
  },
}));

describe('sleepTimerStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSleepTimerStore.getState().cancelTimer();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a minute-based sleep timer and decrements remainingSeconds', () => {
    useSleepTimerStore.getState().startTimer(15);
    const state = useSleepTimerStore.getState();

    expect(state.isActive).toBe(true);
    expect(state.duration).toBe(15);
    expect(state.remainingSeconds).toBe(15 * 60);

    vi.advanceTimersByTime(2000);
    expect(useSleepTimerStore.getState().remainingSeconds).toBe(15 * 60 - 2);
  });

  it('starts end-of-chapter mode without countdown seconds', () => {
    useSleepTimerStore.getState().startTimer('chapter');
    const state = useSleepTimerStore.getState();

    expect(state.isActive).toBe(true);
    expect(state.duration).toBe('chapter');
    expect(state.remainingSeconds).toBeNull();
  });

  it('cancels an active timer', () => {
    useSleepTimerStore.getState().startTimer(30);
    useSleepTimerStore.getState().cancelTimer();

    const state = useSleepTimerStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.duration).toBeNull();
    expect(state.remainingSeconds).toBeNull();
  });

  it('extends an active timer by requested minutes', () => {
    useSleepTimerStore.getState().startTimer(15);
    useSleepTimerStore.getState().extendTimer(10);

    const state = useSleepTimerStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.duration).toBe(10);
    expect(state.remainingSeconds).toBe(25 * 60);
  });

  it('triggers expiration, audio fade, and night veil when timer hits zero', () => {
    (soundscapeEngine.getIsRunning as any).mockReturnValue(true);

    useSleepTimerStore.getState().startTimer(15);
    // Fast forward to zero
    vi.advanceTimersByTime(15 * 60 * 1000);

    const state = useSleepTimerStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.isNightVeilActive).toBe(true);
    expect(state.isCompleted).toBe(true);

    expect(soundscapeEngine.setMasterVolume).toHaveBeenCalledWith(0.35);
    expect(ttsEngine.stop).toHaveBeenCalled();
  });

  it('triggers expiration when chapter ends in chapter mode', () => {
    useSleepTimerStore.getState().startTimer('chapter');
    expect(useSleepTimerStore.getState().isNightVeilActive).toBe(false);

    useSleepTimerStore.getState().notifyChapterChanged();
    expect(useSleepTimerStore.getState().isNightVeilActive).toBe(true);
  });

  it('dismisses night veil cleanly', () => {
    useSleepTimerStore.getState().triggerTimerExpired();
    expect(useSleepTimerStore.getState().isNightVeilActive).toBe(true);

    useSleepTimerStore.getState().dismissNightVeil();
    expect(useSleepTimerStore.getState().isNightVeilActive).toBe(false);
    expect(useSleepTimerStore.getState().isCompleted).toBe(false);
  });
});
