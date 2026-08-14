import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MangaDownloadDock } from '@/components/online/MangaDownloadDock';
import { MangaDownloadOptionsDialog } from '@/components/online/MangaDownloadOptionsDialog';
import {
  buildChapterDownloadTitle,
  chapterDisplayLabel,
  countChapterStatuses,
  sortChaptersAscending,
  type ChapterDownloadStatusMap,
} from '@/components/online/mangaDownloadUtils';
import type { UnifiedChapter } from '@/components/online/OnlineMangaDetailView';

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

const chapter = (overrides: Partial<UnifiedChapter> = {}): UnifiedChapter => ({
  id: 'ch-1',
  volume: undefined,
  chapter: '12',
  title: 'The Return',
  pages: 20,
  sourceType: 'plugin',
  originalChapter: { id: 'ch-1' },
  ...overrides,
});

describe('buildChapterDownloadTitle', () => {
  it('prefixes "Chapter N" when the title has no chapter word', () => {
    expect(buildChapterDownloadTitle(chapter())).toBe('Chapter 12: The Return');
  });

  it('formats titles that include the word "chapter"', () => {
    expect(buildChapterDownloadTitle(chapter({ title: 'Chapter 12 Special' }))).toBe(
      'Chapter 12: Special'
    );
  });

  it('falls back to "Chapter N" when there is no title', () => {
    expect(buildChapterDownloadTitle(chapter({ title: '' }))).toBe('Chapter 12');
  });
});

describe('chapterDisplayLabel', () => {
  it('combines chapter number and title', () => {
    expect(chapterDisplayLabel(chapter())).toBe('Chapter 12: The Return');
  });

  it('falls back to "Oneshot" for untitled, numberless chapters', () => {
    expect(chapterDisplayLabel(chapter({ chapter: '?', title: '' }))).toBe('Oneshot');
  });
});

describe('countChapterStatuses', () => {
  it('tallies queued/downloading/done/failed', () => {
    const status: ChapterDownloadStatusMap = {
      a: 'queued',
      b: 'downloading',
      c: 'done',
      d: 'failed',
      e: 'done',
    };
    expect(countChapterStatuses(status)).toEqual({
      queued: 1,
      downloading: 1,
      done: 2,
      failed: 1,
    });
  });

  it('returns zeros for an empty map', () => {
    expect(countChapterStatuses({})).toEqual({
      queued: 0,
      downloading: 0,
      done: 0,
      failed: 0,
    });
  });
});

describe('sortChaptersAscending', () => {
  it('sorts by volume then chapter number, ascending', () => {
    const ch10 = chapter({ id: 'c10', volume: '1', chapter: '10' });
    const ch2 = chapter({ id: 'c2', volume: '1', chapter: '2' });
    const vol2 = chapter({ id: 'v2', volume: '2', chapter: '1' });
    expect(sortChaptersAscending([vol2, ch10, ch2]).map((c) => c.id)).toEqual([
      'c2',
      'c10',
      'v2',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [chapter({ id: 'b' }), chapter({ id: 'a' })];
    sortChaptersAscending(input);
    expect(input[0].id).toBe('b');
  });
});

describe('MangaDownloadDock', () => {
  it('renders nothing when there are no chapters', () => {
    const { container } = render(
      <MangaDownloadDock
        chapters={[]}
        status={{}}
        onDownloadChapter={vi.fn()}
        onDownloadAll={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a "Download All" button and per-chapter download buttons', () => {
    const chapters = [chapter({ id: 'a', chapter: '1', title: 'First' })];
    render(
      <MangaDownloadDock
        chapters={chapters}
        status={{}}
        onDownloadChapter={vi.fn()}
        onDownloadAll={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /download all/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /chapters/i })).toBeInTheDocument();
  });

  it('calls onDownloadAll from the Download All button', () => {
    const onDownloadAll = vi.fn();
    render(
      <MangaDownloadDock
        chapters={[chapter()]}
        status={{}}
        onDownloadChapter={vi.fn()}
        onDownloadAll={onDownloadAll}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /download all/i }));
    expect(onDownloadAll).toHaveBeenCalledTimes(1);
  });

  it('calls onDownloadChapter with the clicked chapter', () => {
    const chapters = [
      chapter({ id: 'a', chapter: '1', title: 'First' }),
      chapter({ id: 'b', chapter: '2', title: 'Second' }),
    ];
    const onDownloadChapter = vi.fn();
    render(
      <MangaDownloadDock
        chapters={chapters}
        status={{}}
        onDownloadChapter={onDownloadChapter}
        onDownloadAll={vi.fn()}
      />
    );

    // Expand the per-chapter picker
    fireEvent.click(screen.getByRole('button', { name: /chapters/i }));
    fireEvent.click(screen.getByRole('button', { name: /download chapter 2: second/i }));

    expect(onDownloadChapter).toHaveBeenCalledTimes(1);
    expect(onDownloadChapter.mock.calls[0][0].id).toBe('b');
  });

  it('shows per-chapter status icons (done/failed/downloading) from the status map', () => {
    const chapters = [
      chapter({ id: 'a', chapter: '1', title: 'First' }),
      chapter({ id: 'b', chapter: '2', title: 'Second' }),
      chapter({ id: 'c', chapter: '3', title: 'Third' }),
    ];
    render(
      <MangaDownloadDock
        chapters={chapters}
        status={{ a: 'done', b: 'failed', c: 'downloading' }}
        onDownloadChapter={vi.fn()}
        onDownloadAll={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /chapters/i }));

    expect(screen.getByRole('button', { name: /download .*1: first/i })).toHaveAttribute(
      'data-status',
      'done'
    );
    expect(screen.getByRole('button', { name: /download .*2: second/i })).toHaveAttribute(
      'data-status',
      'failed'
    );
    expect(screen.getByRole('button', { name: /download .*3: third/i })).toHaveAttribute(
      'data-status',
      'downloading'
    );
    // Downloading rows are disabled to avoid concurrent downloads
    expect(
      screen.getByRole('button', { name: /download .*3: third/i })
    ).toBeDisabled();
  });

  it('shows the overall "X/Y chapters done" line once chapters finish', () => {
    render(
      <MangaDownloadDock
        chapters={[chapter({ id: 'a' }), chapter({ id: 'b' })]}
        status={{ a: 'done', b: 'failed' }}
        onDownloadChapter={vi.fn()}
        onDownloadAll={vi.fn()}
      />
    );

    expect(screen.getByText(/2\/2 chapters done/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });
});

describe('MangaDownloadOptionsDialog', () => {
  it('shows options and downloads all chapters', () => {
    const onDownload = vi.fn();
    const testChapters = [
      chapter({ id: 'ch-1', chapter: '1' }),
      chapter({ id: 'ch-2', chapter: '2' }),
    ];

    render(
      <MangaDownloadOptionsDialog
        open
        onOpenChange={vi.fn()}
        title="My Manga"
        chapters={testChapters}
        onDownload={onDownload}
      />
    );

    expect(screen.getByText('Download Manga')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /all chapters/i }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledWith(testChapters);
  });
});
