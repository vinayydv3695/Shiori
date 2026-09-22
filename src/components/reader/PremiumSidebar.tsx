import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { useReaderUIStore } from '@/store/premiumReaderStore';
import { api, isAndroid } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import type { TocEntry, Annotation, BookSearchResult, AnnotationCategory } from '@/lib/tauri';
import { X, BookOpen, Highlighter, FileText, Search, Loader2, Trash2, Edit2, Download, Bookmark } from '@/components/icons';
import { StickyNote, ListTree, SearchX, Brain, BookA, Languages, Quote, ChevronRight, History, Volume2 } from 'lucide-react';
import { SidebarAICopilot } from './SidebarAICopilot';
import { parseTocLocationToIndex, findCurrentTocEntry } from '@/lib/toc';
import { notifyAnnotationsChanged } from '@/lib/annotationEvents';
import DOMPurify from 'dompurify';
import { useToastStore } from '@/store/toastStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useAIStore } from '@/store/aiStore';

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fbbf24' },
  { name: 'Green', value: '#34d399' },
  { name: 'Blue', value: '#60a5fa' },
  { name: 'Pink', value: '#f472b6' },
  { name: 'Purple', value: '#a78bfa' },
  { name: 'Orange', value: '#fb923c' },
  { name: 'Red', value: '#f87171' },
  { name: 'Teal', value: '#2dd4bf' },
];

interface SidebarEmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
}

function SidebarEmptyState({
  icon: Icon,
  title,
  description,
}: SidebarEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="premium-sidebar-empty-container"
    >
      <div className="premium-sidebar-empty-icon-wrapper">
        <div className="premium-sidebar-empty-glow" />
        <div className="premium-sidebar-empty-icon-box">
          <Icon className="premium-sidebar-empty-icon" />
        </div>
      </div>

      <h4 className="premium-sidebar-empty-title">{title}</h4>
      <p className="premium-sidebar-empty-desc">{description}</p>
    </motion.div>
  );
}

interface PremiumSidebarProps {
  bookId: number;
  currentIndex: number;
  onNavigate: (chapterIndex: number, searchTerm?: string | null) => void;
}

