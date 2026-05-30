import React, { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, Image as ImageIcon, Loader2, ChevronRight, ChevronLeft } from 'lucide-react'
import { MagnetSourcesModal } from '../online/MagnetSourcesModal'
import { useTorboxStore } from '@/stores/useTorboxStore'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
  const [items, setItems] = useState<TrendingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const enqueueFromAnna = useTorboxStore((s) => s.enqueueFromAnna)
  const enqueueFromMangadex = useTorboxStore((s) => s.enqueueFromMangadex)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    const fetchTrending = async () => {
      setLoading(true)
      setError(null)
      
      try {
        if (type === 'manga') {
          // Fetch from AniList with rich metadata
          const query = `
            query {
              Page(page: 1, perPage: 25) {
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
            }
          `
          const res = await fetch('https://graphql.anilist.co', {
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
            const mangaList: TrendingItem[] = json.data.Page.media.map((m: any) => ({
              id: `anilist-${m.id}`,
              title: m.title.english || m.title.romaji,
              coverUrl: m.coverImage?.extraLarge,
              score: m.averageScore,
              description: m.description,
              genres: m.genres,
              status: m.status,
              year: m.startDate?.year,
            }))
            setItems(mangaList)
          }
        } else if (type === 'books') {
          // Fetch from Open Library (doesn't have as much rich metadata by default)
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
            setItems(booksList)
          }
        }
      } catch (err) {
        if (mounted) {
          console.error('Error fetching trending:', err)
          setError('Failed to load trending items.')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void fetchTrending()
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

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return
    const container = scrollContainerRef.current
    const scrollAmount = container.clientWidth * 0.8
    container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div className="w-full relative py-4">
        <h2 className="text-2xl font-black tracking-tight mb-6 px-4 flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          Trending {type === 'books' ? 'Books' : 'Manga'}
        </h2>
        <div className="flex gap-6 overflow-hidden px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="min-w-[280px] h-[400px] bg-muted/20 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-24">
        <p className="text-destructive font-medium bg-destructive/10 px-6 py-3 rounded-xl">{error}</p>
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className="w-full relative py-6 group/row">
      <div className="flex items-center justify-between px-6 mb-6">
        <h2 className="text-3xl font-black tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
          Trending {type === 'books' ? 'Books' : 'Manga'}
        </h2>
        
        <div className="flex items-center gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <button 
            onClick={() => scroll('left')}
            className="p-2 rounded-full bg-background/50 hover:bg-background border border-border/50 shadow-sm backdrop-blur-md transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => scroll('right')}
            className="p-2 rounded-full bg-background/50 hover:bg-background border border-border/50 shadow-sm backdrop-blur-md transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="flex overflow-x-auto snap-x snap-mandatory gap-6 px-6 pb-8 pt-2 hide-scrollbar"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item, i) => (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            key={item.id}
            onClick={() => void handleSelect(item)}
            className="relative flex-none w-[280px] md:w-[320px] h-[440px] snap-center group cursor-pointer"
          >
            {/* Glassmorphism Card Container */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden bg-background/40 backdrop-blur-xl border border-white/10 dark:border-white/5 shadow-2xl transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] flex flex-col">
              
              {/* Cover Image Half */}
              <div className="relative h-[60%] w-full overflow-hidden bg-muted/20">
                {item.coverUrl ? (
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground/40">
                    <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                  </div>
                )}
                
                {/* Gradient Overlay for seamless blend to content */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

                {/* Top Badges */}
                <div className="absolute top-3 left-3 flex gap-2">
                  {typeof item.score === 'number' && item.score > 0 && (
                    <div className="bg-black/60 backdrop-blur-md text-amber-400 text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1 border border-white/10 shadow-lg">
                      ★ {(item.score / 10).toFixed(1)}
                    </div>
                  )}
                  {item.year && (
                    <div className="bg-black/60 backdrop-blur-md text-white/90 text-xs font-bold px-2.5 py-1 rounded-full border border-white/10 shadow-lg">
                      {item.year}
                    </div>
                  )}
                </div>
              </div>

              {/* Content Half */}
              <div className="flex-1 p-5 flex flex-col relative z-10 -mt-6">
                <h3 className="font-bold text-lg leading-tight text-foreground line-clamp-2 mb-2 drop-shadow-sm">
                  {item.title}
                </h3>
                
                {/* Genres */}
                {item.genres && item.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.genres.slice(0, 3).map(g => (
                      <span key={g} className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/20">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
                
                {/* Description Snippet */}
                {item.description ? (
                  <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1" dangerouslySetInnerHTML={{__html: item.description}} />
                ) : item.author ? (
                  <p className="text-sm text-muted-foreground flex-1">{item.author}</p>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic flex-1">No description available.</p>
                )}
              </div>

              {/* Hover Overlay Action */}
              <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:-translate-y-[60%]">
                <div className="bg-primary text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-full shadow-xl flex items-center gap-2 transform scale-90 group-hover:scale-100 transition-transform">
                  <Search className="w-4 h-4" />
                  Search Torbox
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

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
