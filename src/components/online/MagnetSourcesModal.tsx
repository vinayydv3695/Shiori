import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Server, HardDrive, ShieldCheck, Search, Loader2 } from 'lucide-react'
import { api } from '@/lib/tauri'

export interface MagnetSource {
  title: string
  size: string
  seeders: number
  magnet: string
  source: string
}

interface MagnetSourcesModalProps {
  isOpen: boolean
  onClose: () => void
  query: string
  type: 'manga' | 'books' | 'all'
  onAddMagnetToTorbox: (magnet: string, title: string) => void
}

export function MagnetSourcesModal({ isOpen, onClose, query, type, onAddMagnetToTorbox }: MagnetSourcesModalProps) {
  const [sources, setSources] = useState<MagnetSource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')

  const filteredSources = sources.filter(s => s.title.toLowerCase().includes(searchFilter.toLowerCase()))

  useEffect(() => {
    if (!isOpen || !query) return
    
    let mounted = true
    const fetchSources = async () => {
      setLoading(true)
      setError(null)
      setSources([])
      
      try {
        const targetType = type === 'all' ? 'manga' : type
        let results: MagnetSource[] = []
        
        if (targetType === 'manga') {
          // Call nyaa.si
          const response = await api.searchNyaa(query)
          results = response.map(r => ({
            title: r.title,
            size: r.size,
            seeders: parseInt(r.seeders, 10) || 0,
            magnet: r.magnet,
            source: 'Nyaa.si'
          }))
        } else {
          // Call Anna's Archive
          const response = await api.searchAnnasArchive(query)
          results = response.map(r => ({
            title: r.title,
            size: r.size,
            seeders: 0, // Anna's Archive direct torrents might not show seeders easily
            magnet: r.magnet,
            source: "Anna's Archive"
          }))
        }
        
        if (mounted) {
          setSources(results)
        }
      } catch (err) {
        if (mounted) {
          console.error('Failed to fetch magnet sources:', err)
          setError(String(err))
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    
    void fetchSources()
    return () => { mounted = false }
  }, [isOpen, query, type])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/40 p-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">Available Sources</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5" />
                  Showing results for <span className="font-medium text-foreground">"{query}"</span>
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!loading && !error && sources.length > 0 && (
              <div className="px-5 pt-4 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    placeholder="Filter links..." 
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="w-full bg-background border border-border rounded-md pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2">
              {loading && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p>Searching for magnet links...</p>
                </div>
              )}

              {!loading && error && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <p className="text-destructive font-medium mb-2">Search failed</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
              )}

              {!loading && !error && sources.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Server className="w-10 h-10 mb-4 opacity-20" />
                  <p>No magnet links found for this title.</p>
                </div>
              )}

              {!loading && !error && sources.length > 0 && (
                <div className="flex flex-col gap-2 p-3">
                  {filteredSources.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      No links match your filter.
                    </div>
                  ) : filteredSources.map((s, i) => {
                    const formatMatch = s.title.match(/\.(zip|rar|cbz|cbr|epub|pdf|mobi|azw3)/i)
                    const format = formatMatch ? formatMatch[1].toUpperCase() : 'UNKNOWN'
                    
                    return (
                      <div key={i} className="group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-all">
                        <div className="flex-1 min-w-0 pr-4">
                          <h4 className="font-medium text-sm leading-tight break-words text-foreground group-hover:text-primary transition-colors">
                            {s.title}
                          </h4>
                          <div className="flex items-center gap-3 mt-2 text-xs font-medium">
                            <span className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded shadow-sm">
                              {format}
                            </span>
                            <span className="flex items-center gap-1.5 text-muted-foreground bg-background border border-border px-2 py-0.5 rounded shadow-sm">
                              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> {s.source}
                            </span>
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <HardDrive className="w-3.5 h-3.5" /> {s.size}
                            </span>
                            {s.seeders > 0 && (
                              <span className="flex items-center gap-1.5 text-emerald-500">
                                <Server className="w-3.5 h-3.5" /> {s.seeders} seeders
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            onAddMagnetToTorbox(s.magnet, s.title)
                            onClose()
                          }}
                          className="shrink-0 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
                        >
                          <Download className="w-4 h-4" />
                          Add
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
