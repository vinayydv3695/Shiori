import { useEffect, useState, useMemo } from 'react';
import { usePreferencesStore } from '@/store/preferencesStore';
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
  safeUpdateMediaListEntry
} from '@/lib/anilist';
import { api } from '@/lib/tauri';
import { Loader2, BookOpen, AlertTriangle, RefreshCw, Search, ListOrdered, Activity, CheckCircle2, LayoutGrid } from 'lucide-react';
import { ModernBookCard } from './ModernBookCard';
import { AniListMangaDetailsView } from './AniListMangaDetailsView';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/store/toastStore';
import { motion, AnimatePresence } from 'framer-motion';

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

const cardHover = {
  y: -4,
  transition: { duration: 0.2, ease: 'easeOut' as const },
};

export function AniListDashboard() {
  const anilistToken = usePreferencesStore(state => state.preferences?.anilistToken);
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
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [searchResults, setSearchResults] = useState<AnilistMedia[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
            } catch (err) {
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
            } catch (err) {
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
    if (searchResults.length > 0) {
      allTabs.unshift('Search Results');
    }
    return allTabs;
  }, [collection, searchResults]);
  
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
          To view your AniList library, please go to Settings &gt; Integrations and enter your AniList API token.
        </p>
        <Button onClick={() => document.getElementById('settings-dialog-trigger')?.click()}>
          Open Settings
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-muted-foreground font-medium">Syncing with AniList...</p>
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
  let totalEntries = 0;
  let readingCount = 0;
  let completedCount = 0;
  
  if (collection) {
    collection.lists.forEach(list => {
      totalEntries += list.entries.length;
      if (list.name === 'Reading' || list.name === 'CURRENT') readingCount += list.entries.length;
      if (list.name === 'Completed' || list.name === 'COMPLETED') completedCount += list.entries.length;
    });
  }

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
    <div className="h-full flex flex-col bg-background/50 overflow-hidden relative">
      <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
        {/* Dynamic Hero Section */}
        <div className="relative w-full h-[280px] md:h-[320px] overflow-hidden rounded-b-[2.5rem]">
          {/* Background Image with Parallax & Blur */}
          {heroImage ? (
             <motion.img 
               initial={{ scale: 1.1, opacity: 0 }}
               animate={{ scale: 1, opacity: 0.4 }}
               transition={{ duration: 1.5, ease: 'easeOut' }}
               src={heroImage} 
               alt="Hero Background" 
               className="absolute inset-0 w-full h-full object-cover blur-3xl pointer-events-none scale-110"
             />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-background to-background" />
          )}
          
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

          {/* Hero Content */}
          <div className="absolute inset-0 flex flex-col md:flex-row items-end md:items-center justify-between p-6 md:p-12 pb-8 max-w-[1400px] mx-auto w-full gap-6">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex items-center gap-6"
            >
              {user && (
                <div className="relative">
                  <img src={user.avatar.large || user.avatar.medium} alt={user.name} className="w-20 h-20 md:w-28 md:h-28 rounded-full ring-4 ring-background shadow-2xl object-cover relative z-10" />
                  <div className="absolute inset-[-4px] bg-gradient-to-tr from-primary to-purple-500 rounded-full blur-md opacity-50 z-0"></div>
                </div>
              )}
              <div className="flex flex-col">
                <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent drop-shadow-sm">
                  {user ? `${user.name}` : 'AniList Dashboard'}
                </h1>
                <p className="text-sm md:text-base font-medium text-muted-foreground mt-2 flex items-center gap-2">
                  <BookOpen size={16} className="text-primary/70" /> My Manga Library
                </p>
              </div>
            </motion.div>

            {/* Quick Actions (Sync & Search) */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col items-end gap-3 w-full md:w-auto"
            >
              <form onSubmit={handleDashboardSearch} className="relative w-full md:w-64 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search AniList..." 
                  value={dashboardSearch}
                  onChange={e => setDashboardSearch(e.target.value)}
                  className="w-full bg-background/40 backdrop-blur-md border border-white/10 rounded-full py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground shadow-sm"
                />
                {isSearching && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                )}
              </form>
              <Button 
                variant="secondary" 
                onClick={handleSyncLibrary} 
                disabled={syncingLibrary}
                className="w-full md:w-auto gap-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all border border-indigo-500/20 rounded-full font-semibold shadow-sm"
              >
                <RefreshCw className={cn("w-4 h-4", syncingLibrary && "animate-spin")} />
                {syncingLibrary 
                  ? `Syncing... ${syncProgress.current}/${syncProgress.total}`
                  : "Sync Local Library"}
              </Button>
            </motion.div>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto w-full px-4 md:px-8 -mt-6 relative z-20">
          
          {/* Quick Stats Row */}
          <motion.div 
             variants={containerVariants}
             initial="hidden"
             animate="show"
             className="grid grid-cols-3 gap-4 mb-8"
          >
            <motion.div variants={itemVariants} className="bg-background/60 backdrop-blur-xl border border-white/5 rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-lg hover:bg-background/80 transition-colors">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <ListOrdered size={20} />
              </div>
              <div>
                <div className="text-xl md:text-2xl font-bold tabular-nums tracking-tight text-foreground">{totalEntries}</div>
                <div className="text-xs md:text-sm font-medium text-muted-foreground">Total Entries</div>
              </div>
            </motion.div>
            
            <motion.div variants={itemVariants} className="bg-background/60 backdrop-blur-xl border border-white/5 rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-lg hover:bg-background/80 transition-colors">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                <Activity size={20} />
              </div>
              <div>
                <div className="text-xl md:text-2xl font-bold tabular-nums tracking-tight text-foreground">{readingCount}</div>
                <div className="text-xs md:text-sm font-medium text-muted-foreground">Reading</div>
              </div>
            </motion.div>
            
            <motion.div variants={itemVariants} className="bg-background/60 backdrop-blur-xl border border-white/5 rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-lg hover:bg-background/80 transition-colors">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div className="text-xl md:text-2xl font-bold tabular-nums tracking-tight text-foreground">{completedCount}</div>
                <div className="text-xs md:text-sm font-medium text-muted-foreground">Completed</div>
              </div>
            </motion.div>
          </motion.div>

          {/* Segmented Tabs */}
          {tabs.length > 0 && (
            <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-8 p-1.5 bg-secondary/30 backdrop-blur-md rounded-2xl border border-white/5 inline-flex">
              {tabs.map((tab) => {
                const isActive = activeTab === tab;
                const count = collection?.lists.find(l => l.name === tab)?.entries.length || 0;
                
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "relative px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2",
                      isActive ? "text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="active-anilist-tab"
                        className="absolute inset-0 bg-primary rounded-xl -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10">{tab}</span>
                    <span className={cn(
                      "relative z-10 text-[11px] px-1.5 py-0.5 rounded-md",
                      isActive ? "bg-black/20 text-white" : "bg-muted text-muted-foreground"
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 md:gap-6">
                {searchResults.map((media) => {
                  const title = media.title.userPreferred || media.title.english || media.title.romaji;
                  return (
                    <motion.div variants={itemVariants} key={media.id}>
                      <ModernBookCard
                        id={media.id.toString()}
                        title={title}
                        author={media.format}
                        coverUrl={media.coverImage.extraLarge || media.coverImage.large}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 md:gap-6">
                {currentListGroup.entries.map((entry) => {
                  const manga = entry.media;
                  const title = manga.title.userPreferred || manga.title.english || manga.title.romaji;
                  const progress = entry.progress;
                  const total = manga.chapters;
                  
                  return (
                    <motion.div variants={itemVariants} key={entry.id} className="relative group">
                      <ModernBookCard
                        id={entry.id.toString()}
                        title={title}
                        author={manga.format}
                        coverUrl={manga.coverImage.extraLarge || manga.coverImage.large}
                        onClick={() => handleEntryClick(entry)}
                      />
                      {/* Floating Progress Badge */}
                      {(activeTab === 'Reading' || activeTab === 'CURRENT' || progress > 0) && (
                         <div className="absolute top-3 right-3 z-30 pointer-events-none transition-transform group-hover:scale-105">
                           <div className="bg-black/70 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg border border-white/10 flex items-center gap-1">
                             <BookOpen size={10} className="opacity-80" />
                             {progress}{total ? ` / ${total}` : ''}
                           </div>
                         </div>
                      )}
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
    </div>
  );
}

