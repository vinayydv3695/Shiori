import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CharacterRemapModal } from '@/components/reader/CharacterRemapModal';
import * as overrideService from '@/lib/characterOverrideService';

vi.mock('@/lib/characterOverrideService', async (importOriginal) => {
  const actual = await importOriginal<typeof overrideService>();
  return {
    ...actual,
    searchCharacterOnline: vi.fn(),
    saveCharacterOverride: vi.fn(),
    removeCharacterOverride: vi.fn(),
  };
});

describe('CharacterRemapModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    originalName: 'Holy Dragon',
    currentDisplayName: 'Holy Dragon',
    bookId: 101,
    bookTitle: 'Re:Zero Vol 20',
    onRemapComplete: vi.fn(),
    onRevertComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(overrideService.searchCharacterOnline).mockResolvedValue([]);
  });

  it('renders search input with extracted name and source tabs', () => {
    render(<CharacterRemapModal {...defaultProps} />);

    expect(screen.getByText('Remap Character')).toBeInTheDocument();
    expect(screen.getByText('"Holy Dragon"')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search correct character/i)).toHaveValue('Holy Dragon');

    // Tabs should be present
    expect(screen.getByRole('button', { name: /all sources/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fandom wiki/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /anilist/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wikipedia/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manual entry/i })).toBeInTheDocument();
  });

  it('displays search results with Japanese font styling and applies selection', async () => {
    vi.mocked(overrideService.searchCharacterOnline).mockResolvedValue([
      {
        id: 'rezero-volcanica',
        name: 'Volcanica',
        nativeName: 'ボルカニカ',
        imageUrl: 'https://example.com/volcanica.jpg',
        description: 'The Divine Dragon',
        source: 'fandom',
        mediaTitle: 'Re:Zero Wiki',
      },
    ]);

    render(<CharacterRemapModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Volcanica')).toBeInTheDocument();
    });

    const nativeNameEl = screen.getByText('ボルカニカ');
    expect(nativeNameEl).toBeInTheDocument();
    expect(nativeNameEl).toHaveAttribute('lang', 'ja');
    expect(nativeNameEl).toHaveStyle({ fontFamily: 'var(--font-cjk, sans-serif)' });

    // Click Apply
    const applyBtn = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyBtn);

    expect(overrideService.saveCharacterOverride).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        originalName: 'Holy Dragon',
        resolvedName: 'Volcanica',
        nativeName: 'ボルカニカ',
        source: 'fandom',
      }),
      'Re:Zero Vol 20'
    );
    expect(defaultProps.onRemapComplete).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('allows manual custom entry', async () => {
    render(<CharacterRemapModal {...defaultProps} />);

    // Switch to Custom Entry tab
    const customTab = screen.getByRole('button', { name: /manual entry/i });
    fireEvent.click(customTab);

    // Enter custom character fields
    const nameInput = screen.getByPlaceholderText('e.g. Puck');
    fireEvent.change(nameInput, { target: { value: 'Flugel' } });

    const nativeInput = screen.getByPlaceholderText(/パック/i);
    fireEvent.change(nativeInput, { target: { value: 'フリューゲル' } });

    const saveBtn = screen.getByRole('button', { name: /save custom character/i });
    fireEvent.click(saveBtn);

    expect(overrideService.saveCharacterOverride).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        originalName: 'Holy Dragon',
        resolvedName: 'Flugel',
        nativeName: 'フリューゲル',
        source: 'custom',
      }),
      'Re:Zero Vol 20'
    );
    expect(defaultProps.onRemapComplete).toHaveBeenCalled();
  });

  it('renders revert button when active override exists', () => {
    render(
      <CharacterRemapModal
        {...defaultProps}
        activeOverride={{
          originalName: 'Holy Dragon',
          resolvedName: 'Volcanica',
          nativeName: 'ボルカニカ',
          source: 'fandom',
          updatedAt: Date.now(),
        }}
      />
    );

    const revertBtn = screen.getByRole('button', { name: /revert to "holy dragon"/i });
    expect(revertBtn).toBeInTheDocument();

    fireEvent.click(revertBtn);
    expect(overrideService.removeCharacterOverride).toHaveBeenCalledWith(101, 'Holy Dragon');
    expect(defaultProps.onRevertComplete).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
