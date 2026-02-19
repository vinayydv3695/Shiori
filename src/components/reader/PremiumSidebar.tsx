import { useEffect, useState } from 'react';
import { useUIStore } from '@/store/premiumReaderStore';
import { api } from '@/lib/tauri';
import type { TocEntry, Annotation, BookSearchResult } from '@/lib/tauri';
import { X, BookOpen, Highlighter, FileText, Bookmark, Search } from '@/components/icons';

interface PremiumSidebarProps {
  bookId: number;
  currentIndex: number;
  onNavigate: (chapterIndex: number, searchTerm?: string | null) => void;
}

export function PremiumSidebar({ bookId, currentIndex, onNavigate }: PremiumSidebarProps) {
  const { isSidebarOpen, sidebarTab, closeSidebar, setSidebarTab } = useUIStore();
  
  // Tab data states
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BookSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Load TOC on mount
  useEffect(() => {
    if (bookId) {
      loadToc();
      loadAnnotations();
    }
  }, [bookId]);
  
  const loadToc = async () => {
    try {
      const tocData = await api.getBookToc(bookId);
      setToc(tocData);
    } catch (err) {
      console.error('[PremiumSidebar] Failed to load TOC:', err);
    }
  };
  
  const loadAnnotations = async () => {
    try {
      const annotationsData = await api.getAnnotations(bookId);
      setAnnotations(annotationsData);
    } catch (err) {
      console.error('[PremiumSidebar] Failed to load annotations:', err);
    }
  };
  
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await api.searchInBook(bookId, searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error('[PremiumSidebar] Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleTocClick = (entry: TocEntry) => {
    // Parse chapter index from location format: "epubcfi(/0/)", "epubcfi(/1/)", etc.
    const match = entry.location.match(/epubcfi\(\/(\d+)\//);
    if (match) {
      const index = parseInt(match[1], 10);
      console.log('[PremiumSidebar] Navigating to chapter:', index, 'from TOC entry:', entry.label);
      onNavigate(index);
      closeSidebar();
    } else {
      console.warn('[PremiumSidebar] Could not parse chapter index from location:', entry.location);
    }
  };
  
  const handleSearchResultClick = (result: BookSearchResult) => {
    console.log('[PremiumSidebar] Navigating to search result, chapter:', result.chapter_index, 'query:', searchQuery);
    onNavigate(result.chapter_index, searchQuery);
    closeSidebar();
  };
  
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeSidebar();
    }
  };
  
  // Filter annotations by type
  const highlights = annotations.filter(a => a.annotationType === 'highlight');
  const notes = annotations.filter(a => a.annotationType === 'note');
  const bookmarks = annotations.filter(a => a.annotationType === 'bookmark');
  
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
                    <div key={highlight.id} className="premium-annotation-item">
                      <div 
                        className="premium-annotation-color"
                        style={{ backgroundColor: highlight.color }}
                      />
                      <div className="premium-annotation-content">
                        <p className="premium-annotation-text">{highlight.selectedText}</p>
                        <span className="premium-annotation-location">{highlight.location}</span>
                      </div>
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
                    <div key={note.id} className="premium-annotation-item">
                      <div className="premium-annotation-content">
                        <p className="premium-annotation-note">{note.noteContent}</p>
                        {note.selectedText && (
                          <p className="premium-annotation-text">{note.selectedText}</p>
                        )}
                        <span className="premium-annotation-location">{note.location}</span>
                      </div>
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
                    <div key={bookmark.id} className="premium-annotation-item premium-annotation-item--clickable">
                      <div className="premium-annotation-content">
                        <p className="premium-annotation-location">{bookmark.location}</p>
                        <span className="premium-annotation-date">
                          {new Date(bookmark.createdAt).toLocaleDateString()}
                        </span>
                      </div>
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
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search..."
                  className="premium-search-input"
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="premium-search-button"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>
              
              {searchResults.length > 0 && (
                <div className="premium-search-results">
                  <p className="premium-search-count">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </p>
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      className="premium-search-result"
                      onClick={() => handleSearchResultClick(result)}
                    >
                      <p className="premium-search-result-chapter">{result.chapter_title}</p>
                      <p className="premium-search-result-snippet">{result.snippet}</p>
                      <span className="premium-search-result-matches">
                        {result.match_count} match{result.match_count !== 1 ? 'es' : ''}
                      </span>
                    </div>
                  ))}
                </div>
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
  const match = entry.location.match(/chapter[_-]?(\d+)/i);
  const chapterIndex = match ? parseInt(match[1], 10) : -1;
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
