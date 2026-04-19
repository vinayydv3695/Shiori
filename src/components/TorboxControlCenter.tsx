import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import * as Tabs from '@radix-ui/react-tabs'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/store/toastStore'
import { parsePageUrl } from '@/lib/utils'

interface TorrentInfo {
  id: number
  name: string
  size: number
  progress: number
  downloadSpeed: number
  status: string
  files?: Array<{ id: number; name: string; size: number }>
}

type LocalProgress = {
  localDownloadedBytes?: number
  localTotalBytes?: number
  localProgress?: number
  localPhase?: 'downloading' | 'importing' | 'completed'
  localFileIndex?: number
  localFileTotal?: number
  localFileName?: string
}

type SearchType = 'manga' | 'books' | 'all'
type QueueType = 'manga' | 'books'
type TabValue = 'search' | 'books' | 'manga'
type TorboxInitialTab = 'discover' | 'books' | 'manga'

type KeyStatus = 'unknown' | 'set' | 'unset' | 'verifying' | 'error'

type FileType = 'CBZ' | 'CBR' | 'EPUB' | 'PDF' | 'MOBI' | 'AZW3' | 'DOCX' | 'TORRENT' | 'MAGNET' | 'OTHER'

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
  author?: string
  year?: string
  rating?: number
  ongoing?: boolean
  tags: string[]
  coverUrl?: string
  kind?: QueueType
  sources: SearchSource[]
}

interface JobMeta {
  title?: string
  magnetLink?: string
  kind?: QueueType
  importedPath?: string
  resolvedLink?: string
  resolving?: boolean
  importing?: boolean
  autoImportTriggered?: boolean
  error?: string
}

const BOOK_EXTS = new Set(['epub', 'pdf', 'mobi', 'azw3', 'docx'])
const MANGA_EXTS = new Set(['cbz', 'cbr'])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function normalizeProgress(progress: number): number {
  const scaled = progress <= 1 ? progress * 100 : progress
  return Math.max(0, Math.min(100, scaled))
}

function statusLower(status: string): string {
  return status.trim().toLowerCase()
}

function isFailedStatus(status: string): boolean {
  const normalized = statusLower(status)
  return normalized.includes('error') || normalized.includes('failed')
}

function isCompletedStatus(status: string): boolean {
  const normalized = statusLower(status)
  return (
    normalized.includes('completed') ||
    normalized.includes('complete') ||
    normalized.includes('seeding') ||
    normalized.includes('finished') ||
    normalized.includes('ready')
  )
}

function isActiveStatus(status: string): boolean {
  return !isFailedStatus(status) && !isCompletedStatus(status)
}

function statusPhaseText(status: string): string {
  const normalized = statusLower(status)
  if (normalized.includes('error') || normalized.includes('failed')) return 'Transfer failed'
  if (normalized.includes('completed') || normalized.includes('seeding') || normalized.includes('ready')) return 'Downloaded and imported to library'
  if (normalized.includes('import')) return 'Cloud complete - downloading to this device and importing'
  if (normalized.includes('download')) return 'Downloading from Torbox'
  if (normalized.includes('verify')) return 'Preparing transfer'
  return 'Queued in Torbox'
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
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

  const normalized = statusLower(status)
  if (!normalized.includes('download')) return null

  const clampedProgress = Math.max(0, Math.min(100, progressPercent))
  if (clampedProgress >= 100) return null

  const downloadedBytes = size * (clampedProgress / 100)
  const remainingBytes = Math.max(0, size - downloadedBytes)
  if (remainingBytes <= 0) return null

  return formatEta(remainingBytes / speed)
}

function formatLocalProgress(meta?: LocalProgress): string | null {
  if (!meta) return null
  if (meta.localPhase !== 'downloading' && meta.localPhase !== 'importing') return null

  const localProgress = typeof meta.localProgress === 'number' ? Math.max(0, Math.min(100, meta.localProgress)) : null
  const downloaded = typeof meta.localDownloadedBytes === 'number' ? meta.localDownloadedBytes : null
  const total = typeof meta.localTotalBytes === 'number' ? meta.localTotalBytes : null

  if (localProgress === null && downloaded === null) return null

  let text = 'Local download: '
  text += localProgress !== null ? `${localProgress.toFixed(1)}%` : 'in progress'

  if (downloaded !== null) {
    text += ` (${formatBytes(downloaded)}`
    if (total !== null) {
      text += ` / ${formatBytes(total)}`
    }
    text += ')'
  }

  return text
}