/** Highlight search query matches in a snippet (case-insensitive) */
function highlightMatches(text: string, query: string): string {
  // Safely strip out any raw HTML tags that might be in the search snippet
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const plainText = doc.body.textContent || '';
  if (!query.trim()) return escapeHtml(plainText);
  
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  
  // Escape the plain text first, then inject our trusted <mark> tags
  return escapeHtml(plainText).replace(regex, '<mark class="premium-search-highlight">$1</mark>');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** True when a TOC fetch failed because the book renderer isn't open yet (retryable). */
function isRetryableTocError(err: unknown): boolean {
  if (typeof err === 'string') {
    return err.toLowerCase().includes('not opened');
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('not opened') || msg.includes('not_found');
  }
  return (err as { kind?: string } | null)?.kind === 'not_found';
}

export function PremiumSidebar({ bookId, currentIndex, onNavigate }: PremiumSidebarProps) {
  const isSidebarOpen = useReaderUIStore(state => state.isSidebarOpen);
  const sidebarTab = useReaderUIStore(state => state.sidebarTab);
  const closeSidebar = useReaderUIStore(state => state.closeSidebar);
  const setSidebarTab = useReaderUIStore(state => state.setSidebarTab);
  const setPendingAnnotationId = useReaderUIStore(state => state.setPendingAnnotationId);
  const pendingSearchQuery = useReaderUIStore(state => state.pendingSearchQuery);
  const setPendingSearchQuery = useReaderUIStore(state => state.setPendingSearchQuery);
  const isMobile = useIsMobile();
  const dragControls = useDragControls();
  const aiEnabled = useAIStore((s) => s.enabled);
  
  // Tab data states
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [tocFilter, setTocFilter] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const filteredToc = useMemo(() => {
    if (!tocFilter.trim()) return toc;
    const q = tocFilter.toLowerCase();
    const filterEntries = (entries: TocEntry[]): TocEntry[] => {
      const res: TocEntry[] = [];
      for (const e of entries) {
        const matchSelf = e.label.toLowerCase().includes(q);
        const matchChildren = e.children ? filterEntries(e.children) : [];
        if (matchSelf || matchChildren.length > 0) {
          res.push({
            ...e,
            children: matchChildren.length > 0 ? matchChildren : e.children,
          });
        }
      }
      return res;
    };
    return filterEntries(toc);
  }, [toc, tocFilter]);
  const [annotationFilter, setAnnotationFilter] = useState<'all' | 'highlights' | 'notes'>('all');
  const [categories, setCategories] = useState<AnnotationCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BookSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`shiori-search-history-${bookId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`shiori-search-history-${bookId}`);
      setSearchHistory(raw ? JSON.parse(raw) : []);
    } catch {
      setSearchHistory([]);
    }
  }, [bookId]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tocRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tocAbortRef = useRef(false);

  // AI Copilot is desktop exclusive; redirect to TOC on Android or when AI disabled
  useEffect(() => {
    if ((isAndroid || !aiEnabled) && sidebarTab === 'ai') {
      setSidebarTab('toc');
    }
  }, [sidebarTab, setSidebarTab, aiEnabled]);

  // Combined notes & highlights: redirect any legacy 'notes' tab call to 'highlights' with filter
  useEffect(() => {
    if (sidebarTab === 'notes') {
      setSidebarTab('highlights');
      setAnnotationFilter('notes');
    }
  }, [sidebarTab, setSidebarTab]);

   // openBookRenderer may still be in flight when the sidebar mounts, so a
   // single TOC fetch can fail with "Book N not opened". Retry briefly with
   // backoff, then give up silently (TOC is non-critical).
   const loadToc = useCallback(async () => {
     tocAbortRef.current = false;
     const MAX_ATTEMPTS = 3;
     for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
       try {
         const tocData = await api.getBookToc(bookId);
         if (tocAbortRef.current) return;
         setToc(tocData);
         return;
       } catch (err) {
         if (tocAbortRef.current) return;
         if (attempt === MAX_ATTEMPTS - 1 || !isRetryableTocError(err)) {
           logger.debug('[PremiumSidebar] Failed to load TOC:', err);
           return;
         }
         await new Promise<void>((resolve) => {
           tocRetryTimerRef.current = setTimeout(() => {
             tocRetryTimerRef.current = null;
             resolve();
           }, 400 * (attempt + 1));
         });
       }
     }
   }, [bookId]);

   const loadAnnotations = useCallback(async () => {
     try {
       const annotationsData = await api.getAnnotations(bookId);
       setAnnotations(annotationsData);
     } catch (err) {
       logger.error('[PremiumSidebar] Failed to load annotations:', err);
     }
   }, [bookId]);

  // Load TOC on mount
  useEffect(() => {
     if (bookId) {
       loadToc();
       loadAnnotations();
       api.getAnnotationCategories().then(setCategories).catch(logger.error);
     }
  }, [bookId, loadToc, loadAnnotations]);

  // Clear any in-flight TOC retry on unmount
  useEffect(() => {
    return () => {
      tocAbortRef.current = true;
      if (tocRetryTimerRef.current) {
        clearTimeout(tocRetryTimerRef.current);
        tocRetryTimerRef.current = null;
      }
    };
  }, []);

  // Reload annotations when sidebar opens (to see newly created ones from TextSelectionToolbar)
  useEffect(() => {
    if (isSidebarOpen && bookId) {
      loadAnnotations();
    }
  }, [isSidebarOpen, bookId, loadAnnotations]);

  // Listen for annotation-changed events to refresh the list in real-time
  useEffect(() => {
    const handleAnnotationChanged = () => {
      if (bookId) {
        loadAnnotations();
      }
    };
    
    window.addEventListener('annotation-changed', handleAnnotationChanged);
    return () => {
      window.removeEventListener('annotation-changed', handleAnnotationChanged);
    };
  }, [bookId, loadAnnotations]);

  // Auto-focus search input when opening sidebar on search tab or switching to search tab
  useEffect(() => {
    if (isSidebarOpen && sidebarTab === 'search') {
      const focusSearch = () => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      };

      focusSearch();
      const raf = requestAnimationFrame(focusSearch);
      const timer = setTimeout(focusSearch, 100);

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [isSidebarOpen, sidebarTab]);
  
  const handleExportAnnotations = useCallback(async () => {
    if (annotations.length === 0) {
      useToastStore.getState().addToast({ title: 'No annotations to export', variant: 'info' });
      return;
    }
    try {
      const filePath = await save({
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }],
        defaultPath: 'shiori-annotations.md'
      });
      
      if (!filePath) return;
      
      let markdown = `# Book Annotations\n\n`;
      
      const exportsHighlights = annotations.filter(a => a.annotationType === 'highlight');
      if (exportsHighlights.length > 0) {
        markdown += `## Highlights\n\n`;
        exportsHighlights.forEach(h => {
          markdown += `> ${h.selectedText}\n\n`;
          markdown += `*Location: ${formatLocation(h.location)}*\n\n---\n\n`;
        });
      }
      
      const exportsNotes = annotations.filter(a => a.annotationType === 'note');
      if (exportsNotes.length > 0) {
        markdown += `## Notes\n\n`;
        exportsNotes.forEach(n => {
          if (n.selectedText) markdown += `> ${n.selectedText}\n\n`;
          markdown += `**Note:** ${n.noteContent}\n\n`;
          markdown += `*Location: ${formatLocation(n.location)}*\n\n---\n\n`;
        });
      }

      const exportsBookmarks = annotations.filter(a => a.annotationType === 'bookmark');
      if (exportsBookmarks.length > 0) {
        markdown += `## Bookmarks\n\n`;
        exportsBookmarks.forEach(b => {
          markdown += `- **${b.noteContent || formatLocation(b.location)}** (*Location: ${formatLocation(b.location)}*)\n`;
        });
        markdown += `\n---\n\n`;
      }
      
      await writeTextFile(filePath, markdown);
      
      useToastStore.getState().addToast({
        title: 'Exported successfully to ' + filePath,
        variant: 'success',
        duration: 3000
      });
    } catch (err) {
      logger.error('Failed to export annotations', err);
      useToastStore.getState().addToast({
        title: 'Export failed',
        description: String(err),
        variant: 'error'
      });
    }
  }, [annotations]);
  
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
     try {
       const results = await api.searchInBook(bookId, query);
       setSearchResults(results);
     } catch (err) {
       logger.error('[PremiumSidebar] Search failed:', err);
       setSearchResults([]);
     } finally {
       setIsSearching(false);
     }
  }, [bookId]);

  // Debounced search-as-you-type
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      handleSearch(value);
    }, 350);
  }, [handleSearch]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const addToSearchHistory = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    setSearchHistory(prev => {
      const next = [trimmed, ...prev.filter(item => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 15);
      try {
        localStorage.setItem(`shiori-search-history-${bookId}`, JSON.stringify(next));
      } catch (e) {
        logger.error('Failed to save search history', e);
      }
      return next;
    });
  }, [bookId]);

  const removeFromSearchHistory = useCallback((term: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSearchHistory(prev => {
      const next = prev.filter(item => item !== term);
      try {
        localStorage.setItem(`shiori-search-history-${bookId}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [bookId]);

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    try {
      localStorage.removeItem(`shiori-search-history-${bookId}`);
    } catch {}
  }, [bookId]);

  // Automatically execute search when a pending search query is dispatched from context menu or shortcut
  useEffect(() => {
    if (pendingSearchQuery && isSidebarOpen) {
      setSearchQuery(pendingSearchQuery);
      handleSearch(pendingSearchQuery);
      setPendingSearchQuery(null);
    }
  }, [pendingSearchQuery, isSidebarOpen, handleSearch, setPendingSearchQuery]);

  /** Map a search result to a human-friendly Chapter title */
  const getChapterDisplayTitle = useCallback((result: BookSearchResult): string => {
    const isTechnicalId = (t?: string): boolean => {
      if (!t) return true;
      const s = t.trim().toLowerCase();
      if (s.length <= 2) return true;
      if (/\.(xhtml|html|xml|htm|php|txt|opf|ncx)$/i.test(s)) return true;
      if (/^(id|item|ch|chapter|sec|sect|section|part|page|p|split|text|content|body|wrap)[-_0-9]+/i.test(s)) return true;
      if (/^[a-z][0-9]{2,}$/i.test(s)) return true;
      if (/^[0-9]+$/.test(s)) return true;
      return false;
    };

    // 1. Try finding in TOC by exact chapter index
    if (toc && toc.length > 0) {
      const findInToc = (entries: TocEntry[]): string | null => {
        for (const entry of entries) {
          const idx = parseTocLocationToIndex(entry.location);
          if (idx === result.chapter_index && entry.label?.trim()) {
            return entry.label.trim();
          }
          if (entry.children) {
            const childMatch = findInToc(entry.children);
            if (childMatch) return childMatch;
          }
        }
        return null;
      };
      const tocTitle = findInToc(toc);
      if (tocTitle) return tocTitle;
    }

    // 2. If chapter_title is a real readable name (not an id/filename), use it
    const raw = result.chapter_title?.trim();
    if (raw && !isTechnicalId(raw)) {
      return raw;
    }

    // 3. Match closest preceding TOC entry for sections within a chapter
    if (toc && toc.length > 0) {
      let closestLabel: string | null = null;
      let closestIdx = -1;
      const scanToc = (entries: TocEntry[]) => {
        for (const entry of entries) {
          const idx = parseTocLocationToIndex(entry.location);
          if (idx !== null && !Number.isNaN(idx) && idx <= result.chapter_index && idx > closestIdx) {
            if (entry.label?.trim()) {
              closestIdx = idx;
              closestLabel = entry.label.trim();
            }
          }
          if (entry.children) {
            scanToc(entry.children);
          }
        }
      };
      scanToc(toc);
      if (closestLabel) return closestLabel;
    }

    // 4. Fallback to Chapter N
    return `Chapter ${result.chapter_index + 1}`;
  }, [toc]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

    // Moved to toc.ts for reuse in PremiumEpubReader and PremiumSidebar
   const handleTocClick = (entry: TocEntry) => {
     const index = parseTocLocationToIndex(entry.location);
     if (index !== null && !Number.isNaN(index)) {
       logger.debug('[PremiumSidebar] Navigating to chapter/page:', index, 'from TOC entry:', entry.label);
       onNavigate(index);
       closeSidebar();
     } else {
       logger.warn('[PremiumSidebar] Could not parse chapter index from location:', entry.location);
     }
   };
  
   const handleSearchResultClick = (result: BookSearchResult) => {
     addToSearchHistory(searchQuery);
     logger.debug('[PremiumSidebar] Navigating to search result, chapter:', result.chapter_index, 'query:', searchQuery);
     onNavigate(result.chapter_index, searchQuery);
     closeSidebar();
   };
  
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeSidebar();
    }
  };

  // ── C14: Navigate to annotation's chapter on click ──
  const handleAnnotationClick = useCallback((annotation: Annotation) => {
    const loc = annotation.location;

    // Set pending annotation for scroll-to after highlights render
    if (annotation.id) {
      setPendingAnnotationId(annotation.id);
    }

    // Parse "chapter_N" format (EPUB)
    const chapterMatch = loc.match(/^chapter_(\d+)/);
    if (chapterMatch) {
      const index = parseInt(chapterMatch[1], 10);
      onNavigate(index);
      closeSidebar();
      return;
    }

    // Parse "chapter:N" format
    const chapterColonMatch = loc.match(/^chapter:(\d+)/);
    if (chapterColonMatch) {
      const index = parseInt(chapterColonMatch[1], 10);
      onNavigate(index);
      closeSidebar();
      return;
    }

    // Parse "*-chapter-N" formats used by non-EPUB adapters
    const genericChapterMatch = loc.match(/(?:^|[^\w])(?:generic|mobi|[a-z0-9]+)-chapter-(\d+)/i);
    if (genericChapterMatch) {
      const index = parseInt(genericChapterMatch[1], 10);
      onNavigate(index);
      closeSidebar();
      return;
    }

    // Parse "page-N" format (PDF)
    const pageMatch = loc.match(/^page-(\d+)/);
    if (pageMatch) {
      const page = parseInt(pageMatch[1], 10);
      onNavigate(page);
      closeSidebar();
      return;
    }

    // Parse "page:N" format (PDF TOC)
    const pageColonMatch = loc.match(/^page:(\d+)/);
    if (pageColonMatch) {
      const page = parseInt(pageColonMatch[1], 10);
      onNavigate(page);
      closeSidebar();
      return;
    }

    // MOBI "mobi-chapter-0" — already on the single chapter, just close sidebar
    if (loc.startsWith('mobi-chapter-')) {
      closeSidebar();
      return;
    }
  }, [onNavigate, closeSidebar, setPendingAnnotationId]);

  // ── C15: Delete annotation ──
  const handleDeleteAnnotation = useCallback(async (e: React.MouseEvent, annotation: Annotation) => {
    e.stopPropagation(); // Don't trigger the navigation click
    if (!annotation.id) return;

    try {
      await api.deleteAnnotation(annotation.id);
      // Remove from local state
      setAnnotations(prev => prev.filter(a => a.id !== annotation.id));
      // Notify readers to re-render highlights
      notifyAnnotationsChanged();
      useToastStore.getState().addToast({
        title: `${annotation.annotationType.charAt(0).toUpperCase() + annotation.annotationType.slice(1)} deleted`,
        variant: 'success',
        duration: 2000,
      });
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to delete',
        description: String(err),
        variant: 'error',
      });
    }
  }, []);

  // ── C15: Edit note content ──
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editingColorId, setEditingColorId] = useState<number | null>(null);
  const [playingWordId, setPlayingWordId] = useState<number | null>(null);

  const speakFallback = useCallback((text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.onend = () => setPlayingWordId(null);
      utterance.onerror = () => setPlayingWordId(null);
      window.speechSynthesis.speak(utterance);
    } else {
      setPlayingWordId(null);
    }
  }, []);

  const playAudio = useCallback((id: number, text: string, audioUrl?: string | null) => {
    setPlayingWordId(id);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setPlayingWordId(null);
      audio.onerror = () => speakFallback(text);
      audio.play().catch(() => speakFallback(text));
    } else {
      speakFallback(text);
    }
  }, [speakFallback]);

  const handleStartEditNote = useCallback((e: React.MouseEvent, note: Annotation) => {
    e.stopPropagation();
    setEditingNoteId(note.id ?? null);
    if (!note.noteContent) {
      setEditNoteText('');
      return;
    }
    try {
      const parsed = JSON.parse(note.noteContent);
      if (parsed && parsed.type === 'define') {
        const def = parsed.data?.meanings?.[0]?.definitions?.[0]?.definition || (typeof parsed.data === 'string' ? parsed.data : '');
        setEditNoteText(def);
      } else if (parsed && parsed.type === 'translate') {
        setEditNoteText(parsed.data?.translated_text || '');
      } else {
        setEditNoteText(note.noteContent);
      }
    } catch {
      setEditNoteText(note.noteContent);
    }
  }, []);

  const handleSaveEditNote = useCallback(async (annotation: Annotation) => {
    if (!annotation.id || !editNoteText.trim()) return;

    let contentToSave = editNoteText.trim();
    try {
      if (annotation.noteContent) {
        const parsed = JSON.parse(annotation.noteContent);
        if (parsed && parsed.type === 'define') {
          if (parsed.data?.meanings?.[0]?.definitions?.[0]) {
            parsed.data.meanings[0].definitions[0].definition = contentToSave;
          } else if (typeof parsed.data === 'string') {
            parsed.data = contentToSave;
          }
          contentToSave = JSON.stringify(parsed);
        } else if (parsed && parsed.type === 'translate') {
          if (parsed.data) {
            parsed.data.translated_text = contentToSave;
          }
          contentToSave = JSON.stringify(parsed);
        }
      }
    } catch {
      // Not JSON, save as plain text
    }

    try {
      await api.updateAnnotation(annotation.id, contentToSave, undefined);
      // Update local state
      setAnnotations(prev => prev.map(a =>
        a.id === annotation.id ? { ...a, noteContent: contentToSave } : a
      ));
      setEditingNoteId(null);
      setEditNoteText('');
      notifyAnnotationsChanged();
      useToastStore.getState().addToast({
        title: 'Note updated',
        variant: 'success',
        duration: 2000,
      });
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to update note',
        description: String(err),
        variant: 'error',
      });
    }
  }, [editNoteText]);

  const handleCancelEditNote = useCallback(() => {
    setEditingNoteId(null);
    setEditNoteText('');
  }, []);

  const handleChangeHighlightColor = useCallback(async (annotation: Annotation, newColor: string) => {
    if (!annotation.id) return;
    try {
      await api.updateAnnotation(annotation.id, undefined, newColor);
      setAnnotations(prev => prev.map(a =>
        a.id === annotation.id ? { ...a, color: newColor } : a
      ));
      setEditingColorId(null);
      notifyAnnotationsChanged();
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to update color',
        description: String(err),
        variant: 'error',
      });
    }
  }, []);
  
  // Filter annotations by type
  const highlights = annotations.filter(a => a.annotationType === 'highlight');
  const notes = annotations.filter(a => a.annotationType === 'note');
  const bookmarks = annotations.filter(a => a.annotationType === 'bookmark');

  // The TOC entry the reader is currently inside.
  const currentTocEntry = findCurrentTocEntry(toc, currentIndex);

  /** Format a raw location string for display */
  const formatLocation = (loc: string): string => {
    const chapterMatch = loc.match(/^chapter_(\d+)/);
    if (chapterMatch) return `Chapter ${parseInt(chapterMatch[1], 10) + 1}`;
    const chapterColonMatch = loc.match(/^chapter:(\d+)/);
    if (chapterColonMatch) return `Chapter ${parseInt(chapterColonMatch[1], 10) + 1}`;
    const genericChapterMatch = loc.match(/(?:^|[^\w])(?:generic|mobi|[a-z0-9]+)-chapter-(\d+)/i);
    if (genericChapterMatch) return `Chapter ${parseInt(genericChapterMatch[1], 10) + 1}`;
    const pageMatch = loc.match(/^page-(\d+)/);
    if (pageMatch) return `Page ${pageMatch[1]}`;
    const pageColonMatch = loc.match(/^page:(\d+)/);
    if (pageColonMatch) return `Page ${pageColonMatch[1]}`;
    if (loc === 'mobi-chapter-0') return 'Full text';
    return loc;
  };
  
  return (
    <AnimatePresence>
      {isSidebarOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            className="premium-sidebar-backdrop"
            onClick={handleBackdropClick}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
          
          {/* Sidebar */}
          <motion.div 
            className="premium-sidebar"
            initial={isMobile ? { y: "100%" } : { x: "100%" }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: "100%" } : { x: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            drag={isMobile ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 60 || info.velocity.y > 250) {
                closeSidebar();
              }
            }}
          >
            {/* Header with tabs */}
            {isMobile && (
              <div 
                className="w-full flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
                onPointerDown={(e) => dragControls.start(e)}
                onClick={closeSidebar}
              >
                <div className="w-12 h-1.5 bg-[var(--text-tertiary)] opacity-35 hover:opacity-70 transition-opacity rounded-full pointer-events-none" />
              </div>
            )}
            <div className="premium-sidebar-header">
          <div className="premium-sidebar-tabs">
            {[
              { id: 'search', label: 'Search', icon: Search },
              { id: 'toc', label: 'TOC', icon: BookOpen },
              { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
              { id: 'highlights', label: 'Highlights', icon: Highlighter },
              ...(!isAndroid && aiEnabled ? [{ id: 'ai', label: 'AI', icon: Brain }] : []),
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSidebarTab(tab.id as any)}
                className={`premium-sidebar-tab ${sidebarTab === tab.id ? 'premium-sidebar-tab--active' : ''}`}
              >
                {sidebarTab === tab.id && (
                  <motion.div
                    layoutId="sidebar-tab-indicator"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'var(--bg-elevated)',
                      borderRadius: '9999px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)',
                      zIndex: 0
                    }}
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                  />
                )}
                <tab.icon className="premium-sidebar-tab-icon" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          
          <motion.button
            onClick={closeSidebar}
            className="premium-sidebar-close"
            aria-label="Close sidebar"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X className="premium-sidebar-close-icon" />
          </motion.button>
        </div>
        
        {/* Content */}
        <div className="premium-sidebar-content">
          {/* TOC Tab */}
          {sidebarTab === 'toc' && (
            <div className="premium-sidebar-panel">
              {toc.length > 0 && (
                <div className="premium-search-input-container !mb-3">
                  <Search className="premium-search-icon" />
                  <input
                    type="text"
                    value={tocFilter}
                    onChange={(e) => setTocFilter(e.target.value)}
                    placeholder={`Search ${toc.length} ${toc.length === 1 ? 'chapter' : 'chapters'}...`}
                    className="premium-search-input"
                  />
                  {tocFilter && (
                    <div className="absolute right-3 flex items-center">
                      <button
                        type="button"
                        onClick={() => setTocFilter('')}
                        className="premium-search-clear"
                        aria-label="Clear filter"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tocFilter && (
                <div className="flex items-center justify-between mb-2.5 px-1 text-xs text-[var(--text-tertiary)] font-medium">
                  <span>{filteredToc.length} of {toc.length} {toc.length === 1 ? 'chapter' : 'chapters'}</span>
                </div>
              )}

              {filteredToc.length === 0 ? (
                <SidebarEmptyState
                  icon={ListTree}
                  title={tocFilter ? "No sections match" : "No Table of Contents"}
                  description={tocFilter ? `No chapter matched "${tocFilter}".` : "This book doesn't include an embedded chapter outline."}
                />
              ) : (
                <div className="premium-toc-list">
                  {filteredToc.map((entry, index) => (
                    <TocItem
                      key={index}
                      entry={entry}
                      onClick={handleTocClick}
                      currentEntry={currentTocEntry}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Highlights & Notes Combined Tab */}
          {(sidebarTab === 'highlights' || sidebarTab === 'notes') && (() => {
            const displayList = annotationFilter === 'all'
              ? annotations.filter(a => a.annotationType === 'highlight' || a.annotationType === 'note')
              : annotationFilter === 'highlights'
                ? highlights
                : notes;

            return (
              <div className="premium-sidebar-panel">
                <div className="flex items-center justify-between mb-4 gap-2">
                  <div className="flex items-center p-1 rounded-2xl bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] shadow-inner relative">
                    {[
                      { id: 'all' as const, label: `All (${highlights.length + notes.length})` },
                      { id: 'highlights' as const, label: `Highlights (${highlights.length})` },
                      { id: 'notes' as const, label: `Notes (${notes.length})` },
                    ].map(f => {
                      const isActive = annotationFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setAnnotationFilter(f.id)}
                          className={cn(
                            "relative py-1.5 px-3 rounded-xl text-xs cursor-pointer text-center select-none outline-none focus:outline-none transition-colors duration-150 z-10",
                            isActive
                              ? "text-white font-bold"
                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
                          )}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="activeAnnotationTabIndicator"
                              className="absolute inset-0 rounded-xl bg-[var(--ui-focus)] shadow-md shadow-[color-mix(in_srgb,var(--ui-focus)_35%,transparent)] -z-10"
                              transition={{ type: "spring", stiffness: 500, damping: 36 }}
                            />
                          )}
                          <span className="relative z-10">{f.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {(highlights.length > 0 || notes.length > 0) && (
                    <button 
                      type="button"
                      onClick={handleExportAnnotations}
                      className="px-3 py-1.5 rounded-xl border border-[color-mix(in_srgb,var(--ui-border)_75%,transparent)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-elevated))] shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer outline-none focus:outline-none shrink-0"
                      aria-label="Export to Markdown"
                    >
                      <Download size={13} />
                      <span>Export</span>
                    </button>
                  )}
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={annotationFilter}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full"
                  >
                    {displayList.length === 0 ? (
                      <SidebarEmptyState
                        icon={annotationFilter === 'notes' ? StickyNote : Highlighter}
                        title={annotationFilter === 'notes' ? 'No notes yet' : annotationFilter === 'highlights' ? 'No highlights yet' : 'No highlights or notes yet'}
                        description={
                          annotationFilter === 'notes'
                            ? 'Add personal annotations and takeaways to any passage.'
                            : annotationFilter === 'highlights'
                              ? 'Select any text in the book to highlight quotes and key ideas.'
                              : 'Select any text in the book to highlight quotes or write personal notes.'
                        }
                      />
                    ) : (
                      <div className="premium-annotations-list">
                        {displayList.map((item) => {
                          if (item.annotationType === 'highlight') {
                            return (
                              <motion.div
                                key={item.id}
                                className="premium-annotation-item premium-annotation-item--clickable group"
                                onClick={() => handleAnnotationClick(item)}
                                whileHover={{ scale: 1.005 }}
                                whileTap={{ scale: 0.995 }}
                                transition={{ duration: 0.12 }}
                              >
                                <div className="flex items-center justify-between gap-2 w-full">
                                  <div className="flex items-center gap-2">
                                    <div className="relative flex items-center">
                                      <button 
                                        type="button"
                                        className="w-3.5 h-3.5 rounded-full cursor-pointer transition-transform hover:scale-125 border border-black/10 shadow-xs"
                                        style={{ backgroundColor: item.color || 'var(--ui-focus)' }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingColorId(editingColorId === item.id ? null : (item.id ?? null));
                                        }}
                                        aria-label="Change highlight color"
                                      />
                                      {editingColorId === item.id && (
                                        <div 
                                          className="absolute top-6 left-0 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--ui-border)] shadow-xl" 
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {HIGHLIGHT_COLORS.map((c) => (
                                            <button
                                              key={c.value}
                                              type="button"
                                              className={cn(
                                                "w-4 h-4 rounded-full transition-transform hover:scale-120 cursor-pointer border border-black/10",
                                                item.color === c.value && "ring-2 ring-offset-1 ring-[var(--ui-focus)]"
                                              )}
                                              style={{ backgroundColor: c.value }}
                                              onClick={() => handleChangeHighlightColor(item, c.value)}
                                              aria-label={c.name}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ui-focus)] uppercase tracking-wider">
                                      <Highlighter size={11} />
                                      Highlight
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <motion.button
                                      type="button"
                                      className="premium-annotation-delete"
                                      onClick={(e: React.MouseEvent) => handleDeleteAnnotation(e, item)}
                                      aria-label="Delete highlight"
                                      title="Delete"
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                    >
                                      <Trash2 size={13} />
                                    </motion.button>
                                  </div>
                                </div>

                                <p className="text-[13.5px] font-serif leading-relaxed text-[var(--text-primary)] my-0 select-text italic">
                                  "{item.selectedText}"
                                </p>

                                <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] pt-1 border-t border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] mt-0.5">
                                  <span className="premium-annotation-location">{item.chapterTitle || formatLocation(item.location)}</span>
                                </div>
                              </motion.div>
                            );
                          }

                          // Note item
                          const note = item;
                          let vocabData: any = null;
                          try {
                            if (note.noteContent) {
                              vocabData = JSON.parse(note.noteContent);
                            }
                          } catch {
                            // Plain text note
                          }

                          const isDefinition = Boolean(vocabData && vocabData.type === 'define');
                          const isTranslation = Boolean(vocabData && vocabData.type === 'translate');
                          const cat = note.categoryId ? categories.find(c => c.id === note.categoryId) : null;

                          return (
                            <motion.div
                              key={note.id}
                              className="premium-annotation-item premium-annotation-item--clickable group"
                              onClick={() => handleAnnotationClick(note)}
                              whileHover={{ scale: 1.005 }}
                              whileTap={{ scale: 0.995 }}
                              transition={{ duration: 0.12 }}
                            >
                              {editingNoteId === note.id ? (
                                <div className="flex flex-col gap-2.5 w-full pt-1" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-[var(--text-secondary)]">Edit Note</span>
                                    <span className="text-[11px] text-[var(--text-tertiary)]">Esc to cancel</span>
                                  </div>
                                  <textarea
                                    className="w-full p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--ui-focus)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus)] resize-none font-sans"
                                    value={editNoteText}
                                    onChange={(e) => setEditNoteText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSaveEditNote(note);
                                      }
                                      if (e.key === 'Escape') handleCancelEditNote();
                                    }}
                                    rows={3}
                                    autoFocus
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <motion.button
                                      type="button"
                                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] transition-colors"
                                      onClick={handleCancelEditNote}
                                      whileHover={{ scale: 1.04 }}
                                      whileTap={{ scale: 0.96 }}
                                    >
                                      Cancel
                                    </motion.button>
                                    <motion.button
                                      type="button"
                                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--ui-focus)] hover:brightness-110 disabled:opacity-50 transition-all shadow-xs"
                                      onClick={() => handleSaveEditNote(note)}
                                      disabled={!editNoteText.trim()}
                                      whileHover={{ scale: 1.04 }}
                                      whileTap={{ scale: 0.96 }}
                                    >
                                      Save
                                    </motion.button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between gap-2 w-full">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isDefinition ? (
                                        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--ui-focus)] uppercase tracking-wider">
                                          <BookA size={11} className="opacity-90" />
                                          Vocabulary
                                        </span>
                                      ) : isTranslation ? (
                                        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--ui-focus)] uppercase tracking-wider">
                                          <Languages size={11} className="opacity-90" />
                                          Translation
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                                          <FileText size={11} className="opacity-90" />
                                          Note
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      {isDefinition && (
                                        <motion.button
                                          type="button"
                                          className={cn(
                                            "premium-annotation-action-btn",
                                            playingWordId === note.id && "text-[var(--ui-focus)] !opacity-100 bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)]"
                                          )}
                                          onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            const w = note.selectedText || vocabData?.data?.word || '';
                                            if (note.id && w) {
                                              playAudio(note.id, w, vocabData?.data?.audio_url);
                                            }
                                          }}
                                          aria-label="Pronounce"
                                          title="Pronounce"
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.9 }}
                                        >
                                          <Volume2 size={13} className={playingWordId === note.id ? "animate-pulse" : ""} />
                                        </motion.button>
                                      )}
                                      <motion.button
                                        type="button"
                                        className="premium-annotation-action-btn"
                                        onClick={(e: React.MouseEvent) => handleStartEditNote(e, note)}
                                        aria-label="Edit note"
                                        title="Edit"
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                      >
                                        <Edit2 size={12} />
                                      </motion.button>
                                      <motion.button
                                        type="button"
                                        className="premium-annotation-delete"
                                        onClick={(e: React.MouseEvent) => handleDeleteAnnotation(e, note)}
                                        aria-label="Delete note"
                                        title="Delete"
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                      >
                                        <Trash2 size={12} />
                                      </motion.button>
                                    </div>
                                  </div>

                                  {isDefinition ? (() => {
                                    const meaning = vocabData.data?.meanings?.[0];
                                    const def = meaning?.definitions?.[0]?.definition || (typeof vocabData.data === 'string' ? vocabData.data : 'No definition available.');
                                    const partOfSpeech = meaning?.partOfSpeech || meaning?.part_of_speech;
                                    const example = meaning?.definitions?.[0]?.example;
                                    const phonetic = vocabData.data?.phonetic;
                                    const word = note.selectedText || vocabData.data?.word || 'Term';

                                    return (
                                      <div className="flex flex-col gap-1.5">
                                        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                                          <h4 className="text-[15.5px] font-bold font-serif text-[var(--text-primary)] tracking-tight leading-snug m-0">
                                            {word}
                                          </h4>
                                          {phonetic && (
                                            <span className="text-[11px] font-mono text-[var(--text-tertiary)] opacity-85">
                                              {phonetic.startsWith('/') ? phonetic : `/${phonetic}/`}
                                            </span>
                                          )}
                                          {partOfSpeech && (
                                            <span className="text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-secondary)]">
                                              {partOfSpeech}
                                            </span>
                                          )}
                                        </div>
                                        <p 
                                          className="text-[13px] font-serif leading-relaxed text-[var(--text-primary)] opacity-90 m-0 select-text" 
                                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(def) }} 
                                        />
                                        {example && (
                                          <div className="pl-2.5 border-l-2 border-[color-mix(in_srgb,var(--ui-focus)_40%,transparent)] mt-0.5">
                                            <p className="text-[12px] font-serif italic text-[var(--text-secondary)] leading-relaxed m-0 select-text">
                                              "{example}"
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })() : isTranslation ? (() => {
                                    const transText = vocabData.data?.translated_text || 'No translation found.';
                                    return (
                                      <div className="flex flex-col gap-1.5">
                                        {note.selectedText && (
                                          <div className="pl-2.5 border-l-2 border-[var(--ui-focus)]/40 py-0.5">
                                            <p className="text-[12.5px] font-serif italic leading-snug text-[var(--text-secondary)] m-0 select-text line-clamp-3">
                                              "{note.selectedText}"
                                            </p>
                                          </div>
                                        )}
                                        <p 
                                          className="text-[13.5px] font-sans font-medium text-[var(--text-primary)] leading-relaxed m-0 select-text" 
                                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(transText) }} 
                                        />
                                        <span className="text-[9.5px] text-[var(--text-tertiary)] uppercase font-semibold tracking-wider">
                                          Via {vocabData?.data?.provider || 'Google'}
                                        </span>
                                      </div>
                                    );
                                  })() : (
                                    <div className="flex flex-col gap-1.5">
                                      {note.selectedText && note.selectedText.trim() !== note.noteContent?.trim() && (
                                        <div className="pl-2.5 border-l-2 border-[var(--ui-focus)]/40 py-0.5">
                                          <p className="text-[12.5px] font-serif italic text-[var(--text-secondary)] leading-snug m-0 select-text line-clamp-4">
                                            "{note.selectedText}"
                                          </p>
                                        </div>
                                      )}
                                      <div className="text-[13px] font-sans text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap select-text">
                                        {note.noteContent}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] pt-1 border-t border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] mt-0.5">
                                    <span className="premium-annotation-location">{note.chapterTitle || formatLocation(note.location)}</span>
                                    {cat && cat.name.toLowerCase() !== 'vocabulary' && cat.name.toLowerCase() !== 'translation' && (
                                      <span className="premium-annotation-category-badge">
                                        {cat.name}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            );
          })()}
          

          {/* Bookmarks Tab */}
          {sidebarTab === 'bookmarks' && (
            <div className="premium-sidebar-panel">
              <div className="flex items-center justify-between mb-2.5 px-0.5">
                <span className="text-xs font-medium text-[var(--text-tertiary)]">
                  {bookmarks.length} {bookmarks.length === 1 ? 'bookmark' : 'bookmarks'}
                </span>
              </div>

              {bookmarks.length === 0 ? (
                <SidebarEmptyState
                  icon={Bookmark}
                  title="No bookmarks yet"
                  description="Bookmark any chapter to quickly jump back to it later."
                />
              ) : (
                <motion.div
                  className="premium-annotations-list"
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                  initial="hidden"
                  animate="show"
                >
                  {bookmarks.map((bm) => (
                    <motion.div
                      key={bm.id}
                      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                      className="premium-annotation-item premium-annotation-item--clickable group"
                      onClick={() => handleAnnotationClick(bm)}
                      whileHover={{ scale: 1.005 }}
                      whileTap={{ scale: 0.995 }}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="premium-badge flex items-center gap-1 text-[10px] font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          <Bookmark size={10} fill="currentColor" />
                          Bookmark
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <motion.button
                            className="premium-annotation-delete"
                            onClick={(e: React.MouseEvent) => handleDeleteAnnotation(e, bm)}
                            aria-label="Delete bookmark"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <Trash2 size={13} />
                          </motion.button>
                        </div>
                      </div>

                      <h4 className="text-[15px] font-serif font-medium leading-snug text-[var(--text-primary)] my-0">
                        {bm.noteContent || formatLocation(bm.location)}
                      </h4>

                      <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] pt-0.5">
                        <span className="premium-annotation-location">
                          {formatLocation(bm.location)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          )}

          {/* Search Tab */}
          {sidebarTab === 'search' && (
            <div className="premium-sidebar-panel">
              <div className="premium-search-input-container">
                <Search className="premium-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch(searchQuery);
                      addToSearchHistory(searchQuery);
                    }
                  }}
                  placeholder="Search in book..."
                  className="premium-search-input"
                  autoFocus
                />
                {isSearching ? (
                  <div className="absolute right-3.5 flex items-center">
                    <Loader2 className="premium-search-spinner" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : searchQuery.length > 0 ? (
                  <div className="absolute right-3 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="premium-search-clear"
                      aria-label="Clear search"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <span className="absolute right-3.5 text-[10px] font-mono text-[var(--text-tertiary)] bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] px-1.5 py-0.5 rounded border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] pointer-events-none">
                    Enter ↵
                  </span>
                )}
              </div>
              
              {searchResults.length > 0 && (
                <motion.div 
                  className="premium-search-results"
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } }}
                  initial="hidden" animate="show"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_20%,transparent)]">
                      {searchResults.reduce((sum, r) => sum + r.match_count, 0)} {searchResults.reduce((sum, r) => sum + r.match_count, 0) === 1 ? 'match' : 'matches'}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)] font-medium">
                      in {searchResults.length} {searchResults.length === 1 ? 'chapter' : 'chapters'}
                    </span>
                  </div>
                  {searchResults.map((result, index) => (
                    <motion.div
                      key={index}
                      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                      className="premium-search-result group"
                      onClick={() => handleSearchResultClick(result)}
                      whileHover={{ scale: 1.005 }}
                      whileTap={{ scale: 0.995 }}
                    >
                      <div className="premium-search-result-header">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <BookOpen size={13} className="text-[var(--ui-focus)] shrink-0" />
                          <span className="text-[13.5px] font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--ui-focus)] transition-colors">
                            {getChapterDisplayTitle(result)}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--text-secondary)] px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] shrink-0">
                          {result.match_count} {result.match_count === 1 ? 'match' : 'matches'}
                        </span>
                      </div>
                      <p
                        className="premium-search-result-snippet"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(highlightMatches(result.snippet, searchQuery)),
                        }}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <SidebarEmptyState
                  icon={SearchX}
                  title="No results found"
                  description={`No matches found for "${searchQuery}".`}
                />
              )}

              {!searchQuery.trim() && searchHistory.length > 0 && (
                <div className="flex flex-col gap-2 mt-3">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5">
                      <History size={12} className="text-[var(--ui-focus)]" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Recent Searches
                      </span>
                      <span className="text-[10px] font-semibold text-[var(--text-tertiary)] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]">
                        {searchHistory.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearSearchHistory}
                      className="text-[11px] font-medium text-[var(--text-tertiary)] hover:text-rose-500 transition-colors cursor-pointer flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-rose-500/10"
                      aria-label="Clear all search history"
                    >
                      <Trash2 size={11} />
                      <span>Clear all</span>
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--bg-secondary))] overflow-hidden divide-y divide-[color-mix(in_srgb,var(--ui-border)_35%,transparent)] shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
                    <AnimatePresence initial={false}>
                      {searchHistory.map((term) => (
                        <motion.div
                          key={term}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                          onClick={() => {
                            setSearchQuery(term);
                            handleSearch(term);
                            addToSearchHistory(term);
                          }}
                          className="group flex items-center justify-between px-3.5 py-2.5 hover:bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-elevated))] transition-colors cursor-pointer select-none"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSearchQuery(term);
                              handleSearch(term);
                              addToSearchHistory(term);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden min-w-0 flex-1 mr-2">
                            <div className="w-6 h-6 rounded-lg bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--ui-focus)_15%,transparent)] flex items-center justify-center transition-colors shrink-0">
                              <History size={12} className="text-[var(--text-tertiary)] group-hover:text-[var(--ui-focus)] transition-colors" />
                            </div>
                            <span className="text-[13px] font-medium text-[var(--text-primary)] group-hover:text-[var(--ui-focus)] transition-colors truncate">
                              {term}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-medium text-[var(--text-tertiary)] opacity-0 group-hover:opacity-75 transition-opacity px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hidden sm:inline-block">
                              Search ↵
                            </span>
                            <button
                              type="button"
                              onClick={(e) => removeFromSearchHistory(term, e)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-rose-500 hover:bg-rose-500/15 opacity-40 group-hover:opacity-100 transition-all shrink-0 cursor-pointer"
                              aria-label={`Remove ${term} from history`}
                              title="Remove"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {!searchQuery.trim() && searchHistory.length === 0 && (
                <SidebarEmptyState
                  icon={History}
                  title="No recent searches"
                  description="Searches you perform will appear here."
                />
              )}
            </div>
          )}

          {sidebarTab === 'ai' && (
            <div className="premium-sidebar-panel" style={{ padding: 0, height: '100%' }}>
              <SidebarAICopilot
                bookId={bookId}
                chapterIndex={currentIndex}
                chapterTitle={findCurrentTocEntry(toc, currentIndex)?.label}
              />
            </div>
          )}
          </div>
        </motion.div>
      </>
      )}
    </AnimatePresence>
  );
}

// Helper component for rendering TOC items recursively
interface TocItemProps {
  entry: TocEntry;
  onClick: (entry: TocEntry) => void;
  currentEntry: TocEntry | null;
}

function TocItem({ entry, onClick, currentEntry }: TocItemProps) {
  const isCurrent = Boolean(
    currentEntry === entry || 
    (currentEntry?.location && currentEntry.location === entry.location) || 
    (currentEntry?.label && currentEntry.label.trim() === entry.label.trim())
  );
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Bring the current chapter into view when the TOC opens
  useEffect(() => {
    if (isCurrent && buttonRef.current) {
      buttonRef.current.scrollIntoView({ block: 'center' });
    }
  }, [isCurrent]);

  return (
    <div className="premium-toc-item" style={{ paddingLeft: `${entry.level * 14}px` }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onClick(entry)}
        className={cn(
          "premium-toc-button group",
          isCurrent && "premium-toc-button--current"
        )}
      >
        {isCurrent ? (
          <BookOpen size={14} className="text-[var(--ui-focus)] shrink-0" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] opacity-35 group-hover:bg-[var(--ui-focus)] group-hover:opacity-100 group-hover:scale-125 transition-all shrink-0" />
        )}
        <span 
          className="premium-toc-label" 
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {entry.label}
        </span>
        {isCurrent ? (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--ui-focus)] text-white shrink-0 shadow-2xs">
            Reading
          </span>
        ) : (
          <ChevronRight size={13} className="text-[var(--text-tertiary)] opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0 transition-all shrink-0" />
        )}
      </button>
      {entry.children && entry.children.length > 0 && (
        <div className="premium-toc-children">
          {entry.children.map((child, index) => (
            <TocItem
              key={index}
              entry={child}
              onClick={onClick}
              currentEntry={currentEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
