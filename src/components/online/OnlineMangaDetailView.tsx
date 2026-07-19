import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Play, Bookmark, BookmarkCheck, ArrowLeft, Search, Star, FileText, Globe, Download, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fetchWithRetry, cn } from '@/lib/utils';
import { MangaDownloadDialog } from './MangaDownloadDialog';

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
  onSaveToLibrary?: () => Promise<void>;
  isInLibrary?: boolean;
  lastReadChapterId?: string;

  onMangaClick?: (mangaId: string) => void;
  onDownloadChapters?: (chapters: UnifiedChapter[], seriesMetadata?: any) => void;
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
  onSaveToLibrary,
  isInLibrary,
  lastReadChapterId,
  onMangaClick,
  onDownloadChapters,
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
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);

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
                description
                startDate { year }
                staff(perPage: 3) {
                  edges {
                    role
                    node { name { full } }
                  }
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
            const authorNode = media.staff?.edges?.find((e: any) => e.role?.toLowerCase().includes('story') || e.role?.toLowerCase().includes('art')) || media.staff?.edges?.[0];
            const fetchedAuthor = authorNode?.node?.name?.full;
            const fetchedYear = media.startDate?.year;
            setAnilistData({ ...media, totalReviews, fetchedAuthor, fetchedYear });
          }
        } catch (e) {
          console.error("Anilist fetch error:", e);
        }
      };
      fetchAnilist();
    }
  }, [title]);

  const finalDescription = description || anilistData?.description || '';
  const finalAuthor = author && author !== 'Unknown' ? author : anilistData?.fetchedAuthor || 'Unknown';
  const finalYear = year && year !== '?' ? year : anilistData?.fetchedYear || '?';

  const displayDescription = useMemo(() => {
    if (!finalDescription) return '';
    if (isDescriptionExpanded) return finalDescription;
    return finalDescription.length > 250 ? finalDescription.slice(0, 250) + '...' : finalDescription;
  }, [finalDescription, isDescriptionExpanded]);

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
        className="absolute top-0 left-0 right-0 h-[65vh] opacity-30 pointer-events-none transition-all duration-1000"
        style={{
          backgroundImage: `url(${coverUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(60px) saturate(2)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-[65vh] bg-gradient-to-b from-background/20 via-background/60 to-background pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 p-6 md:p-10 max-w-[1400px] mx-auto w-full pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-10">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between mb-6">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to browse
          </button>

          {/* Close (RAB) Button */}
          <button
            onClick={onBack}
            className="flex md:hidden items-center justify-center w-11 h-11 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-all shadow-md active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hero Section */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-10 mb-12">
          
          {/* Left Column (Cover) */}
          <div className="w-full shrink-0 flex flex-col items-center md:items-start relative z-20">
            <div className="w-[220px] md:w-full aspect-[2/3] rounded-xl overflow-hidden shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] border border-border/50 bg-card/50 backdrop-blur-sm relative group">
            {coverUrl ? (
              <>
                <img src={coverUrl} alt={title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground/80 font-medium">No Cover</div>
            )}
            </div>
          </div>

          {/* Right/Middle Column (Title, Description, Details) */}
          <div className="flex flex-col min-w-0 pt-2 md:pt-4 relative z-20">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold tracking-widest uppercase">
                {status || 'RELEASING'}
              </span>
              <span className="px-3 py-1 bg-secondary border border-border/50 text-foreground/80 rounded-full text-xs font-medium">
                {formatText}
              </span>
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-3 leading-tight tracking-tight drop-shadow-md">
              {title}
            </h1>
            
            <p className="text-sm md:text-base text-muted-foreground/80 mb-6 line-clamp-2 max-w-3xl" title={alternateTitles}>
              {alternateTitles}
            </p>


            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mb-6">
              <div className="flex gap-2 w-full sm:w-auto">
                <Button onClick={() => unifiedChapters.length > 0 && onReadChapter(filteredAndSortedChapters[filteredAndSortedChapters.length - 1])}
                        className="flex-1 sm:flex-none gap-2 px-6 sm:px-8 h-10 sm:h-12 rounded-full text-xs sm:text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
                  READ <Play className="w-3 h-3 sm:w-4 sm:h-4 ml-1 fill-current" />
                </Button>
                {resumeChapter && (
                  <Button onClick={() => onReadChapter(resumeChapter)}
                          variant="secondary"
                          className="flex-1 sm:flex-none gap-2 px-6 sm:px-8 h-10 sm:h-12 rounded-full text-xs sm:text-sm font-semibold shadow-md transition-all hover:-translate-y-0.5">
                    RESUME <Play className="w-3 h-3 sm:w-4 sm:h-4 ml-1 fill-current" />
                  </Button>
                )}
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {onSaveToLibrary && (
                  <Button
                    onClick={onSaveToLibrary}
                    variant="outline"
                    disabled={isInLibrary}
                    className="flex-1 sm:flex-none gap-2 px-4 sm:px-6 h-10 sm:h-12 rounded-full text-xs sm:text-sm font-medium border-border/50 bg-secondary hover:bg-secondary/50 backdrop-blur-sm transition-all"
                  >
                    {isInLibrary
                      ? <><BookmarkCheck className="w-4 h-4 text-green-400" /> SAVED</>
                      : <><Bookmark className="w-4 h-4" /> SAVE</>}
                  </Button>
                )}
                {onDownloadChapters && unifiedChapters.length > 0 && (
                  <Button
                    onClick={() => setDownloadDialogOpen(true)}
                    variant="outline"
                    className="flex-1 sm:flex-none gap-2 px-4 sm:px-6 h-10 sm:h-12 rounded-full text-xs sm:text-sm font-medium border-border/50 bg-secondary hover:bg-secondary/50 backdrop-blur-sm transition-all"
                  >
                    <Download className="w-4 h-4" /> DL
                  </Button>
                )}
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-y-3 gap-x-4 sm:gap-6 mb-6 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-secondary border border-border/30 backdrop-blur-md">
              <div className="flex flex-col">
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-0.5 font-semibold">Rating</span>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Star className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400 fill-yellow-400" />
                  <span className="font-bold text-foreground text-sm sm:text-lg leading-none">{ratingScore}</span>
                  <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline-block ml-1">({totalReviews} revs)</span>
                </div>
              </div>
              <div className="w-px h-8 bg-secondary/50 hidden sm:block"></div>
              <div className="flex flex-col">
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-0.5 font-semibold">Chapters</span>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400" />
                  <span className="font-bold text-foreground text-sm sm:text-lg leading-none">{filteredAndSortedChapters.length}</span>
                </div>
              </div>
              <div className="w-px h-8 bg-secondary/50 hidden sm:block"></div>
              <div className="flex flex-col">
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-0.5 font-semibold">Author</span>
                <span className="font-medium text-foreground text-xs sm:text-sm max-w-[120px] sm:max-w-[150px] truncate" title={finalAuthor}>{finalAuthor}</span>
              </div>
              <div className="w-px h-8 bg-secondary/50 hidden sm:block"></div>
              <div className="flex flex-col">
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-0.5 font-semibold">Published</span>
                <span className="font-medium text-foreground text-xs sm:text-sm">{finalYear}</span>
              </div>
            </div>

            {(displayDescription || (genres && genres.length > 0)) && (
              <div className="text-sm md:text-base text-foreground/80 leading-relaxed max-w-4xl bg-white/[0.02] border border-border/30 rounded-xl p-5 backdrop-blur-sm">
                {displayDescription && (
                  <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayDescription.replace(/\n/g, '<br/>')) }} />
                )}
                {finalDescription && finalDescription.length > 250 && (
                  <button
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="text-primary hover:text-primary/80 hover:underline ml-2 font-semibold focus:outline-none transition-colors"
                  >
                    {isDescriptionExpanded ? 'Read less' : 'Read more'}
                  </button>
                )}
                
                {/* Genres Inline */}
                {genres && genres.length > 0 && (
                  <div className={cn("flex flex-wrap gap-2", displayDescription && "mt-6 pt-4 border-t border-border/30")}>
                    {genres.map(g => (
                      <span key={g} className="px-3 py-1 bg-secondary border border-border/50 rounded-md text-xs font-medium text-foreground/70">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chapters & Related Layout */}
        <div className="flex flex-col lg:flex-row gap-8 relative z-20 mt-4">
          
          {/* Main Left Area: Chapters */}
          <div className="flex-1 min-w-0">
            {/* Tabs & Search Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-border/50">
              <div className="flex gap-6">
                <button
                  className={`pb-2 text-sm font-bold tracking-widest uppercase transition-all relative ${activeTab === 'CHAPTER' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setActiveTab('CHAPTER')}
                >
                  Chapters
                  {activeTab === 'CHAPTER' && <div className="absolute bottom-[-17px] left-0 right-0 h-[2px] bg-primary rounded-t-full shadow-[0_0_8px_rgba(var(--primary),0.8)]" />}
                </button>
                <button
                  className={`pb-2 text-sm font-bold tracking-widest uppercase transition-all relative ${activeTab === 'VOLUME' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setActiveTab('VOLUME')}
                >
                  Volumes
                  {activeTab === 'VOLUME' && <div className="absolute bottom-[-17px] left-0 right-0 h-[2px] bg-primary rounded-t-full shadow-[0_0_8px_rgba(var(--primary),0.8)]" />}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 rounded-full bg-secondary border border-border/50 text-xs font-medium text-foreground/80 flex items-center gap-2 backdrop-blur-sm">
                  <Globe className="w-3.5 h-3.5" /> EN
                </div>
                
                <div className="relative w-full sm:w-48 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search chap..."
                    className="h-9 pl-9 bg-secondary hover:bg-secondary/50 border-border/50 text-foreground text-sm focus-visible:ring-1 focus-visible:ring-primary rounded-full transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Chapter Container */}
            <div className="bento-widget rounded-2xl overflow-hidden border border-border/50 bg-card/40 backdrop-blur-md shadow-xl">
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
                      
                      const isHighlighted = lastReadChapterId ? ch.id === lastReadChapterId : idx === 0;

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
                          className={`flex items-center justify-between p-4 cursor-pointer transition-colors border-b border-border/30 hover:bg-secondary ${isHighlighted ? 'bg-primary/10 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {isHighlighted && <Play className="w-3.5 h-3.5 text-primary fill-primary shrink-0 drop-shadow-sm" />}
                            <span className={`truncate text-sm ${isHighlighted ? 'text-primary font-bold' : 'text-foreground/90 font-medium'}`}>
                              {fullTitle || 'Chapter'}
                            </span>
                          </div>
                          <div className="flex flex-col items-end shrink-0 ml-4">
                            {ch.scanlationGroup && (
                              <span className="text-[11px] font-medium text-foreground/60 max-w-[100px] sm:max-w-[150px] truncate" title={ch.scanlationGroup}>
                                {ch.scanlationGroup}
                              </span>
                            )}
                            {ch.date && ch.date !== 'Unknown' && (
                              <span className="text-[11px] text-muted-foreground/70">
                                {ch.date}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  volumes.map((vol) => {
                    const volChapters = filteredAndSortedChapters.filter(c => c.volume === vol);
                    const isExpanded = expandedVolume === vol;
                    return (
                      <div key={vol} className="border-b border-border/30">
                        <div 
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary transition-colors font-medium text-sm text-foreground"
                          onClick={() => setExpandedVolume(isExpanded ? null : vol)}
                        >
                          <span className="font-semibold text-base">Volume {vol !== 'None' ? vol : '?'}</span>
                          <span className="text-xs px-2 py-1 bg-secondary rounded-md text-muted-foreground">{volChapters.length} chapters</span>
                        </div>
                        {isExpanded && (
                          <div className="bg-secondary/20">
                            {volChapters.map((ch) => {
                              const chapterNumStr = ch.chapter && ch.chapter !== '?' ? `Chapter ${ch.chapter}` : '';
                              const fullTitle = ch.title ? (chapterNumStr ? `${chapterNumStr}: ${ch.title}` : ch.title) : chapterNumStr || 'Oneshot';
                              const isHighlighted = lastReadChapterId ? ch.id === lastReadChapterId : false;
                              return (
                                <div 
                                  key={ch.id} 
                                  onClick={() => onReadChapter(ch)}
                                  className={`flex items-center justify-between p-3 pl-8 cursor-pointer transition-colors border-t border-border/30 hover:bg-secondary ${isHighlighted ? 'bg-primary/10 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {isHighlighted && <Play className="w-3 h-3 text-primary fill-primary shrink-0" />}
                                    <span className={`truncate text-sm ${isHighlighted ? 'text-primary font-bold' : 'text-foreground/80 font-medium'}`}>{fullTitle}</span>
                                  </div>
                                  <div className="flex flex-col items-end shrink-0 ml-4">
                                    {ch.scanlationGroup && (
                                      <span className="text-[11px] font-medium text-foreground/60 max-w-[100px] sm:max-w-[150px] truncate" title={ch.scanlationGroup}>
                                        {ch.scanlationGroup}
                                      </span>
                                    )}
                                    {ch.date && ch.date !== 'Unknown' && (
                                      <span className="text-[11px] text-muted-foreground/70">
                                        {ch.date}
                                      </span>
                                    )}
                                  </div>
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
              <div className="bento-widget rounded-2xl overflow-hidden border border-border/50 bg-card/40 backdrop-blur-md shadow-xl">
                <div className="px-5 py-4 flex items-center justify-between border-b border-border/50 bg-secondary/20">
                  <h3 className="font-bold text-sm text-foreground tracking-wide uppercase">Related Manga</h3>
                  <button className="text-xs text-primary font-medium hover:text-primary/80 transition-colors">More</button>
                </div>
                <div className="p-3 flex flex-col">
                  {relatedManga.slice(0, 5).map((m, i) => (
                    <div key={i} className="px-3 py-2.5 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-secondary cursor-pointer rounded-lg transition-colors truncate"
                         onClick={() => onMangaClick && onMangaClick(m.id)}>
                      {m.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* You may also like */}
            {recommendedManga && recommendedManga.length > 0 && (
              <div className="bento-widget rounded-2xl overflow-hidden border border-border/50 bg-card/40 backdrop-blur-md shadow-xl">
                <div className="px-5 py-4 border-b border-border/50 bg-secondary/20">
                  <h3 className="font-bold text-sm text-foreground tracking-wide uppercase">You may also like</h3>
                </div>
                <div className="p-4 flex flex-col gap-4">
                  {recommendedManga.slice(0, 4).map((m, i) => (
                    <div key={i} className="flex gap-4 cursor-pointer group" onClick={() => onMangaClick && onMangaClick(m.id)}>
                      <div className="w-14 h-20 bg-secondary/40 rounded-md shrink-0 overflow-hidden shadow-md">
                        {m.coverUrl && <img src={m.coverUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />}
                      </div>
                      <div className="flex flex-col justify-center min-w-0 py-1">
                        <div className="text-sm font-bold text-foreground/90 truncate group-hover:text-primary transition-colors mb-1">{m.title}</div>
                        <div className="text-xs font-medium text-muted-foreground bg-secondary w-fit px-2 py-0.5 rounded-md">Chap {m.latestChapter || '?'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <MangaDownloadDialog
          open={downloadDialogOpen}
          onOpenChange={setDownloadDialogOpen}
          chapters={filteredAndSortedChapters}
          onDownload={(chapters) => onDownloadChapters?.(chapters, anilistData)}
        />

      </div>
    </div>
  );
}
