import { useEffect, useState, useRef, useCallback } from 'react';
import { useUIStore } from '@/store/premiumReaderStore';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import type { TocEntry, Annotation, BookSearchResult, AnnotationCategory } from '@/lib/tauri';
import { X, BookOpen, Highlighter, FileText, Bookmark, Search, Loader2, Trash2, Edit2 } from '@/components/icons';
import { useToastStore } from '@/store/toastStore';

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

interface PremiumSidebarProps {
  bookId: number;
  currentIndex: number;
  onNavigate: (chapterIndex: number, searchTerm?: string | null) => void;
}

/** Highlight search query matches in a snippet (case-insensitive) */
function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark class="premium-search-highlight">$1</mark>');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function PremiumSidebar({ bookId, currentIndex, onNavigate }: PremiumSidebarProps) {
  const isSidebarOpen = useUIStore(state => state.isSidebarOpen);
  const sidebarTab = useUIStore(state => state.sidebarTab);
  const closeSidebar = useUIStore(state => state.closeSidebar);
  const setSidebarTab = useUIStore(state => state.setSidebarTab);
  const setPendingAnnotationId = useUIStore(state => state.setPendingAnnotationId);
  
  // Tab data states
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [categories, setCategories] = useState<AnnotationCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BookSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Load TOC on mount
  useEffect(() => {
     if (bookId) {
       loadToc();
       loadAnnotations();
       api.getAnnotationCategories().then(setCategories).catch(logger.error);
     }
    // loadToc and loadAnnotations are recreated each render - would cause infinite loop if added
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // Reload annotations when sidebar opens (to see newly created ones from TextSelectionToolbar)
  useEffect(() => {
    if (isSidebarOpen && bookId) {
      loadAnnotations();
    }
    // loadAnnotations is recreated each render - would cause infinite loop if added
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSidebarOpen, bookId]);

  // Auto-focus search input when switching to search tab
  useEffect(() => {
    if (sidebarTab === 'search' && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [sidebarTab]);
  
   const loadToc = async () => {
     try {
       const tocData = await api.getBookToc(bookId);
       setToc(tocData);
     } catch (err) {
       logger.error('[PremiumSidebar] Failed to load TOC:', err);
     }
   };
   
   const loadAnnotations = async () => {
     try {
       const annotationsData = await api.getAnnotations(bookId);
       setAnnotations(annotationsData);
     } catch (err) {
       logger.error('[PremiumSidebar] Failed to load annotations:', err);
     }
   };
  
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

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);
  
   const parseTocLocationToIndex = (location: string): number | null => {
     // EPUB variants: epubcfi(/0/12), epubcfi(/12/), epubcfi(/12)
     const cfiNestedMatch = location.match(/epubcfi\(\/\d+\/(\d+)\b/i);
     if (cfiNestedMatch) return parseInt(cfiNestedMatch[1], 10);

     const cfiSimpleMatch = location.match(/epubcfi\(\/(\d+)\b/i);
     if (cfiSimpleMatch) return parseInt(cfiSimpleMatch[1], 10);

     // Generic chapter formats
    const chapterMatch = location.match(/(?:^|[^\w])(?:chapter|chapter_|chapter-|html-chapter-|md-chapter-|fb2-chapter-|docx-chapter-)(\d+)/i);
     if (chapterMatch) return parseInt(chapterMatch[1], 10);

     // Renderer fallback: "chapter:12"
     const chapterColon = location.match(/^chapter:(\d+)/i);
     if (chapterColon) return parseInt(chapterColon[1], 10);

     // PDF TOC style: "page:12" / annotation style "page-12"
    const pageMatch = location.match(/^page[:-](\d+)/i);
     if (pageMatch) {
       const pageNumber = parseInt(pageMatch[1], 10);
       return Number.isNaN(pageNumber) ? null : pageNumber;
     }

     return null;
   };

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
    const genericChapterMatch = loc.match(/(?:^|[^\w])[a-z0-9]+-chapter-(\d+)/i);
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
      window.dispatchEvent(new CustomEvent('annotation-changed'));
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
      window.dispatchEvent(new CustomEvent('annotation-changed'));
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
      window.dispatchEvent(new CustomEvent('annotation-changed'));
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

  /** Format a raw location string for display */
  const formatLocation = (loc: string): string => {
    const chapterMatch = loc.match(/^chapter_(\d+)/);
    if (chapterMatch) return `Chapter ${parseInt(chapterMatch[1], 10) + 1}`;
    const chapterColonMatch = loc.match(/^chapter:(\d+)/);
    if (chapterColonMatch) return `Chapter ${parseInt(chapterColonMatch[1], 10) + 1}`;
    const genericChapterMatch = loc.match(/(?:^|[^\w])[a-z0-9]+-chapter-(\d+)/i);
    if (genericChapterMatch) return `Chapter ${parseInt(genericChapterMatch[1], 10) + 1}`;
    const pageMatch = loc.match(/^page-(\d+)/);
    if (pageMatch) return `Page ${pageMatch[1]}`;
    const pageColonMatch = loc.match(/^page:(\d+)/);
    if (pageColonMatch) return `Page ${pageColonMatch[1]}`;
    if (loc === 'mobi-chapter-0') return 'Full text';
    return loc;
  };
  
  if (!isSidebarOpen) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div 
        className="premium-sidebar-backdrop"
        onClick={handleBackdropClick}
      />
      
      {/* Sidebar */}
      <div className={`premium-sidebar ${isSidebarOpen ? 'premium-sidebar--open' : ''}`}>
        {/* Header with tabs */}
        <div className="premium-sidebar-header">
          <div className="premium-sidebar-tabs">
            <button
              onClick={() => setSidebarTab('toc')}
              className={`premium-sidebar-tab ${sidebarTab === 'toc' ? 'premium-sidebar-tab--active' : ''}`}
              title="Table of Contents"
            >
              <BookOpen className="premium-sidebar-tab-icon" />
              <span>TOC</span>
            </button>
            
            <button
              onClick={() => setSidebarTab('highlights')}
              className={`premium-sidebar-tab ${sidebarTab === 'highlights' ? 'premium-sidebar-tab--active' : ''}`}
              title="Highlights"
            >
              <Highlighter className="premium-sidebar-tab-icon" />
              <span>Highlights</span>
            </button>
            
            <button
              onClick={() => setSidebarTab('notes')}
              className={`premium-sidebar-tab ${sidebarTab === 'notes' ? 'premium-sidebar-tab--active' : ''}`}
              title="Notes"
            >
              <FileText className="premium-sidebar-tab-icon" />
              <span>Notes</span>
            </button>
            
            <button
              onClick={() => setSidebarTab('bookmarks')}
              className={`premium-sidebar-tab ${sidebarTab === 'bookmarks' ? 'premium-sidebar-tab--active' : ''}`}
              title="Bookmarks"
            >
              <Bookmark className="premium-sidebar-tab-icon" />
              <span>Bookmarks</span>
            </button>
            
            <button
              onClick={() => setSidebarTab('search')}
              className={`premium-sidebar-tab ${sidebarTab === 'search' ? 'premium-sidebar-tab--active' : ''}`}
              title="Search"
            >
              <Search className="premium-sidebar-tab-icon" />
              <span>Search</span>
            </button>
          </div>
          
          <button
            onClick={closeSidebar}
            className="premium-sidebar-close"
            aria-label="Close sidebar"
          >
            <X className="premium-sidebar-close-icon" />
          </button>
        </div>
        
        {/* Content */}
        <div className="premium-sidebar-content">
          {/* TOC Tab */}
          {sidebarTab === 'toc' && (
            <div className="premium-sidebar-panel">
              <h3 className="premium-sidebar-title">Table of Contents</h3>
              {toc.length === 0 ? (
                <p className="premium-sidebar-empty">No table of contents available</p>
              ) : (
                <div className="premium-toc-list">
                  {toc.map((entry, index) => (
                    <TocItem
                      key={index}
                      entry={entry}
                      onClick={handleTocClick}
                      currentIndex={currentIndex}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Highlights Tab */}
          {sidebarTab === 'highlights' && (
            <div className="premium-sidebar-panel">
              <h3 className="premium-sidebar-title">Highlights</h3>
              {highlights.length === 0 ? (
                <p className="premium-sidebar-empty">No highlights yet</p>
              ) : (
                <div className="premium-annotations-list">
                  {highlights.map((highlight) => (
                    <div
                      key={highlight.id}
                      className="premium-annotation-item premium-annotation-item--clickable"
                      onClick={() => handleAnnotationClick(highlight)}
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
                        <p className="premium-annotation-text">{highlight.selectedText}</p>
                        <span className="premium-annotation-location">{formatLocation(highlight.location)}</span>
                      </div>
                      <button
                        className="premium-annotation-delete"
                        onClick={(e) => handleDeleteAnnotation(e, highlight)}
                        title="Delete highlight"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Notes Tab */}
          {sidebarTab === 'notes' && (
            <div className="premium-sidebar-panel">
              <h3 className="premium-sidebar-title">Notes</h3>
              {notes.length === 0 ? (
                <p className="premium-sidebar-empty">No notes yet</p>
              ) : (
                <div className="premium-annotations-list">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="premium-annotation-item premium-annotation-item--clickable"
                      onClick={() => handleAnnotationClick(note)}
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
                              <button
                                className="premium-annotation-edit-btn premium-annotation-edit-btn--cancel"
                                onClick={handleCancelEditNote}
                              >
                                Cancel
                              </button>
                              <button
                                className="premium-annotation-edit-btn premium-annotation-edit-btn--save"
                                onClick={() => handleSaveEditNote(note)}
                                disabled={!editNoteText.trim()}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="premium-annotation-note">{note.noteContent}</p>
                            {note.selectedText && (
                              <p className="premium-annotation-text">{note.selectedText}</p>
                            )}
                            <div className="premium-annotation-meta">
                              <span className="premium-annotation-location">{formatLocation(note.location)}</span>
                              {note.categoryId && (() => {
                                const cat = categories.find(c => c.id === note.categoryId);
                                return cat ? (
                                  <span
                                    className="premium-annotation-category-badge"
                                    style={{ backgroundColor: cat.color + '20', color: cat.color, borderColor: cat.color + '40' }}
                                  >
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
                          <button
                            className="premium-annotation-action-btn"
                            onClick={(e) => handleStartEditNote(e, note)}
                            title="Edit note"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="premium-annotation-delete"
                            onClick={(e) => handleDeleteAnnotation(e, note)}
                            title="Delete note"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Bookmarks Tab */}
          {sidebarTab === 'bookmarks' && (
            <div className="premium-sidebar-panel">
              <h3 className="premium-sidebar-title">Bookmarks</h3>
              {bookmarks.length === 0 ? (
                <p className="premium-sidebar-empty">No bookmarks yet</p>
              ) : (
                <div className="premium-annotations-list">
                  {bookmarks.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="premium-annotation-item premium-annotation-item--clickable"
                      onClick={() => handleAnnotationClick(bookmark)}
                    >
                      <div className="premium-annotation-content">
                        {bookmark.selectedText && (
                          <p className="premium-annotation-text">{bookmark.selectedText}</p>
                        )}
                        <span className="premium-annotation-location">{formatLocation(bookmark.location)}</span>
                        <span className="premium-annotation-date">
                          {new Date(bookmark.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className="premium-annotation-delete"
                        onClick={(e) => handleDeleteAnnotation(e, bookmark)}
                        title="Delete bookmark"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Search Tab */}
          {sidebarTab === 'search' && (
            <div className="premium-sidebar-panel">
              <h3 className="premium-sidebar-title">Search in Book</h3>
              <div className="premium-search-input-container">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                  placeholder="Search in book..."
                  className="premium-search-input"
                />
                {isSearching && (
                  <Loader2 className="premium-search-spinner" style={{ animation: 'spin 1s linear infinite' }} />
                )}
              </div>
              
              {searchResults.length > 0 && (
                <div className="premium-search-results">
                  <p className="premium-search-count">
                    {searchResults.reduce((sum, r) => sum + r.match_count, 0)} match{searchResults.reduce((sum, r) => sum + r.match_count, 0) !== 1 ? 'es' : ''} in {searchResults.length} chapter{searchResults.length !== 1 ? 's' : ''}
                  </p>
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      className="premium-search-result"
                      onClick={() => handleSearchResultClick(result)}
                    >
                      <p className="premium-search-result-chapter">{result.chapter_title}</p>
                      <p
                        className="premium-search-result-snippet"
                        dangerouslySetInnerHTML={{
                          __html: highlightMatches(result.snippet, searchQuery),
                        }}
                      />
                      <span className="premium-search-result-matches">
                        {result.match_count} match{result.match_count !== 1 ? 'es' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <p className="premium-sidebar-empty">No results found</p>
              )}

              {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
                <p className="premium-sidebar-empty" style={{ fontSize: 12 }}>Type at least 2 characters</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Helper component for rendering TOC items recursively
interface TocItemProps {
  entry: TocEntry;
  onClick: (entry: TocEntry) => void;
  currentIndex: number;
}

function TocItem({ entry, onClick, currentIndex }: TocItemProps) {
  const chapterMatch = entry.location.match(/chapter[_:-]?(\d+)/i);
  const pageMatch = entry.location.match(/^page[:-](\d+)/i);
  const cfiNestedMatch = entry.location.match(/epubcfi\(\/\d+\/(\d+)\b/i);
  const cfiSimpleMatch = entry.location.match(/epubcfi\(\/(\d+)\b/i);
  const chapterIndex = chapterMatch
    ? parseInt(chapterMatch[1], 10)
    : pageMatch
      ? parseInt(pageMatch[1], 10)
      : cfiNestedMatch
        ? parseInt(cfiNestedMatch[1], 10)
        : cfiSimpleMatch
          ? parseInt(cfiSimpleMatch[1], 10)
          : -1;
  const isCurrent = chapterIndex === currentIndex;
  
  return (
    <div className="premium-toc-item" style={{ paddingLeft: `${entry.level * 16}px` }}>
      <button
        onClick={() => onClick(entry)}
        className={`premium-toc-button ${isCurrent ? 'premium-toc-button--current' : ''}`}
      >
        {entry.label}
      </button>
      {entry.children && entry.children.length > 0 && (
        <div className="premium-toc-children">
          {entry.children.map((child, index) => (
            <TocItem
              key={index}
              entry={child}
              onClick={onClick}
              currentIndex={currentIndex}
            />
          ))}
        </div>
      )}
    </div>
  );
}
