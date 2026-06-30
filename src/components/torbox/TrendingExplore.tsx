import React, { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, Image as ImageIcon, Loader2, ChevronRight, ChevronLeft, Star } from 'lucide-react'
import { MagnetSourcesModal } from '../online/MagnetSourcesModal'
import { useTorboxStore } from '@/store/useTorboxStore'
import { toast } from 'sonner'
import { fetchWithRetry } from '@/lib/utils'

export interface TrendingItem {
  id: string
  title: string
  coverUrl?: string
  author?: string
  score?: number
  description?: string
  genres?: string[]
  status?: string
  year?: number
}

interface TrendingExploreProps {
  type: 'manga' | 'books'
}

export function TrendingExplore({ type }: TrendingExploreProps) {
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([])
  const [topItems, setTopItems] = useState<TrendingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const enqueueFromAnna = useTorboxStore((s) => s.enqueueFromAnna)
  const enqueueFromMangadex = useTorboxStore((s) => s.enqueueFromMangadex)

  useEffect(() => {
    let mounted = true
    const fetchItems = async () => {
      setLoading(true)
      setError(null)
      
      try {
        if (type === 'manga') {
          // Fetch Trending and Top Manga from AniList
          const query = `
            query {
              Trending: Page(page: 1, perPage: 25) {
                media(type: MANGA, format_in: [MANGA, ONE_SHOT], sort: TRENDING_DESC) {
                  id
                  title { romaji english }
                  coverImage { extraLarge }
                  averageScore
                  description(asHtml: false)
                  genres
                  status
                  startDate { year }
                }
              }
              Top: Page(page: 1, perPage: 25) {
                media(type: MANGA, format_in: [MANGA, ONE_SHOT], sort: SCORE_DESC) {
                  id
                  title { romaji english }
                  coverImage { extraLarge }
                  averageScore
                  description(asHtml: false)
                  genres
                  status
                  startDate { year }
                }
              }
            }
          `
          const res = await fetchWithRetry('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ query })
          })
          
          if (!res.ok) throw new Error('Failed to fetch from AniList')
          const json = await res.json()
          
          if (mounted) {
            const mapItem = (m: any): TrendingItem => ({
              id: `anilist-${m.id}`,
              title: m.title.english || m.title.romaji,
              coverUrl: m.coverImage?.extraLarge,
              score: m.averageScore,
              description: m.description,
              genres: m.genres,
              status: m.status,
              year: m.startDate?.year,
            })
            
            setTrendingItems(json.data.Trending.media.map(mapItem))
            setTopItems(json.data.Top.media.map(mapItem))
          }
        } else if (type === 'books') {
          const res = await fetch('https://openlibrary.org/trending/daily.json?limit=25')
          if (!res.ok) throw new Error('Failed to fetch from Open Library')
          const json = await res.json()
          
          if (mounted) {
            const booksList: TrendingItem[] = json.works.map((w: any) => ({
              id: `openlib-${w.key}`,
              title: w.title,
              coverUrl: w.cover_i ? `https://covers.openlibrary.org/b/id/${w.cover_i}-L.jpg` : undefined,
              author: w.author_name?.[0],
              year: w.first_publish_year,
            }))
            setTrendingItems(booksList)
            setTopItems([])
          }
        }
      } catch (err) {
        if (mounted) {
          console.error('Error fetching items:', err)
          setError('Failed to load items.')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void fetchItems()
    return () => { mounted = false }
  }, [type])

  const handleSelect = async (item: TrendingItem) => {
    setSearchQuery(item.title)
    setModalOpen(true)
  }

  const handleAddMagnet = async (magnet: string, title: string) => {
    try {
      if (type === 'books') {
        await enqueueFromAnna({ title, sourceLink: magnet })
      } else {
        await enqueueFromMangadex({ title, sourceLink: magnet })
      }
      toast.success(`Added "${title}" to Torbox queue`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to add to Torbox: ${msg}`)
    }
  }

  if (loading) {
    return (
      <div className="w-full relative py-4 space-y-12">
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-4 px-4 flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            Trending {type === 'books' ? 'Books' : 'Manga'}
          </h2>
          <div className="flex gap-4 overflow-hidden px-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="min-w-[140px] h-[200px] bg-muted/20 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-12">
        <p className="text-destructive font-medium bg-destructive/10 px-6 py-3 rounded-xl">{error}</p>
      </div>
    )
  }

  if (trendingItems.length === 0) return null

  return (
    <div className="w-full flex flex-col gap-10 py-4">
      <Row title={`Trending ${type === 'books' ? 'Books' : 'Manga'}`} items={trendingItems} onSelect={handleSelect} />
      {topItems.length > 0 && (
        <Row title={`Top Rated ${type === 'books' ? 'Books' : 'Manga'}`} items={topItems} onSelect={handleSelect} />
      )}

      <MagnetSourcesModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        query={searchQuery}
        type={type}
        onAddMagnetToTorbox={handleAddMagnet}
      />
    </div>
  )
}

function Row({ title, items, onSelect }: { title: string, items: TrendingItem[], onSelect: (item: TrendingItem) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const scrollAmount = scrollRef.current.clientWidth * 0.8
    scrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' })
  }

  return (
    <div className="relative group/row">
      <div className="flex items-center justify-between px-6 mb-4">
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground/90">
          {title}
        </h2>
        
        <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <button 
            onClick={() => scroll('left')}
            className="p-1.5 rounded-full bg-background/50 hover:bg-background border border-border/50 shadow-sm backdrop-blur-md transition-all text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            onClick={() => scroll('right')}
            className="p-1.5 rounded-full bg-background/50 hover:bg-background border border-border/50 shadow-sm backdrop-blur-md transition-all text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex overflow-x-auto gap-4 px-6 pb-4 pt-1 hide-scrollbar snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item, i) => (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            key={item.id}
            onClick={() => onSelect(item)}
            className="relative flex-none w-[225px] snap-center group cursor-pointer"
          >
            <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-muted/20 border border-white/5 shadow-md group-hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1">
              {item.coverUrl ? (
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground/40">
                  <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                </div>
              )}

              {/* Top gradient for score/year */}
              <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-black/60 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Bottom gradient for title and genres */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 pt-8 flex flex-col justify-end text-white text-left transition-all duration-300 opacity-90 group-hover:opacity-100">
                <h3 className="font-bold text-sm leading-tight line-clamp-2 drop-shadow-md">
                  {item.title}
                </h3>
                
                {/* Score & Year hover reveal */}
                <div className="absolute top-2 left-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform -translate-y-2 group-hover:translate-y-0">
                  {typeof item.score === 'number' && item.score > 0 && (
                    <span className="bg-black/60 backdrop-blur-md text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-lg">
                      <Star className="w-3 h-3 fill-yellow-400" />
                      {(item.score / 10).toFixed(1)}
                    </span>
                  )}
                </div>

                {/* Genres */}
                {item.genres && item.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 overflow-hidden max-h-[22px]">
                    {item.genres.slice(0, 2).map(g => (
                      <span key={g} className="text-[9px] font-medium uppercase tracking-wide text-white/70 bg-white/10 px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Search Icon Overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
                <div className="bg-primary/90 text-primary-foreground p-2.5 rounded-full shadow-lg transform scale-50 group-hover:scale-100 transition-transform duration-300 backdrop-blur-sm">
                  <Search className="w-4 h-4" />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
