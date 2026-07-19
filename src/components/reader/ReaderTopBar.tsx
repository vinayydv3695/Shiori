import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReaderUIStore } from '@/store/premiumReaderStore';
import { useBookReadingTime } from '@/hooks/useBookReadingTime';
import { ArrowLeft, Clock, Maximize2, Minimize2, MoreVertical } from '@/components/icons';
// Removed DropdownMenu imports
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
  const [isMoreMenuOpen, setIsMoreMenuOpen] = React.useState(false);

  return (
    <div className={`premium-top-bar ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''}`} data-tauri-drag-region>
      <div className="premium-top-bar-content">
        <div className="premium-top-bar-left max-w-[75%] md:max-w-[60%] flex-1">
          <button
            onClick={onClose}
            className="premium-control-button shrink-0"
            aria-label="Back to library"
            title="Back to library"
          >
            <ArrowLeft className="premium-control-icon" />
          </button>
          <div className="flex flex-col min-w-0 overflow-hidden text-left justify-center h-full">
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
          <div className="md:hidden flex items-center relative">
            <button
              className={`premium-control-button ${isMoreMenuOpen ? 'premium-control-button--active' : ''}`}
              aria-label="More options"
              title="More options"
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            >
              <MoreVertical className="premium-control-icon" />
            </button>
            
            <AnimatePresence>
              {isMoreMenuOpen && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[95]" 
                    onClick={() => setIsMoreMenuOpen(false)} 
                  />
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full right-0 mt-2 w-56 flex flex-col p-2 bg-[var(--bg-elevated)] border border-[var(--ui-border)] shadow-xl rounded-[var(--radius-lg)] z-[100] backdrop-blur-xl bg-opacity-90"
                  >
                    <motion.div 
                      className="w-full flex flex-col gap-1 pb-2 premium-mobile-menu-items" 
                      onClick={() => setIsMoreMenuOpen(false)}
                      variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}
                      initial="hidden"
                      animate="show"
                    >
                      {React.Children.toArray(React.isValidElement(rightExtra) && rightExtra.type === React.Fragment ? (rightExtra.props as any).children : rightExtra).map((child, i) => (
                        <motion.div key={i} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                          {child}
                        </motion.div>
                      ))}
                      <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
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
                      </motion.div>
                    </motion.div>
                    <motion.div 
                      className="w-full border-t border-[var(--ui-border)] pt-2 flex flex-col gap-1 premium-mobile-menu-items"
                      variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.15 } } }}
                      initial="hidden"
                      animate="show"
                    >
                      <ReaderSettings format={format} />
                    </motion.div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
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