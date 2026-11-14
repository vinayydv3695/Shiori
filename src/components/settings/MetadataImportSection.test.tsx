import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetadataImportSection } from './MetadataImportSection'
import { api } from '../../lib/tauri'
import { open } from '@tauri-apps/plugin-dialog'

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('../../lib/tauri', () => ({ api: { previewLibraryMetadataImport: vi.fn(), importLibraryMetadata: vi.fn() } }))
vi.mock('../../store/libraryStore', () => ({ useLibraryStore: { getState: () => ({ refreshLibrary: mocks.refresh }) } }))
vi.mock('../ui/button', () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }))

const summary = { fingerprint: 'fp', total: 4, matched: 3, unmatched: 1, wouldUpdate: 2, updated: 0, unchanged: 1 }
describe('MetadataImportSection', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('confirm', vi.fn(() => true)) })
  it('requires preview and treats file-dialog cancel as a no-op', async () => {
    vi.mocked(open).mockResolvedValueOnce(null)
    render(<MetadataImportSection />)
    expect(screen.queryByRole('button', { name: 'Fill missing metadata' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Choose JSON file' }))
    await waitFor(() => expect(open).toHaveBeenCalled())
    expect(api.previewLibraryMetadataImport).not.toHaveBeenCalled()
  })
  it('surfaces picker errors and does not retain a preview after selecting another file', async () => {
    vi.mocked(open).mockResolvedValueOnce('/tmp/first.json').mockResolvedValueOnce('/tmp/second.json').mockRejectedValueOnce(new Error('picker failed'))
    vi.mocked(api.previewLibraryMetadataImport).mockResolvedValue(summary)
    render(<MetadataImportSection />)
    const choose = screen.getByRole('button', { name: 'Choose JSON file' })
    fireEvent.click(choose)
    await screen.findByRole('button', { name: 'Preview' })
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await screen.findByText(/3 matched/)
    fireEvent.click(choose)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Fill missing metadata' })).toBeNull())
    fireEvent.click(choose)
    await screen.findByText('Error: picker failed')
    expect(api.importLibraryMetadata).not.toHaveBeenCalled()
  })
  it('previews, applies with fingerprint, and refreshes the library once', async () => {
    vi.mocked(open).mockResolvedValueOnce('/tmp/library.json')
    vi.mocked(api.previewLibraryMetadataImport).mockResolvedValueOnce(summary)
    vi.mocked(api.importLibraryMetadata).mockResolvedValueOnce({ ...summary, updated: 2, wouldUpdate: 0 })
    render(<MetadataImportSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose JSON file' }))
    await screen.findByRole('button', { name: 'Preview' })
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await screen.findByText(/3 matched/)
    const apply = screen.getByRole('button', { name: 'Fill missing metadata' })
    fireEvent.click(apply)
    fireEvent.click(apply)
    await screen.findByText(/Filled missing metadata for 2 books/)
    expect(api.importLibraryMetadata).toHaveBeenCalledWith('/tmp/library.json', 'fp')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
  it('clears a failed preview and prevents apply', async () => {
    vi.mocked(open).mockResolvedValueOnce('/tmp/library.json')
    vi.mocked(api.previewLibraryMetadataImport).mockRejectedValueOnce(new Error('bad file'))
    render(<MetadataImportSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose JSON file' }))
    await screen.findByRole('button', { name: 'Preview' })
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await screen.findByText('Error: bad file')
    expect(screen.queryByRole('button', { name: 'Fill missing metadata' })).toBeNull()
  })
})
