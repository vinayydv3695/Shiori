import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnlineMangaDetailView, UnifiedChapter } from '@/components/online/OnlineMangaDetailView';
import { TooltipProvider } from '@/components/ui/tooltip';

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

  it('regression: Action gates - Save to Library button should be disabled when isInLibrary is true', () => {
    // The view renders AppTooltip wrappers; the app mounts TooltipProvider in
    // main.tsx, so tests must provide it too.
    const { rerender } = render(
      <TooltipProvider delayDuration={0}>
        <OnlineMangaDetailView
          {...defaultProps}
          isInLibrary={true}
        />
      </TooltipProvider>
    );

    // When already in the library the button reads "SAVED" and is disabled.
    const button = screen.getByRole('button', { name: /saved/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();

    // Verify it does not call onSaveToLibrary when clicked while disabled
    fireEvent.click(button);
    expect(defaultProps.onSaveToLibrary).not.toHaveBeenCalled();

    // Rerender with isInLibrary = false
    rerender(
      <TooltipProvider delayDuration={0}>
        <OnlineMangaDetailView
          {...defaultProps}
          isInLibrary={false}
        />
      </TooltipProvider>
    );

    // Not in library: button reads "SAVE" and is enabled.
    const enabledButton = screen.getByRole('button', { name: /^save$/i });
    expect(enabledButton).toBeInTheDocument();
    expect(enabledButton).not.toBeDisabled();

    // Verify clicking calls the handler
    fireEvent.click(enabledButton);
    expect(defaultProps.onSaveToLibrary).toHaveBeenCalledTimes(1);
  });
});
