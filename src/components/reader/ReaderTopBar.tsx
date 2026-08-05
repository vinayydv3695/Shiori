import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReaderUIStore } from '@/store/premiumReaderStore';
import { ArrowLeft, Maximize2, Minimize2, MoreVertical } from '@/components/icons';
import { ReaderSettings, type ReaderFormat } from './ReaderSettings';
import { useFullscreen } from '@/hooks/useFullscreen';
import { ConvertToEpubMenuItem } from '@/components/conversion/ConvertToEpubMenuItem';

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
  const isSidebarOpen = useReaderUIStore(state => state.isSidebarOpen);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [isMoreMenuOpen, setIsMoreMenuOpen] = React.useState(false);
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = React.useState(false);

  const extraChildren = React.Children.toArray(
    React.isValidElement(rightExtra) && rightExtra.type === React.Fragment
      ? (rightExtra.props as any).children
      : rightExtra
  );

  // Desktop primary toolbar buttons: Search (0) & Table of Contents (1)
  const desktopPrimary = extraChildren.slice(0, 2);
  // Desktop overflow dropdown items: Highlights, Two-Page, Doodle, etc. (2+)
  const desktopSecondary = extraChildren.slice(2);

  return (
    <div
      className={`premium-top-bar ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''} ${isSidebarOpen ? 'premium-top-bar--sidebar-open' : ''}`}
      data-tauri-drag-region
    >
      <div className="premium-top-bar-content">
        {/* ── LEFT: Back Button + Uncropped Title & Subtitle ── */}
        <div className="premium-top-bar-left max-w-[70%] sm:max-w-[80%] md:max-w-[440px] lg:max-w-[560px] flex-1">
          <button
            onClick={onClose}
            className="premium-control-button shrink-0"
            aria-label="Back to library"
            title="Back to library"
          >
            <ArrowLeft className="premium-control-icon" />
          </button>
          <div className="flex flex-col min-w-0 overflow-hidden text-left justify-center h-full">
            <span className="premium-book-title truncate block w-full" title={title}>{title}</span>
            <span className="premium-chapter-indicator truncate block w-full" title={subtitle}>{subtitle}</span>
          </div>
        </div>

        {/* ── CENTER: Optional Extra Controls ── */}
        {centerExtra && (
          <div className="premium-top-bar-center !hidden md:!flex">
            {centerExtra}
          </div>
        )}

        {/* ── RIGHT: Streamlined Reading Tools ── */}
        <div className="premium-top-bar-right">
          {/* Mobile More Options Dropdown */}
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
                      {extraChildren.map((child, i) => (
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
                      <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                        <ConvertToEpubMenuItem
                          bookId={bookId}
                          bookTitle={title}
                          format={format}
                          variant="menu"
                          reopenOnSuccess
                        />
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

          {/* Desktop Streamlined Controls (Search, TOC, Appearance + More Dropdown) */}
          <div className="hidden md:flex items-center gap-1.5">
            {desktopPrimary}
            <ReaderSettings format={format} />
            
            {/* Desktop More Options Dropdown */}
            <div className="relative">
              <button
                className={`premium-control-button ${isDesktopMenuOpen ? 'premium-control-button--active' : ''}`}
                aria-label="More options"
                title="More options"
                onClick={() => setIsDesktopMenuOpen(!isDesktopMenuOpen)}
              >
                <MoreVertical className="premium-control-icon" />
              </button>

              <AnimatePresence>
                {isDesktopMenuOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[95]"
                      onClick={() => setIsDesktopMenuOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute top-full right-0 mt-2.5 w-60 flex flex-col p-1.5 bg-[var(--bg-elevated)] border border-[var(--ui-border)] shadow-2xl rounded-2xl z-[100] backdrop-blur-2xl bg-opacity-95"
                    >
                      <div className="flex flex-col gap-1 premium-desktop-menu-items">
                        {desktopSecondary.map((child, i) => (
                          <div key={i} onClick={() => setIsDesktopMenuOpen(false)}>
                            {child}
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => {
                            toggleFullscreen();
                            setIsDesktopMenuOpen(false);
                          }}
                          className="premium-control-button"
                          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                        >
                          {isFullscreen ? (
                            <Minimize2 className="premium-control-icon" />
                          ) : (
                            <Maximize2 className="premium-control-icon" />
                          )}
                        </button>

                        <div className="my-1 border-t border-[var(--ui-border)] opacity-50" />

                        <div onClick={() => setIsDesktopMenuOpen(false)}>
                          <ConvertToEpubMenuItem
                            bookId={bookId}
                            bookTitle={title}
                            format={format}
                            variant="menu"
                            reopenOnSuccess
                          />
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}