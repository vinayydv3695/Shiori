import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { motion, AnimatePresence } from 'framer-motion'
import DOMPurify from 'dompurify'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import * as Tabs from '@radix-ui/react-tabs'
import {
  AlertCircle,
  Cloud,
  DownloadCloud,
  Download,
  Link,
  Loader2,
  Search,
  Server,
  HardDrive,
  ShieldCheck,
  X,
  Image as ImageIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useToast } from '@/store/toastStore'
import { TrendingExplore } from './torbox/TrendingExplore'
import { useTorboxStore, TorboxQueueItem } from '@/store/useTorboxStore'
import { parsePageUrl } from '@/lib/utils'
import { isAndroid } from '@/lib/tauri'
import { useOnlineSearchStore } from '@/store/onlineSearchStore'

type SearchType = 'manga' | 'books' | 'all'
type QueueType = 'manga' | 'books'
type TabValue = 'search' | 'books' | 'manga'
type TorboxInitialTab = 'discover' | 'books' | 'manga'
type KeyStatus = 'unknown' | 'set' | 'unset' | 'verifying' | 'error'
type FileType = 'CBZ' | 'CBR' | 'ZIP' | 'EPUB' | 'PDF' | 'MOBI' | 'AZW3' | 'DOCX' | 'TORRENT' | 'MAGNET' | 'OTHER'

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

