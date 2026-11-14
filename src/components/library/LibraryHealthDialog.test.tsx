// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { LibraryHealthDialog } from './LibraryHealthDialog';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const report = { checked: 2, skipped: 0, missing: [], unreadable: [] };

describe('LibraryHealthDialog', () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it('does not scan until opened and shows an empty result', async () => {
    vi.mocked(invoke).mockResolvedValue(report);
    const view = render(<LibraryHealthDialog open={false} onOpenChange={vi.fn()} />);
    expect(invoke).not.toHaveBeenCalled();
    view.rerender(<LibraryHealthDialog open onOpenChange={vi.fn()} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('All checked files are available.')).toBeTruthy();
  });

  it('shows missing and unreadable files, including skipped count', async () => {
    vi.mocked(invoke).mockResolvedValue({ checked: 3, skipped: 1, missing: [{ id: 1, title: 'Lost', filePath: '/lost' }], unreadable: [{ id: 2, title: 'Locked', filePath: '/locked', reason: 'permission denied' }] });
    render(<LibraryHealthDialog open onOpenChange={vi.fn()} />);
    expect(await screen.findByText(/Missing file: Lost/)).toBeTruthy();
    expect(screen.getByText(/Unreadable file: Locked/)).toBeTruthy();
    expect(screen.getByText(/1 skipped/)).toBeTruthy();
  });

  it('offers retry after an error', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(report);
    render(<LibraryHealthDialog open onOpenChange={vi.fn()} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('All checked files are available.')).toBeTruthy();
  });

  it('disables another check while a request is pending', async () => {
    let finish!: (value: typeof report) => void;
    vi.mocked(invoke).mockResolvedValueOnce(report).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<LibraryHealthDialog open onOpenChange={vi.fn()} />);
    const checkAgain = await screen.findByRole('button', { name: 'Check again' });
    fireEvent.click(checkAgain);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(checkAgain.hasAttribute('disabled')).toBe(true);
    finish(report);
  });
});