function formatLocalFileStep(meta?: LocalProgress): string | null {
  if (!meta) return null
  if (meta.localPhase !== 'downloading' && meta.localPhase !== 'importing') return null
  if (typeof meta.localFileIndex !== 'number' || typeof meta.localFileTotal !== 'number') return null
  if (meta.localFileTotal <= 1) return null

  const name = typeof meta.localFileName === 'string' && meta.localFileName.trim() ? meta.localFileName : null
  return `Volume ${meta.localFileIndex} of ${meta.localFileTotal}${name ? ` - ${name}` : ''}`
}

function isTorboxLikeLink(link: string): boolean {
  const normalized = link.trim().toLowerCase()
  return normalized.startsWith('magnet:') || normalized.startsWith('http://') || normalized.startsWith('https://')
}

function getFileExt(fileName: string): string {
  const parts = fileName.trim().toLowerCase().split('.')
  if (parts.length < 2) return ''
  return parts[parts.length - 1]
}

function fileTypeFromName(fileName: string, link?: string): FileType {
  const ext = getFileExt(fileName)
  if (ext === 'cbz') return 'CBZ'
  if (ext === 'cbr') return 'CBR'
  if (ext === 'epub') return 'EPUB'
  if (ext === 'pdf') return 'PDF'
  if (ext === 'mobi') return 'MOBI'
  if (ext === 'azw3') return 'AZW3'
  if (ext === 'docx') return 'DOCX'
  if (ext === 'torrent') return 'TORRENT'
  const normalized = (link ?? '').toLowerCase()
  if (normalized.startsWith('magnet:')) return 'MAGNET'
  return 'OTHER'
}

function inferSourceKind(fileType: FileType): QueueType | undefined {
  if (fileType === 'CBZ' || fileType === 'CBR') return 'manga'
  if (fileType === 'EPUB' || fileType === 'PDF' || fileType === 'MOBI' || fileType === 'AZW3' || fileType === 'DOCX') {
    return 'books'
  }
  return undefined
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 6)
}

function parseSearchSource(input: unknown, index: number, fallbackTitle: string): SearchSource | null {
  const record = asRecord(input)
  if (!record) return null

  const rawLink = pickString(record, [
    'magnet_url',
    'torrent_url',
    'magnetLink',
    'magnet_link',
    'magnet',
    'url',
    'link',
    'torrent',
    'torrent_link',
    'torrentLink',
  ])
  if (!rawLink) return null

  const parsedLink = parsePageUrl(rawLink)
  let linkKind = parsedLink.kind
  if (linkKind === 'direct') {
    const normalized = parsedLink.url.trim().toLowerCase()
    if (normalized.startsWith('magnet:')) linkKind = 'magnet'
    else if (normalized.includes('.torrent') || normalized.includes('/torrent')) linkKind = 'torrent'
  }

  const magnetLink = parsedLink.url
  if (!magnetLink || !isTorboxLikeLink(magnetLink)) return null

  const fileName = pickString(record, ['fileName', 'filename', 'name', 'title']) ?? fallbackTitle
  const fileTypeText = pickString(record, ['fileType', 'type', 'format'])
  const fileType = fileTypeText ? fileTypeFromName(`${fileName}.${fileTypeText}`, magnetLink) : fileTypeFromName(fileName, magnetLink)
  const sizeBytes = pickNumber(record, ['sizeBytes', 'size_bytes', 'size', 'fileSize', 'file_size'])
  const seeders = pickNumber(record, ['seeders', 'seeds'])

  return {
    id: pickString(record, ['id']) ?? `source-${index}-${fileName}`,
    label: fileName,
    magnetLink,
    linkKind,
    fileType,
    fileName,
    sizeBytes,
    seeders,
  }
}

