import { logger } from '@/lib/logger';
import React from 'react';
import { useReaderUIStore } from '@/store/premiumReaderStore';
import { useBookReadingTime } from '@/hooks/useBookReadingTime';
import { ArrowLeft, Clock, Maximize2, Minimize2, Bookmark, ZoomIn, ZoomOut, MoreVertical } from '@/components/icons';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ReaderSettings, type ReaderFormat } from './ReaderSettings';
import { WindowControls } from '../layout/WindowControls';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useReadingSettings } from '@/store/premiumReaderStore';

interface ReaderTopBarProps {
  bookId: number;
  title: string;
  subtitle: string;
  progress: number;
  format: ReaderFormat;
  onClose: () => void;
  centerExtra?: React.ReactNode;
  rightExtra?: React.ReactNode;
}

export function ReaderTopBar({
  bookId,
  title,
  subtitle,
  progress,
  format,
  onClose,
  centerExtra,
  rightExtra,
}: ReaderTopBarProps) {
  const isTopBarVisible = useReaderUIStore(state => state.isTopBarVisible);
  const toggleSidebar = useReaderUIStore(state => state.toggleSidebar);
  const { formattedTime } = useBookReadingTime(bookId);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const increaseFontSize = useReadingSettings(state => state.increaseFontSize);
  const decreaseFontSize = useReadingSettings(state => state.decreaseFontSize);

  return (
    <div className={`premium-top-bar ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''}`} data-tauri-drag-region>
      <div className="premium-top-bar-content">
        <div className="premium-top-bar-left max-w-[60%] flex-1">
          <button
            onClick={onClose}
            className="premium-control-button shrink-0"
            aria-label="Back to library"
            title="Back to library"
          >
            <ArrowLeft className="premium-control-icon" />
          </button>
          <div className="flex flex-col min-w-0 overflow-hidden text-left">
            <span className="premium-book-title truncate block w-full">{title}</span>
            <span className="premium-chapter-indicator truncate block w-full">{subtitle}</span>
          </div>
        </div>

        <div className="premium-top-bar-center !hidden md:!flex">
          <div className="premium-reading-time" title="Reading time">
            <Clock />
            <span>{formattedTime}</span>
          </div>
          <div className="premium-top-bar-separator" />
          <span className="premium-progress-text">{Math.round(progress)}%</span>
          {centerExtra}
        </div>

        <div className="premium-top-bar-right">
          <div className="md:hidden flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="premium-control-button"
                  aria-label="More options"
                  title="More options"
                >
                  <MoreVertical className="premium-control-icon" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 flex flex-wrap gap-2 p-2 bg-[var(--bg-elevated)] border-[var(--ui-border)] shadow-lg rounded-[var(--radius-lg)]">
                {rightExtra}
                <ReaderSettings format={format} />
                <button
                  onClick={toggleFullscreen}
                  className="premium-control-button premium-fullscreen-button"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? (
                    <Minimize2 className="premium-control-icon" />
                  ) : (
                    <Maximize2 className="premium-control-icon" />
                  )}
                </button>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {rightExtra}
            <ReaderSettings format={format} />
            <button
              onClick={toggleFullscreen}
              className="premium-control-button premium-fullscreen-button"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="premium-control-icon" />
              ) : (
                <Maximize2 className="premium-control-icon" />
              )}
            </button>
            <div className="ml-2 pl-2 border-l border-[var(--ui-divider)] h-6 flex items-center">
              <WindowControls />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}