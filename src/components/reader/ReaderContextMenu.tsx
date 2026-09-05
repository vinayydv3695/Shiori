import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Copy,
  BookOpen,
  Languages,
  Highlighter,
  StickyNote,
  Bookmark,
  BookmarkPlus,
  BookmarkMinus,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronRight,
  Settings,
} from 'lucide-react';
import { useReadingSettings, READER_THEME_COLORS } from '@/store/premiumReaderStore';
import { isAndroid } from '@/lib/tauri';

export interface ReaderContextMenuProps {
  x: number;
  y: number;
  selectedText?: string;
  isFocusMode: boolean;
  isFullscreen: boolean;
  isBookmarked?: boolean;
  onClose: () => void;
  onSearchInBook: (query?: string) => void;
  onOpenToc: () => void;
  onOpenBookmarks: () => void;
  onOpenHighlights?: () => void;
  onToggleBookmark: () => void;
  onToggleFocusMode: () => void;
  onToggleFullscreen: () => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  onCopy?: (text: string) => void;
  onHighlight?: (text: string) => void;
  onAddNote?: (text: string) => void;
  onDefine?: (text: string) => void;
  onTranslate?: (text: string) => void;
  onOpenSettings?: () => void;
}

export function ReaderContextMenu({
  x,
  y,
  selectedText,
  isFocusMode,
  isFullscreen,
  isBookmarked = false,
  onClose,
  onSearchInBook,
  onOpenToc,
  onOpenBookmarks,
  onOpenHighlights,
  onToggleBookmark,
  onToggleFocusMode,
  onToggleFullscreen,
  onNextPage,
  onPrevPage,
  onCopy,
  onHighlight,
  onAddNote,
  onDefine,
  onTranslate,
  onOpenSettings,
}: ReaderContextMenuProps) {
  if (isAndroid) return null;

  const menuRef = useRef<HTMLDivElement>(null);
  const readerTheme = useReadingSettings((state) => state.theme) || 'paper';
  const colors = READER_THEME_COLORS[readerTheme] || READER_THEME_COLORS.paper;
  const accentColor = colors['--text-link'] || colors['--ui-focus'] || '#8B6914';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Viewport clamping - compact, minimal golden ratio width
  const menuWidth = 208;
  const estimatedHeight = selectedText ? 280 : 330;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  const left = Math.max(12, Math.min(x, viewportWidth - menuWidth - 16));
  const top = Math.max(12, Math.min(y, viewportHeight - estimatedHeight - 16));

  const hasSelection = Boolean(selectedText && selectedText.trim().length > 0);
  const trimmedSelection = hasSelection ? selectedText!.trim() : '';

  const act = (cb?: () => void) => () => {
    cb?.();
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.94, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.08 } }}
        transition={{ type: 'spring', damping: 28, stiffness: 420, mass: 0.6 }}
        style={{
          position: 'fixed',
          left: `${left}px`,
          top: `${top}px`,
          width: `${menuWidth}px`,
          backgroundColor: colors['--bg-elevated'] || '#FAF7F2',
          borderColor: colors['--ui-border'] || 'rgba(0, 0, 0, 0.14)',
          color: colors['--text-primary'] || '#2C2416',
          boxShadow: `0 20px 45px -8px rgba(0, 0, 0, 0.26), 0 8px 18px -4px rgba(0, 0, 0, 0.14), 0 0 0 1px ${colors['--ui-border'] || 'rgba(0, 0, 0, 0.08)'}`,
          zIndex: 99999,
          opacity: 1,
        }}
        className="rounded-2xl border p-1.5 select-none text-xs font-sans shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Selection Context Items */}
        {hasSelection ? (
          <>
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider opacity-45">
              Selection
            </div>
            <MenuItem
              icon={<Search size={14} />}
              label={`Search "${trimmedSelection.length > 12 ? trimmedSelection.slice(0, 12) + '…' : trimmedSelection}"`}
              accentColor={accentColor}
              onClick={act(() => onSearchInBook(trimmedSelection))}
            />
            {onCopy && (
              <MenuItem
                icon={<Copy size={14} />}
                label="Copy"
                accentColor={accentColor}
                onClick={act(() => onCopy(trimmedSelection))}
              />
            )}
            {onDefine && trimmedSelection.split(/\s+/).length <= 4 && (
              <MenuItem
                icon={<BookOpen size={14} />}
                label="Define"
                accentColor={accentColor}
                onClick={act(() => onDefine(trimmedSelection))}
              />
            )}
            {onTranslate && (
              <MenuItem
                icon={<Languages size={14} />}
                label="Translate"
                accentColor={accentColor}
                onClick={act(() => onTranslate(trimmedSelection))}
              />
            )}
            {onHighlight && (
              <MenuItem
                icon={<Highlighter size={14} />}
                label="Highlight"
                accentColor={accentColor}
                onClick={act(() => onHighlight(trimmedSelection))}
              />
            )}
            {onAddNote && (
              <MenuItem
                icon={<StickyNote size={14} />}
                label="Add Note"
                accentColor={accentColor}
                onClick={act(() => onAddNote(trimmedSelection))}
              />
            )}

            <div
              className="my-1.5 mx-2 h-px"
              style={{ backgroundColor: colors['--ui-divider'] || 'rgba(0,0,0,0.08)' }}
            />
          </>
        ) : null}

        {/* Global Reader Actions */}
        {!hasSelection && (
          <>
            <MenuItem
              icon={<Search size={14} />}
              label="Search in Book"
              accentColor={accentColor}
              highlightIcon
              onClick={act(() => onSearchInBook())}
            />
            <MenuItem
              icon={<BookOpen size={14} />}
              label="Table of Contents"
              accentColor={accentColor}
              onClick={act(onOpenToc)}
            />
            <MenuItem
              icon={<Bookmark size={14} />}
              label="Bookmarks"
              accentColor={accentColor}
              onClick={act(onOpenBookmarks)}
            />
            <MenuItem
              icon={<Highlighter size={14} />}
              label="Highlights & Notes"
              accentColor={accentColor}
              onClick={act(() => onOpenHighlights ? onOpenHighlights() : onOpenBookmarks())}
            />
          </>
        )}

        <MenuItem
          icon={isBookmarked ? <BookmarkMinus size={14} /> : <BookmarkPlus size={14} />}
          label={isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
          accentColor={accentColor}
          isActive={isBookmarked}
          onClick={act(onToggleBookmark)}
        />

        <div
          className="my-1.5 mx-2 h-px"
          style={{ backgroundColor: colors['--ui-divider'] || 'rgba(0,0,0,0.08)' }}
        />

        <MenuItem
          icon={isFocusMode ? <EyeOff size={14} /> : <Eye size={14} />}
          label={isFocusMode ? 'Exit Focus Mode' : 'Focus Mode'}
          accentColor={accentColor}
          isActive={isFocusMode}
          onClick={act(onToggleFocusMode)}
        />

        <MenuItem
          icon={isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          accentColor={accentColor}
          isActive={isFullscreen}
          onClick={act(onToggleFullscreen)}
        />

        <div
          className="my-1.5 mx-2 h-px"
          style={{ backgroundColor: colors['--ui-divider'] || 'rgba(0,0,0,0.08)' }}
        />

        <MenuItem
          icon={<ChevronLeft size={14} />}
          label="Previous Page"
          accentColor={accentColor}
          onClick={act(onPrevPage)}
        />

        <MenuItem
          icon={<ChevronRight size={14} />}
          label="Next Page"
          accentColor={accentColor}
          onClick={act(onNextPage)}
        />

        {onOpenSettings && (
          <>
            <div
              className="my-1.5 mx-2 h-px"
              style={{ backgroundColor: colors['--ui-divider'] || 'rgba(0,0,0,0.08)' }}
            />
            <MenuItem
              icon={<Settings size={14} />}
              label="Reading Settings"
              accentColor={accentColor}
              onClick={act(onOpenSettings)}
            />
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  accentColor?: string;
  highlightIcon?: boolean;
  isActive?: boolean;
  onClick: () => void;
  onClose?: () => void;
}

function MenuItem({
  icon,
  label,
  accentColor,
  highlightIcon,
  isActive,
  onClick,
  onClose,
}: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
        onClose?.();
      }}
      className="group w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[13px] font-medium transition-all duration-150 text-left cursor-pointer active:scale-[0.985] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          style={{
            backgroundColor: highlightIcon || isActive
              ? `color-mix(in srgb, ${accentColor || 'currentColor'} 16%, transparent)`
              : 'color-mix(in srgb, currentColor 6%, transparent)',
            color: highlightIcon || isActive ? accentColor : 'inherit',
          }}
        >
          {icon}
        </div>
        <span className="truncate tracking-tight">{label}</span>
      </div>

      {isActive && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 mr-1"
          style={{ backgroundColor: accentColor || '#10b981' }}
        />
      )}
    </button>
  );
}
