import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Search, Download, Loader2, AlertCircle, ExternalLink, ArrowUpDown } from 'lucide-react'
import { api, isTauri, type ProwlarrResult } from '../../lib/tauri'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { usePreferencesStore } from '../../store/preferencesStore'
import { useToast } from '../../store/toastStore'
import { logger } from '../../lib/logger'

interface ProwlarrSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookTitle: string
  bookAuthor?: string
}

type SortKey = 'seeders' | 'size' | 'date'

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '—'
  const gb = bytes / (1024 ** 3)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 ** 2)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export const ProwlarrSearch = ({ open, onOpenChange, bookTitle, bookAuthor }: ProwlarrSearchProps) => {
  const preferences = usePreferencesStore((s) => s.preferences) as unknown as {
    prowlarrEnabled?: boolean
    prowlarrUrl?: string
    prowlarrApiKey?: string
    prowlarrCategories?: string
  }

  const prowlarrEnabled = preferences?.prowlarrEnabled ?? false
  const prowlarrUrl = preferences?.prowlarrUrl ?? ''
  const prowlarrApiKey = preferences?.prowlarrApiKey ?? ''
  const prowlarrCategories = preferences?.prowlarrCategories ?? '[7000,8000]'

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProwlarrResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [grabbingGuid, setGrabbingGuid] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('seeders')
  const toast = useToast()

  // Pre-fill search query with book info on open
  useEffect(() => {
    if (open) {
      const initial = bookAuthor ? `${bookTitle} ${bookAuthor}` : bookTitle
      setQuery(initial)
      setResults([])
      setError(null)
    }
  }, [open, bookTitle, bookAuthor])

  const parseCategories = (): number[] => {
    try {
      const parsed = JSON.parse(prowlarrCategories)
      return Array.isArray(parsed) ? parsed.map(Number).filter((n) => !isNaN(n)) : [7000, 8000]
    } catch {
      return [7000, 8000]
    }
  }

  const handleSearch = async () => {
    if (!isTauri) return
    if (!prowlarrUrl || !prowlarrApiKey) {
      setError('Prowlarr is not configured. Please add your URL and API key in Settings → Download Services.')
      return
    }
    if (!query.trim()) return

    try {
      setLoading(true)
      setError(null)
      setResults([])
      const cats = parseCategories()
      const res = await api.prowlarrSearch(prowlarrUrl, prowlarrApiKey, query.trim(), cats)
      setResults(res)
      if (res.length === 0) {
        setError('No results found. Try a different search term.')
      }
    } catch (err) {
      logger.error('Prowlarr search failed:', err)
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGrab = async (result: ProwlarrResult) => {
    if (!isTauri || !result.guid || result.indexerId === null) return

    // Prefer local magnet/download URL to avoid extra round-trip
    const directLink = result.magnetUrl || result.downloadUrl
    if (directLink) {
      try {
        setGrabbingGuid(result.guid)
        await api.debridResolveAndImport('auto', [directLink], result.title)
        toast.success('Sent to download queue', result.title)
        onOpenChange(false)
      } catch (err) {
        logger.error('Grab via debrid failed:', err)
        // Fall through to Prowlarr grab
      } finally {
        setGrabbingGuid(null)
      }
      return
    }

    // No direct link — ask Prowlarr to push to its download clients
    try {
      setGrabbingGuid(result.guid)
      const link = await api.prowlarrGrabRelease(prowlarrUrl, prowlarrApiKey, result.guid, result.indexerId!)
      if (link.startsWith('magnet:') || link.startsWith('http')) {
        await api.debridResolveAndImport('auto', [link], result.title)
        toast.success('Sent to download queue', result.title)
        onOpenChange(false)
      } else {
        toast.success('Sent to Prowlarr download client', result.title)
        onOpenChange(false)
      }
    } catch (err) {
      logger.error('Prowlarr grab failed:', err)
      toast.error('Grab failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGrabbingGuid(null)
    }
  }

  const sortedResults = [...results].sort((a, b) => {
    if (sortKey === 'seeders') return (b.seeders ?? -1) - (a.seeders ?? -1)
    if (sortKey === 'size') return (b.size ?? -1) - (a.size ?? -1)
    if (sortKey === 'date') {
      return new Date(b.publishDate ?? 0).getTime() - new Date(a.publishDate ?? 0).getTime()
    }
    return 0
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[92vw] max-w-4xl max-h-[85vh] flex flex-col z-[60]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              <Dialog.Title className="text-lg font-semibold">Search Prowlarr</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Not configured warning */}
          {!prowlarrEnabled || !prowlarrUrl || !prowlarrApiKey ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-12 text-center">
              <AlertCircle className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm max-w-xs">
                Prowlarr is not configured. Go to{' '}
                <span className="font-semibold">Settings → General → Download Services</span> and
                enable Prowlarr with your URL and API key.
              </p>
            </div>
          ) : (
            <>
              {/* Search bar */}
              <div className="px-6 py-4 border-b border-border">
                <div className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search for book title, author…"
                    className="flex-1"
                    disabled={loading}
                    autoFocus
                  />
                  <Button onClick={handleSearch} disabled={loading || !query.trim()} className="gap-2">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    {loading ? 'Searching…' : 'Search'}
                  </Button>
                </div>

                {/* Sort controls */}
                {results.length > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-muted-foreground">{results.length} results · Sort:</span>
                    {(['seeders', 'size', 'date'] as SortKey[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => setSortKey(key)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${
                          sortKey === key
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/40'
                        }`}
                      >
                        <ArrowUpDown size={10} />
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto">
                {error && !loading && (
                  <div className="flex items-center gap-2 p-4 m-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                {sortedResults.length > 0 && (
                  <div className="divide-y divide-border">
                    {sortedResults.map((result, idx) => {
                      const isGrabbing = grabbingGuid === result.guid
                      return (
                        <div
                          key={result.guid ?? idx}
                          className="flex items-start justify-between gap-3 px-6 py-3 hover:bg-muted/40 transition-colors group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate" title={result.title}>
                                {result.title}
                              </p>
                              {result.infoUrl && (
                                <a
                                  href={result.infoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-primary"
                                  aria-label="Open info page"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {result.indexer && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                  {result.indexer}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">{formatBytes(result.size)}</span>
                              {result.seeders !== null && (
                                <span
                                  className={`text-xs font-medium ${
                                    (result.seeders ?? 0) > 5
                                      ? 'text-green-600 dark:text-green-400'
                                      : (result.seeders ?? 0) > 0
                                      ? 'text-yellow-600 dark:text-yellow-400'
                                      : 'text-muted-foreground'
                                  }`}
                                >
                                  ↑{result.seeders} seeds
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatDate(result.publishDate)}
                              </span>
                            </div>
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGrab(result)}
                            disabled={!!grabbingGuid}
                            className="shrink-0 gap-1.5"
                          >
                            {isGrabbing ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Download size={14} />
                            )}
                            {isGrabbing ? 'Grabbing…' : 'Grab'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {!loading && results.length === 0 && !error && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <Search className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">
                      Enter a search term and press Search
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
