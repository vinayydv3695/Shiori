import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePremiumReaderKeyboard } from '../usePremiumReaderKeyboard';

describe('usePremiumReaderKeyboard', () => {
  let handlers: {
    onPrevChapter: ReturnType<typeof vi.fn>;
    onNextChapter: ReturnType<typeof vi.fn>;
    onPrevPage: ReturnType<typeof vi.fn>;
    onNextPage: ReturnType<typeof vi.fn>;
    onScrollUp: ReturnType<typeof vi.fn>;
    onScrollDown: ReturnType<typeof vi.fn>;
    isPaginatedOrTwoPage?: boolean;
    pageFlipEnabled?: boolean;
  };

  beforeEach(() => {
    handlers = {
      onPrevChapter: vi.fn(),
      onNextChapter: vi.fn(),
      onPrevPage: vi.fn(),
      onNextPage: vi.fn(),
      onScrollUp: vi.fn(),
      onScrollDown: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function fireKey(key: string, options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    window.dispatchEvent(event);
    return event;
  }

  describe('Arrow keys in simple mode (not paginated, pageFlip disabled)', () => {
    it('ArrowRight navigates to next chapter/page directly without scrolling', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: false,
          pageFlipEnabled: false,
        })
      );

      const evt = fireKey('ArrowRight');
      expect(evt.defaultPrevented).toBe(true);
      expect(handlers.onNextChapter).toHaveBeenCalledTimes(1);
      expect(handlers.onNextPage).not.toHaveBeenCalled();
      expect(handlers.onScrollDown).not.toHaveBeenCalled();
    });

    it('ArrowLeft navigates to previous chapter/page directly without scrolling', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: false,
          pageFlipEnabled: false,
        })
      );

      const evt = fireKey('ArrowLeft');
      expect(evt.defaultPrevented).toBe(true);
      expect(handlers.onPrevChapter).toHaveBeenCalledTimes(1);
      expect(handlers.onPrevPage).not.toHaveBeenCalled();
      expect(handlers.onScrollUp).not.toHaveBeenCalled();
    });
  });

  describe('Arrow keys in page-flip mode (pageFlipEnabled: true)', () => {
    it('ArrowRight triggers onNextPage to flip the page forward', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: false,
          pageFlipEnabled: true,
        })
      );

      const evt = fireKey('ArrowRight');
      expect(evt.defaultPrevented).toBe(true);
      expect(handlers.onNextPage).toHaveBeenCalledTimes(1);
      expect(handlers.onNextChapter).not.toHaveBeenCalled();
    });

    it('ArrowLeft triggers onPrevPage to flip the page backward', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: false,
          pageFlipEnabled: true,
        })
      );

      const evt = fireKey('ArrowLeft');
      expect(evt.defaultPrevented).toBe(true);
      expect(handlers.onPrevPage).toHaveBeenCalledTimes(1);
      expect(handlers.onPrevChapter).not.toHaveBeenCalled();
    });
  });

  describe('Arrow keys in paginated / two-page mode (isPaginatedOrTwoPage: true)', () => {
    it('ArrowRight turns page forward with onNextPage', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: true,
        })
      );

      fireKey('ArrowRight');
      expect(handlers.onNextPage).toHaveBeenCalledTimes(1);
      expect(handlers.onNextChapter).not.toHaveBeenCalled();
    });

    it('ArrowLeft turns page backward with onPrevPage', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: true,
        })
      );

      fireKey('ArrowLeft');
      expect(handlers.onPrevPage).toHaveBeenCalledTimes(1);
      expect(handlers.onPrevChapter).not.toHaveBeenCalled();
    });
  });

  describe('Cmd/Ctrl modifiers with Arrow keys', () => {
    it('Cmd+ArrowRight jumps to next chapter even in paginated or flip mode', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: true,
          pageFlipEnabled: true,
        })
      );

      fireKey('ArrowRight', { metaKey: true });
      expect(handlers.onNextChapter).toHaveBeenCalledTimes(1);
      expect(handlers.onNextPage).not.toHaveBeenCalled();
    });

    it('Ctrl+ArrowLeft jumps to previous chapter even in paginated or flip mode', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: true,
          pageFlipEnabled: true,
        })
      );

      fireKey('ArrowLeft', { ctrlKey: true });
      expect(handlers.onPrevChapter).toHaveBeenCalledTimes(1);
      expect(handlers.onPrevPage).not.toHaveBeenCalled();
    });
  });

  describe('Vertical scrolling with ArrowUp and ArrowDown', () => {
    it('ArrowDown calls onScrollDown in vertical mode', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: false,
        })
      );

      fireKey('ArrowDown');
      expect(handlers.onScrollDown).toHaveBeenCalledTimes(1);
      expect(handlers.onNextPage).not.toHaveBeenCalled();
    });

    it('ArrowUp calls onScrollUp in vertical mode', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: false,
        })
      );

      fireKey('ArrowUp');
      expect(handlers.onScrollUp).toHaveBeenCalledTimes(1);
      expect(handlers.onPrevPage).not.toHaveBeenCalled();
    });

    it('ArrowDown calls onNextPage in paginated mode', () => {
      renderHook(() =>
        usePremiumReaderKeyboard({
          ...handlers,
          isPaginatedOrTwoPage: true,
        })
      );

      fireKey('ArrowDown');
      expect(handlers.onNextPage).toHaveBeenCalledTimes(1);
      expect(handlers.onScrollDown).not.toHaveBeenCalled();
    });
  });

  describe('Space and Page keys', () => {
    it('Space triggers onNextPage', () => {
      renderHook(() => usePremiumReaderKeyboard(handlers));
      fireKey(' ');
      expect(handlers.onNextPage).toHaveBeenCalledTimes(1);
    });

    it('Shift+Space triggers onPrevPage', () => {
      renderHook(() => usePremiumReaderKeyboard(handlers));
      fireKey(' ', { shiftKey: true });
      expect(handlers.onPrevPage).toHaveBeenCalledTimes(1);
    });
  });
});