function queueStatusBadgeClass(job: TorboxQueueItem): string {
  if (job.localPhase === 'downloading' || job.localPhase === 'importing') return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/40'
  const normalized = (job.status || '').toLowerCase()
  if (normalized.includes('downloading') || normalized.includes('verify')) return 'bg-blue-500/15 text-blue-300 border-blue-400/40'
  if (normalized.includes('completed') || normalized.includes('seeding') || normalized.includes('ready')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
  if (normalized.includes('error') || normalized.includes('failed')) return 'bg-red-500/15 text-red-300 border-red-400/40'
  return 'bg-muted text-muted-foreground border-border'
}

function progressFillClass(job: TorboxQueueItem): string {
  if (job.localPhase === 'downloading' || job.localPhase === 'importing') return 'bg-yellow-400'
  const normalized = (job.status || '').toLowerCase()
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
  const rawLink = record.magnet_url || record.torrent_url || record.magnetLink || record.magnet_link || record.magnet || record.torrent || extra.magnet || extra.torrent || record.url || record.link || extra.url || extra.link
  if (!rawLink) return null

  const parsedLink = parsePageUrl(rawLink)
  let linkKind = parsedLink.kind
  if (linkKind === 'direct') {
    const normalized = parsedLink.url.trim().toLowerCase()
    if (normalized.startsWith('magnet:')) linkKind = 'magnet'
    else if (normalized.includes('.torrent') || normalized.includes('/torrent') || normalized.includes('/download/')) linkKind = 'torrent'
  }

  const magnetLink = parsedLink.url
  if (!magnetLink) return null

  const fileName = record.fileName || record.filename || record.name || record.title || extra.fileName || extra.filename || extra.name || extra.title || fallbackTitle
  const sizeBytes = Number(record.sizeBytes || record.size_bytes || record.size || record.fileSize || record.file_size || extra.sizeBytes || extra.size_bytes || extra.size)
  const seeders = Number(record.seeders || record.seeds || extra.seeders || extra.seeds)

  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  let fileType: FileType = 'OTHER'
  if (['cbz', 'cbr'].includes(ext)) fileType = 'CBZ'
  else if (['epub', 'pdf', 'mobi', 'azw3', 'docx', 'zip'].includes(ext)) fileType = ext.toUpperCase() as FileType
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
  const isMobile = useIsMobile()
  const { success, error, info } = useToast()
  const { jobs, enqueueJob, removeJob, importJob, resolveJob, clearCompleted: clearStoreCompleted } = useTorboxStore()

  const [apiKey, setApiKey] = useState<string>('')
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('unknown')
  const preferences = usePreferencesStore(state => state.preferences)
  const preferredContentType = preferences?.preferredContentType ?? 'both'
  const updateGeneralSettings = usePreferencesStore(state => state.updateGeneralSettings)

  const searchQuery = useOnlineSearchStore(state => state.queries.torbox)
  const setSearchQuery = (val: string) => useOnlineSearchStore.getState().setQuery('torbox', val)

  const [searchType, setSearchType] = useState<SearchType>(
    preferredContentType === 'books' ? 'books' : (preferredContentType === 'manga' ? 'manga' : 'all')
  )
  const [searchResults, setSearchResults] = useState<UnifiedMetadata[]>([])
  
  const [activeModalResult, setActiveModalResult] = useState<SearchResult | null>(null)
  const [isFetchingTorrents, setIsFetchingTorrents] = useState<string | null>(null)
  const [sourceBusy, setSourceBusy] = useState<Record<string, boolean>>({})

  const [isSearching, setIsSearching] = useState(false)
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    const val = mapInitialTabToValue(initialTab)
    if (val === 'books' && preferredContentType !== 'manga') return 'books'
    if (val === 'manga' && preferredContentType !== 'books') return 'manga'
    return 'search'
  })

  const [keyFeedback, setKeyFeedback] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [manualTitle, setManualTitle] = useState('')
  const [manualMagnet, setManualMagnet] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [linkSearchFilter, setLinkSearchFilter] = useState('')
  const [refineQuery, setRefineQuery] = useState('')

  const booksJobs = useMemo(() => jobs.filter((job) => job.source === 'anna'), [jobs])
  const mangaJobs = useMemo(() => jobs.filter((job) => job.source === 'manga'), [jobs])

  useEffect(() => {
    const val = mapInitialTabToValue(initialTab)
    if (val === 'books' && preferredContentType !== 'manga') setActiveTab('books')
    else if (val === 'manga' && preferredContentType !== 'books') setActiveTab('manga')
    else setActiveTab('search')
  }, [initialTab, preferredContentType])

  useEffect(() => {
    if (activeTab === 'search' && searchQuery.trim() && searchResults.length === 0 && !isSearching) {
      void runSearch()
    }
  }, [activeTab])

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
          const mangaRes = await invoke<any[]>('search_manga_metadata', { title: query, includeNsfw: preferences?.includeNsfw ?? false })
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

  const fetchTorrentsForMetadata = useCallback(async (meta: UnifiedMetadata, customQuery?: string) => {
    setIsFetchingTorrents(meta.id)
    if (!customQuery) {
      setActiveModalResult({
        ...meta,
        sources: [],
      })
      setLinkSearchFilter('')
      setRefineQuery(meta.title)
    }
    const query = customQuery || meta.title
    try {
      const raw = await invoke<any>('search_manga_sources', { query })
      const rootArray = Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? raw?.data ?? [])
      
      const sources: SearchSource[] = []
      rootArray.forEach((row: any, i: number) => {
        const sourceId = (row.sourceId || row.source_id || '').toLowerCase()
        if (sourceId !== 'nyaa') return

        if (row.sources && Array.isArray(row.sources)) {
          row.sources.forEach((s: any, j: number) => {
            const parsed = parseSearchSource(s, j, meta.title)
            if (parsed) sources.push(parsed)
          })
        }
        const direct = parseSearchSource(row, i, meta.title)
        if (direct) {
          sources.push(direct)
        }
      })

      setActiveModalResult({
        ...meta,
        sources,
      })
    } catch (err) {
      error('Failed to fetch torrents', getErrorMessage(err, 'Search error'))
    } finally {
      setIsFetchingTorrents(null)
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
                
                <div className="relative z-10 flex flex-row items-start gap-3 md:gap-4">
                  {(job as any).coverPath || (job as any).metadata?.coverUrl ? (
                    <img src={(job as any).coverPath ? convertFileSrc((job as any).coverPath) : (job as any).metadata!.coverUrl} alt="Cover" className="h-24 w-16 md:h-28 md:w-20 rounded-md object-cover shadow-sm bg-muted shrink-0" />
                  ) : (
                    <div className="flex h-24 w-16 md:h-28 md:w-20 items-center justify-center rounded-md bg-muted/50 text-muted-foreground/50 shrink-0">
                      <ImageIcon className="h-6 w-6 md:h-8 md:w-8" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0 flex flex-col text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 pr-4">
                        <h3 className="font-semibold text-sm md:text-base text-foreground truncate" title={job.title || 'Unknown Title'}>{job.title || 'Unknown Title'}</h3>
                        <p className="mt-0.5 md:mt-1 truncate text-xs text-muted-foreground" title={job.sourceLink}>{job.sourceLink}</p>
                      </div>
                      <button onClick={() => void removeJob(job.id)} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Cancel/Remove">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex items-end justify-between">
                      <Badge className={`border text-[10px] uppercase tracking-wider font-semibold ${queueStatusBadgeClass(job)}`} variant="outline">
                        {job.status || 'queued'}
                      </Badge>
                      <div className="text-right">
                        <p className="text-xs font-medium text-foreground/80">{Math.round(progress)}%</p>
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                      <motion.div className={`h-full rounded-full ${progressFillClass(job)}`} initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                      <span className="truncate pr-2">{statusPhaseText(job.status)}</span>
                      <div className="flex shrink-0 items-center gap-2 text-right">
                        {eta && <span className="text-blue-400/80">{eta}</span>}
                        {(job.downloadSpeed || 0) > 0 && <span>{formatSpeed(job.downloadSpeed!)}</span>}
                      </div>
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
    <div className={`flex h-full flex-col bg-background p-6 text-foreground relative overflow-hidden ${isAndroid ? 'pt-[calc(env(safe-area-inset-top,0px)+2px)]' : ''} ${isMobile ? 'pb-4 px-4' : ''}`}>
      <header className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 pb-2 md:pb-6">
        <div className="flex items-center gap-4">
          <div className="hidden md:flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Cloud className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Torbox Control Center
              <Badge variant="outline" className={`h-5 px-2 rounded-md font-bold tracking-wider uppercase text-[10px] ${apiKey ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10' : 'border-amber-500/30 text-amber-500 bg-amber-500/10'}`}>
                {apiKey ? 'API Active' : 'No Key'}
              </Badge>
            </h1>
            <p className="hidden md:block text-sm font-medium text-muted-foreground mt-0.5">Manage your cloud downloads and resolve premium sources.</p>
          </div>
        </div>

        <div className="hidden md:flex flex-wrap items-center gap-4">
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
        <Tabs.List className="flex items-center gap-4 md:gap-6 border-b border-border/50 pb-0 md:pb-2 mb-2 md:mb-4">
          {(['search', 'books', 'manga'] as const).map((tab) => {
            if (tab === 'books' && preferredContentType === 'manga') return null;
            if (tab === 'manga' && preferredContentType === 'books') return null;
            const isActive = activeTab === tab;
            const label = tab === 'search' ? 'Discover' : tab === 'books' ? 'Books Queue' : 'Manga Queue';
            const count = tab === 'books' ? booksJobs.length : tab === 'manga' ? mangaJobs.length : null;

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
                <div className="max-w-2xl mx-auto mb-4 md:mb-8 pt-2 md:pt-4">
                  <div className="relative flex items-center shadow-sm bg-card border border-border rounded-full hover:border-border/80 ring-1 ring-transparent focus-within:border-primary focus-within:ring-primary transition-shadow duration-200">
                    <Search className="hidden md:block absolute left-5 h-5 w-5 text-muted-foreground" />
                    <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runSearch() }} placeholder="Search AniList or OpenLibrary..." className="flex-1 h-12 md:h-14 border-0 bg-transparent pl-4 md:pl-14 pr-1 md:pr-2 text-sm md:text-base font-medium shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                    <div className="pr-1 md:pr-2 flex items-center gap-1 md:gap-2">
                      <select value={searchType} onChange={(event) => setSearchType(event.target.value as SearchType)} className="h-8 md:h-10 rounded-full bg-transparent hover:bg-foreground focus:bg-foreground border-0 px-2 md:px-4 text-xs md:text-sm font-medium text-muted-foreground hover:text-background focus:text-background cursor-pointer focus:outline-none transition-colors [&>option]:bg-background [&>option]:text-foreground max-w-[85px] md:max-w-none truncate">
                        {(preferredContentType === 'manga' || preferredContentType === 'both') && <option value="manga">Manga</option>}
                        {(preferredContentType === 'books' || preferredContentType === 'both') && <option value="books">Books</option>}
                        {preferredContentType === 'both' && <option value="all">Everywhere</option>}
                      </select>
                      <Button size="icon" className="h-9 w-9 md:h-10 md:w-10 rounded-full shrink-0" onClick={() => void runSearch()} disabled={isSearching}>
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  {searchType !== 'books' && (
                    <div className="flex items-center justify-end mt-1 md:mt-3 pr-2 md:pr-4 gap-2 text-xs md:text-sm text-muted-foreground">
                      <input 
                        type="checkbox" 
                        id="nsfw-toggle"
                        checked={preferences?.includeNsfw ?? false}
                        onChange={(e) => updateGeneralSettings({ includeNsfw: e.target.checked })}
                        className="rounded border-border text-primary focus:ring-primary/20 bg-background/50 cursor-pointer"
                      />
                      <label htmlFor="nsfw-toggle" className="cursor-pointer select-none hover:text-foreground transition-colors">Include NSFW Content</label>
                    </div>
                  )}
                </div>

                {searchError && <p className="mb-6 text-sm font-medium text-destructive bg-destructive/10 border border-destructive/20 p-4 rounded-xl inline-flex items-center gap-2"><AlertCircle className="h-4 w-4"/> {searchError}</p>}

                <div className="grid grid-cols-[repeat(auto-fill,minmax(105px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 md:gap-4 items-start pb-8">
                  <AnimatePresence>
                    {searchResults.map((result) => {
                      const isLoading = isFetchingTorrents === result.id;

                      return (
                        <motion.div 
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          key={result.id} 
                          className="group flex flex-col overflow-hidden rounded-xl bg-card border shadow-sm transition-all border-border/50 hover:border-primary/50 hover:shadow-md cursor-pointer h-full"
                          onClick={() => {
                            fetchTorrentsForMetadata(result);
                          }}
                        >
                          <div className="flex flex-col h-full">
                            <div className="relative overflow-hidden bg-muted flex-shrink-0 w-full aspect-[2/3]">
                              {result.coverUrl ? (
                                <img src={result.coverUrl} alt={result.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground/40">
                                  <Search className="h-8 w-8 opacity-50" />
                                </div>
                              )}
                              {typeof result.rating === 'number' && (
                                <div className="absolute top-2 right-2 bg-background/90 text-amber-500 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm backdrop-blur-md">★ {(result.rating / 10).toFixed(1)}</div>
                              )}
                              {isLoading && (
                                <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-10">
                                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col min-w-0 p-3 flex-1">
                              <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary leading-snug text-sm line-clamp-2">{result.title}</h3>
                              <p className="mt-1 text-muted-foreground truncate text-xs">
                                {result.year && <span>{result.year}</span>}
                                {result.year && result.author && <span className="mx-1.5 opacity-50">•</span>}
                                {result.author && <span>{result.author}</span>}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-auto pt-3">
                                {result.tags.slice(0, 2).map((tag, i) => (
                                  <Badge key={i} variant="secondary" className="px-1.5 py-0 text-[9px] bg-primary/10 text-primary border-0">{tag}</Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
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
                  
                <div className="mt-auto pt-6 border-t border-border/50 pb-2">
                  <div className="max-w-3xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 lg:gap-4">
                    <div className="flex items-center gap-3 w-full lg:w-auto">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Link className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold tracking-tight text-foreground/80 truncate">Manual Magnet Add</h4>
                        <p className="text-[11px] text-muted-foreground truncate">Inject a magnet link if search is unavailable</p>
                      </div>
                    </div>

                    <div className="flex w-full lg:w-auto items-center gap-2 lg:gap-3">
                      <Input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="Title" className="h-9 flex-[0.7] lg:w-32 text-xs font-medium bg-background border-border/40 focus:border-primary/40 rounded-full min-w-0" />
                      <Input value={manualMagnet} onChange={(event) => setManualMagnet(event.target.value)} placeholder="magnet:?xt..." className="h-9 flex-1 lg:w-48 text-xs font-medium bg-background border-border/40 focus:border-primary/40 font-mono rounded-full min-w-0" />
                      <Button size="sm" variant="secondary" className="h-9 rounded-full px-3 lg:px-4 font-semibold shadow-sm shrink-0" onClick={() => void addManualLink()}>Inject</Button>
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

      <AnimatePresence>
        {activeModalResult && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModalResult(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header with Manga Info */}
              <div className="flex flex-col sm:flex-row gap-4 p-5 sm:p-6 bg-muted/20 border-b border-border relative shrink-0">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="absolute top-2 right-2 sm:top-4 sm:right-4 rounded-full hover:bg-accent hover:text-foreground transition-colors z-20" 
                  onClick={() => setActiveModalResult(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
                
                <div className="w-24 sm:w-32 aspect-[2/3] shrink-0 rounded-md overflow-hidden bg-muted border border-border/50 shadow-sm relative">
                  {activeModalResult.coverUrl ? (
                    <img src={activeModalResult.coverUrl} alt={activeModalResult.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground"><ImageIcon className="w-8 h-8 opacity-20" /></div>
                  )}
                </div>
                
                <div className="flex flex-col flex-1 min-w-0 pr-6">
                  <h2 className="text-xl sm:text-2xl font-bold leading-tight text-foreground">{activeModalResult.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
                    {activeModalResult.year && <span>{activeModalResult.year}</span>}
                    {activeModalResult.year && activeModalResult.author && <span className="opacity-50">•</span>}
                    {activeModalResult.author && <span>{activeModalResult.author}</span>}
                  </p>
                  
                  {activeModalResult.description && (
                    <p className="mt-3 text-sm text-muted-foreground/90 line-clamp-3 overflow-hidden text-ellipsis leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeModalResult.description) }} />
                  )}
                </div>
              </div>

              {/* Torrents Section */}
              <div className="flex flex-col flex-1 overflow-hidden bg-background">
                <div className="p-4 sm:p-5 border-b border-border/50 shrink-0">
                  <h3 className="font-semibold text-sm mb-3">Available Torrents {isFetchingTorrents === activeModalResult.id ? '' : `(${activeModalResult.sources.length})`}</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <input 
                        type="text" 
                        placeholder="Refine search query..." 
                        value={refineQuery}
                        onChange={e => setRefineQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') fetchTorrentsForMetadata(activeModalResult, refineQuery) }}
                        className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
                      />
                    </div>
                    <Button 
                      size="sm" 
                      className="h-9 px-4 font-semibold shrink-0"
                      onClick={() => fetchTorrentsForMetadata(activeModalResult, refineQuery)}
                      disabled={isFetchingTorrents === activeModalResult.id}
                    >
                      Search
                    </Button>
                  </div>
                  
                  {isFetchingTorrents !== activeModalResult.id && activeModalResult.sources.length > 0 && (
                    <div className="mt-3 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input 
                        type="text" 
                        placeholder="Filter links..." 
                        value={linkSearchFilter}
                        onChange={e => setLinkSearchFilter(e.target.value)}
                        className="w-full bg-background border border-border rounded-md pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
                      />
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                  {isFetchingTorrents === activeModalResult.id ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <p className="text-sm font-medium">Searching for torrents...</p>
                    </div>
                  ) : activeModalResult.sources.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                      <AlertCircle className="w-10 h-10 text-muted-foreground opacity-50 mb-3" />
                      <p className="text-muted-foreground font-medium mb-1">No torrents found</p>
                      <p className="text-sm text-muted-foreground/70">Try refining your search query above.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {activeModalResult.sources
                        .filter(s => s.label.toLowerCase().includes(linkSearchFilter.toLowerCase()))
                        .map((source) => {
                          const busyId = `${activeModalResult.id}:${source.id}`
                          const busy = sourceBusy[busyId] === true

                          const getBadgeColor = (type: string) => {
                            const t = type.toUpperCase()
                            if (t === 'CBZ' || t === 'CBR') return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
                            if (t === 'EPUB') return 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                            if (t === 'PDF') return 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                            if (t === 'ZIP' || t === 'RAR') return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                            return 'bg-secondary text-secondary-foreground'
                          }

                          return (
                            <div key={source.id} className="group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-all">
                              <div className="flex-1 min-w-0 pr-4">
                                <h4 className="font-medium text-sm leading-tight break-words text-foreground group-hover:text-primary transition-colors">
                                  {source.label}
                                </h4>
                                <div className="flex items-center flex-wrap gap-3 mt-2 text-xs font-medium">
                                  <span className={`flex items-center gap-1.5 border px-2 py-0.5 rounded shadow-sm ${getBadgeColor(source.fileType || '')}`}>
                                    {source.fileType || 'UNKNOWN'}
                                  </span>
                                  <span className="flex items-center gap-1.5 text-muted-foreground bg-background border border-border px-2 py-0.5 rounded shadow-sm">
                                    <ShieldCheck className="w-3.5 h-3.5 text-primary" /> {source.linkKind === 'nyaa' ? 'Nyaa.si' : source.linkKind === 'anna' ? 'Anna\'s Archive' : 'Unknown'}
                                  </span>
                                  {typeof source.sizeBytes === 'number' && (
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                      <HardDrive className="w-3.5 h-3.5" /> {formatBytes(source.sizeBytes)}
                                    </span>
                                  )}
                                  {typeof source.seeders === 'number' && (
                                    <span className="flex items-center gap-1.5 text-emerald-500">
                                      <Server className="w-3.5 h-3.5" /> {source.seeders} seeders
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center">
                                {source.linkKind === 'direct' || source.linkKind === 'anna' || source.linkKind === 'external' ? (
                                  <Button
                                    variant="secondary"
                                    className="bg-white text-black hover:bg-white/90 h-9 px-4 rounded-md text-sm font-medium shadow-sm"
                                    onClick={() => {
                                      try {
                                        const url = new URL(source.magnetLink);
                                        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'magnet:') {
                                          const openedWindow = window.open(source.magnetLink, '_blank', 'noopener,noreferrer')
                                          if (!openedWindow) window.location.assign(source.magnetLink)
                                        } else {
                                          console.error('Blocked unsafe link protocol:', url.protocol);
                                        }
                                      } catch (e) {
                                        console.error('Invalid link format', e);
                                      }
                                    }}
                                  >
                                    <Link className="w-4 h-4 mr-2 opacity-70" />
                                    Direct Download
                                  </Button>
                                ) : (
                                  <Button
                                    className="bg-white text-black hover:bg-white/90 h-9 px-4 rounded-md text-sm font-medium shadow-sm"
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
                                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    Add
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
