import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  X, 
  BookPlus, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Check, 
  Layers, 
  BookOpen, 
  Loader2,
  Star,
  CheckCheck,
  RotateCcw,
  LayoutGrid,
  List
} from 'lucide-react';
import { AniListIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { AnilistMediaListShelf, AnilistMediaList } from '@/lib/anilist';
import { api, isAndroid, type Book } from '@/lib/tauri';
import { isErrorKind } from '@/lib/errors';
import { useTombstoneConfirm } from '@/hooks/useTombstoneConfirm';
import { pluginApi } from '@/lib/pluginSources';
import { toast } from '@/store/toastStore';
import { motion, AnimatePresence } from 'framer-motion';

interface AniListImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shelf: AnilistMediaListShelf | null;
  anilistToken: string | null;
}

interface ImportableItem {
  entry: AnilistMediaList;
  status: 'reading' | 'planning' | 'completed' | 'paused' | 'dropped';
  listName: string;
}

export function AniListImportDialog({ isOpen, onClose, shelf, anilistToken }: AniListImportDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
  const [statusText, setStatusText] = useState('');
  const [activeItem, setActiveItem] = useState<{ title: string; cover?: string } | null>(null);
  const [completedMap, setCompletedMap] = useState<Map<number, boolean>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListFilter, setSelectedListFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const cancelRef = useRef(false);

  const { confirmTombstones, tombstoneDialog } = useTombstoneConfirm();

  // Extract all eligible entries from user's shelf
  const allEntries = useMemo<ImportableItem[]>(() => {
    if (!shelf || !shelf.lists) return [];
    
    let entries: ImportableItem[] = [];
    
    for (const list of shelf.lists) {
      const lowerName = list.name.toLowerCase();
      let shioriStatus: 'reading' | 'planning' | 'completed' | 'paused' | 'dropped' = 'planning';
      
      if (lowerName.includes('reading') || lowerName.includes('current')) {
        shioriStatus = 'reading';
      } else if (lowerName.includes('plan')) {
        shioriStatus = 'planning';
      } else if (lowerName.includes('completed')) {
        shioriStatus = 'completed';
      } else if (lowerName.includes('paused') || lowerName.includes('hold')) {
        shioriStatus = 'paused';
      } else if (lowerName.includes('dropped')) {
        shioriStatus = 'dropped';
      }

      const listEntries: ImportableItem[] = (list.entries || []).map(e => ({
        entry: e,
        status: shioriStatus,
        listName: list.name,
      }));
      
      entries = entries.concat(listEntries);
    }
    
    // De-duplicate by media ID
    const seen = new Set<number>();
    const unique: ImportableItem[] = [];
    for (const item of entries) {
      if (!seen.has(item.entry.media.id)) {
        seen.add(item.entry.media.id);
        unique.push(item);
      }
    }

    return unique.sort((a, b) => {
      const titleA = a.entry.media.title.userPreferred || a.entry.media.title.english || a.entry.media.title.romaji || '';
      const titleB = b.entry.media.title.userPreferred || b.entry.media.title.english || b.entry.media.title.romaji || '';
      return titleA.localeCompare(titleB);
    });
  }, [shelf]);

  // Selected items list
  const selectedItemsToImport = useMemo(() => {
    return allEntries.filter(e => selectedIds.has(e.entry.media.id));
  }, [allEntries, selectedIds]);

  // Available list tabs for filter pills
  const availableLists = useMemo(() => {
    const lists = new Set<string>();
    for (const item of allEntries) {
      lists.add(item.listName);
    }
    return Array.from(lists);
  }, [allEntries]);

  // Filter entries based on search and list filter
  const filteredEntries = useMemo(() => {
    return allEntries.filter(item => {
      if (selectedListFilter !== 'all' && item.listName !== selectedListFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const romaji = (item.entry.media.title.romaji || '').toLowerCase();
        const english = (item.entry.media.title.english || '').toLowerCase();
        const native = (item.entry.media.title.native || '').toLowerCase();
        const userPref = (item.entry.media.title.userPreferred || '').toLowerCase();
        return romaji.includes(q) || english.includes(q) || native.includes(q) || userPref.includes(q);
      }
      return true;
    });
  }, [allEntries, selectedListFilter, searchQuery]);

  // Initial selection when opening
  useEffect(() => {
    if (isOpen) {
      setIsImporting(false);
      setProgress({ current: 0, total: 0, successes: 0, failures: 0 });
      setStatusText('');
      setActiveItem(null);
      setCompletedMap(new Map());
      setSearchQuery('');
      setSelectedListFilter('all');
      cancelRef.current = false;
      
      const initialSelected = new Set<number>();
      for (const item of allEntries) {
        if (item.status === 'reading' || item.status === 'planning') {
          initialSelected.add(item.entry.media.id);
        }
      }
      setSelectedIds(initialSelected.size > 0 ? initialSelected : new Set(allEntries.map(e => e.entry.media.id)));
    }
  }, [isOpen, allEntries]);

  const toggleSelect = (id: number) => {
    if (isImporting) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (isImporting) return;
    const allFilteredIds = filteredEntries.map(e => e.entry.media.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      allFilteredIds.forEach(id => next.add(id));
      return next;
    });
  };

  const deselectAll = () => {
    if (isImporting) return;
    const allFilteredIds = new Set(filteredEntries.map(e => e.entry.media.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      allFilteredIds.forEach(id => next.delete(id));
      return next;
    });
  };

  /** Add a book, offering to forget the tombstone and retry once if it was previously deleted. */
  const addBookWithTombstoneRetry = async (book: Book): Promise<boolean> => {
    try {
      await api.addBook(book);
      return true;
    } catch (err) {
      if (!isErrorKind(err, 'tombstoned') || !book.file_path) {
        throw err;
      }
      const importAnyway = await confirmTombstones([book.file_path]);
      if (!importAnyway) {
        return false;
      }
      await api.clearTombstone(book.file_path);
      await api.addBook(book);
      return true;
    }
  };

  /** Helper to search multiple online manga sources with timeout protection and title fallbacks */
  const searchMangaOnline = async (candidateTitles: string[]): Promise<{ sourceId: string; resultId: string; coverUrl?: string } | null> => {
    // Prioritize MangaDex on desktop, MangaFire on Android
    const sources = isAndroid
      ? ['mangafire', 'toongod', 'manhwaread']
      : ['mangadex', 'mangafire', 'toongod', 'manhwaread'];
    
    for (const sourceId of sources) {
      for (const title of candidateTitles) {
        if (!title || !title.trim()) continue;
        try {
          const searchPromise = pluginApi.search(sourceId, title.trim(), 1);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`${sourceId} timeout`)), 4500)
          );
          
          const results = await Promise.race([searchPromise, timeoutPromise]);
          if (results && results.length > 0) {
            const match = results[0];
            return {
              sourceId,
              resultId: match.id,
              coverUrl: match.cover_url || match.coverUrl,
            };
          }
        } catch {
          // Fall through to next candidate or next source
        }
      }
    }
    return null;
  };

  const handleStartImport = async () => {
    const itemsToImport = allEntries.filter(e => selectedIds.has(e.entry.media.id));
    if (itemsToImport.length === 0) return;
    
    setIsImporting(true);
    cancelRef.current = false;
    setProgress({ total: itemsToImport.length, current: 0, successes: 0, failures: 0 });
    setCompletedMap(new Map());
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < itemsToImport.length; i++) {
      if (cancelRef.current) {
        setStatusText('Import cancelled.');
        break;
      }

      const { entry, status } = itemsToImport[i];
      const userPref = entry.media.title.userPreferred || '';
      const english = entry.media.title.english || '';
      const romaji = entry.media.title.romaji || '';
      const native = entry.media.title.native || '';

      const titleCandidates = Array.from(new Set([userPref, english, romaji, native].filter(Boolean)));
      const displayTitle = userPref || english || romaji || 'Unknown Title';
      const cover = entry.media.coverImage?.extraLarge || entry.media.coverImage?.large || entry.media.coverImage?.medium;
      
      setActiveItem({ title: displayTitle, cover });
      setStatusText(`Searching sources for "${displayTitle}"...`);
      setProgress(p => ({ ...p, current: i + 1 }));
      
      let wasSuccess = false;
      try {
        const match = await searchMangaOnline(titleCandidates);
        
        if (match) {
          setStatusText(`Adding "${displayTitle}" (${match.sourceId})...`);

          const book: Book = {
            uuid: crypto.randomUUID(),
            title: displayTitle,
            file_path: `online-manga://${match.sourceId}/${match.resultId}`, 
            file_format: 'online-manga',
            cover_path: cover || match.coverUrl,
            domain: 'manga',
            reading_status: status,
            anilist_id: entry.media.id.toString(),
            notes: entry.media.description,
            added_date: new Date().toISOString(),
            modified_date: new Date().toISOString(),
            language: 'en',
            is_favorite: false
          };

          try {
            const added = await addBookWithTombstoneRetry(book);
            if (added) {
              successCount++;
              wasSuccess = true;
            } else {
              failCount++;
            }
          } catch {
            toast.error(`Error importing ${displayTitle}`);
            failCount++;
          }
        } else {
          console.warn(`No online match found across sources for ${displayTitle}`);
          failCount++;
        }
      } catch (err) {
        console.error(`Failed to import ${displayTitle}:`, err);
        failCount++;
      }

      setCompletedMap(prev => new Map(prev).set(entry.media.id, wasSuccess));
      setProgress(p => ({ ...p, successes: successCount, failures: failCount }));
      await new Promise(r => setTimeout(r, 400));
    }
    
    setActiveItem(null);
    setStatusText(`Sync complete! ${successCount} titles added, ${failCount} skipped.`);
    setTimeout(() => {
      if (!cancelRef.current) {
        onClose();
      }
    }, 1800);
  };

  const handleCancelImport = () => {
    cancelRef.current = true;
    setIsImporting(false);
    onClose();
  };

  const selectedCount = selectedIds.size;
  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const remainingCount = Math.max(0, progress.total - progress.current);

  return (
    <>
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && !isImporting && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl translate-x-[-50%] translate-y-[-50%] border border-border/70 bg-card text-card-foreground p-0 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 md:px-8 border-b border-border/50 bg-card/80 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-[#02A9FF]/10 border border-[#02A9FF]/20 flex items-center justify-center text-[#02A9FF] shadow-xs shrink-0">
                <AniListIcon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-xl sm:text-2xl font-black text-foreground tracking-tight truncate">
                  Import from AniList
                </Dialog.Title>
                <Dialog.Description className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5 truncate">
                  {isImporting 
                    ? `Syncing ${progress.current} of ${progress.total} titles into library...`
                    : `Sync online manga titles directly into your library`
                  }
                </Dialog.Description>
              </div>
            </div>

            <Dialog.Close 
              disabled={isImporting} 
              className="w-10 h-10 rounded-full bg-secondary/60 hover:bg-secondary text-foreground/80 hover:text-foreground border border-border/50 flex items-center justify-center transition-all disabled:opacity-30 shrink-0 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {/* Main Body */}
          <div className="flex-1 overflow-y-auto min-h-0 p-5 sm:p-6 md:p-8 space-y-5 overscroll-contain custom-scrollbar">
            {!isImporting ? (
              <>
                {/* Search & Filter Controls Bar */}
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search manga by title..."
                      className="w-full pl-11 pr-10 py-3 rounded-2xl bg-secondary/40 border border-border/60 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all shadow-2xs"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* List Filter Tabs & Bulk Actions */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
                      <button
                        onClick={() => setSelectedListFilter('all')}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          selectedListFilter === 'all'
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'bg-secondary/60 text-muted-foreground hover:text-foreground border border-border/50'
                        }`}
                      >
                        All ({allEntries.length})
                      </button>
                      {availableLists.map(listName => {
                        const count = allEntries.filter(e => e.listName === listName).length;
                        return (
                          <button
                            key={listName}
                            onClick={() => setSelectedListFilter(listName)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                              selectedListFilter === listName
                                ? 'bg-primary text-primary-foreground shadow-xs'
                                : 'bg-secondary/60 text-muted-foreground hover:text-foreground border border-border/50'
                            }`}
                          >
                            {listName} ({count})
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        onClick={selectAll}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-secondary/40 hover:bg-secondary/80 text-foreground border border-border/50 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCheck className="w-3.5 h-3.5 text-primary" />
                        <span>Select All</span>
                      </button>
                      <button
                        onClick={deselectAll}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-secondary/40 hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border/50 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Deselect All</span>
                      </button>

                      {/* View Mode Toggle */}
                      <div className="flex items-center p-0.5 rounded-xl bg-secondary/60 border border-border/50 ml-1">
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                            viewMode === 'grid' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                          }`}
                          title="Grid View"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setViewMode('list')}
                          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                            viewMode === 'list' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                          }`}
                          title="List View"
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Manga Items: Large Poster Grid or Compact List */}
                <div className="max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
                  {filteredEntries.length > 0 ? (
                    viewMode === 'grid' ? (
                      /* Large Poster Grid */
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
                        {filteredEntries.map(({ entry, status, listName }) => {
                          const id = entry.media.id;
                          const isSelected = selectedIds.has(id);
                          const title = entry.media.title.userPreferred || entry.media.title.english || entry.media.title.romaji;
                          const cover = entry.media.coverImage?.extraLarge || entry.media.coverImage?.large || entry.media.coverImage?.medium;
                          const averageScore = entry.media.averageScore;

                          return (
                            <div
                              key={id}
                              onClick={() => toggleSelect(id)}
                              className={`group relative flex flex-col rounded-2xl p-2 border transition-all duration-200 cursor-pointer select-none ${
                                isSelected
                                  ? 'bg-secondary/70 border-primary/50 shadow-md ring-2 ring-primary/30 text-foreground'
                                  : 'bg-secondary/20 hover:bg-secondary/40 border-border/40 text-muted-foreground hover:text-foreground opacity-85 hover:opacity-100'
                              }`}
                            >
                              {/* Poster Image Container */}
                              <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-muted/40 shadow-xs border border-border/40">
                                {cover ? (
                                  <img
                                    src={cover}
                                    alt={title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-secondary">
                                    <BookOpen className="w-8 h-8 text-muted-foreground/40" />
                                  </div>
                                )}

                                {/* Bottom Vignette for text contrast */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                                {/* Score Badge (Top-Left) */}
                                {averageScore && averageScore > 0 && (
                                  <div className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-md text-amber-400 text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-white/10 shadow-xs">
                                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                    <span>{averageScore}</span>
                                  </div>
                                )}

                                {/* Checkbox Badge (Top-Right) */}
                                <div className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-lg flex items-center justify-center transition-all shadow-md backdrop-blur-md ${
                                  isSelected
                                    ? 'bg-primary border border-primary text-primary-foreground'
                                    : 'bg-black/60 border border-white/30 text-transparent hover:border-white/60'
                                }`}>
                                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>

                                {/* Status Chip (Inside Poster Bottom) */}
                                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-bold text-white drop-shadow-sm">
                                  <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs flex items-center gap-1 capitalize">
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      status === 'reading' ? 'bg-emerald-400' :
                                      status === 'planning' ? 'bg-sky-400' :
                                      status === 'completed' ? 'bg-purple-400' : 'bg-muted-foreground'
                                    }`} />
                                    <span>{listName}</span>
                                  </span>

                                  {entry.progress > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs">
                                      Ch. {entry.progress}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Title Under Poster */}
                              <div className="pt-2 px-1 pb-0.5">
                                <h4 className="text-xs font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors leading-tight">
                                  {title}
                                </h4>
                                {entry.media.format && (
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase mt-0.5">
                                    {entry.media.format.replace(/_/g, ' ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Detailed List View */
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredEntries.map(({ entry, status, listName }) => {
                          const id = entry.media.id;
                          const isSelected = selectedIds.has(id);
                          const title = entry.media.title.userPreferred || entry.media.title.english || entry.media.title.romaji;
                          const cover = entry.media.coverImage?.large || entry.media.coverImage?.medium;
                          const averageScore = entry.media.averageScore;

                          return (
                            <div
                              key={id}
                              onClick={() => toggleSelect(id)}
                              className={`group relative flex items-center gap-3.5 p-3 rounded-2xl border transition-all duration-150 cursor-pointer select-none ${
                                isSelected
                                  ? 'bg-secondary/70 border-primary/50 shadow-xs text-foreground ring-1 ring-primary/20'
                                  : 'bg-secondary/20 hover:bg-secondary/40 border-border/40 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0 ${
                                isSelected
                                  ? 'bg-primary border-primary text-primary-foreground shadow-2xs'
                                  : 'border-border/70 bg-card/60'
                              }`}>
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>

                              <div className="relative w-14 h-20 rounded-xl overflow-hidden shadow-xs border border-border/50 shrink-0 bg-secondary">
                                {cover ? (
                                  <img src={cover} alt={title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <BookOpen className="w-5 h-5 text-muted-foreground/50" />
                                  </div>
                                )}
                                {averageScore && averageScore > 0 && (
                                  <div className="absolute top-1 left-1 bg-black/75 backdrop-blur-xs text-amber-400 text-[9px] font-black px-1 py-0.5 rounded flex items-center gap-0.5">
                                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                    <span>{averageScore}</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-extrabold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                                  {title}
                                </h4>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-card/90 border border-border/60 text-muted-foreground capitalize flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      status === 'reading' ? 'bg-emerald-500' :
                                      status === 'planning' ? 'bg-sky-500' :
                                      status === 'completed' ? 'bg-purple-500' : 'bg-muted-foreground'
                                    }`} />
                                    <span>{listName}</span>
                                  </span>

                                  {entry.progress > 0 && (
                                    <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                      <Layers className="w-3 h-3 text-primary/70" />
                                      Ch. {entry.progress} {entry.media.chapters ? `/ ${entry.media.chapters}` : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="text-center py-14 px-4 text-muted-foreground flex flex-col items-center gap-2.5">
                      <AlertCircle className="w-9 h-9 text-muted-foreground/40" />
                      <p className="text-base font-bold text-foreground">No manga found</p>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        Try adjusting your search query or list filter.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* State-of-the-Art Live Import Dashboard: Split Showcase + Live Sync Queue */
              <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-stretch w-full min-h-[480px]">
                
                {/* Left Column: Large Hero Cover Showcase */}
                <div className="w-full md:w-[320px] lg:w-[360px] shrink-0 bg-secondary/30 border border-border/60 rounded-3xl p-6 sm:p-7 backdrop-blur-xl shadow-xl flex flex-col items-center justify-between text-center relative overflow-hidden">
                  
                  {/* Active Hero Cover */}
                  <div className="flex flex-col items-center space-y-4 w-full my-auto">
                    <div className="relative group">
                      {activeItem?.cover ? (
                        <motion.img 
                          key={activeItem.cover}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.25 }}
                          src={activeItem.cover} 
                          alt={activeItem.title} 
                          className="w-44 h-64 sm:w-48 sm:h-72 md:w-56 md:h-80 object-cover rounded-2xl shadow-2xl border border-border/70 bg-card" 
                        />
                      ) : (
                        <div className="w-44 h-64 sm:w-48 sm:h-72 md:w-56 md:h-80 rounded-2xl bg-secondary/80 border border-border/70 flex items-center justify-center shadow-2xl">
                          <BookOpen className="w-12 h-12 text-muted-foreground/40" />
                        </div>
                      )}

                      {/* Syncing Badge */}
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-card border border-border px-4 py-1 rounded-full shadow-xl flex items-center gap-2 whitespace-nowrap">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                        <span className="text-xs font-black text-foreground">Syncing Title</span>
                      </div>
                    </div>

                    {/* Active Title & Current Stage */}
                    <div className="pt-3 w-full">
                      <h3 className="text-base sm:text-lg font-black text-foreground line-clamp-2 leading-snug">
                        {activeItem?.title || 'Processing...'}
                      </h3>
                      <p className="text-xs font-semibold text-muted-foreground mt-1.5 truncate">
                        {statusText}
                      </p>
                    </div>
                  </div>

                </div>

                {/* Right Column: Progress Dashboard & Live Sync Queue */}
                <div className="flex-1 min-w-0 flex flex-col justify-between space-y-5">
                  
                  {/* Progress Header & Linear Bar */}
                  <div className="bg-secondary/30 border border-border/60 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-extrabold text-foreground tracking-tight">
                          Sync Progress
                        </h4>
                        <p className="text-xs font-medium text-muted-foreground mt-0.5">
                          Processing <strong className="text-foreground">{progress.current}</strong> of {progress.total} selected titles
                        </p>
                      </div>
                      <span className="font-mono text-xl sm:text-2xl font-black text-foreground">
                        {progressPercent}%
                      </span>
                    </div>

                    {/* Full-width Shimmer Bar */}
                    <div className="w-full h-3.5 rounded-full bg-secondary border border-border/50 overflow-hidden p-0.5 shadow-inner">
                      <motion.div 
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Clean Metric Counters (No sparkle icon!) */}
                    <div className="grid grid-cols-3 gap-2.5 pt-1">
                      <div className="px-3.5 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block uppercase tracking-wider">Added</span>
                        <strong className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">{progress.successes}</strong>
                      </div>
                      <div className="px-3.5 py-2 rounded-2xl bg-secondary/80 border border-border/60 text-center">
                        <span className="text-[10px] font-bold text-muted-foreground block uppercase tracking-wider">Remaining</span>
                        <strong className="text-sm sm:text-base font-black text-foreground font-mono">{remainingCount}</strong>
                      </div>
                      <div className="px-3.5 py-2 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">
                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block uppercase tracking-wider">Skipped</span>
                        <strong className="text-sm sm:text-base font-black text-rose-600 dark:text-rose-400 font-mono">{progress.failures}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Live Import Queue / Item Stream */}
                  <div className="flex-1 bg-secondary/20 border border-border/50 rounded-3xl p-4 sm:p-5 flex flex-col min-h-[220px]">
                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Sync Queue ({selectedItemsToImport.length} titles)
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {progress.successes + progress.failures} completed
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[220px] space-y-2 pt-2.5 pr-1 overscroll-contain custom-scrollbar">
                      {selectedItemsToImport.map((item, index) => {
                        const id = item.entry.media.id;
                        const title = item.entry.media.title.userPreferred || item.entry.media.title.english || item.entry.media.title.romaji;
                        const cover = item.entry.media.coverImage?.large || item.entry.media.coverImage?.medium;
                        const isCurrent = progress.current === index + 1;
                        const isCompleted = completedMap.has(id);
                        const isSuccess = completedMap.get(id);

                        return (
                          <div 
                            key={id}
                            className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-all ${
                              isCurrent
                                ? 'bg-primary/10 border-primary/40 shadow-xs'
                                : isCompleted
                                  ? 'bg-secondary/40 border-border/40 opacity-80'
                                  : 'bg-secondary/15 border-border/30 opacity-50'
                            }`}
                          >
                            {/* Thumbnail */}
                            <div className="w-9 h-12 rounded-lg overflow-hidden border border-border/50 shrink-0 bg-secondary">
                              {cover ? (
                                <img src={cover} alt={title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground/50" />
                                </div>
                              )}
                            </div>

                            {/* Title & Info */}
                            <div className="flex-1 min-w-0">
                              <h5 className={`text-xs sm:text-sm font-bold truncate leading-tight ${isCurrent ? 'text-foreground font-black' : 'text-foreground/90'}`}>
                                {title}
                              </h5>
                              <span className="text-[10px] text-muted-foreground font-medium capitalize mt-0.5 block">
                                {item.listName} • Ch. {item.entry.progress || 0}
                              </span>
                            </div>

                            {/* State Badge */}
                            <div className="shrink-0">
                              {isCurrent ? (
                                <span className="px-2.5 py-1 rounded-xl bg-primary/20 text-primary border border-primary/30 text-[11px] font-bold flex items-center gap-1.5">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Syncing</span>
                                </span>
                              ) : isCompleted ? (
                                isSuccess ? (
                                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center gap-1">
                                    <Check className="w-3 h-3 stroke-[3]" />
                                    <span>Added</span>
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[11px] font-bold flex items-center gap-1">
                                    <X className="w-3 h-3" />
                                    <span>Skipped</span>
                                  </span>
                                )
                              ) : (
                                <span className="px-2 py-0.5 rounded-lg bg-secondary/80 text-muted-foreground border border-border/40 text-[10px] font-medium">
                                  Queued
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between p-5 sm:p-6 md:px-8 border-t border-border/50 bg-card/90 backdrop-blur-md shrink-0 gap-3">
            {!isImporting ? (
              <>
                <div className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  <strong className="text-foreground font-black text-sm sm:text-base">{selectedCount}</strong> of {allEntries.length} titles selected
                </div>

                <div className="flex items-center gap-3">
                  <Button 
                    variant="ghost" 
                    onClick={onClose} 
                    className="rounded-xl px-5 text-xs sm:text-sm font-bold hover:bg-secondary/70 cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleStartImport} 
                    disabled={selectedCount === 0} 
                    className="gap-2 rounded-xl px-6 py-2.5 text-xs sm:text-sm font-bold shadow-md hover:scale-102 active:scale-98 transition-all cursor-pointer"
                  >
                    <BookPlus className="w-4 h-4" />
                    <span>Import Selected ({selectedCount})</span>
                  </Button>
                </div>
              </>
            ) : (
              <div className="w-full flex items-center justify-between">
                <span className="text-xs sm:text-sm text-muted-foreground font-medium flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  Syncing library with AniList...
                </span>
                <Button 
                  variant="outline" 
                  onClick={handleCancelImport}
                  className="rounded-xl px-5 text-xs sm:text-sm font-bold hover:bg-destructive/10 hover:text-destructive border-border/60 cursor-pointer"
                >
                  Cancel Import
                </Button>
              </div>
            )}
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {tombstoneDialog}
    </>
  );
}
