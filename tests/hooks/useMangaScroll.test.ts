import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMangaScroll } from '@/components/manga/hooks/useMangaScroll';
import { useMangaUIStore } from '@/store/mangaReaderStore';

/**
 * K3-004: the auto-scroll RAF loop must run ONLY while auto-scrolling is
 * active — subscribed to isAutoScrolling, not polling it every frame.
 */

type MockState = Record<string, unknown>;
type Listener = (state: MockState) => void;

const { createMockStore } = vi.hoisted(() => {
  function createMockStore(initial: MockState) {
    const listeners = new Set<Listener>();
    let state = { ...initial };
    return {
      getState: () => state,
      subscribe: (listener: Listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setState: (partial: MockState) => {
        state = { ...state, ...partial };
        listeners.forEach((l) => l(state));
      },
    };
  }
  return { createMockStore };
});

vi.mock('@/store/mangaReaderStore', () => {
  const uiStore = createMockStore({ isAutoScrolling: false });
  uiStore.setState({
    setAutoScroll: (val: boolean) => uiStore.setState({ isAutoScrolling: val }),
  });
  const settingsStore = createMockStore({ autoScrollSpeed: 1 });
  return { useMangaUIStore: uiStore, useMangaSettingsStore: settingsStore };
});

let rafSpy: ReturnType<typeof vi.fn>;
let cafSpy: ReturnType<typeof vi.fn>;
let rafIdCounter: number;

/** jsdom elements have no layout; fake the scroll metrics. */
function makeContainer() {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 500, configurable: true });
  return el;
}

describe('useMangaScroll auto-scroll RAF loop', () => {
  beforeEach(() => {
    rafIdCounter = 0;
    rafSpy = vi.fn((_cb: FrameRequestCallback) => ++rafIdCounter);
    cafSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', cafSpy);
    useMangaUIStore.getState().setAutoScroll(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('never schedules RAF when auto-scroll is disabled', () => {
    const el = makeContainer();
    renderHook(() => useMangaScroll({ current: el }, vi.fn()));
    expect(rafSpy).not.toHaveBeenCalled();
    expect(cafSpy).not.toHaveBeenCalled();
  });

  it('starts ONE RAF loop when auto-scroll is enabled', () => {
    const el = makeContainer();
    renderHook(() => useMangaScroll({ current: el }, vi.fn()));

    act(() => {
      useMangaUIStore.getState().setAutoScroll(true);
    });
    expect(rafSpy).toHaveBeenCalledTimes(1);

    // Simulate one frame: the loop must keep itself alive.
    act(() => {
      rafSpy.mock.calls[0][0](1_000_000);
    });
    expect(rafSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps scroll speed time-based (not per-frame)', () => {
    const el = makeContainer();
    renderHook(() => useMangaScroll({ current: el }, vi.fn()));

    act(() => {
      useMangaUIStore.getState().setAutoScroll(true);
    });
    // First frame anchors lastTime, second frame 1000ms later must scroll
    // ~60px at speed 1 (60px/s), regardless of frame count.
    act(() => {
      rafSpy.mock.calls[0][0](performance.now());
    });
    act(() => {
      rafSpy.mock.calls[1][0](performance.now() + 1000);
    });
    expect(el.scrollTop).toBeGreaterThanOrEqual(60);
    expect(el.scrollTop).toBeLessThan(70);
  });

  it('cancels the loop on the same tick auto-scroll is disabled mid-flight', () => {
    const el = makeContainer();
    renderHook(() => useMangaScroll({ current: el }, vi.fn()));

    act(() => {
      useMangaUIStore.getState().setAutoScroll(true);
    });
    // Run one frame so the loop is actively scheduled.
    act(() => {
      rafSpy.mock.calls[0][0](performance.now());
    });
    const scheduledId = rafSpy.mock.results[rafSpy.mock.calls.length - 1].value;

    act(() => {
      useMangaUIStore.getState().setAutoScroll(false);
    });
    expect(cafSpy).toHaveBeenCalledWith(scheduledId);

    // The loop must not reschedule itself.
    expect(rafSpy).toHaveBeenCalledTimes(2);
  });

  it('stops (and cancels) when the scroll reaches the bottom', () => {
    const el = makeContainer();
    el.scrollTop = 1500; // scrollHeight - clientHeight
    renderHook(() => useMangaScroll({ current: el }, vi.fn()));

    act(() => {
      useMangaUIStore.getState().setAutoScroll(true);
    });
    const scheduledId = rafSpy.mock.results[0].value;

    act(() => {
      rafSpy.mock.calls[0][0](performance.now());
    });

    expect(useMangaUIStore.getState().isAutoScrolling).toBe(false);
    expect(cafSpy).toHaveBeenCalledWith(scheduledId);
    // The bottom frame must not schedule another frame.
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });
});