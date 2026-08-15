import { useEffect, useState, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import {
  getViewer,
  getMediaListShelf,
  AnilistUser,
  AnilistMediaListShelf,
  AnilistMediaList,
  AnilistMedia,
  searchMedia,
  safeUpdateMediaListEntry,
  getTopManga
} from '@/lib/anilist';
import { api } from '@/lib/tauri';
import { Loader2, BookOpen, AlertTriangle, RefreshCw, Search, CheckCircle2, Star, DownloadCloud, ArrowUpDown } from 'lucide-react';
import { AniListBookCard } from './AniListBookCard';
import { AniListMangaDetailsView } from './AniListMangaDetailsView';
import { AniListUserProfileView } from './AniListUserProfileView';
import { AniListImportDialog } from './AniListImportDialog';
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
  const [shelf, setShelf] = useState<AnilistMediaListShelf | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('Reading');
  const [selectedEntry, setSelectedEntry] = useState<AnilistMediaList | null>(null);
  const [selectedRawMedia, setSelectedRawMedia] = useState<AnilistMedia | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showProfileView, setShowProfileView] = useState(false);
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'score' | 'title' | 'progress'>('default');
  
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

        const lists = await getMediaListShelf(viewer.id, anilistToken);
        setShelf(lists);
        
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
    if (shelf) {
      for (const list of shelf.lists) {
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
      const lists = await getMediaListShelf(viewer.id, anilistToken);
      setShelf(lists);
    } catch (err) {
      showErrorToast('Update Failed', String(err));
    }
  };

  const handleSyncLibrary = async () => {
    if (!anilistToken) return;
    setSyncingLibrary(true);
    try {
      // Page through the library instead of pulling up to 10k books in one
      // giant IPC payload. The sync loops over every book anyway.
      const PAGE_SIZE = 200;
      const allLibraryBooks: Awaited<ReturnType<typeof api.searchBooks>>['books'] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await api.searchBooks({ limit: PAGE_SIZE, offset });
        allLibraryBooks.push(...page.books);
        if (allLibraryBooks.length >= page.total || page.books.length === 0) break;
      }
      const allBooks = allLibraryBooks.filter(b => 
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
    if (!shelf) return [];
    const defaultTabs = ['Reading', 'Completed', 'Planning', 'Dropped'];
    const availableLists = shelf.lists.filter(list => !list.isCustomList).map(l => l.name);
    const allTabs = defaultTabs.filter(t => availableLists.includes(t)).concat(availableLists.filter(t => !defaultTabs.includes(t)));
    if (topManga.length > 0) {
      allTabs.unshift('Top Manga');
    }
    if (searchResults.length > 0) {
      allTabs.unshift('Search Results');
    }
    return allTabs;
  }, [shelf, searchResults, topManga]);
  
  useEffect(() => {
      if (tabs.length > 0 && !tabs.includes(activeTab)) {
          setActiveTab(tabs[0]);
      }
  }, [tabs, activeTab]);

  const currentListGroup = shelf?.lists.find(l => l.name === activeTab);
  
  const sortedEntries = useMemo(() => {
    if (!currentListGroup) return [];
    const entries = [...currentListGroup.entries];
    if (sortBy === 'score') {
      entries.sort((a, b) => (b.score || b.media.averageScore || 0) - (a.score || a.media.averageScore || 0));
    } else if (sortBy === 'title') {
      entries.sort((a, b) => {
        const titleA = a.media.title.userPreferred || a.media.title.english || '';
        const titleB = b.media.title.userPreferred || b.media.title.english || '';
        return titleA.localeCompare(titleB);
      });
    } else if (sortBy === 'progress') {
      entries.sort((a, b) => (b.progress || 0) - (a.progress || 0));
    }
    return entries;
  }, [currentListGroup, sortBy]);

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
  
  // Calculate Stats
  let totalChaptersRead = 0;
  let totalScore = 0;
  let scoredCount = 0;
  let completedCount = 0;
  
  if (shelf) {
    shelf.lists.forEach(list => {
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
  if (!heroImage && shelf) {
    const readingList = shelf.lists.find(l => l.name === 'Reading' || l.name === 'CURRENT');
    if (readingList && readingList.entries.length > 0) {
        const media = readingList.entries[0].media;
        heroImage = media.bannerImage || media.coverImage.extraLarge || media.coverImage.large;
    }
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden relative">
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {/* Dynamic Hero Section */}
        <div className="relative w-full h-[200px] md:h-[280px] overflow-hidden">
          {/* Background Image (Cover/Banner) */}
          {heroImage ? (
             <motion.img 
               initial={{ scale: 1.05, opacity: 0 }}
               animate={{ scale: 1, opacity: 0.75 }}
               transition={{ duration: 1.2, ease: 'easeOut' }}
               src={heroImage} 
               alt="Hero Background" 
               className="absolute inset-0 w-full h-full object-cover pointer-events-none"
               style={{ objectPosition: 'center 35%' }}
             />
          ) : (
             <div className="absolute inset-0 bg-gradient-to-r from-primary/25 via-card to-background" />
          )}
          
          {/* Multi-stage Ambient Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent pointer-events-none" />
        </div>

        {/* Profile Info Bar */}
        <div className="max-w-[1400px] mx-auto w-full px-4 md:px-8 relative z-20">
          <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-4 -mt-16 md:-mt-20 mb-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex flex-col md:flex-row items-center md:items-end gap-5 w-full"
            >
              {user && (
                <button 
                  className="relative shrink-0 transition-transform active:scale-95 hover:scale-105 cursor-pointer select-none"
                  onClick={() => setShowProfileView(true)}
                  title="View Profile Details"
                >
                  <img 
                    src={user.avatar.large || user.avatar.medium} 
                    alt={user.name} 
                    className="w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-card shadow-xl object-cover ring-2 ring-primary/30 ring-offset-2 ring-offset-background" 
                  />
                </button>
              )}
              <div className="flex flex-col text-center md:text-left mb-1">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
                  {user ? user.name : 'AniList Dashboard'}
                </h1>
                
                {/* Compact Glass Pill Stats */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2.5">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card/80 backdrop-blur-md border border-border/60 shadow-xs text-xs font-bold text-foreground" title="Chapters Read">
                    <BookOpen size={13} className="text-primary" />
                    <span>{totalChaptersRead}</span>
                    <span className="text-[10px] text-muted-foreground uppercase font-extrabold tracking-wider">Chapters</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card/80 backdrop-blur-md border border-border/60 shadow-xs text-xs font-bold text-foreground" title="Completed Series">
                    <CheckCircle2 size={13} className="text-primary" />
                    <span>{completedCount}</span>
                    <span className="text-[10px] text-muted-foreground uppercase font-extrabold tracking-wider">Completed</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card/80 backdrop-blur-md border border-border/60 shadow-xs text-xs font-bold text-foreground" title="Mean Score">
                    <Star size={13} className="text-amber-400 fill-amber-400" />
                    <span>{meanScore}</span>
                    <span className="text-[10px] text-muted-foreground uppercase font-extrabold tracking-wider">Score</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Quick Actions (Sync & Search) */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto mb-1"
            >
              <form onSubmit={handleDashboardSearch} className="relative w-full sm:w-56 md:w-64 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search AniList..." 
                  value={dashboardSearch}
                  onChange={e => setDashboardSearch(e.target.value)}
                  className="w-full bg-card/80 border border-border/60 hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground/70 rounded-full py-2 pl-9 pr-4 text-xs font-semibold shadow-xs transition-all outline-none"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                )}
              </form>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSortBy(prev => prev === 'default' ? 'score' : prev === 'score' ? 'title' : prev === 'title' ? 'progress' : 'default')}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full bg-card/80 hover:bg-card border border-border/60 hover:border-primary/50 text-foreground shadow-xs text-xs font-bold transition-all hover:scale-102 active:scale-98 cursor-pointer select-none"
                  title={`Sorted by: ${sortBy === 'default' ? 'Default' : sortBy === 'score' ? 'Top Score' : sortBy === 'title' ? 'Title A-Z' : 'Most Progress'}`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-primary" />
                  <span className="capitalize">{sortBy === 'default' ? 'Sort' : sortBy}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowImportDialog(true)}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-card/80 hover:bg-card border border-border/60 hover:border-primary/50 text-foreground shadow-xs text-xs font-bold transition-all hover:scale-102 active:scale-98 cursor-pointer select-none"
                >
                  <DownloadCloud className="w-4 h-4 text-primary" />
                  <span>Import</span>
                </button>
                
                <button 
                  type="button"
                  onClick={handleSyncLibrary}
                  disabled={syncingLibrary}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-card/80 hover:bg-card border border-border/60 hover:border-primary/50 text-foreground shadow-xs text-xs font-bold transition-all hover:scale-102 active:scale-98 cursor-pointer disabled:opacity-50 select-none"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5 text-primary", syncingLibrary && "animate-spin")} />
                  <span>{syncingLibrary ? `${syncProgress.current}/${syncProgress.total}` : "Sync"}</span>
                </button>
              </div>
            </motion.div>
          </div>
          
          {/* Segmented Tabs (Clean Theme-Aware Pill Switcher) */}
          {tabs.length > 0 && (
            <div className="flex gap-2 overflow-x-auto p-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden mb-6 select-none shrink-0">
              {tabs.map((tab) => {
                const isActive = activeTab === tab;
                let count = 0;
                if (tab === 'Search Results') count = searchResults.length;
                else if (tab === 'Top Manga') count = topManga.length;
                else count = shelf?.lists.find(l => l.name === tab)?.entries.length || 0;
                
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "relative px-4 py-2 text-xs sm:text-sm font-extrabold transition-colors whitespace-nowrap flex items-center gap-2 rounded-full select-none cursor-pointer shrink-0",
                      isActive ? "text-primary-foreground font-bold" : "bg-card/80 hover:bg-card border border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground shadow-xs"
                    )}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="active-anilist-tab-pill"
                        className="absolute inset-0 bg-primary rounded-full shadow-md shadow-primary/25 z-0"
                        transition={{ type: "spring", stiffness: 450, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10">{tab}</span>
                    <span className={cn(
                      "relative z-10 text-[10px] font-extrabold font-mono px-2 py-0.5 rounded-full transition-colors",
                      isActive 
                        ? "bg-primary-foreground/20 text-primary-foreground" 
                        : "bg-primary/15 text-primary border border-primary/20"
                    )}>
                      {count}
                    </span>
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
              <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 md:gap-6">
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
              <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 md:gap-6">
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
            ) : !currentListGroup || sortedEntries.length === 0 ? (
              <motion.div variants={itemVariants} className="flex flex-col items-center justify-center min-h-[320px] p-8 text-center space-y-4 max-w-md mx-auto rounded-3xl bg-card/40 border border-border/40 backdrop-blur-md shadow-xs my-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-1 text-primary">
                  <BookOpen className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-extrabold text-foreground">No manga in "{activeTab}"</h3>
                <p className="text-muted-foreground text-xs leading-relaxed max-w-[280px]">
                  You don't have any manga saved under this shelf status yet. Explore top titles or search online to add!
                </p>
                {topManga.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('Top Manga')}
                    className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:scale-102 active:scale-98 transition-all cursor-pointer mt-2"
                  >
                    Browse Top Manga
                  </button>
                )}
              </motion.div>
            ) : (
              <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 md:gap-6">
                {sortedEntries.map((entry) => {
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
          <AniListUserProfileView onClose={() => setShowProfileView(false)} user={user} shelf={shelf} />
        )}
      </AnimatePresence>

      <AniListImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        shelf={shelf}
        anilistToken={anilistToken}
      />
    </div>
  );
}