function parseSearchResults(payload: unknown): SearchResult[] {
  const rootArray = Array.isArray(payload)
    ? payload
    : (() => {
        const record = asRecord(payload)
        if (!record) return []
        const items = record.items ?? record.results ?? record.data
        return Array.isArray(items) ? items : []
      })()

  const parsed: SearchResult[] = []

  rootArray.forEach((row, rowIndex) => {
    const record = asRecord(row)
    if (!record) return

    const title = pickString(record, ['title', 'name']) ?? `Untitled Result ${rowIndex + 1}`
    const nestedSources = Array.isArray(record.sources) ? record.sources : []

    const sources = nestedSources
      .map((source, sourceIndex) => parseSearchSource(source, sourceIndex, title))
      .filter((source): source is SearchSource => source !== null)

    const directSource = parseSearchSource(record, 0, title)
    if (directSource) {
      const exists = sources.some((source) => source.magnetLink === directSource.magnetLink)
      if (!exists) sources.unshift(directSource)
    }

    if (sources.length === 0) return

    const kindText = pickString(record, ['kind', 'contentType', 'category', 'type'])?.toLowerCase()
    const kind: QueueType | undefined = kindText?.includes('book')
      ? 'books'
      : kindText?.includes('manga')
      ? 'manga'
      : undefined

    const parsedResult: SearchResult = {
      id: pickString(record, ['id']) ?? `result-${rowIndex}`,
      title,
      author: pickString(record, ['author', 'artist', 'creator']),
      year: pickString(record, ['year', 'releaseYear', 'published']),
      rating: pickNumber(record, ['rating', 'score']),
      ongoing: pickString(record, ['status'])?.toLowerCase().includes('ongoing'),
      tags: parseTags(record.tags ?? record.genres),
      coverUrl: pickString(record, ['coverUrl', 'cover_url', 'cover', 'thumbnail', 'image']),
      kind,
      sources,
    }

    parsed.push(parsedResult)
  })

  return parsed
}

function filterBySearchType(results: SearchResult[], searchType: SearchType): SearchResult[] {
  if (searchType === 'all') return results

  return results.filter((result) => {
    if (result.kind) return result.kind === searchType

    const kinds = new Set(result.sources.map((source) => inferSourceKind(source.fileType)).filter(Boolean))
    if (kinds.size === 0) return true
    return kinds.has(searchType)
  })
}

function inferTorrentKind(job: TorrentInfo, meta?: JobMeta): QueueType | undefined {
  if (meta?.kind) return meta.kind

  const names = [job.name, ...(job.files?.map((file) => file.name) ?? [])]
  let hasBook = false
  let hasManga = false

  for (const name of names) {
    const ext = getFileExt(name)
    if (BOOK_EXTS.has(ext)) hasBook = true
    if (MANGA_EXTS.has(ext)) hasManga = true
  }

  if (hasManga && !hasBook) return 'manga'
  if (hasBook && !hasManga) return 'books'
  return undefined
}

function sourceBadgeClass(fileType: FileType): string {
  if (fileType === 'CBZ' || fileType === 'CBR') return 'bg-violet-500/15 text-violet-300 border-violet-400/40'
  if (fileType === 'EPUB') return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
  if (fileType === 'PDF') return 'bg-sky-500/15 text-sky-300 border-sky-400/40'
  return 'bg-muted text-muted-foreground border-border'
}

function queueStatusBadgeClass(status: string): string {
  const normalized = statusLower(status)
  if (normalized.includes('downloading') || normalized.includes('verify')) {
    return 'bg-blue-500/15 text-blue-300 border-blue-400/40'
  }
  if (normalized.includes('completed') || normalized.includes('seeding') || normalized.includes('ready')) {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
  }
  if (normalized.includes('error') || normalized.includes('failed')) {
    return 'bg-red-500/15 text-red-300 border-red-400/40'
  }
  return 'bg-muted text-muted-foreground border-border'
}

function progressFillClass(status: string): string {
  const normalized = statusLower(status)
  if (normalized.includes('completed') || normalized.includes('seeding') || normalized.includes('ready')) {
    return 'bg-emerald-400'
  }
  if (normalized.includes('error') || normalized.includes('failed')) {
    return 'bg-red-400'
  }
  if (normalized.includes('downloading') || normalized.includes('verify')) {
    return 'bg-blue-400'
  }
  return 'bg-muted-foreground'
}

