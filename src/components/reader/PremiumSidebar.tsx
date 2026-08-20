import { useEffect, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { useReaderUIStore } from '@/store/premiumReaderStore';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import type { TocEntry, Annotation, BookSearchResult, AnnotationCategory } from '@/lib/tauri';
import { X, BookOpen, Highlighter, FileText, Search, Loader2, Trash2, Edit2, Download } from '@/components/icons';
import { StickyNote, ListTree, SearchX } from 'lucide-react';
import { parseTocLocationToIndex, findCurrentTocEntry } from '@/lib/toc';
import { notifyAnnotationsChanged } from '@/lib/annotationEvents';
import DOMPurify from 'dompurify';
import { useToastStore } from '@/store/toastStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

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
  const isMobile = useIsMobile();
  const dragControls = useDragControls();
  
  // Tab data states
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [categories, setCategories] = useState<AnnotationCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BookSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tocRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tocAbortRef = useRef(false);

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

  // Auto-focus search input when switching to search tab
  useEffect(() => {
    if (sidebarTab === 'search' && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [sidebarTab]);
  
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

  const handleStartEditNote = useCallback((e: React.MouseEvent, note: Annotation) => {
    e.stopPropagation();
    setEditingNoteId(note.id ?? null);
    setEditNoteText(note.noteContent || '');
  }, []);

  const handleSaveEditNote = useCallback(async (annotation: Annotation) => {
    if (!annotation.id || !editNoteText.trim()) return;

    try {
      await api.updateAnnotation(annotation.id, editNoteText.trim(), undefined);
      // Update local state
      setAnnotations(prev => prev.map(a =>
        a.id === annotation.id ? { ...a, noteContent: editNoteText.trim() } : a
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
              { id: 'notes', label: 'Notes', icon: FileText },
              { id: 'highlights', label: 'Highlights', icon: Highlighter }
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
              <h3 className="premium-sidebar-title">Table of Contents</h3>
              {toc.length === 0 ? (
                <SidebarEmptyState
                  icon={ListTree}
                  title="No Table of Contents"
                  description="This book doesn't include an embedded chapter outline."
                />
              ) : (
                <motion.div 
                  className="premium-toc-list"
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                  initial="hidden" animate="show"
                >
                  {toc.map((entry, index) => (
                    <motion.div key={index} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                      <TocItem
                        entry={entry}
                        onClick={handleTocClick}
                        currentEntry={currentTocEntry}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          )}
          
          {/* Highlights Tab */}
          {sidebarTab === 'highlights' && (
            <div className="premium-sidebar-panel">
              <div className="flex items-center justify-between mb-4">
                <h3 className="premium-sidebar-title" style={{ marginBottom: 0 }}>Highlights</h3>
                {highlights.length > 0 && (
                  <button 
                    onClick={handleExportAnnotations}
                    className="premium-sidebar-export-btn"
                    title="Export to Markdown"
                  >
                    <Download size={13} />
                    <span>Export</span>
                  </button>
                )}
              </div>
              {highlights.length === 0 ? (
                <SidebarEmptyState
                  icon={Highlighter}
                  title="No highlights yet"
                  description="Select any text in the book to highlight quotes, facts, and key ideas."
                />
              ) : (
                <motion.div 
                  className="premium-annotations-list"
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                  initial="hidden" animate="show"
                >
                  {highlights.map((highlight) => (
                    <motion.div
                      key={highlight.id}
                      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                      className="premium-annotation-item premium-annotation-item--clickable"
                      onClick={() => handleAnnotationClick(highlight)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="premium-annotation-color-wrapper">
                        <div 
                          className="premium-annotation-color"
                          style={{ backgroundColor: highlight.color }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingColorId(editingColorId === highlight.id ? null : (highlight.id ?? null));
                          }}
                          title="Change color"
                        />
                        {editingColorId === highlight.id && (
                          <div className="premium-annotation-color-picker" onClick={(e) => e.stopPropagation()}>
                            {HIGHLIGHT_COLORS.map((c) => (
                              <button
                                key={c.value}
                                className={`premium-annotation-color-swatch ${highlight.color === c.value ? 'premium-annotation-color-swatch--active' : ''}`}
                                style={{ backgroundColor: c.value }}
                                onClick={() => handleChangeHighlightColor(highlight, c.value)}
                                title={c.name}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="premium-annotation-content">
                        <div className="premium-annotation-header">
                          <div className="premium-badge premium-badge--highlight">
                            <Highlighter size={10} />
                            Highlight
                          </div>
                        </div>
                        <p className="premium-annotation-text">{highlight.selectedText}</p>
                        <div className="premium-annotation-meta">
                          <span className="premium-annotation-location">{formatLocation(highlight.location)}</span>
                        </div>
                      </div>
                      <motion.button
                        className="premium-annotation-delete"
                        onClick={(e: React.MouseEvent) => handleDeleteAnnotation(e, highlight)}
                        title="Delete highlight"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <Trash2 size={14} />
                      </motion.button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          )}
          
          {/* Notes Tab */}
          {sidebarTab === 'notes' && (
            <div className="premium-sidebar-panel">
              <div className="flex items-center justify-between mb-4">
                <h3 className="premium-sidebar-title" style={{ marginBottom: 0 }}>Notes</h3>
                {notes.length > 0 && (
                  <button 
                    onClick={handleExportAnnotations}
                    className="premium-sidebar-export-btn"
                    title="Export to Markdown"
                  >
                    <Download size={13} />
                    <span>Export</span>
                  </button>
                )}
              </div>
              {notes.length === 0 ? (
                <SidebarEmptyState
                  icon={StickyNote}
                  title="No notes yet"
                  description="Add personal annotations, takeaways, and reflections to any passage."
                />
              ) : (
                <motion.div 
                  className="premium-annotations-list"
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                  initial="hidden" animate="show"
                >
                  {notes.map((note) => (
                    <motion.div
                      key={note.id}
                      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                      className="premium-annotation-item premium-annotation-item--clickable"
                      onClick={() => handleAnnotationClick(note)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="premium-annotation-content">
                        {editingNoteId === note.id ? (
                          <div className="premium-annotation-edit" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              className="premium-annotation-edit-input"
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
                            <div className="premium-annotation-edit-actions">
                              <motion.button
                                className="premium-annotation-edit-btn premium-annotation-edit-btn--cancel"
                                onClick={handleCancelEditNote}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                Cancel
                              </motion.button>
                              <motion.button
                                className="premium-annotation-edit-btn premium-annotation-edit-btn--save"
                                onClick={() => handleSaveEditNote(note)}
                                disabled={!editNoteText.trim()}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                Save
                              </motion.button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="premium-annotation-header">
                              <div className="premium-badge premium-badge--note">
                                <FileText size={10} />
                                Note
                              </div>
                            </div>
                            <div className="premium-annotation-note">
                              {(() => {
                                try {
                                  if (!note.noteContent) return null;
                                  const vocabData = JSON.parse(note.noteContent);
                                  if (vocabData && vocabData.type === 'define') {
                                    return (
                                      <div className="flex flex-col gap-1 text-xs">
                                        <span className="font-semibold tracking-wider text-[11px] uppercase opacity-75" style={{ color: 'var(--text-secondary)' }}>Definition</span>
                                        <span className="text-sm font-serif leading-relaxed" style={{ color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(vocabData.data?.meanings?.[0]?.definitions?.[0]?.definition || 'No definition found.') }} />
                                      </div>
                                    );
                                  }
                                  if (vocabData && vocabData.type === 'translate') {
                                    return (
                                      <div className="flex flex-col gap-1 text-xs">
                                        <span className="font-semibold tracking-wider text-[11px] uppercase opacity-75" style={{ color: 'var(--text-secondary)' }}>Translation</span>
                                        <span className="text-sm font-serif leading-relaxed" style={{ color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(vocabData.data?.translated_text || 'No translation found.') }} />
                                      </div>
                                    );
                                  }
                                } catch {
                                  // Not JSON
                                }
                                return <p className="text-sm font-serif leading-relaxed" style={{ color: 'var(--text-primary)' }}>{note.noteContent}</p>;
                              })()}
                            </div>
                            {note.selectedText && (
                              <p className="premium-annotation-text">{note.selectedText}</p>
                            )}
                            <div className="premium-annotation-meta">
                              <span className="premium-annotation-location">{formatLocation(note.location)}</span>
                              {note.categoryId && (() => {
                                const cat = categories.find(c => c.id === note.categoryId);
                                return cat ? (
                                  <span className="premium-annotation-category-badge">
                                    {cat.name}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                          </>
                        )}
                      </div>
                      {editingNoteId !== note.id && (
                        <div className="premium-annotation-actions">
                          <motion.button
                            className="premium-annotation-action-btn"
                            onClick={(e: React.MouseEvent) => handleStartEditNote(e, note)}
                            title="Edit note"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <Edit2 size={14} />
                          </motion.button>
                          <motion.button
                            className="premium-annotation-delete"
                            onClick={(e: React.MouseEvent) => handleDeleteAnnotation(e, note)}
                            title="Delete note"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <Trash2 size={14} />
                          </motion.button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          )}
          

          {/* Search Tab */}
          {sidebarTab === 'search' && (
            <div className="premium-sidebar-panel">
              <h3 className="premium-sidebar-title">Search in Book</h3>
              <div className="premium-search-input-container">
                <Search className="premium-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                  placeholder="Search in book..."
                  className="premium-search-input"
                />
                {isSearching ? (
                  <Loader2 className="premium-search-spinner" style={{ animation: 'spin 1s linear infinite' }} />
                ) : searchQuery.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="premium-search-clear"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
              
              {searchResults.length > 0 && (
                <motion.div 
                  className="premium-search-results"
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                  initial="hidden" animate="show"
                >
                  <p className="premium-search-count">
                    {searchResults.reduce((sum, r) => sum + r.match_count, 0)} match{searchResults.reduce((sum, r) => sum + r.match_count, 0) !== 1 ? 'es' : ''} in {searchResults.length} chapter{searchResults.length !== 1 ? 's' : ''}
                  </p>
                  {searchResults.map((result, index) => (
                    <motion.div
                      key={index}
                      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                      className="premium-search-result"
                      onClick={() => handleSearchResultClick(result)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="premium-search-result-header">
                        <p className="premium-search-result-chapter">
                          <FileText size={14} /> {getChapterDisplayTitle(result)}
                        </p>
                        <span className="premium-search-result-matches">
                          {result.match_count} match{result.match_count !== 1 ? 'es' : ''}
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

              {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
                <SidebarEmptyState
                  icon={Search}
                  title="Search in book"
                  description="Type at least 2 characters to search across all chapters."
                />
              )}
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
  const isCurrent = currentEntry === entry;
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Bring the current chapter into view when the TOC opens
  useEffect(() => {
    if (isCurrent && buttonRef.current) {
      buttonRef.current.scrollIntoView({ block: 'center' });
    }
  }, [isCurrent]);

  return (
    <div className="premium-toc-item" style={{ paddingLeft: `${entry.level * 16}px` }}>
      <button
        ref={buttonRef}
        onClick={() => onClick(entry)}
        className={`premium-toc-button ${isCurrent ? 'premium-toc-button--current' : ''}`}
      >
        <BookOpen size={14} className="premium-toc-icon" />
        <span className="premium-toc-label" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</span>
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
