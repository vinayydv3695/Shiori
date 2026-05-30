import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertCircle,
  ChevronDown,
  Cloud,
  DownloadCloud,
  Filter,
  Link,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/store/toastStore'
import { TrendingExplore } from './torbox/TrendingExplore'
import { useTorboxStore, TorboxQueueItem } from '@/stores/useTorboxStore'
import { parsePageUrl } from '@/lib/utils'

type SearchType = 'manga' | 'books' | 'all'
type QueueType = 'manga' | 'books'
type TabValue = 'search' | 'books' | 'manga'
type TorboxInitialTab = 'discover' | 'books' | 'manga'
type KeyStatus = 'unknown' | 'set' | 'unset' | 'verifying' | 'error'
type FileType = 'CBZ' | 'CBR' | 'EPUB' | 'PDF' | 'MOBI' | 'AZW3' | 'DOCX' | 'TORRENT' | 'MAGNET' | 'OTHER'

interface UnifiedMetadata {
  id: string
  title: string
  author?: string
  year?: string
  rating?: number
  ongoing?: boolean
  tags: string[]
  coverUrl?: string
  description?: string
  kind: QueueType
}

interface SearchSource {
  id: string
  label: string
  magnetLink: string
  linkKind?: string
  fileType: FileType
  fileName: string
  sizeBytes?: number
  seeders?: number
}

interface SearchResult {
  id: string
  title: string
  sources: SearchSource[]
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const precision = size >= 10 || unitIndex === 0 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function formatSpeed(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B/s'
  return `${formatBytes(value)}/s`
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'ETA --'
  const rounded = Math.round(seconds)
  if (rounded < 60) return `ETA ${rounded}s`
  const minutes = Math.floor(rounded / 60)
  const secs = rounded % 60
  if (minutes < 60) return secs === 0 ? `ETA ${minutes}m` : `ETA ${minutes}m ${secs}s`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins === 0 ? `ETA ${hours}h` : `ETA ${hours}h ${mins}m`
}

function estimateEta(status: string, size: number, progressPercent: number, speed: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return null
  if (!Number.isFinite(speed) || speed <= 0) return null
  const normalized = status.toLowerCase()
  if (!normalized.includes('download')) return null
  const clampedProgress = Math.max(0, Math.min(100, progressPercent))
  if (clampedProgress >= 100) return null
  const downloadedBytes = size * (clampedProgress / 100)
  const remainingBytes = Math.max(0, size - downloadedBytes)
  if (remainingBytes <= 0) return null
  return formatEta(remainingBytes / speed)
}

function formatLocalProgress(job: TorboxQueueItem): string | null {
  if (job.localPhase !== 'downloading' && job.localPhase !== 'importing') return null
  const localProgress = typeof job.localProgress === 'number' ? Math.max(0, Math.min(100, job.localProgress)) : null
  const downloaded = typeof job.localDownloadedBytes === 'number' ? job.localDownloadedBytes : null
  const total = typeof job.localTotalBytes === 'number' ? job.localTotalBytes : null
  if (localProgress === null && downloaded === null) return null
  let text = 'Local download: '
  text += localProgress !== null ? `${localProgress.toFixed(1)}%` : 'in progress'
  if (downloaded !== null) {
    text += ` (${formatBytes(downloaded)}`
    if (total !== null) text += ` / ${formatBytes(total)}`
    text += ')'
  }
  return text
}

function formatLocalFileStep(job: TorboxQueueItem): string | null {
  if (job.localPhase !== 'downloading' && job.localPhase !== 'importing') return null
  if (typeof job.localFileIndex !== 'number' || typeof job.localFileTotal !== 'number') return null
  if (job.localFileTotal <= 1) return null
  const name = typeof job.localFileName === 'string' && job.localFileName.trim() ? job.localFileName : null
  return `Volume ${job.localFileIndex} of ${job.localFileTotal}${name ? ` - ${name}` : ''}`
}

function queueStatusBadgeClass(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized.includes('downloading') || normalized.includes('verify')) return 'bg-blue-500/15 text-blue-300 border-blue-400/40'
  if (normalized.includes('completed') || normalized.includes('seeding') || normalized.includes('ready')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
  if (normalized.includes('error') || normalized.includes('failed')) return 'bg-red-500/15 text-red-300 border-red-400/40'
  return 'bg-muted text-muted-foreground border-border'
}

function progressFillClass(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized.includes('completed') || normalized.includes('seeding') || normalized.includes('ready')) return 'bg-emerald-400'
  if (normalized.includes('error') || normalized.includes('failed')) return 'bg-red-400'
  if (normalized.includes('downloading') || normalized.includes('verify')) return 'bg-blue-400'
  return 'bg-muted-foreground'
}