function mapInitialTabToValue(initialTab: TorboxInitialTab): TabValue {
  if (initialTab === 'books') return 'books'
  if (initialTab === 'manga') return 'manga'
  return 'search'
}

interface TorboxControlCenterProps {
  initialTab?: TorboxInitialTab
}

export default function TorboxControlCenter({ initialTab = 'discover' }: TorboxControlCenterProps) {
  const { success, error, info } = useToast()

  const [apiKey, setApiKey] = useState<string>('')
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('unknown')
  const [jobs, setJobs] = useState<TorrentInfo[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<SearchType>('manga')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [activeTab, setActiveTab] = useState<TabValue>(() => mapInitialTabToValue(initialTab))

  const [keyFeedback, setKeyFeedback] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchUnavailable, setSearchUnavailable] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualMagnet, setManualMagnet] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [sourceBusy, setSourceBusy] = useState<Record<string, boolean>>({})
  const [jobMeta, setJobMeta] = useState<Record<number, JobMeta>>({})

  const jobsRef = useRef<TorrentInfo[]>(jobs)

  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  useEffect(() => {
    setActiveTab(mapInitialTabToValue(initialTab))
  }, [initialTab])

  const stats = useMemo(() => {
    const total = jobs.length
    const active = jobs.filter((job) => isActiveStatus(job.status)).length
    const completed = jobs.filter((job) => isCompletedStatus(job.status)).length
    const failed = jobs.filter((job) => isFailedStatus(job.status)).length
    return { total, active, completed, failed }
  }, [jobs])

  const booksJobs = useMemo(
    () => jobs.filter((job) => inferTorrentKind(job, jobMeta[job.id]) === 'books'),
    [jobs, jobMeta]
  )

  const mangaJobs = useMemo(
    () => jobs.filter((job) => inferTorrentKind(job, jobMeta[job.id]) === 'manga'),
    [jobs, jobMeta]
  )

  const clearCompleted = useCallback(() => {
    const completedIds = new Set(jobs.filter((job) => isCompletedStatus(job.status)).map((job) => job.id))
    if (completedIds.size === 0) {
      info('No completed jobs', 'There are no completed items to clear.')
      return
    }

    setJobs((prev) => prev.filter((job) => !completedIds.has(job.id)))
    setJobMeta((prev) => {
      const next: Record<number, JobMeta> = {}
      Object.entries(prev).forEach(([id, meta]) => {
        const numericId = Number(id)
        if (!completedIds.has(numericId)) {
          next[numericId] = meta
        }
      })
      return next
    })
  }, [info, jobs])

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

    return () => {
      mounted = false
    }
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

  const runSearch = useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      setSearchError(null)
      return
    }

    setIsSearching(true)
    setSearchError(null)

    try {
      const raw = await invoke<unknown>('search_manga_sources', { query })
      const parsed = filterBySearchType(parseSearchResults(raw), searchType)
      setSearchResults(parsed)
      setSearchUnavailable(false)

      if (parsed.length === 0) {
        setSearchError('No source links found for this query. You can paste a magnet link manually below.')
      }
    } catch (invokeError) {
      setSearchResults([])
      setSearchUnavailable(true)
      setSearchError(
        getErrorMessage(
          invokeError,
          'Search command is unavailable. Paste a magnet or torrent link manually to queue it.'
        )
      )
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, searchType])

  const addQueuedJob = useCallback(
    async (payload: { source: SearchSource; result: SearchResult; fallbackKind: QueueType }) => {
      const { source, result, fallbackKind } = payload
      const busyId = `${result.id}:${source.id}`

      if (source.linkKind === 'anna' || source.linkKind === 'external') {
        try {
          const openedWindow = window.open(source.magnetLink, '_blank', 'noopener,noreferrer')
          if (!openedWindow) {
            window.location.assign(source.magnetLink)
          }
        } catch {
          window.location.assign(source.magnetLink)
        }
        info('Opened in browser', 'This source should be opened in your browser, not queued to Torbox.')
        return
      }

      setSourceBusy((prev) => ({ ...prev, [busyId]: true }))
      try {
        const queued = await invoke<{ torrentId: number }>('add_to_torbox_queue', {
          magnetLink: source.magnetLink,
        })

        const fallbackJob: TorrentInfo = {
          id: queued.torrentId,
          name: source.fileName || result.title,
          size: source.sizeBytes ?? 0,
          progress: 0,
          downloadSpeed: 0,
          status: 'queued',
          files: source.fileName
            ? [
                {
                  id: 0,
                  name: source.fileName,
                  size: source.sizeBytes ?? 0,
                },
              ]
            : undefined,
        }

        let nextJob = fallbackJob
        try {
          const instant = await invoke<TorrentInfo>('get_torbox_instant', { torrentId: queued.torrentId })
          nextJob = instant
        } catch {
          // Keep fallback job if instant lookup fails.
        }

        const inferredKind = inferSourceKind(source.fileType) ?? result.kind ?? fallbackKind

        setJobs((prev) => [nextJob, ...prev.filter((job) => job.id !== nextJob.id)])
        setJobMeta((prev) => ({
          ...prev,
          [nextJob.id]: {
            ...prev[nextJob.id],
            title: result.title,
            magnetLink: source.magnetLink,
            kind: inferredKind,
            error: undefined,
          },
        }))

        success('Added to cloud', `${result.title} was added to Torbox queue.`)
      } catch (invokeError) {
        const message = getErrorMessage(invokeError, 'Failed to add source to Torbox queue.')
        setSearchError(message)
        error('Queue failed', message)
      } finally {
        setSourceBusy((prev) => {
          const next = { ...prev }
          delete next[busyId]
          return next
        })
      }
    },
    [error, info, success]
  )

  const addManualLink = useCallback(async () => {
    const link = manualMagnet.trim()
    if (!isTorboxLikeLink(link)) {
      setSearchError('Please paste a valid magnet or HTTP/HTTPS link.')
      return
    }

    const manualType: FileType = link.startsWith('magnet:') ? 'MAGNET' : 'TORRENT'

    await addQueuedJob({
      source: {
        id: 'manual',
        label: manualTitle.trim() || 'Manual source',
        fileName: manualTitle.trim() || 'Manual source',
        magnetLink: link,
        fileType: manualType,
      },
      result: {
        id: 'manual-result',
        title: manualTitle.trim() || 'Manual source',
        tags: [],
        sources: [],
        kind: searchType === 'all' ? undefined : searchType,
      },
      fallbackKind: searchType === 'books' ? 'books' : 'manga',
    })

    setManualMagnet('')
    if (!manualTitle.trim()) {
      setManualTitle('')
    }
  }, [addQueuedJob, manualMagnet, manualTitle, searchType])

  const pollActiveJobs = useCallback(async (currentJobs: TorrentInfo[]) => {
    const active = currentJobs.filter((job) => isActiveStatus(job.status))
    if (active.length === 0) return

    const updates = await Promise.all(
      active.map(async (job) => {
        try {
          const latest = await invoke<TorrentInfo>('get_torbox_instant', { torrentId: job.id })
          return latest
        } catch {
          return null
        }
      })
    )

    const byId = new Map<number, TorrentInfo>()
    updates.forEach((update) => {
      if (update) byId.set(update.id, update)
    })

    if (byId.size === 0) return

    setJobs((prev) => prev.map((job) => byId.get(job.id) ?? job))
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void pollActiveJobs(jobsRef.current)
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [pollActiveJobs])

  const removeJob = useCallback((id: number) => {
    setJobs((prev) => prev.filter((job) => job.id !== id))
    setJobMeta((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const resolveDownload = useCallback(
    async (job: TorrentInfo) => {
      setJobMeta((prev) => ({
        ...prev,
        [job.id]: {
          ...prev[job.id],
          resolving: true,
          error: undefined,
        },
      }))

      try {
        const fileId = job.files?.[0]?.id
        const link = await invoke<string>('resolve_torbox_download', {
          torrentId: job.id,
          fileId,
        })
        setJobMeta((prev) => ({
          ...prev,
          [job.id]: {
            ...prev[job.id],
            resolvedLink: link,
            resolving: false,
            error: undefined,
          },
        }))
        success('Download resolved', 'Temporary Torbox link generated.')
      } catch (invokeError) {
        const message = getErrorMessage(invokeError, 'Failed to resolve Torbox download link.')
        setJobMeta((prev) => ({
          ...prev,
          [job.id]: {
            ...prev[job.id],
            resolving: false,
            error: message,
          },
        }))
        error('Resolve failed', message)
      }
    },
    [error, success]
  )

  const importIntoLibrary = useCallback(
    async (job: TorrentInfo) => {
      setJobMeta((prev) => ({
        ...prev,
        [job.id]: {
          ...prev[job.id],
          importing: true,
          error: undefined,
        },
      }))

      try {
        const importedPath = await invoke<string>('import_existing_torbox_target', {
          torrentId: job.id,
          fileId: job.files?.[0]?.id,
          filenameHint: job.name || jobMeta[job.id]?.title,
        })
        setJobMeta((prev) => ({
          ...prev,
          [job.id]: {
            ...prev[job.id],
            importing: false,
            importedPath,
            error: undefined,
          },
        }))
        success('Import completed', importedPath)
      } catch (invokeError) {
        const message = getErrorMessage(invokeError, 'Failed to import completed Torbox target into library.')
        setJobMeta((prev) => ({
          ...prev,
          [job.id]: {
            ...prev[job.id],
            importing: false,
            error: message,
          },
        }))
        error('Import failed', message)
      }
    },
    [error, jobMeta, success]
  )

  useEffect(() => {
    for (const job of jobs) {
      if (!isCompletedStatus(job.status)) continue
      const meta = jobMeta[job.id]
      if (meta?.importedPath || meta?.importing || meta?.autoImportTriggered) continue

      setJobMeta((prev) => ({
        ...prev,
        [job.id]: {
          ...prev[job.id],
          autoImportTriggered: true,
        },
      }))

      void importIntoLibrary(job)
    }
  }, [importIntoLibrary, jobMeta, jobs])

  const renderQueueRows = useCallback(
    (rows: TorrentInfo[], emptyLabel: string) => {
      if (rows.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 py-10 text-muted-foreground">
            <AlertCircle className="mb-2 h-4 w-4" />
            <p className="text-sm">{emptyLabel}</p>
          </div>
        )
      }

      return (
        <div className="overflow-hidden rounded-lg border border-border/80">
          <div className="grid grid-cols-[2.6fr_0.9fr_1.5fr_0.9fr_0.9fr_48px] items-center gap-3 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <span>Title</span>
            <span>Size</span>
            <span>Progress</span>
            <span>Status</span>
            <span>Speed</span>
            <span className="text-right">&nbsp;</span>
          </div>

          {rows.map((job) => {
            const meta = jobMeta[job.id]
            const progress = normalizeProgress(job.progress)
            const importedPath = meta?.importedPath
            const resolvedLink = meta?.resolvedLink
            const eta = estimateEta(job.status, job.size, progress, job.downloadSpeed)
            const localProgressText = formatLocalProgress(meta as LocalProgress | undefined)
            const localFileStepText = formatLocalFileStep(meta as LocalProgress | undefined)

            return (
              <div key={job.id} className="border-t border-border/70 px-3 py-2">
                <div className="grid grid-cols-[2.6fr_0.9fr_1.5fr_0.9fr_0.9fr_48px] items-center gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{job.name || meta?.title || `Torrent #${job.id}`}</p>
                    <p className="text-[11px] text-muted-foreground">ID {job.id}</p>
                  </div>

                  <span className="text-xs text-muted-foreground">{formatBytes(job.size)}</span>

                  <div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={`h-1.5 rounded-full transition-all ${progressFillClass(job.status)}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(progress)}%</p>
                  </div>

                  <div className="space-y-0.5">
                    <Badge className={`w-fit border text-[11px] ${queueStatusBadgeClass(job.status)}`} variant="outline">
                      {job.status || 'queued'}
                    </Badge>
                    <p className="truncate text-[10px] text-muted-foreground">{statusPhaseText(job.status)}</p>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{formatSpeed(job.downloadSpeed)}</p>
                    {eta && <p className="text-[10px] text-muted-foreground">{eta}</p>}
                  </div>

                  <button
                    type="button"
                    className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => removeJob(job.id)}
                    aria-label="Remove job"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {(isCompletedStatus(job.status) || isFailedStatus(job.status) || resolvedLink || importedPath || meta?.error) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => void resolveDownload(job)}
                      disabled={Boolean(meta?.resolving)}
                    >
                      {meta?.resolving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Resolve Link
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => void importIntoLibrary(job)}
                      disabled={Boolean(meta?.importing)}
                    >
                      {meta?.importing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Import
                    </Button>

                    {resolvedLink && <span className="truncate text-[11px] text-muted-foreground">Resolved: {resolvedLink}</span>}
                    {importedPath && <span className="truncate text-[11px] text-emerald-400">Imported: {importedPath}</span>}
                    {meta?.error && <span className="text-[11px] text-red-400">{meta.error}</span>}
                  </div>
                )}

                {localProgressText && <p className="mt-1 text-[11px] text-muted-foreground">{localProgressText}</p>}
                {localFileStepText && <p className="mt-0.5 text-[11px] text-muted-foreground/90">{localFileStepText}</p>}
              </div>
            )
          })}
        </div>
      )
    },
    [importIntoLibrary, jobMeta, removeJob, resolveDownload]
  )

  return (
    <div className="flex h-full flex-col gap-3 bg-background p-4 text-foreground">
      <section className="rounded-lg border border-border bg-card px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-blue-300" variant="outline">
              TORBOX CLOUD WORKSPACE
            </Badge>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Torbox Control Center</h1>
            <p className="text-sm text-muted-foreground">Search and queue books &amp; manga via Torbox</p>
          </div>

          <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={clearCompleted}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Clear Completed
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md bg-muted px-3 py-1 text-[11px]">Total {stats.total}</span>
          <span className="rounded-md bg-muted px-3 py-1 text-[11px] text-blue-300">Active {stats.active}</span>
          <span className="rounded-md bg-muted px-3 py-1 text-[11px] text-emerald-300">Completed {stats.completed}</span>
          <span className="rounded-md bg-muted px-3 py-1 text-[11px] text-red-300">Failed {stats.failed}</span>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card px-3 py-2.5">
        {keyStatus === 'set' && !editingKey ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge className="border border-emerald-400/40 bg-emerald-500/10 text-[11px] text-emerald-300" variant="outline">
                Connected ✓
              </Badge>
              <span className="text-xs text-muted-foreground">Torbox key saved</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  setEditingKey(true)
                  setKeyStatus('unset')
                  setKeyFeedback(null)
                }}
              >
                Change key
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-red-300 hover:underline"
                onClick={() => void clearSavedKey()}
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-2.5">
            <p className="text-sm font-medium text-amber-300">Torbox API key required</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste Torbox API key"
                className="h-8 max-w-md text-xs"
              />
              <Button
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => void verifyAndSaveKey()}
                disabled={keyStatus === 'verifying'}
              >
                {keyStatus === 'verifying' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Verify &amp; Save
              </Button>
            </div>

            {keyFeedback && (
              <p className={`mt-2 text-xs ${keyStatus === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{keyFeedback}</p>
            )}
          </div>
        )}
      </section>

      <Tabs.Root
        value={activeTab}
        onValueChange={(next) => setActiveTab(next as TabValue)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-card p-1">
          <Tabs.Trigger
            value="search"
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors data-[state=active]:bg-muted data-[state=active]:text-foreground"
          >
            Search
          </Tabs.Trigger>
          <Tabs.Trigger
            value="books"
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors data-[state=active]:bg-muted data-[state=active]:text-foreground"
          >
            Books Queue
            <Badge variant="outline" className="h-4 rounded-full px-1.5 py-0 text-[10px]">
              {booksJobs.length}
            </Badge>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="manga"
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors data-[state=active]:bg-muted data-[state=active]:text-foreground"
          >
            Manga Queue
            <Badge variant="outline" className="h-4 rounded-full px-1.5 py-0 text-[10px]">
              {mangaJobs.length}
            </Badge>
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="search" className="mt-3 min-h-0 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void runSearch()
                  }
                }}
                placeholder="Search titles, authors..."
                className="h-8 pl-8 text-sm"
              />
            </div>

            <select
              value={searchType}
              onChange={(event) => setSearchType(event.target.value as SearchType)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              aria-label="Search type"
            >
              <option value="manga">Manga</option>
              <option value="books">Books</option>
              <option value="all">All</option>
            </select>

            <Button size="sm" className="h-8 px-3 text-xs" onClick={() => void runSearch()} disabled={isSearching}>
              {isSearching ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Search
            </Button>
          </div>

          {searchError && <p className="mt-2 text-xs text-red-300">{searchError}</p>}

          <div className="mt-3 space-y-2">
            {searchResults.map((result) => {
              const expanded = expandedSourceId === result.id
              return (
                <div key={result.id} className="rounded-md border border-border/80 bg-background/50 p-2.5">
                  <div className="flex items-start gap-3">
                    {result.coverUrl ? (
                      <img
                        src={result.coverUrl}
                        alt={result.title}
                        className="h-14 w-[42px] rounded-sm object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-14 w-[42px] items-center justify-center rounded-sm bg-muted text-[10px] text-muted-foreground">
                        N/A
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{result.title}</p>
                        <span className="text-xs text-amber-300">
                          ★ {typeof result.rating === 'number' ? result.rating.toFixed(1) : '—'}
                        </span>
                      </div>

                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {result.author || 'Unknown author'}
                        {result.year ? ` · ${result.year}` : ''}
                        {result.ongoing ? ' · Ongoing' : ''}
                      </p>

                      {result.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {result.tags.map((tag) => (
                            <span key={`${result.id}-${tag}`} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setExpandedSourceId(expanded ? null : result.id)}
                    >
                      Sources {expanded ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  <div
                    className={`overflow-hidden transition-all duration-200 ${expanded ? 'mt-2 max-h-[420px] opacity-100' : 'max-h-0 opacity-0'}`}
                    id={`sources-${result.id}`}
                  >
                    <Separator className="my-2" />
                    <p className="mb-2 text-xs text-muted-foreground">Available sources for &quot;{result.title}&quot;</p>

                    <div className="space-y-1.5">
                      {result.sources.map((source) => {
                        const busyId = `${result.id}:${source.id}`
                        const busy = sourceBusy[busyId] === true

                        return (
                          <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className={`border text-[10px] ${sourceBadgeClass(source.fileType)}`}>
                                  {source.fileType}
                                </Badge>
                                <p className="truncate text-xs">{source.label}</p>
                              </div>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {typeof source.sizeBytes === 'number' ? formatBytes(source.sizeBytes) : 'Unknown size'}
                                {typeof source.seeders === 'number' ? ` · ${source.seeders} seeders` : ''}
                              </p>
                            </div>

                            <Button
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              disabled={busy}
                              onClick={() =>
                                void addQueuedJob({
                                  source,
                                  result,
                                  fallbackKind: searchType === 'books' ? 'books' : 'manga',
                                })
                              }
                            >
                              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              Add to Cloud ↑
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}

            {!isSearching && searchResults.length === 0 && searchQuery.trim() && !searchError && (
              <div className="rounded-md border border-dashed border-border/70 px-3 py-5 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            )}
          </div>

          <Separator className="my-3" />

          <div className="rounded-md border border-border/70 bg-background/60 p-2.5">
            <p className="text-xs font-medium">Manual source add</p>
            {searchUnavailable && (
              <p className="mt-1 text-[11px] text-amber-300">
                Search command is unavailable in this build. Paste a magnet or torrent link below.
              </p>
            )}

            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                placeholder="Optional title"
                className="h-8 text-xs"
              />
              <Input
                value={manualMagnet}
                onChange={(event) => setManualMagnet(event.target.value)}
                placeholder="magnet:?xt=... or https://..."
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8 px-3 text-xs" onClick={() => void addManualLink()}>
                Add
              </Button>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="books" className="mt-3 min-h-0 rounded-lg border border-border bg-card p-3">
          {renderQueueRows(booksJobs, 'No books in queue')}
        </Tabs.Content>

        <Tabs.Content value="manga" className="mt-3 min-h-0 rounded-lg border border-border bg-card p-3">
          {renderQueueRows(mangaJobs, 'No manga in queue')}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
