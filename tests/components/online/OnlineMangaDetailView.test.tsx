import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnlineMangaDetailView, UnifiedChapter } from '@/components/online/OnlineMangaDetailView';

// Mock matchMedia
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('OnlineMangaDetailView - Action Gating', () => {
  const defaultProps = {
    title: 'Test Manga',
    chaptersLoading: false,
    chaptersError: null,
    unifiedChapters: [] as UnifiedChapter[],
    onBack: vi.fn(),
    onReadChapter: vi.fn(),
    onSaveToLibrary: vi.fn(),
  };

  it('regression: Action gates - Add to Library button should be disabled when isInLibrary is true', () => {
    const { rerender } = render(
      <OnlineMangaDetailView
        {...defaultProps}
        isInLibrary={true}
      />
    );

    const button = screen.getByRole('button', { name: /in library/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();

    // Verify it does not call onSaveToLibrary when clicked while disabled
    fireEvent.click(button);
    expect(defaultProps.onSaveToLibrary).not.toHaveBeenCalled();

    // Rerender with isInLibrary = false
    rerender(
      <OnlineMangaDetailView
        {...defaultProps}
        isInLibrary={false}
      />
    );

    const enabledButton = screen.getByRole('button', { name: /add to library/i });
    expect(enabledButton).toBeInTheDocument();
    expect(enabledButton).not.toBeDisabled();

    // Verify clicking calls the handler
    fireEvent.click(enabledButton);
    expect(defaultProps.onSaveToLibrary).toHaveBeenCalledTimes(1);
  });
});
