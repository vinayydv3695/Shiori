import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BulkActionBar } from '@/components/library/BulkActionBar';
import { useLibraryStore } from '@/store/libraryStore';
import { api, type Book } from '@/lib/tauri';
import { TooltipProvider } from '@/components/ui/tooltip';

const renderWithTooltip = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

vi.mock('@/lib/tauri', () => ({
  api: {
    deleteBooks: vi.fn().mockResolvedValue(undefined),
    permanentDeleteBooks: vi.fn().mockResolvedValue(undefined),
    deleteMangaSeries: vi.fn().mockResolvedValue(undefined),
    getMangaSeriesList: vi.fn().mockResolvedValue([]),
  },
  isTauri: () => true,
  isAndroid: false,
}));

describe('BulkActionBar & BulkDeleteDialog', () => {
  const mockBooks: Book[] = [
    {
      id: 1,
      title: 'Re:Zero Vol 1',
      series: 'Re:Zero',
      series_index: 1,
      file_path: '/path/1.epub',
      file_format: 'epub',
      added_date: '2026-01-01',
    } as Book,
    {
      id: 2,
      title: 'Re:Zero Vol 2',
      series: 'Re:Zero',
      series_index: 2,
      file_path: '/path/2.epub',
      file_format: 'epub',
      added_date: '2026-01-01',
    } as Book,
    {
      id: 3,
      title: 'One Piece Ch 1',
      series: 'One Piece',
      series_index: 1,
      file_path: '/path/3.cbz',
      file_format: 'cbz',
      added_date: '2026-01-01',
    } as Book,
    {
      id: 4,
      title: 'One Piece Ch 2',
      series: 'One Piece',
      series_index: 2,
      file_path: '/path/4.cbz',
      file_format: 'cbz',
      added_date: '2026-01-01',
    } as Book,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({
      books: mockBooks,
      selectedBookIds: new Set([1, 2, 3, 4]),
      totalCount: 4,
    });
  });

  it('renders series-aware selection counter when multiple series are selected', () => {
    renderWithTooltip(
      <BulkActionBar
        visibleBookIds={[1, 2, 3, 4]}
        onConvert={vi.fn()}
        onAddToShelf={vi.fn()}
        onAddToSeries={vi.fn()}
      />
    );

    // Should indicate 2 series selected
    expect(screen.getByText(/2 series/i)).toBeInTheDocument();
    expect(screen.getByText(/4 vols/i)).toBeInTheDocument();

    // Verify Delete and Permanent Delete actions are rendered
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^permanent delete$/i })).toBeInTheDocument();
  });

  it('opens BulkDeleteDialog in trash mode when clicking Delete', async () => {
    renderWithTooltip(
      <BulkActionBar
        visibleBookIds={[1, 2, 3, 4]}
        onConvert={vi.fn()}
        onAddToShelf={vi.fn()}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(deleteBtn);

    // Dialog title
    expect(await screen.findByText('Delete Items')).toBeInTheDocument();
    expect(screen.getAllByText('Move to Recycle Bin').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Re:Zero')).toBeInTheDocument();
    expect(screen.getByText('One Piece')).toBeInTheDocument();

    // Confirm button in trash mode
    const confirmBtn = screen.getByTestId('bulk-delete-confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.deleteBooks).toHaveBeenCalledWith([1, 2, 3, 4]);
    });
  });

  it('opens BulkDeleteDialog in permanent mode and calls permanentDeleteBooks (skipping recycle bin)', async () => {
    renderWithTooltip(
      <BulkActionBar
        visibleBookIds={[1, 2, 3, 4]}
        onConvert={vi.fn()}
        onAddToShelf={vi.fn()}
      />
    );

    const permBtn = screen.getByRole('button', { name: /^permanent delete$/i });
    fireEvent.click(permBtn);

    // Dialog should show Permanent Delete header & warning
    expect(await screen.findByRole('heading', { name: /^permanently delete$/i })).toBeInTheDocument();
    expect(screen.getByTestId('bulk-delete-warning-banner')).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('bulk-delete-confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.permanentDeleteBooks).toHaveBeenCalledWith([1, 2, 3, 4]);
      expect(api.deleteBooks).not.toHaveBeenCalled();
    });
  });

  it('allows switching between Recycle Bin and Permanent Delete inside the dialog', async () => {
    renderWithTooltip(
      <BulkActionBar
        visibleBookIds={[1, 2, 3, 4]}
        onConvert={vi.fn()}
        onAddToShelf={vi.fn()}
      />
    );

    // Open in trash mode first
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(await screen.findByText('Delete Items')).toBeInTheDocument();

    // Click on the Permanent Delete mode card
    const permModeCard = screen.getByRole('button', { name: /bypasses the recycle bin/i });
    fireEvent.click(permModeCard);

    // Header changes to Permanently Delete
    expect(screen.getByRole('heading', { name: /^permanently delete$/i })).toBeInTheDocument();

    // Confirm button updates to permanent delete
    const confirmBtn = screen.getByTestId('bulk-delete-confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.permanentDeleteBooks).toHaveBeenCalledWith([1, 2, 3, 4]);
    });
  });

  it('clears selection when Clear button is clicked', () => {
    renderWithTooltip(
      <BulkActionBar
        visibleBookIds={[1, 2, 3, 4]}
        onConvert={vi.fn()}
        onAddToShelf={vi.fn()}
      />
    );

    const clearBtn = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearBtn);

    expect(useLibraryStore.getState().selectedBookIds.size).toBe(0);
  });
});
