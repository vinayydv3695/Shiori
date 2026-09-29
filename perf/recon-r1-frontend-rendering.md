# R1 — Frontend Rendering Recon (READ-ONLY pass)

Scope: non-virtualized lists, `.map()` over thousands, memoization, unstable props, render storms, images, layout/CSS cost.

## Critical

### C1. SeriesView renders every volume card with no virtualization
- **File:** `src/components/library/SeriesView.tsx`
- **Evidence:** grid branch `processedBooks.map((book, idx) => …)` renders one `PremiumBookCard` per volume (~lines 897–930); list branch maps `ListBookCard` for all (~lines 933–946). For a 1000-chapter series that is 1000 mounted cards in one `ScrollArea`.
- `forceVisible={true}` (~line 917) bypasses the IntersectionObserver lazy-reveal built into `PremiumBookCard` (`ModernBookCard.tsx:261,278` — `if (forceVisible) return;`), so all 1000 covers resolve immediately.
- `animationDelay={idx * 20}` (~line 918) → 1000th card waits 20 s of stagger; also forces 1000 concurrent CSS entrance animations on open.
- `bookRefs.current.set(book.id, el)` per row builds a 1000-entry ref Map (~line 902).
- Heavy effects on the dialog: `Dialog.Overlay backdrop-blur-sm`, controls bar `backdrop-blur-3xl` (~line 745), header hero `filter blur-3xl scale-125` (~line 87). Backdrop-filter over a scrollable region forces full-screen re-compositing per frame on weak GPUs (Android WebView especially).

### C2. "Mark all read" is O(n) sequential IPC
- **File:** `src/components/library/SeriesView.tsx`, `handleMarkAllRead` (~lines 700–714)
- **Evidence:** `for (const book of series.books) { await api.updateReadingStatus(book.id, 'completed') }` — 1000 serialized IPC round-trips, then a full `loadInitialBooks()` refetch. UI is blocked-feeling for seconds; each update also fires DB FTS triggers backend-side (see R2).

## High

### H1. Metadata/Delete handlers fetch the entire series table to find one row
- **File:** `src/components/library/SeriesView.tsx`, `handleFindSeriesMetadata` (~line 683), `handleDeleteSeries` (~line 699)
- **Evidence:** `api.getMangaSeriesList(1000, 0)` then `.find(s => s.title.toLowerCase() === …)` — full-table IPC payload + fragile title matching, used to recover a series id the view never received (the `SeriesGroup` prop carries no DB id; `useGroupedLibrary.ts:117` builds `id` from a slug of the title).

### H2. ModernListView / ModernTableView are not virtualized
- **Files:** `src/components/library/ModernListView.tsx:51` (`books.map`), `src/components/library/ModernTableView.tsx:234` (`sortedBooks.map`)
- **Evidence:** the library store's infinite scroll appends pages of 50 (`libraryStore.ts loadMoreBooks`); after scrolling through a 10k library the list/table DOM holds every loaded row. Grid view is fine (`LibraryGrid.tsx:366` uses `useVirtualizer`, overscan 3, single grid-level IntersectionObserver, windowed cover prefetch at `:495-527`).

### H3. Reader chapter dropdown maps all chapters
- **File:** `src/components/manga/MangaReaderHeader.tsx`
- **Evidence:** `processedChapters.map` (~line 471) and `processedLocalBooks.map` (~line 582) render every chapter/volume row on open; `processedLocalBooks` re-sorts with `compareBooksNatural` (regex-heavy, `seriesSorting.ts:47-81`) per memo invalidation. 1000 rows + 1000 regex parses on dropdown open.

## Medium

### M1. HomePage fires up to 100 individual `getBook` IPC calls
- **File:** `src/components/home/HomePage.tsx:271` — `favIds.slice(0, 100).map(id => api.getBook(id).catch(() => null))`. One batched command exists for covers/progress but not for books-by-ids here. Also `getLibraryStats` (full `books` scan, no `in_trash` filter — R2) on every mount.

### M2. `applyLibraryUpdate('book-updated')` is N+1 over IPC
- **File:** `src/store/libraryStore.ts` (~line 487-501) — `Promise.all(onScreen.map((id) => api.getBook(id)))`. A batch `getBooksByIds` command exists backend-side (`library_service.rs:191`) but is not exposed/used here.

### M3. Series grouping recomputes regex sorts on every library window append
- **File:** `src/hooks/useGroupedLibrary.ts:96` — `seriesBooks.sort(compareBooksNatural…)`; `compareBooksNatural` → `parseVolumeOrChapterNumber` (`src/lib/seriesSorting.ts:47`) runs up to 3 regex patterns per comparison. Each `loadMoreBooks` append rebuilds `groupedItems` (dep `[books]`), so a 1000-volume series re-sorts (~10k comparisons × regex) on every page append during scroll — progressive jank while scrolling the manga library.

### M4. AniList banner fetch on every SeriesView open
- **File:** `src/components/library/SeriesView.tsx` (~lines 517-545) — network POST to graphql.anilist.co per open, no cache; also runs on mobile data.

## Low
- `Dialog` entrance `animate-in zoom-in-95` + 1000 children mounting in the same frame (SeriesView) — first paint of the dialog is one giant layout. Combined with C1.
- `useLibraryFilter` re-filters the full loaded window per keystroke (check debounce in `App.tsx` search path; `useGlobalSearch.ts:53` uses a `setTimeout` debounce — verify delay covers library grid filtering too).

## What is already good (do not regress)
- `LibraryGrid.tsx`: TanStack virtualizer, single IntersectionObserver for cover reveal, windowed cover prefetch, ResizeObserver rAF-throttled column recompute.
- `PremiumBookCard` is `memo`'d with `loading="lazy" decoding="async"` images (`ModernBookCard.tsx:237,352-353`).
- Zustand selector granularity in `MangaReader.tsx` (per-field selectors) — model pattern.
