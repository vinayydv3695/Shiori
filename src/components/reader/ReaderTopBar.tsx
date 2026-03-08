import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/store/premiumReaderStore';
import { useBookReadingTime } from '@/hooks/useBookReadingTime';
import { ArrowLeft, Clock, Maximize2, Minimize2, Bookmark } from '@/components/icons';
import { ReaderSettings, type ReaderFormat } from './ReaderSettings';

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
  const isTopBarVisible = useUIStore(state => state.isTopBarVisible);
  const toggleSidebar = useUIStore(state => state.toggleSidebar);
  const { formattedTime } = useBookReadingTime(bookId);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <div className={`premium-top-bar ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''}`}>
      <div className="premium-top-bar-content">
        <div className="premium-top-bar-left">
          <button
            onClick={onClose}
            className="premium-control-button"
            aria-label="Back to library"
            title="Back to library"
          >
            <ArrowLeft className="premium-control-icon" />
          </button>
          <div className="flex flex-col">
            <span className="premium-book-title">{title}</span>
            <span className="premium-chapter-indicator">{subtitle}</span>
          </div>
        </div>

        <div className="premium-top-bar-center">
          <div className="premium-reading-time" title="Reading time">
            <Clock />
            <span>{formattedTime}</span>
          </div>
          <div className="premium-top-bar-separator" />
          <span className="premium-progress-text">{Math.round(progress)}%</span>
          {centerExtra}
        </div>

        <div className="premium-top-bar-right">
          {rightExtra}
          <button
            onClick={() => toggleSidebar('bookmarks')}
            className="premium-control-button"
            aria-label="Bookmarks"
            title="Bookmarks"
          >
            <Bookmark className="premium-control-icon" />
          </button>
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
        </div>
      </div>
    </div>
  );
}