import { useEffect, useState, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import {
  getViewer,
  getMediaListCollection,
  AnilistUser,
  AnilistMediaListCollection,
  AnilistMediaList,
  AnilistMedia,
  searchMedia,
  safeUpdateMediaListEntry,
  getTopManga
} from '@/lib/anilist';
import { api } from '@/lib/tauri';
import { Loader2, BookOpen, AlertTriangle, RefreshCw, Search, CheckCircle2, LayoutGrid, Star } from 'lucide-react';
import { AniListBookCard } from './AniListBookCard';
import { AniListMangaDetailsView } from './AniListMangaDetailsView';
import { AniListUserProfileView } from './AniListUserProfileView';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/store/toastStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

interface AniListDashboardProps {
  onOpenSettings?: () => void;
}

export function AniListDashboard({ onOpenSettings }: AniListDashboardProps = {}) {
  const { token: anilistToken } = useAniListAccessToken();
  const setCurrentView = useUIStore(state => state.setCurrentView);
  const setSearchQuery = useOnlineSearchStore(state => state.setQuery);
  const { error: showErrorToast } = useToast();

  const [user, setUser] = useState<AnilistUser | null>(null);
  const [collection, setCollection] = useState<AnilistMediaListCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('Reading');
  const [selectedEntry, setSelectedEntry] = useState<AnilistMediaList | null>(null);
  const [selectedRawMedia, setSelectedRawMedia] = useState<AnilistMedia | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showProfileView, setShowProfileView] = useState(false);
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [searchResults, setSearchResults] = useState<AnilistMedia[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [topManga, setTopManga] = useState<AnilistMedia[]>([]);

  useEffect(() => {
    async function loadAnilist() {
      if (!anilistToken) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const viewer = await getViewer(anilistToken);
        setUser(viewer);

        const lists = await getMediaListCollection(viewer.id, anilistToken);
        setCollection(lists);
        
        try {
          const top = await getTopManga(anilistToken);
          setTopManga(top);
        } catch (e) {
          console.warn("Failed to fetch top manga", e);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        showErrorToast('AniList Sync Error', msg);
      } finally {
        setLoading(false);
      }
    }
    loadAnilist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anilistToken]);

  const handleSearchOnlineManga = (title: string) => {
    setSearchQuery('online-manga', title);
    setCurrentView('online-manga');
  };

  const handleSearchTorbox = (title: string) => {
    setSearchQuery('torbox', title);
    setCurrentView('torbox-discover');
  };

  const handleEntryClick = (entry: AnilistMediaList) => {
    setSelectedEntry(entry);
    setSelectedRawMedia(null);
    setIsDetailsOpen(true);
  };

  const handleRawEntryClick = (media: AnilistMedia) => {
    handleOpenMediaId(media.id);
  };

  const handleOpenMediaId = (id: number) => {
    let foundEntry: AnilistMediaList | null = null;
    if (collection) {
      for (const list of collection.lists) {
        const found = list.entries.find(e => e.media.id === id);
        if (found) {
          foundEntry = found;
          break;
        }
      }
    }
    
    if (foundEntry) {
      setSelectedEntry(foundEntry);
      setSelectedRawMedia(null);
    } else {
      setSelectedEntry(null);
      setSelectedRawMedia({ id } as AnilistMedia);
    }
    setIsDetailsOpen(true);
  };

  const handleDashboardSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboardSearch.trim() || !anilistToken) return;
    
    setIsSearching(true);
    try {
      const results = await searchMedia(dashboardSearch, anilistToken);
      setSearchResults(results);
      setActiveTab('Search Results');
    } catch (err) {
      showErrorToast('Search Error', String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const handleDetailsUpdate = async () => {
    if (!anilistToken) return;
    try {
      const viewer = user || await getViewer(anilistToken);
      if (!user) setUser(viewer);
      const lists = await getMediaListCollection(viewer.id, anilistToken);
      setCollection(lists);
    } catch (err) {
      showErrorToast('Update Failed', String(err));
    }
  };

  const handleSyncLibrary = async () => {
    if (!anilistToken) return;
    setSyncingLibrary(true);
    try {
      const result = await api.searchBooks({ limit: 10000, offset: 0 });
      const allBooks = result.books.filter(b => 
        b.file_format === 'cbz' || 
        b.file_format === 'cbr' || 
        b.file_format === 'zip' || 
        b.file_format === 'rar' || 
        b.file_path.includes('manga')
      );
      
      setSyncProgress({ current: 0, total: allBooks.length });
      
      for (let i = 0; i < allBooks.length; i++) {
        const book = allBooks[i];
        let mediaId = book.anilist_id ? Number(book.anilist_id) : null;
        
        if (!mediaId) {
            try {
                const results = await searchMedia(book.title, anilistToken);
                if (results && results.length > 0) {
                    mediaId = results[0].id;
                    await api.updateBook({ ...book, anilist_id: mediaId.toString() });
                }
            } catch {
                console.warn(`Failed to search anilist for ${book.title}`);
            }
        }
        
        if (mediaId && book.id) {
            try {
                const progress = await api.getReadingProgress(book.id);
                let chapterNum = 0;
                const match = book.title.match(/chapter\s+(\d+)/i) || book.title.match(/(?:ch|c)\.?\s*(\d+)/i);
                if (match) {
                    chapterNum = parseInt(match[1]);
                } else if (progress && progress.currentPage) {
                    chapterNum = progress.currentPage;
                }
                
                let status = 'PLANNING';
                if (book.reading_status === 'reading') status = 'CURRENT';
                else if (book.reading_status === 'completed') status = 'COMPLETED';
                
                await safeUpdateMediaListEntry(mediaId, chapterNum, status, anilistToken);
            } catch {
                console.warn(`Failed to update list entry for ${book.title}`);
            }
        }
        
        setSyncProgress({ current: i + 1, total: allBooks.length });
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      showErrorToast('Sync Complete', `Successfully synced ${allBooks.length} manga to AniList.`);
      window.location.reload();
    } catch (err) {
      showErrorToast('Sync Error', String(err));
    } finally {
      setSyncingLibrary(false);
    }
  };

  const tabs = useMemo(() => {
    if (!collection) return [];
    const defaultTabs = ['Reading', 'Completed', 'Planning', 'Dropped'];
    const availableLists = collection.lists.filter(list => !list.isCustomList).map(l => l.name);
    const allTabs = defaultTabs.filter(t => availableLists.includes(t)).concat(availableLists.filter(t => !defaultTabs.includes(t)));
    if (topManga.length > 0) {
      allTabs.unshift('Top Manga');
    }
    if (searchResults.length > 0) {
      allTabs.unshift('Search Results');
    }
    return allTabs;
  }, [collection, searchResults, topManga]);
  
  useEffect(() => {
      if (tabs.length > 0 && !tabs.includes(activeTab)) {
          setActiveTab(tabs[0]);
      }
  }, [tabs, activeTab]);

  if (!anilistToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <BookOpen className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-semibold">AniList Not Connected</h2>
        <p className="text-muted-foreground max-w-md">
          To view your AniList library, please go to Settings &gt; Integrations and log in with AniList.
        </p>
        <Button onClick={onOpenSettings}>
          Open Settings
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full space-y-6 p-6 overflow-hidden">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="w-full aspect-[2/3] rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4 text-destructive">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-semibold">Sync Failed</h2>
        <p className="text-muted-foreground max-w-md">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const currentListGroup = collection?.lists.find(l => l.name === activeTab);
  
  // Calculate Stats
  let totalChaptersRead = 0;
  let totalScore = 0;
  let scoredCount = 0;
  let completedCount = 0;
  
  if (collection) {
    collection.lists.forEach(list => {
      if (list.name === 'Completed' || list.name === 'COMPLETED') completedCount += list.entries.length;
      
      list.entries.forEach(entry => {
        if (entry.progress) totalChaptersRead += entry.progress;
        if (entry.score && entry.score > 0) {
          totalScore += entry.score;
          scoredCount++;
        }
      });
    });
  }
  
  const meanScore = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : '0.0';

  // Derive Hero Banner Image
  let heroImage = user?.bannerImage;
  if (!heroImage && collection) {
    const readingList = collection.lists.find(l => l.name === 'Reading' || l.name === 'CURRENT');
    if (readingList && readingList.entries.length > 0) {
        const media = readingList.entries[0].media;
        heroImage = media.bannerImage || media.coverImage.extraLarge || media.coverImage.large;
    }
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden relative">
      <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
        {/* Dynamic Hero Section */}
        <div className="relative w-full h-[150px] md:h-[220px] overflow-hidden">
          {/* Background Image (Cover/Banner) */}
          {heroImage ? (
             <motion.img 
               initial={{ scale: 1.05, opacity: 0 }}
               animate={{ scale: 1, opacity: 0.6 }}
               transition={{ duration: 1.2, ease: 'easeOut' }}
               src={heroImage} 
               alt="Hero Background" 
               className="absolute inset-0 w-full h-full object-cover pointer-events-none"
               style={{ objectPosition: 'center 30%' }}
             />
          ) : (
             <div className="absolute inset-0 bg-gradient-to-r from-secondary/50 to-background" />
          )}
          
          {/* Bottom Fade Gradient for seamless blend into theme background */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        </div>

        {/* Profile Info Bar */}
        <div className="max-w-[1400px] mx-auto w-full px-4 md:px-8 relative z-20">
          <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-4 -mt-12 md:-mt-16 mb-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex flex-col md:flex-row items-center md:items-end gap-5 w-full"
            >
              {user && (
                <button 
                  className="relative shrink-0 transition-transform active:scale-95 hover:scale-105 cursor-pointer"
                  onClick={() => setShowProfileView(true)}
                >
                  <img 
                    src={user.avatar.large || user.avatar.medium} 
                    alt={user.name} 
                    className="w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-background shadow-xl object-cover ring-2 ring-primary/20 ring-offset-2 ring-offset-background" 
                  />
                </button>
              )}
              <div className="flex flex-col text-center md:text-left mb-1">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                  {user ? user.name : 'AniList Dashboard'}
                </h1>
                
                {/* Compact Stats inline for desktop, or just below for mobile */}
                <div className="flex items-center justify-center md:justify-start gap-4 mt-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5" title="Chapters Read">
                    <BookOpen size={14} className="text-primary/70" />
                    <span className="font-semibold text-foreground">{totalChaptersRead}</span>
                  </div>
                  <div className="flex items-center gap-1.5" title="Completed Series">
                    <CheckCircle2 size={14} className="text-primary/70" />
                    <span className="font-semibold text-foreground">{completedCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5" title="Mean Score">
                    <Star size={14} className="text-primary/70" />
                    <span className="font-semibold text-foreground">{meanScore}</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Quick Actions (Sync & Search) */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto mb-1"
            >
              <form onSubmit={handleDashboardSearch} className="relative w-full md:w-56 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search AniList..." 
                  value={dashboardSearch}
                  onChange={e => setDashboardSearch(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-full py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                )}
              </form>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSyncLibrary} 
                disabled={syncingLibrary}
                className="w-full md:w-auto gap-2 border-border hover:bg-secondary/80 text-foreground transition-all rounded-full font-medium"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", syncingLibrary && "animate-spin")} />
                {syncingLibrary 
                  ? `${syncProgress.current}/${syncProgress.total}`
                  : "Sync"}
              </Button>
            </motion.div>
          </div>
          
          {/* Segmented Tabs (Underline Style) */}
          {tabs.length > 0 && (
            <div className="flex gap-6 overflow-x-auto hide-scrollbar mb-4 border-b border-border/50">
              {tabs.map((tab) => {
                const isActive = activeTab === tab;
                let count = 0;
                if (tab === 'Search Results') count = searchResults.length;
                else if (tab === 'Top Manga') count = topManga.length;
                else count = collection?.lists.find(l => l.name === tab)?.entries.length || 0;
                
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "relative pb-2.5 text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-1.5",
                      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span>{tab}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-sm font-bold",
                      isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    )}>
                      {count}
                    </span>
                    {isActive && (
                      <motion.div 
                        layoutId="active-anilist-underline"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Content Grid */}
          <motion.div 
            key={activeTab} // re-trigger animations on tab change
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="pb-24"
          >
            {activeTab === 'Search Results' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {searchResults.map((media) => {
                  const title = media.title.userPreferred || media.title.english || media.title.romaji;
                  return (
                    <motion.div variants={itemVariants} key={media.id}>
                      <AniListBookCard
                        id={media.id.toString()}
                        title={title}
                        format={media.format}
                        coverUrl={media.coverImage.extraLarge || media.coverImage.large}
                        score={media.averageScore}
                        onClick={() => handleRawEntryClick(media)}
                      />
                    </motion.div>
                  );
                })}
              </div>
            ) : activeTab === 'Top Manga' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {topManga.map((media) => {
                  const title = media.title.userPreferred || media.title.english || media.title.romaji;
                  return (
                    <motion.div variants={itemVariants} key={media.id}>
                      <AniListBookCard
                        id={media.id.toString()}
                        title={title}
                        format={media.format}
                        coverUrl={media.coverImage.extraLarge || media.coverImage.large}
                        score={media.averageScore}
                        onClick={() => handleRawEntryClick(media)}
                      />
                    </motion.div>
                  );
                })}
              </div>
            ) : !currentListGroup || currentListGroup.entries.length === 0 ? (
              <motion.div variants={itemVariants} className="flex flex-col items-center justify-center h-[300px] text-center space-y-4">
                <div className="w-20 h-20 bg-secondary/30 rounded-full flex items-center justify-center mb-2 shadow-inner border border-white/5">
                  <LayoutGrid className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-xl font-bold text-foreground">Nothing here yet</h3>
                <p className="text-muted-foreground text-sm max-w-[250px]">
                  You don't have any manga in your "{activeTab}" list. Try searching for something new!
                </p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {currentListGroup.entries.map((entry) => {
                  const manga = entry.media;
                  const title = manga.title.userPreferred || manga.title.english || manga.title.romaji;
                  const progress = entry.progress;
                  const total = manga.chapters;
                  
                  return (
                    <motion.div variants={itemVariants} key={entry.id}>
                      <AniListBookCard
                        id={entry.id.toString()}
                        title={title}
                        format={manga.format}
                        coverUrl={manga.coverImage.extraLarge || manga.coverImage.large}
                        score={entry.score || manga.averageScore}
                        progress={progress}
                        total={total}
                        status={entry.status}
                        onClick={() => handleEntryClick(entry)}
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {isDetailsOpen && (selectedEntry || selectedRawMedia) && (
          <AniListMangaDetailsView 
            key={selectedEntry ? selectedEntry.media.id : selectedRawMedia!.id}
            mediaId={selectedEntry ? selectedEntry.media.id : selectedRawMedia!.id}
            initialEntry={selectedEntry || undefined}
            onClose={() => setIsDetailsOpen(false)}
            onUpdate={handleDetailsUpdate}
            onOpenMedia={handleOpenMediaId}
            onSearchOnlineManga={handleSearchOnlineManga}
            onSearchTorbox={handleSearchTorbox}
          />
        )}
      </AnimatePresence>
      {/* Profile Details Dialog/Overlay */}
      <AnimatePresence>
        {showProfileView && user && (
          <AniListUserProfileView onClose={() => setShowProfileView(false)} user={user} collection={collection} />
        )}
      </AnimatePresence>
    </div>
  );
}
