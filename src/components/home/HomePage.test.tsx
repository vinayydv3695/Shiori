import React from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  api: Object.fromEntries(['getLibraryStats', 'getBooksByDomain', 'getBooksByIds', 'getRecommendedBooks', 'getReadingProgressBatch', 'getBooksByReadingStatus', 'getRecentBooks', 'getRecentProgress', 'getBook'].map(name => [name, vi.fn()])),
  listener: undefined as undefined | (() => void),
  reads: 0,
}))
vi.mock('@/lib/tauri', () => ({ api: fake.api, isAndroid: false }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async (_: string, callback: () => void) => { fake.listener = callback; return () => { fake.listener = undefined } }) }))
vi.mock('./AndroidHomePage', () => ({ AndroidHomePage: () => null }))
vi.mock('./FeaturedContinueCard', () => ({ FeaturedContinueCard: () => null }))
vi.mock('@/hooks/useThumbnail', () => ({ useThumbnail: () => null }))
vi.mock('@/store/libraryStore', async () => {
  const { create } = await import('zustand')
  return { countActiveFilterCriteria: () => 0, EMPTY_FILTERS: {}, useLibraryStore: create(() => ({
    get books() { fake.reads++; return [] }, favoriteBookIds: [],
  })) }
})

import { HomePage } from './HomePage'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useLibraryStore } from '@/store/libraryStore'
import { useUIStore } from '@/store/uiStore'

const dashboard = () => <TooltipProvider><HomePage onOpenBook={vi.fn()} onViewRSS={vi.fn()} /></TooltipProvider>

const catalog = Array.from({ length: 50_000 }, (_, i) => ({
  id: i + 1, uuid: `book-${i}`, title: `Book ${i}`, authors: ['Author'], file_path: `/books/${i}.epub`,
  file_format: 'epub', file_size: 1024, added_date: '2026-01-01', reading_status: 'unread',
  domain: i % 2 ? 'books' : 'manga_comics',
}))

beforeEach(() => {
  vi.clearAllMocks()
  useUIStore.setState({ currentDomain: 'books' })
  fake.reads = 0
  fake.api.getLibraryStats.mockResolvedValue({ total_books: 25000, total_manga: 25000, total_size_bytes: 51200000 })
  fake.api.getBooksByReadingStatus.mockResolvedValue([])
  fake.api.getRecentBooks.mockResolvedValue([])
  fake.api.getRecentProgress.mockResolvedValue([])
  fake.api.getBooksByDomain.mockResolvedValue([])
  fake.api.getBooksByIds.mockResolvedValue([])
  fake.api.getRecommendedBooks.mockResolvedValue([])
  fake.api.getReadingProgressBatch.mockResolvedValue({})
  useLibraryStore.setState({ get books() { fake.reads++; return catalog } } as never, true)
  // Keep the catalog getter observable without discarding the stable favorites selector.
  Object.defineProperty(useLibraryStore.getState(), 'favoriteBookIds', { value: new Set(), configurable: true, enumerable: true })
  Object.defineProperty(useLibraryStore.getState(), 'books', { get: () => { fake.reads++; return catalog }, configurable: true, enumerable: true })
  fake.reads = 0
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it.each(['books', 'manga_comics'] as const)('renders populated bounded sections in %s without reading the catalog', async domain => {
  useUIStore.setState({ currentDomain: domain })
  const rows = catalog.filter(book => book.domain === domain).slice(0, 6).map((book, index) => ({ ...book, title: `Dashboard ${domain} ${String.fromCharCode(65 + index)}` }))
  fake.api.getBooksByDomain.mockResolvedValue(rows)
  fake.api.getRecommendedBooks.mockResolvedValue(rows)
  fake.api.getBooksByReadingStatus.mockResolvedValue(rows)
  const view = render(dashboard())
  await waitFor(() => expect(view.container.textContent).toContain(rows[0].title))
  expect(fake.reads).toBe(0)
  const nodes = view.container.querySelectorAll('*').length
  expect(nodes).toBeLessThan(1000)
  expect(view.container.querySelectorAll('.bento-list-item').length).toBeGreaterThan(0)
  process.stdout.write(`Populated Home dashboard scale ${JSON.stringify({ domain, catalog: catalog.length, recordsPerResponse: rows.length, returnedRecords: rows.length * (fake.api.getBooksByDomain.mock.calls.length + fake.api.getRecommendedBooks.mock.calls.length + fake.api.getBooksByReadingStatus.mock.calls.length), nodes, renderedRows: view.container.querySelectorAll('.bento-list-item').length })}\n`)
})

it('starts independent dashboard requests before library stats resolve', async () => {
  let resolveStats!: (value: unknown) => void
  fake.api.getLibraryStats.mockReturnValue(new Promise(resolve => { resolveStats = resolve }))
  render(dashboard())
  await waitFor(() => expect(fake.api.getBooksByReadingStatus).toHaveBeenCalledTimes(3))
  expect(fake.api.getBooksByDomain).toHaveBeenCalledTimes(1)
  expect(fake.api.getRecommendedBooks).toHaveBeenCalledTimes(1)
  await act(async () => { resolveStats({ total_books: 25000, total_manga: 25000, total_size_bytes: 51200000 }) })
})

it('keeps desktop reads and rendered nodes bounded with a 50,000-item catalog', async () => {
  const view = render(dashboard())
  await waitFor(() => expect(fake.api.getBooksByReadingStatus).toHaveBeenCalledTimes(3))
  expect(fake.reads).toBe(0)
  expect(fake.api.getBooksByReadingStatus.mock.calls.every(call => call[1] <= 100 && call[3] === 'books')).toBe(true)
  const nodes = view.container.querySelectorAll('*').length
  expect(nodes).toBeLessThan(1000)
  console.info('Home dashboard scale', { catalog: catalog.length, statusRequests: fake.api.getBooksByReadingStatus.mock.calls.length, nodes, catalogReads: fake.reads })
})

it('does not refetch dashboard data when library pagination replaces books', async () => {
  render(dashboard())
  await waitFor(() => expect(fake.api.getBooksByReadingStatus).toHaveBeenCalledTimes(3))
  const requests = fake.api.getLibraryStats.mock.calls.length
  await act(async () => { useLibraryStore.setState({ books: catalog.slice(100, 150) } as never) })
  expect(fake.api.getLibraryStats).toHaveBeenCalledTimes(requests)
  expect(fake.api.getBooksByReadingStatus).toHaveBeenCalledTimes(3)
})

it('refreshes after a real library-updated event and cancels pending refresh on unmount', async () => {
  const view = render(dashboard())
  await waitFor(() => expect(fake.listener).toBeTypeOf('function'))
  await waitFor(() => expect(fake.api.getBooksByReadingStatus).toHaveBeenCalledTimes(3))
  vi.useFakeTimers()
  await act(async () => { fake.listener!(); await vi.advanceTimersByTimeAsync(100) })
  expect(fake.api.getBooksByReadingStatus).toHaveBeenCalledTimes(6)
  act(() => { fake.listener!() })
  view.unmount()
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  expect(fake.api.getBooksByReadingStatus).toHaveBeenCalledTimes(6)
})
