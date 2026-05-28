import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Book, Image as ImageIcon, Loader2 } from 'lucide-react'

export interface TrendingItem {
  id: string
  title: string
  coverUrl?: string
  author?: string
  score?: number
}

interface TrendingExploreProps {
  type: 'manga' | 'books' | 'all'
  onSelect: (title: string) => void
}

export function TrendingExplore({ type, onSelect }: TrendingExploreProps) {
  const [items, setItems] = useState<TrendingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const fetchTrending = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const effectiveType = type === 'all' ? 'manga' : type
        
        if (effectiveType === 'manga') {
          // Fetch from AniList
          const query = `
            query {
              Page(page: 1, perPage: 15) {
                media(type: MANGA, sort: TRENDING_DESC) {
                  id
                  title { romaji english }
                  coverImage { large }
                  averageScore
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
              coverUrl: m.coverImage?.large,
              score: m.averageScore,
            }))
            setItems(mangaList)
          }
        } else if (effectiveType === 'books') {
          // Fetch from Open Library
          const res = await fetch('https://openlibrary.org/trending/daily.json?limit=15')
          if (!res.ok) throw new Error('Failed to fetch from Open Library')
          const json = await res.json()
          
          if (mounted) {
            const booksList: TrendingItem[] = json.works.map((w: any) => ({
              id: `openlib-${w.key}`,
              title: w.title,
              coverUrl: w.cover_i ? `https://covers.openlibrary.org/b/id/${w.cover_i}-L.jpg` : undefined,
              author: w.author_name?.[0]
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
    setSelectingId(item.id)
    try {
      await onSelect(item.title)
    } finally {
      setSelectingId(null)
    }
  }

  if (loading) {
    return (
      <div className="w-full">
        <h2 className="text-xl font-bold tracking-tight mb-6 px-1 flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          Loading Popular {type === 'books' ? 'Books' : 'Manga'}...
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] w-full bg-muted/30 rounded-xl animate-pulse border border-border/40" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className="w-full animate-in fade-in duration-500 pb-8">
      <h2 className="text-xl font-bold tracking-tight mb-6 px-1">
        Trending {type === 'books' ? 'Books' : 'Manga'}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {items.map((item) => (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            key={item.id}
            className="group flex flex-col gap-3 cursor-pointer relative"
            onClick={() => void handleSelect(item)}
          >
            <div className="relative overflow-hidden rounded-xl bg-muted/30 shadow-sm border border-border/40 aspect-[2/3] w-full">
              {item.coverUrl ? (
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground/40 bg-muted/10">
                  <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">No Cover</span>
                </div>
              )}

              {typeof item.score === 'number' && (
                <div className="absolute bottom-2 right-2 bg-background/90 text-amber-500 text-[11px] font-bold px-1.5 py-0.5 rounded border border-border/50 flex items-center gap-1 shadow-sm backdrop-blur-md">
                  ★ {(item.score / 10).toFixed(1)}
                </div>
              )}

              <div className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm">
                <div className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-full shadow-md flex items-center gap-2">
                  <Search className="w-3.5 h-3.5" />
                  Search Torbox
                </div>
              </div>
              
              {selectingId === item.id && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center backdrop-blur-sm z-10">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}
            </div>

            <div className="min-w-0 px-1">
              <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary truncate text-sm">
                {item.title}
              </h3>
              {item.author && (
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {item.author}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
