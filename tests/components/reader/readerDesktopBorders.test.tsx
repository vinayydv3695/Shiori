import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useReadingSettings } from '@/store/premiumReaderStore';
import { ReaderBorderDeckle } from '@/components/reader/ReaderBorderDeckle';
import { ReaderFolioFrame } from '@/components/reader/ReaderFolioFrame';
import { ReaderFocusVignette } from '@/components/reader/ReaderFocusVignette';
import { ReaderMarginRhythmBeads } from '@/components/reader/ReaderMarginRhythmBeads';

describe('Desktop Border & Margin Innovations', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    useReadingSettings.getState().resetToDefaults();
  });

  describe('Reading Settings Defaults & Actions', () => {
    it('defaults all 4 desktop border features to OFF', () => {
      const state = useReadingSettings.getState();
      expect(state.deckledEdgesEnabled).toBe(false);
      expect(state.collectorFrame).toBe('none');
      expect(state.focusVignette).toBe(false);
      expect(state.rhythmBeads).toBe(false);
    });

    it('allows toggling each feature independently', () => {
      const store = useReadingSettings.getState();

      store.setDeckledEdgesEnabled(true);
      expect(useReadingSettings.getState().deckledEdgesEnabled).toBe(true);

      store.setCollectorFrame('victorian');
      expect(useReadingSettings.getState().collectorFrame).toBe('victorian');

      store.setFocusVignette(true);
      expect(useReadingSettings.getState().focusVignette).toBe(true);

      store.setRhythmBeads(true);
      expect(useReadingSettings.getState().rhythmBeads).toBe(true);

      // Reset
      store.resetToDefaults();
      const resetState = useReadingSettings.getState();
      expect(resetState.deckledEdgesEnabled).toBe(false);
      expect(resetState.collectorFrame).toBe('none');
      expect(resetState.focusVignette).toBe(false);
      expect(resetState.rhythmBeads).toBe(false);
    });
  });

  describe('ReaderBorderDeckle', () => {
    it('renders left and right page stacks with correct progress indications', () => {
      const onNavigate = vitest.fn();
      const { container } = render(
        <ReaderBorderDeckle
          currentIndex={5}
          totalChapters={10}
          onNavigateToChapter={onNavigate}
        />
      );

      const deckleContainer = container.querySelector('.reader-deckle-container');
      expect(deckleContainer).toBeTruthy();

      const leftStack = container.querySelector('.reader-deckle-stack--left') as HTMLElement;
      const rightStack = container.querySelector('.reader-deckle-stack--right') as HTMLElement;

      expect(leftStack).toBeTruthy();
      expect(rightStack).toBeTruthy();

      // Check left stack interaction
      fireEvent.click(leftStack);
      expect(onNavigate).toHaveBeenCalled();
    });
  });

  describe('ReaderFolioFrame', () => {
    it('renders nothing when style is none', () => {
      const { container } = render(<ReaderFolioFrame style="none" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders Victorian corner flourishes when style is victorian', () => {
      const { container } = render(<ReaderFolioFrame style="victorian" />);
      const flourishes = container.querySelectorAll('.reader-folio-flourish');
      expect(flourishes.length).toBe(4);
      expect(container.querySelector('.reader-folio-inner-rule')).toBeTruthy();
    });

    it('renders architectural corners when style is minimal', () => {
      const { container } = render(<ReaderFolioFrame style="minimal" />);
      const corners = container.querySelectorAll('.reader-folio-minimal-corner');
      expect(corners.length).toBe(4);
      expect(container.querySelector('.reader-folio-minimal-axis')).toBeTruthy();
    });

    it('renders letterpress well when style is deboss', () => {
      const { container } = render(<ReaderFolioFrame style="deboss" />);
      expect(container.querySelector('.reader-folio-deboss-well')).toBeTruthy();
    });
  });

  describe('ReaderFocusVignette', () => {
    it('renders nothing when disabled', () => {
      const { container } = render(<ReaderFocusVignette enabled={false} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders vignette overlay when enabled', () => {
      const { container } = render(<ReaderFocusVignette enabled={true} />);
      expect(container.querySelector('.reader-focus-vignette')).toBeTruthy();
    });
  });

  describe('ReaderMarginRhythmBeads', () => {
    it('renders rhythm track with beads and marks current chapter active', () => {
      const onNavigate = vitest.fn();
      const chapters = [
        { index: 0, title: 'Prologue' },
        { index: 1, title: 'Chapter 1' },
        { index: 2, title: 'Chapter 2' },
      ];

      const { container } = render(
        <ReaderMarginRhythmBeads
          chapters={chapters}
          currentIndex={1}
          totalChapters={3}
          onNavigateToChapter={onNavigate}
        />
      );

      const track = container.querySelector('.reader-rhythm-track');
      expect(track).toBeTruthy();

      const beads = container.querySelectorAll('.reader-rhythm-bead');
      expect(beads.length).toBe(3);

      // Index 1 should have active bead class
      expect(beads[1].classList.contains('reader-rhythm-bead--active')).toBe(true);
      // Index 0 should be marked read
      expect(beads[0].classList.contains('reader-rhythm-bead--read')).toBe(true);
      // Index 2 should be marked unread
      expect(beads[2].classList.contains('reader-rhythm-bead--unread')).toBe(true);

      // Clicking a bead invokes onNavigateToChapter
      const anchors = container.querySelectorAll('.reader-rhythm-bead-anchor');
      fireEvent.click(anchors[2]);
      expect(onNavigate).toHaveBeenCalledWith(2);
    });
  });
});
