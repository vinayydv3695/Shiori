import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Play, Bookmark, ArrowLeft, Search, Star, Info, FileText, Globe } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fetchWithRetry } from '@/lib/utils';

export interface UnifiedChapter {
  id: string;
  volume: string;
  chapter: string;
  title: string;
  scanlationGroup?: string;
  pages?: number;
  sourceType: 'mangadex' | 'plugin';
  originalChapter: any;
  date?: string; 
}

interface OnlineMangaDetailViewProps {
  title: string;
  coverUrl?: string;
  description?: string;
  author?: string;
  status?: string;
  year?: number | string;
  genres?: string[];
  rating?: string;

  chaptersLoading: boolean;
  chaptersError: string | null;
  unifiedChapters: UnifiedChapter[];
  sourceId?: string;
  contentId?: string;

  relatedManga?: any[];
  recommendedManga?: any[];

  onBack: () => void;
  onReadChapter: (chapter: UnifiedChapter) => void;

  onMangaClick?: (mangaId: string) => void;
}

export function OnlineMangaDetailView({
  title,
  coverUrl,
  description,
  author,
  status,
  year,
  genres,
  rating,
  chaptersLoading,
  chaptersError,
  unifiedChapters,
  sourceId,
  contentId,
  relatedManga,
  recommendedManga,
  onBack,
  onReadChapter,

  onMangaClick,
}: OnlineMangaDetailViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const [resumeChapterId, setResumeChapterId] = useState<string | null>(null);

  useEffect(() => {
    if (sourceId && contentId) {
      const progressKey = `online:${sourceId}:${contentId}`;
      const savedProgressStr = localStorage.getItem(`shiori-manga-progress:${progressKey}`);
      if (savedProgressStr) {
        try {
          const savedProgress = JSON.parse(savedProgressStr);
          if (savedProgress?.chapterId) {
            setResumeChapterId(savedProgress.chapterId);
          }
        } catch (e) {
          console.error('Failed to parse manga progress', e);
        }
      }
    }
  }, [sourceId, contentId]);

  const resumeChapter = useMemo(() => {
    if (!resumeChapterId) return null;
    return unifiedChapters.find(c => c.id === resumeChapterId) || null;
  }, [resumeChapterId, unifiedChapters]);

  const [expandedVolume, setExpandedVolume] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'CHAPTER' | 'VOLUME'>('CHAPTER');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAscending, setSortAscending] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [anilistData, setAnilistData] = useState<any>(null);

  useEffect(() => {
    if (title) {
      const fetchAnilist = async () => {
        try {
          const query = `
            query ($search: String) {
              Media(search: $search, type: MANGA) {
                id
                title {
                  english
                  romaji
                  native
                }
                averageScore
                stats {
                  scoreDistribution {
                    score
                    amount
                  }
                }
                source
                format
              }
            }
          `;
          const res = await fetchWithRetry('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { search: title } })
          });
          const data = await res.json();
          if (data.data?.Media) {
            const media = data.data.Media;
            const totalReviews = media.stats?.scoreDistribution?.reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0;
            setAnilistData({ ...media, totalReviews });
          }
        } catch (e) {
          console.error("Anilist fetch error:", e);
        }
      };
      fetchAnilist();
    }
  }, [title]);

  const displayDescription = useMemo(() => {
    if (!description) return '';
    if (isDescriptionExpanded) return description;
    return description.length > 250 ? description.slice(0, 250) + '...' : description;
  }, [description, isDescriptionExpanded]);

  const filteredAndSortedChapters = useMemo(() => {
    let list = [...unifiedChapters];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (ch) =>
          ch.chapter.includes(q) ||
          ch.title.toLowerCase().includes(q) ||
          ch.volume.includes(q)
      );
    }

    list.sort((a, b) => {
      const aVol = a.volume === 'None' ? 0 : Number(a.volume) || 0;
      const bVol = b.volume === 'None' ? 0 : Number(b.volume) || 0;
      const aChap = Number(a.chapter) || 0;
      const bChap = Number(b.chapter) || 0;

      if (aVol !== bVol) {
        return sortAscending ? aVol - bVol : bVol - aVol;
      }
      return sortAscending ? aChap - bChap : bChap - aChap;
    });

    return list;
  }, [unifiedChapters, searchQuery, sortAscending]);

  const volumes = useMemo(() => {
    if (activeTab !== 'VOLUME') return [];
    const vols = new Set(filteredAndSortedChapters.map((c) => c.volume));
    return Array.from(vols);
  }, [filteredAndSortedChapters, activeTab]);

  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedChapters.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 57, 
    overscan: 5,
  });

  const ratingScore = anilistData?.averageScore ? (anilistData.averageScore / 10).toFixed(2) : rating ? rating : '?';
  const totalReviews = anilistData?.totalReviews ? anilistData.totalReviews.toLocaleString() : '0';
  const alternateTitles = anilistData?.title ? [anilistData.title.english, anilistData.title.romaji, anilistData.title.native].filter(Boolean).join('; ') : title;
  const formatText = anilistData?.format || 'Manga';

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto overflow-x-hidden relative font-sans">
      {/* Background Gradient / Blur */}
      <div
        className="absolute top-0 left-0 right-0 h-[60vh] opacity-20 pointer-events-none"
        style={{
          backgroundImage: `url(${coverUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 20%',
          filter: 'blur(30px) saturate(1.5)',
          maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
        }}
      />

      {/* Main Content Area */}
      <div className="relative z-10 p-6 md:p-10 max-w-[1400px] mx-auto w-full">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to browse
        </button>

        {/* Hero Section */}
        <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] lg:grid-cols-[250px_1fr_288px] gap-8 mb-12">
          
          {/* Left Column (Cover) */}
          <div className="w-full shrink-0">
            <div className="w-[200px] md:w-full mx-auto aspect-[2/3] rounded-md overflow-hidden shadow-2xl bg-card border border-border">
            {coverUrl ? (
              <img src={coverUrl} alt={title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground/80">No Cover</div>
            )}
            </div>
          </div>

          {/* Middle Column (Title, Description, Buttons) */}
          <div className="flex flex-col flex-1 min-w-0 pt-2">
            <div className="text-sm font-semibold tracking-[0.2em] text-muted-foreground uppercase mb-2">
              {status || 'RELEASING'}
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2 leading-tight">
              {title}
            </h1>
            
            <p className="text-sm text-muted-foreground/80 mb-6 truncate" title={alternateTitles}>
              {alternateTitles}
            </p>


            <div className="flex flex-wrap gap-4 mb-6">
              <Button onClick={() => unifiedChapters.length > 0 && onReadChapter(filteredAndSortedChapters[filteredAndSortedChapters.length - 1])}
                      className="gap-2 px-8 h-10 rounded text-sm bg-[#357ebd] hover:bg-[#2b659b] text-foreground border-0">
                START READING <Play className="w-4 h-4 ml-1 fill-current" />
              </Button>
              {resumeChapter && (
                <Button onClick={() => onReadChapter(resumeChapter)}
                        variant="secondary"
                        className="gap-2 px-8 h-10 rounded text-sm text-foreground border border-border/50">
                  CONTINUE READING <Play className="w-4 h-4 ml-1 fill-current" />
                </Button>
              )}
            </div>


            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-6 font-medium">
              <span>{formatText}</span>
              <div className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {filteredAndSortedChapters.length}</div>
              <div className="flex items-center gap-1"><span className="font-bold text-foreground/90">{ratingScore}</span> AniList by {totalReviews} users</div>
            </div>

            <div className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
              <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayDescription.replace(/\n/g, '<br/>')) }} />
              {description && description.length > 250 && (
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-foreground/90 hover:underline ml-2 font-medium focus:outline-none"
                >
                  {isDescriptionExpanded ? 'Read less -' : 'Read more +'}
                </button>
              )}
            </div>
          </div>

          {/* Right Column (Info & Ratings) */}
          <div className="w-full md:w-72 flex-shrink-0 flex flex-col gap-6 pt-2">
            <div className="text-sm text-muted-foreground space-y-3">
              <div className="flex">
                <span className="w-24 shrink-0">Author:</span>
                <span className="text-foreground">{author || 'Unknown'}</span>
              </div>
              <div className="flex">
                <span className="w-24 shrink-0">Published:</span>
                <span className="text-foreground">{year || '?'}</span>
              </div>
              <div className="flex">
                <span className="w-24 shrink-0">Genres:</span>
                <span className="text-foreground">{genres && genres.length > 0 ? genres.join(', ') : 'None'}</span>
              </div>
            </div>

            <div className="border border-[#eab308]/20 bg-[#eab308]/5 rounded p-4 flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-foreground leading-none mb-1">
                  {ratingScore} <span className="text-sm font-normal text-muted-foreground">/ 10</span>
                </div>
                <div className="text-xs text-muted-foreground/80">by {totalReviews} reviews</div>
              </div>
              <div className="flex gap-1 text-[#eab308]">
                <Star className="w-4 h-4 fill-current" />
                <Star className="w-4 h-4 fill-current" />
                <Star className="w-4 h-4 fill-current" />
                <Star className="w-4 h-4 fill-current" />
                <Star className="w-4 h-4 fill-current opacity-50" />
              </div>
            </div>
          </div>
        </div>

        {/* Chapters & Related Layout */}
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Main Left Area: Chapters */}
          <div className="flex-1 min-w-0">
            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-border">
              <button
                className={`px-6 py-3 text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'CHAPTER' ? 'text-foreground border-b-2 border-[#357ebd]' : 'text-muted-foreground/80 hover:text-foreground/90'}`}
                onClick={() => setActiveTab('CHAPTER')}
              >
                Chapter
              </button>
              <button
                className={`px-6 py-3 text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'VOLUME' ? 'text-foreground border-b-2 border-[#357ebd]' : 'text-muted-foreground/80 hover:text-foreground/90'}`}
                onClick={() => setActiveTab('VOLUME')}
              >
                Volume
              </button>
            </div>

            {/* Chapter Container */}
            <div className="border border-border bg-card rounded-md overflow-hidden">
              
              {/* Header / Search */}
              <div className="bg-muted/50 border-b border-border p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 rounded-full border border-border bg-muted text-xs font-medium text-foreground/90 flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" /> Language: EN
                  </div>
                </div>
                
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Chap number..."
                    className="h-9 pl-9 bg-background border-border text-foreground/90 text-sm focus-visible:ring-1 focus-visible:ring-[#357ebd]"
                  />
                </div>
              </div>

              {/* List */}
              <div 
                ref={parentRef}
                className="flex flex-col max-h-[600px] overflow-y-auto custom-scrollbar relative"
              >
                {chaptersLoading ? (
                  <div className="p-8 text-center text-muted-foreground/80">Loading chapters...</div>
                ) : chaptersError ? (
                  <div className="p-8 text-center text-red-400">{chaptersError}</div>
                ) : filteredAndSortedChapters.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground/80">No chapters found</div>
                ) : activeTab === 'CHAPTER' ? (
                  <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const idx = virtualRow.index;
                      const ch = filteredAndSortedChapters[idx];
                      const chapterNumStr = ch.chapter && ch.chapter !== '?' ? `Chapter ${ch.chapter}` : (ch.title ? '' : 'Oneshot');
                      const fullTitle = ch.title ? (chapterNumStr ? `${chapterNumStr}: ${ch.title}` : ch.title) : chapterNumStr;
                      
                      return (
                        <div 
                          key={ch.id} 
                          onClick={() => onReadChapter(ch)}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className={`flex items-center justify-between p-4 cursor-pointer transition-colors border-b border-border hover:bg-accent ${idx === 0 ? 'bg-accent/30' : ''}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {idx === 0 && <Play className="w-3 h-3 text-[#357ebd] fill-[#357ebd] shrink-0" />}
                            <span className={`truncate text-sm ${idx === 0 ? 'text-[#357ebd] font-medium' : 'text-foreground/90'}`}>
                              {fullTitle || 'Chapter'}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground/80 shrink-0 ml-4">
                            {ch.date || 'Unknown'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  volumes.map((vol) => {
                    const volChapters = filteredAndSortedChapters.filter(c => c.volume === vol);
                    const isExpanded = expandedVolume === vol;
                    return (
                      <div key={vol} className="border-b border-border">
                        <div 
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent transition-colors font-medium text-sm text-foreground/90"
                          onClick={() => setExpandedVolume(isExpanded ? null : vol)}
                        >
                          <span>Volume {vol !== 'None' ? vol : '?'}</span>
                          <span className="text-xs text-muted-foreground">{volChapters.length} chapters</span>
                        </div>
                        {isExpanded && (
                          <div className="bg-muted/20">
                            {volChapters.map((ch) => {
                              const chapterNumStr = ch.chapter && ch.chapter !== '?' ? `Chapter ${ch.chapter}` : '';
                              const fullTitle = ch.title ? (chapterNumStr ? `${chapterNumStr}: ${ch.title}` : ch.title) : chapterNumStr || 'Oneshot';
                              return (
                                <div 
                                  key={ch.id} 
                                  onClick={() => onReadChapter(ch)}
                                  className="flex items-center justify-between p-3 pl-8 cursor-pointer transition-colors border-t border-border/50 hover:bg-accent"
                                >
                                  <span className="truncate text-sm text-foreground/90">{fullTitle}</span>
                                  <span className="text-xs text-muted-foreground/80 shrink-0 ml-4">{ch.date || 'Unknown'}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar: Related */}
          <div className="w-full lg:w-72 flex flex-col gap-6">
            
            {/* Related Manga */}
            {relatedManga && relatedManga.length > 0 && (
              <div className="border border-border bg-card rounded-md overflow-hidden">
                <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Related Manga</h3>
                  <button className="text-xs text-muted-foreground hover:text-primary">More ▾</button>
                </div>
                <div className="p-2 flex flex-col">
                  {relatedManga.slice(0, 5).map((m, i) => (
                    <div key={i} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer rounded truncate"
                         onClick={() => onMangaClick && onMangaClick(m.id)}>
                      {m.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* You may also like */}
            {recommendedManga && recommendedManga.length > 0 && (
              <div className="border border-border bg-card rounded-md overflow-hidden">
                <div className="bg-muted/50 border-b border-border px-4 py-3">
                  <h3 className="font-semibold text-foreground">You may also like</h3>
                </div>
                <div className="p-3 flex flex-col gap-3">
                  {recommendedManga.slice(0, 4).map((m, i) => (
                    <div key={i} className="flex gap-3 cursor-pointer group" onClick={() => onMangaClick && onMangaClick(m.id)}>
                      <div className="w-12 h-16 bg-muted rounded shrink-0 overflow-hidden">
                        {m.coverUrl && <img src={m.coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" />}
                      </div>
                      <div className="flex flex-col justify-center min-w-0">
                        <div className="text-sm font-medium text-foreground/90 truncate group-hover:text-[#357ebd] transition-colors">{m.title}</div>
                        <div className="text-xs text-muted-foreground/80">Chap {m.latestChapter || '?'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
