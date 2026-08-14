import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DownloadQueuePanel,
  useDownloadQueueUI,
} from '@/components/online/DownloadQueuePanel';
import { useOnlineDownloadStore } from '@/store/onlineDownloadStore';
import type { DownloadProgress } from '@/store/onlineDownloadStore';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
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

beforeEach(() => {
  useOnlineDownloadStore.setState({ downloads: {} });
  useDownloadQueueUI.setState({ open: false });
});

const progress = (overrides: Partial<DownloadProgress> = {}): DownloadProgress => ({
  target_id: 'https://example.com/book.epub',
  status: 'downloading',
  downloaded_bytes: 1_572_864, // 1.5 MB
  total_bytes: 10_485_760, // 10 MB
  ...overrides,
});

describe('onlineDownloadStore.registerDownload', () => {
  it('creates a minimal entry with the title when no progress exists yet', () => {
    useOnlineDownloadStore.getState().registerDownload('https://example.com/a.epub', 'Book A');

    const entry = useOnlineDownloadStore.getState().downloads['https://example.com/a.epub'];
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Book A');
    expect(entry!.status).toBe('downloading');
    expect(entry!.downloaded_bytes).toBe(0);
    expect(entry!.total_bytes).toBeNull();
  });

  it('merges the title into an existing progress entry without clobbering it', () => {
    const store = useOnlineDownloadStore.getState();
    store.setDownload('https://example.com/a.epub', progress({ downloaded_bytes: 5_242_880 }));

    useOnlineDownloadStore.getState().registerDownload('https://example.com/a.epub', 'Book A');

    const entry = useOnlineDownloadStore.getState().downloads['https://example.com/a.epub'];
    expect(entry!.title).toBe('Book A');
    expect(entry!.status).toBe('downloading');
    expect(entry!.downloaded_bytes).toBe(5_242_880); // untouched
    expect(entry!.total_bytes).toBe(10_485_760); // untouched
  });

  it('keeps separate ids independent', () => {
    const store = useOnlineDownloadStore.getState();
    store.registerDownload('id-1', 'First');
    store.registerDownload('id-2', 'Second');

    const downloads = useOnlineDownloadStore.getState().downloads;
    expect(downloads['id-1'].title).toBe('First');
    expect(downloads['id-2'].title).toBe('Second');
    expect(Object.keys(downloads)).toHaveLength(2);
  });

  it('clearDownload removes the entry', () => {
    const store = useOnlineDownloadStore.getState();
    store.registerDownload('id-1', 'First');
    store.clearDownload('id-1');

    expect(useOnlineDownloadStore.getState().downloads['id-1']).toBeUndefined();
  });
});

describe('DownloadQueuePanel', () => {
  it('shows an empty state when nothing is downloading', () => {
    useDownloadQueueUI.getState().setOpen(true);
    render(<DownloadQueuePanel />);

    expect(screen.getByText('Queue is Empty')).toBeInTheDocument();
  });

  it('lists active downloads with title, MB readout and status', () => {
    useOnlineDownloadStore.setState({
      downloads: {
        'https://example.com/a.epub': progress({
          target_id: 'https://example.com/a.epub',
          title: 'Book A',
        }),
        'https://example.com/b.epub': progress({
          target_id: 'https://example.com/b.epub',
          title: 'Book B',
          status: 'completed',
          downloaded_bytes: 10_485_760,
          total_bytes: 10_485_760,
        }),
      },
    });
    useDownloadQueueUI.getState().setOpen(true);
    render(<DownloadQueuePanel />);

    // Titles from the registered title map
    expect(screen.getByText('Book A')).toBeInTheDocument();
    expect(screen.getByText('Book B')).toBeInTheDocument();

    // Status lines
    expect(screen.getByText('Downloading…')).toBeInTheDocument();
    expect(screen.getByText('Added to library')).toBeInTheDocument();

    // MB readouts (1.5 MB / 10.0 MB and 10.0 MB for the completed one)
    expect(screen.getByText('1.5 MB / 10.0 MB')).toBeInTheDocument();
    expect(screen.getByText('10.0 MB')).toBeInTheDocument();

    // Header counts
    expect(screen.getByText('1 active · 2 total')).toBeInTheDocument();
  });

  it('falls back to the target_id when no title was registered', () => {
    useOnlineDownloadStore.setState({
      downloads: {
        'https://example.com/untitled.epub': progress({
          target_id: 'https://example.com/untitled.epub',
        }),
      },
    });
    useDownloadQueueUI.getState().setOpen(true);
    render(<DownloadQueuePanel />);

    expect(screen.getByText('https://example.com/untitled.epub')).toBeInTheDocument();
  });
});