function statusPhaseText(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized.includes('error') || normalized.includes('failed')) return 'Transfer failed'
  if (normalized.includes('completed') || normalized.includes('seeding') || normalized.includes('ready')) return 'Downloaded and imported to library'
  if (normalized.includes('import')) return 'Cloud complete - downloading to this device and importing'
  if (normalized.includes('download')) return 'Downloading from Torbox'
  if (normalized.includes('verify')) return 'Preparing transfer'
  return 'Queued in Torbox'
}

function mapInitialTabToValue(initialTab: TorboxInitialTab): TabValue {
  if (initialTab === 'books') return 'books'
  if (initialTab === 'manga') return 'manga'
  return 'search'
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

// Simplified parsers from before
function parseSearchSource(record: any, index: number, fallbackTitle: string): SearchSource | null {
  if (!record) return null
  const extra = record.extra || {}
  const rawLink = record.magnet_url || record.torrent_url || record.magnetLink || record.magnet_link || record.magnet || record.url || record.link || record.torrent || extra.magnet || extra.url || extra.torrent || extra.link
  if (!rawLink) return null

  const parsedLink = parsePageUrl(rawLink)
  let linkKind = parsedLink.kind
  if (linkKind === 'direct') {
    const normalized = parsedLink.url.trim().toLowerCase()
    if (normalized.startsWith('magnet:')) linkKind = 'magnet'
    else if (normalized.includes('.torrent') || normalized.includes('/torrent')) linkKind = 'torrent'
  }

  const magnetLink = parsedLink.url
  if (!magnetLink) return null

  const fileName = record.fileName || record.filename || record.name || record.title || extra.fileName || extra.filename || extra.name || extra.title || fallbackTitle
  const sizeBytes = Number(record.sizeBytes || record.size_bytes || record.size || record.fileSize || record.file_size || extra.sizeBytes || extra.size_bytes || extra.size)
  const seeders = Number(record.seeders || record.seeds || extra.seeders || extra.seeds)

  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  let fileType: FileType = 'OTHER'
  if (['cbz', 'cbr'].includes(ext)) fileType = 'CBZ'
  else if (['epub', 'pdf', 'mobi', 'azw3', 'docx'].includes(ext)) fileType = ext.toUpperCase() as FileType
  else if (['torrent'].includes(ext)) fileType = 'TORRENT'
  else if (magnetLink.toLowerCase().startsWith('magnet:')) fileType = 'MAGNET'

  return {
    id: record.id || `source-${index}`,
    label: fileName,
    magnetLink,
    linkKind,
    fileType,
    fileName,
    sizeBytes: Number.isNaN(sizeBytes) ? undefined : sizeBytes,
    seeders: Number.isNaN(seeders) ? undefined : seeders,
  }
}

export default function TorboxControlCenter({ initialTab = 'discover' }: { initialTab?: TorboxInitialTab }) {
  const { success, error, info } = useToast()
  const { jobs, enqueueJob, removeJob, importJob, resolveJob, clearCompleted: clearStoreCompleted } = useTorboxStore()

  const [apiKey, setApiKey] = useState<string>('')
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('unknown')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<SearchType>('manga')
  const [searchResults, setSearchResults] = useState<UnifiedMetadata[]>([])
  
  const [activeModalResult, setActiveModalResult] = useState<SearchResult | null>(null)
  const [isFetchingTorrents, setIsFetchingTorrents] = useState(false)
  const [sourceBusy, setSourceBusy] = useState<Record<string, boolean>>({})

  const [isSearching, setIsSearching] = useState(false)
  const [activeTab, setActiveTab] = useState<TabValue>(() => mapInitialTabToValue(initialTab))

  const [keyFeedback, setKeyFeedback] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [manualTitle, setManualTitle] = useState('')
  const [manualMagnet, setManualMagnet] = useState('')
  const [editingKey, setEditingKey] = useState(false)

  const booksJobs = useMemo(() => jobs.filter((job) => job.source === 'anna'), [jobs])
  const mangaJobs = useMemo(() => jobs.filter((job) => job.source === 'manga'), [jobs])

  useEffect(() => {
    setActiveTab(mapInitialTabToValue(initialTab))
  }, [initialTab])

  useEffect(() => {
    let mounted = true
    const loadKey = async () => {
      try {
        const saved = await invoke<string | null>('get_torbox_key')
        if (!mounted) return
        if (saved && saved.trim()) {
          setApiKey(saved)
          setKeyStatus('set')
          setEditingKey(false)
        } else {
          setKeyStatus('unset')
          setEditingKey(true)
        }
      } catch (invokeError) {
        if (!mounted) return
        setKeyStatus('error')
        setKeyFeedback(getErrorMessage(invokeError, 'Failed to load Torbox key.'))
      }
    }
    void loadKey()
    return () => { mounted = false }
  }, [])

  const verifyAndSaveKey = useCallback(async () => {
    const trimmed = apiKey.trim()
    if (!trimmed) {
      setKeyStatus('error')
      setKeyFeedback('API key is required.')
      return
    }
    setKeyStatus('verifying')
    setKeyFeedback(null)
    try {
      const result = await invoke<{ valid: boolean; message: string }>('verify_torbox_key', { apiKey: trimmed })
      if (result.valid) {
        setKeyStatus('set')
        setKeyFeedback(result.message || 'Torbox key saved.')
        setEditingKey(false)
        success('Torbox connected', result.message || 'API key verified and saved.')
      } else {
        setKeyStatus('error')
        setKeyFeedback(result.message || 'Invalid Torbox key.')
        error('Key verification failed', result.message || 'Please check your API key.')
      }
    } catch (invokeError) {
      const message = getErrorMessage(invokeError, 'Failed to verify Torbox key.')
      setKeyStatus('error')
      setKeyFeedback(message)
      error('Key verification failed', message)
    }
  }, [apiKey, error, success])

  const clearSavedKey = useCallback(async () => {
    try {
      await invoke<void>('save_torbox_key', { apiKey: null })
      setApiKey('')
      setKeyStatus('unset')
      setEditingKey(true)
      setKeyFeedback('Torbox key cleared.')
    } catch (invokeError) {
      setKeyStatus('error')
      setKeyFeedback(getErrorMessage(invokeError, 'Failed to clear Torbox key.'))
    }
  }, [])

  const runSearch = useCallback(async (queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim()
    if (!query) {
      setSearchResults([])
      setSearchError(null)
      return []
    }
    if (queryOverride) setSearchQuery(queryOverride)
    setIsSearching(true)
    setSearchError(null)

    try {
      let combined: UnifiedMetadata[] = []
      
      if (searchType === 'manga' || searchType === 'all') {
        try {
          const mangaRes = await invoke<any[]>('search_manga_metadata', { title: query })
          const mapped = mangaRes.map(m => ({
            id: `anilist-${m.anilist_id}`,
            title: m.title_english || m.title_romaji || m.title_native || 'Unknown Title',
            author: m.authors?.[0],
            year: m.start_year?.toString(),
            rating: m.average_score,
            ongoing: m.status && m.status !== 'FINISHED',
            tags: m.genres || [],
            coverUrl: m.cover_url_large || m.cover_url_extra_large,
            description: m.description,
            kind: 'manga' as const
          }))
          combined = [...combined, ...mapped]
        } catch (e) {
          console.error("Manga metadata search failed", e)
        }
      }

      if (searchType === 'books' || searchType === 'all') {
        try {
          const bookRes = await invoke<any[]>('search_book_metadata', { title: query, author: null })
          const mapped = bookRes.map(b => ({
            id: `ol-${b.open_library_id}`,
            title: b.title || 'Unknown Title',
            author: b.authors?.[0]?.name,
            year: b.publish_date,
            rating: undefined,
            ongoing: false,
            tags: b.subjects || [],
            coverUrl: b.cover_url_large || b.cover_url_medium || b.cover_url_small,
            description: b.description,
            kind: 'books' as const
          }))
          combined = [...combined, ...mapped]
        } catch (e) {
          console.error("Book metadata search failed", e)
        }
      }

      setSearchResults(combined)
      if (combined.length === 0) {
        setSearchError('No matching series found. Try a different query.')
      }
    } catch (invokeError) {
      setSearchResults([])
      setSearchError(getErrorMessage(invokeError, 'Search failed.'))
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, searchType])

  const fetchTorrentsForMetadata = useCallback(async (meta: UnifiedMetadata) => {
    setIsFetchingTorrents(true)
    try {
      const raw = await invoke<any>('search_manga_sources', { query: meta.title })
      const rootArray = Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? raw?.data ?? [])
      
      const sources: SearchSource[] = []
      rootArray.forEach((row: any, i: number) => {
        if (row.sources && Array.isArray(row.sources)) {
          row.sources.forEach((s: any, j: number) => {
            const parsed = parseSearchSource(s, j, meta.title)
            if (parsed) sources.push(parsed)
          })
        }
        const direct = parseSearchSource(row, i, meta.title)
        if (direct && !sources.some(s => s.magnetLink === direct.magnetLink)) {
          sources.unshift(direct)
        }
      })

      setActiveModalResult({
        id: meta.id,
        title: meta.title,
        sources,
      })
    } catch (err) {
      error('Failed to fetch torrents', getErrorMessage(err, 'Search error'))
    } finally {
      setIsFetchingTorrents(false)
    }
  }, [error])

  const addManualLink = useCallback(async () => {
    const link = manualMagnet.trim()
    if (!link) {
      setSearchError('Please paste a valid magnet or HTTP/HTTPS link.')
      return
    }
    try {
      await enqueueJob({ title: manualTitle.trim() || 'Manual Add', sourceLink: link, kind: searchType === 'books' ? 'books' : 'manga' })
      success('Added manual link', 'Job queued to Torbox.')
      setManualMagnet('')
      setManualTitle('')
    } catch (err) {
      error('Queue failed', getErrorMessage(err, 'Failed to add manual link'))
    }
  }, [enqueueJob, manualMagnet, manualTitle, searchType, success, error])

  const renderQueueRows = useCallback((rows: TorboxQueueItem[], emptyLabel: string) => {
    if (rows.length === 0) {
      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 py-16 text-muted-foreground backdrop-blur-sm bg-muted/10">
          <AlertCircle className="mb-3 h-6 w-6 opacity-50" />
          <p className="text-sm font-medium tracking-wide opacity-80">{emptyLabel}</p>
        </motion.div>
      )
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {rows.map((job) => {
            const progress = job.progress || 0
            const isDone = job.status === 'completed'
            const isErr = job.status === 'failed'
            const eta = estimateEta(job.status, job.size || 0, progress, job.downloadSpeed || 0)
            const localProgressText = formatLocalProgress(job)
            const localFileStepText = formatLocalFileStep(job)

            return (
              <motion.div
                key={job.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-xl p-4 shadow-sm transition-all hover:shadow-md hover:border-border"
              >
                {!isDone && !isErr && <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl" />}
                {isDone && <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />}
                
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground tracking-tight">{job.title || `Job #${job.id}`}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                        <span>{formatBytes(job.size || 0)}</span>
                        <span className="opacity-50">•</span>
                        <span className="truncate">ID {job.torrentId || '...'}</span>
                      </div>
                    </div>
                    <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100" onClick={() => removeJob(job.id)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <Badge className={`border text-[10px] uppercase tracking-wider font-semibold ${queueStatusBadgeClass(job.status)}`} variant="outline">
                      {job.status || 'queued'}
                    </Badge>
                    <div className="text-right">
                      <p className="text-xs font-medium text-foreground/80">{Math.round(progress)}%</p>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                    <motion.div className={`h-full rounded-full ${progressFillClass(job.status)}`} initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                    <span className="truncate pr-2">{statusPhaseText(job.status)}</span>
                    <div className="flex shrink-0 items-center gap-2 text-right">
                      {eta && <span className="text-blue-400/80">{eta}</span>}
                      {(job.downloadSpeed || 0) > 0 && <span>{formatSpeed(job.downloadSpeed!)}</span>}
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-4 space-y-2">
                  {(isDone || isErr || job.resolvedLink || job.importedPath || job.error) && (
                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/40">
                      <Button size="sm" variant="secondary" className="h-7 rounded-md px-2.5 text-[11px] font-medium" onClick={() => void resolveJob(job.id)} disabled={job.resolving}>
                        {job.resolving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Resolve Link
                      </Button>
                      <Button size="sm" variant="secondary" className="h-7 rounded-md px-2.5 text-[11px] font-medium" onClick={() => void importJob(job.id)} disabled={job.localPhase === 'importing'}>
                        {job.localPhase === 'importing' && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Import
                      </Button>
                      {job.resolvedLink && <span className="truncate w-full block text-[10px] text-muted-foreground mt-1">Resolved: {job.resolvedLink}</span>}
                      {job.importedPath && <span className="truncate w-full block text-[10px] text-emerald-400/90 mt-1">Imported: {job.importedPath}</span>}
                      {job.error && <span className="text-[10px] text-red-400/90 w-full block mt-1">{job.error}</span>}
                    </div>
                  )}

                  {(localProgressText || localFileStepText) && (
                    <div className="rounded-md bg-muted/30 p-2 text-[10px] text-muted-foreground border border-border/30 mt-2">
                      {localProgressText && <p>{localProgressText}</p>}
                      {localFileStepText && <p className="mt-0.5 opacity-80">{localFileStepText}</p>}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    )
  }, [removeJob, resolveJob, importJob])

  return (
    <div className="flex h-full flex-col bg-background p-6 text-foreground relative overflow-hidden">
      <header className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Cloud className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              Torbox Control Center
              <Badge variant="outline" className={`h-5 px-2 rounded-md font-bold tracking-wider uppercase text-[10px] ${apiKey ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10' : 'border-amber-500/30 text-amber-500 bg-amber-500/10'}`}>
                {apiKey ? 'API Active' : 'No Key'}
              </Badge>
            </h1>
            <p className="text-sm font-medium text-muted-foreground mt-0.5">Manage your cloud downloads and resolve premium sources.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <AnimatePresence mode="wait">
            {keyStatus === 'set' && !editingKey ? (
              <motion.div key="connected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 rounded-lg font-medium" onClick={() => { setEditingKey(true); setKeyStatus('unset'); setKeyFeedback(null) }}>
                  Change Key
                </Button>
                <Button variant="ghost" size="sm" className="h-9 rounded-lg font-medium text-muted-foreground hover:text-red-400" onClick={() => void clearSavedKey()}>
                  Disconnect
                </Button>
              </motion.div>
            ) : (
              <motion.div key="disconnected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 relative">
                <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste Torbox API Key" className="h-9 w-40 sm:w-56 text-sm bg-background transition-all" />
                <Button size="sm" variant="secondary" className="h-9 px-4 font-semibold" onClick={() => void verifyAndSaveKey()} disabled={keyStatus === 'verifying'}>
                  {keyStatus === 'verifying' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null} Verify
                </Button>
                {keyFeedback && keyStatus === 'error' && (
                  <span className="absolute top-11 right-0 text-[11px] font-medium text-destructive whitespace-nowrap bg-background border border-destructive/20 px-3 py-1.5 rounded-md shadow-md z-50">
                    {keyFeedback}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <Tabs.Root value={activeTab} onValueChange={(next) => setActiveTab(next as TabValue)} className="flex min-h-0 flex-1 flex-col z-10">
        <Tabs.List className="flex items-center gap-6 border-b border-border/50 pb-2 mb-4">
          {(['search', 'books', 'manga'] as const).map((tab) => {
            const isActive = activeTab === tab;
            let label = tab === 'search' ? 'Discover' : tab === 'books' ? 'Books Queue' : 'Manga Queue';
            let count = tab === 'books' ? booksJobs.length : tab === 'manga' ? mangaJobs.length : null;

            return (
              <Tabs.Trigger key={tab} value={tab} className={`relative flex items-center gap-2 pb-2 text-sm outline-none transition-colors hover:text-foreground ${isActive ? 'text-foreground font-semibold' : 'text-muted-foreground font-medium'}`}>
                <span>{label}</span>
                {count !== null && count > 0 && <Badge variant="secondary" className="h-5 px-1.5 py-0 text-[10px] font-bold">{count}</Badge>}
                {isActive && <motion.div layoutId="torbox-tab-indicator" className="absolute -bottom-[9px] left-0 right-0 h-0.5 bg-primary" initial={false} transition={{ type: "spring", stiffness: 500, damping: 30 }} />}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.2 }} className="mt-4 flex-1 min-h-0 overflow-y-auto">
            {activeTab === 'search' && (
              <Tabs.Content value="search" className="h-full outline-none overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <div className="max-w-2xl mx-auto mb-8 pt-4">
                  <div className="relative flex items-center shadow-sm bg-card border border-border rounded-full hover:border-border/80 ring-1 ring-transparent focus-within:border-primary focus-within:ring-primary transition-shadow duration-200">
                    <Search className="absolute left-5 h-5 w-5 text-muted-foreground" />
                    <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runSearch() }} placeholder="Search AniList or OpenLibrary..." className="flex-1 h-14 border-0 bg-transparent pl-14 pr-4 text-base font-medium shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                    <div className="pr-2 flex items-center gap-2">
                      <select value={searchType} onChange={(event) => setSearchType(event.target.value as SearchType)} className="h-10 rounded-full bg-transparent border-0 px-4 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none [&>option]:bg-background [&>option]:text-foreground">
                        <option value="manga">Manga</option>
                        <option value="books">Books</option>
                        <option value="all">Everywhere</option>
                      </select>
                      <Button size="icon" className="h-10 w-10 rounded-full shrink-0" onClick={() => void runSearch()} disabled={isSearching}>
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {searchError && <p className="mb-6 text-sm font-medium text-destructive bg-destructive/10 border border-destructive/20 p-4 rounded-xl inline-flex items-center gap-2"><AlertCircle className="h-4 w-4"/> {searchError}</p>}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start pb-8">
                  <AnimatePresence>
                    {searchResults.map((result) => {
                      return (
                        <motion.div 
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          key={result.id} 
                          className="group flex gap-4 cursor-pointer rounded-xl bg-card/60 border border-border/50 p-3 shadow-sm backdrop-blur-xl hover:shadow-md hover:border-border transition-all"
                          onClick={() => fetchTorrentsForMetadata(result)}
                        >
                          <div className="relative overflow-hidden rounded-lg bg-muted/30 shadow-sm border border-border/40 w-24 h-32 shrink-0">
                            {result.coverUrl ? (
                              <img src={result.coverUrl} alt={result.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground/40 bg-muted/10">
                                <Search className="h-6 w-6 opacity-50" />
                              </div>
                            )}
                            {typeof result.rating === 'number' && (
                              <div className="absolute bottom-1 right-1 bg-background/90 text-amber-500 text-[10px] font-bold px-1 rounded shadow-sm backdrop-blur-md">★ {(result.rating / 10).toFixed(1)}</div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                            <div>
                              <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary text-sm line-clamp-2 leading-snug">{result.title}</h3>
                              <p className="mt-1 text-xs text-muted-foreground truncate">
                                {result.year && <span>{result.year}</span>}
                                {result.year && result.author && <span className="mx-1.5 opacity-50">•</span>}
                                {result.author && <span>{result.author}</span>}
                              </p>
                              {result.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-2 opacity-80" dangerouslySetInnerHTML={{ __html: result.description }} />}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-3">
                              {result.tags.slice(0, 3).map((tag, i) => (
                                <Badge key={i} variant="secondary" className="px-1.5 py-0 text-[9px] bg-primary/10 text-primary border-0">{tag}</Badge>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>

                  {!isSearching && searchResults.length === 0 && searchQuery.trim() && !searchError && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full flex flex-col items-center justify-center rounded-3xl border border-dashed border-border py-20 bg-muted/5">
                      <Search className="h-10 w-10 text-muted-foreground/30 mb-4" />
                      <p className="text-base font-medium text-muted-foreground/80">No matching metadata found.</p>
                    </motion.div>
                  )}
                  
                  {!isSearching && searchResults.length === 0 && !searchQuery.trim() && (
                    <div className="col-span-full">
                      <TrendingExplore type={searchType === 'all' ? 'manga' : searchType} />
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-8 border-t border-border/50">
                  <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                        <Link className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold tracking-tight text-foreground/80">Manual Magnet Add</h4>
                        <p className="text-[11px] text-muted-foreground">Inject a magnet link if search is unavailable</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="Custom Title" className="h-9 w-32 text-xs font-medium bg-background border-border/40 focus:border-primary/40 rounded-full" />
                      <Input value={manualMagnet} onChange={(event) => setManualMagnet(event.target.value)} placeholder="magnet:?xt=urn:btih:..." className="h-9 w-48 text-xs font-medium bg-background border-border/40 focus:border-primary/40 font-mono rounded-full" />
                      <Button size="sm" variant="secondary" className="h-9 rounded-full px-4 font-semibold shadow-sm" onClick={() => void addManualLink()}>Inject</Button>
                    </div>
                  </div>
                </div>
              </Tabs.Content>
            )}

            {activeTab === 'books' && (
              <Tabs.Content value="books" className="h-full rounded-2xl border border-border/50 bg-card/40 p-5 backdrop-blur-xl shadow-sm outline-none overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold tracking-tight text-foreground/90">Books Queue</h2>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={clearStoreCompleted}>Clear Completed</Button>
                    <Badge variant="secondary" className="bg-white/10 text-foreground">{booksJobs.length} active tasks</Badge>
                  </div>
                </div>
                {renderQueueRows(booksJobs, 'No books are currently in your queue.')}
              </Tabs.Content>
            )}

            {activeTab === 'manga' && (
              <Tabs.Content value="manga" className="h-full rounded-2xl border border-border/50 bg-card/40 p-5 backdrop-blur-xl shadow-sm outline-none overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold tracking-tight text-foreground/90">Manga Queue</h2>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={clearStoreCompleted}>Clear Completed</Button>
                    <Badge variant="secondary" className="bg-white/10 text-foreground">{mangaJobs.length} active tasks</Badge>
                  </div>
                </div>
                {renderQueueRows(mangaJobs, 'No manga are currently in your queue.')}
              </Tabs.Content>
            )}
          </motion.div>
        </AnimatePresence>
      </Tabs.Root>

      <Dialog.Root open={!!activeModalResult || isFetchingTorrents} onOpenChange={(open) => !open && !isFetchingTorrents && setActiveModalResult(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#121212] border border-white/10 rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col z-50 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300">
            {isFetchingTorrents ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-purple-400" />
                <p className="text-sm font-medium text-gray-300 animate-pulse">Scanning torrent clouds for results...</p>
              </div>
            ) : activeModalResult && (
              <>
                <div className="flex-none px-6 py-5 border-b border-white/5 relative">
                  <div className="flex items-center gap-3 pr-12">
                    <div className="flex items-center justify-center w-8 h-8 rounded bg-purple-500/10 text-purple-400">
                      <DownloadCloud className="w-5 h-5" />
                    </div>
                    <Dialog.Title className="text-xl font-bold tracking-tight text-white truncate">
                      {activeModalResult.title}
                    </Dialog.Title>
                  </div>
                  
                  <Dialog.Close asChild>
                    <button className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50">
                      <X className="w-5 h-5" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-sm font-medium text-gray-300 cursor-pointer hover:bg-white/10 transition-colors">
                      <Filter className="w-4 h-4" />
                      <span>All Sources</span>
                      <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                    </div>
                    <span className="text-sm font-medium text-gray-500">
                      {activeModalResult.sources.length} of {activeModalResult.sources.length} results
                    </span>
                  </div>

                  {activeModalResult.sources.length === 0 ? (
                    <div className="text-center py-10">
                      <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground opacity-50 mb-3" />
                      <p className="text-gray-400">No torrents found for this series.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeModalResult.sources.map((source) => {
                        const busyId = `${activeModalResult.id}:${source.id}`
                        const busy = sourceBusy[busyId] === true

                        return (
                          <div key={source.id} className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4 flex flex-col gap-3 transition-colors hover:bg-[#1a1a1a]/80">
                            <div className="flex flex-col gap-1.5">
                              <h3 className="text-[15px] font-semibold text-white/90 truncate">{source.label}</h3>
                              <div className="flex items-center gap-3 text-xs font-medium text-gray-400">
                                <Badge variant="secondary" className="bg-[#3b1578] hover:bg-[#3b1578] text-[#d4b4f5] border-0 rounded text-[10px] px-2 py-0 uppercase tracking-wide">
                                  {source.fileType || 'UNKNOWN'}
                                </Badge>
                                {typeof source.sizeBytes === 'number' && <span>{formatBytes(source.sizeBytes)}</span>}
                                {typeof source.seeders === 'number' && (
                                  <span className="text-purple-400 font-bold">{source.seeders} seeders</span>
                                )}
                              </div>
                            </div>

                            <div className="pt-1 w-full">
                              {source.linkKind === 'direct' || source.linkKind === 'anna' || source.linkKind === 'external' ? (
                                <Button
                                  className="w-full h-10 bg-[#2a2a2a] hover:bg-[#333333] text-white border border-white/5 rounded-lg text-sm font-semibold transition-colors"
                                  onClick={() => {
                                    const openedWindow = window.open(source.magnetLink, '_blank', 'noopener,noreferrer')
                                    if (!openedWindow) window.location.assign(source.magnetLink)
                                  }}
                                >
                                  <Link className="w-4 h-4 mr-2 opacity-70" />
                                  Direct Download
                                </Button>
                              ) : (
                                <Button
                                  className="w-full h-10 bg-[#4c1d95] hover:bg-[#5b21b6] text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-purple-900/20"
                                  disabled={busy}
                                  onClick={async () => {
                                    setSourceBusy((prev) => ({ ...prev, [busyId]: true }))
                                    try {
                                      await enqueueJob({
                                        title: activeModalResult.title,
                                        sourceLink: source.magnetLink,
                                        kind: searchType === 'books' ? 'books' : 'manga'
                                      })
                                      success('Added to Cloud', 'Job is now queued.')
                                    } catch (e) {
                                      error('Queue failed', getErrorMessage(e, 'Could not add to Torbox'))
                                    } finally {
                                      setSourceBusy((prev) => { const n = { ...prev }; delete n[busyId]; return n; })
                                    }
                                  }}
                                >
                                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                                  Add to Cloud
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
