import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReaderUIStore } from '@/store/premiumReaderStore';
import { ArrowLeft, Maximize2, Minimize2, MoreVertical } from '@/components/icons';
import { Headphones, History } from 'lucide-react';
import { ReaderTooltip } from './ReaderTooltip';
import { ReaderSettings, type ReaderFormat } from './ReaderSettings';
import { AmbientSoundBar } from './AmbientSoundBar';
import { useFullscreen } from '@/hooks/useFullscreen';
import { ConvertToEpubMenuItem } from '@/components/conversion/ConvertToEpubMenuItem';
import { checkHiatus } from '@/lib/catchUpService';
import { ChapterCatchUpModal } from './ChapterCatchUpModal';
import { api, isAndroid } from '@/lib/tauri';

interface ReaderTopBarProps {
  bookId: number;
  title: string;
  subtitle: string;
  progress: number;
  format: ReaderFormat;
  onClose: () => void;
  centerExtra?: React.ReactNode;
  rightExtra?: React.ReactNode;
  currentChapterIndex?: number;
  lastRead?: string;
  onNavigateToChapter?: (chapterIndex: number) => void;
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
  currentChapterIndex = 0,
  lastRead,
  onNavigateToChapter,
}: ReaderTopBarProps) {
  const isTopBarVisible = useReaderUIStore(state => state.isTopBarVisible);
  const isSidebarOpen = useReaderUIStore(state => state.isSidebarOpen);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [isMoreMenuOpen, setIsMoreMenuOpen] = React.useState(false);
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = React.useState(false);
  const [showAmbientBar, setShowAmbientBar] = React.useState(false);
  const [isCatchUpOpen, setIsCatchUpOpen] = React.useState(false);
  const [savedLastRead, setSavedLastRead] = React.useState<string | undefined>(lastRead);

  React.useEffect(() => {
    if (lastRead) {
      setSavedLastRead(lastRead);
      return;
    }
    api.getReadingProgress(bookId).then((p) => {
      if (p?.lastRead) {
        setSavedLastRead(p.lastRead);
      }
    }).catch(() => {});
  }, [bookId, lastRead]);

  const { isHiatus, daysAgo } = checkHiatus(savedLastRead);

  // Automatically ensure menus close whenever the topbar hides, sidebar opens, or book changes
  React.useEffect(() => {
    if (!isTopBarVisible || isSidebarOpen) {
      setIsMoreMenuOpen(false);
      setIsDesktopMenuOpen(false);
      setShowAmbientBar(false);
    }
  }, [isTopBarVisible, isSidebarOpen]);

  React.useEffect(() => {
    setIsMoreMenuOpen(false);
    setIsDesktopMenuOpen(false);
    setShowAmbientBar(false);
  }, [bookId]);

  const extraChildren = React.Children.toArray(
    React.isValidElement(rightExtra) && rightExtra.type === React.Fragment
      ? (rightExtra.props as any).children
      : rightExtra
  );

  // Desktop primary toolbar buttons: Search (0), Table of Contents (1), Bookmark (2)
  const desktopPrimary = extraChildren.slice(0, 3);
  // Desktop overflow dropdown items: Highlights, Doodle, etc. (3+)
  const desktopSecondary = extraChildren.slice(3);

  return (
    <div
      className={`premium-top-bar ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''} ${isSidebarOpen ? 'premium-top-bar--sidebar-open' : ''}`}
      data-tauri-drag-region
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="premium-top-bar-content">
        {/* ── LEFT: Back Button + Uncropped Title & Subtitle ── */}
        <div className="premium-top-bar-left max-w-[70%] sm:max-w-[80%] md:max-w-[440px] lg:max-w-[560px] flex-1">
          <ReaderTooltip content="Back to library">
            <button
              onClick={onClose}
              className="premium-control-button shrink-0 cursor-pointer"
              aria-label="Back to library"
            >
              <ArrowLeft className="premium-control-icon" />
            </button>
          </ReaderTooltip>
          <div className="flex flex-col min-w-0 overflow-hidden text-left justify-center h-full py-0.5">
            <ReaderTooltip content={title} side="bottom">
              <span className="premium-book-title truncate block w-full leading-tight font-extrabold text-xs sm:text-sm">{title}</span>
            </ReaderTooltip>
            {subtitle && (
              <ReaderTooltip content={subtitle} side="bottom">
                <span className="premium-chapter-indicator truncate block w-full leading-tight text-[10px] sm:text-xs opacity-75 font-medium mt-0.5">{subtitle}</span>
              </ReaderTooltip>
            )}
          </div>
          {isHiatus && (
            <ReaderTooltip content={`Hiatus: Last read ${daysAgo} days ago. Click for recap!`}>
              <button
                type="button"
                onClick={() => setIsCatchUpOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 border border-amber-500/30 transition-all shrink-0 cursor-pointer animate-pulse hover:animate-none"
              >
                <History className="w-3 h-3" />
                <span>Catch-Up</span>
              </button>
            </ReaderTooltip>
          )}
        </div>

        {/* ── CENTER: Optional Extra Controls ── */}
        {centerExtra && (
          <div className="premium-top-bar-center !hidden md:!flex">
            {centerExtra}
          </div>
        )}

        {/* ── RIGHT: Streamlined Reading Tools ── */}
        <div className="premium-top-bar-right flex items-center gap-1">
          {/* Primary Action Buttons (Search, TOC) */}
          <div className="flex items-center gap-1">
            {desktopPrimary}
            <ReaderSettings format={format} />
            <ReaderTooltip content="Ambient Soundscapes">
              <button
                type="button"
                className={`premium-control-button ${showAmbientBar ? 'premium-control-button--active' : ''}`}
                aria-label="Ambient Soundscapes"
                onClick={() => {
                  setShowAmbientBar(!showAmbientBar);
                  setIsMoreMenuOpen(false);
                }}
              >
                <Headphones className="premium-control-icon" />
              </button>
            </ReaderTooltip>
          </div>

          {/* More Options Dropdown */}
          <div className="relative flex items-center">
            <ReaderTooltip content="More options">
              <button
                className={`premium-control-button ${isMoreMenuOpen ? 'premium-control-button--active' : ''}`}
                aria-label="More options"
                onClick={() => {
                  setIsMoreMenuOpen(!isMoreMenuOpen);
                  setShowAmbientBar(false);
                }}
              >
                <MoreVertical className="premium-control-icon" />
              </button>
            </ReaderTooltip>

            <AnimatePresence>
              {isMoreMenuOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[95]"
                    onClick={() => setIsMoreMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="premium-dropdown-menu"
                  >
                    <motion.div
                      className="flex flex-col gap-0.5"
                      variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } }}
                      initial="hidden"
                      animate="show"
                    >
                      {desktopSecondary.map((child, i) => {
                        if (!React.isValidElement(child)) return null;
                        const actualChild = (child.type === ReaderTooltip && (child.props as any).children)
                          ? (child.props as any).children
                          : child;
                        const label = actualChild.props?.['aria-label'] || actualChild.props?.title || ((child.type === ReaderTooltip) ? (child.props as any).content : '');

                        return (
                          <motion.button
                            key={i}
                            type="button"
                            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                            onClick={(e) => {
                              setIsMoreMenuOpen(false);
                              actualChild.props?.onClick?.(e);
                            }}
                            className="premium-menu-item"
                          >
                            {actualChild.props?.children}
                            {label && <span className="premium-menu-item-label">{label}</span>}
                          </motion.button>
                        );
                      })}

                      {!isAndroid && (
                        <motion.button
                          type="button"
                          variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                          onClick={() => {
                            toggleFullscreen();
                            setIsMoreMenuOpen(false);
                          }}
                          className="premium-menu-item"
                          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                        >
                          {isFullscreen ? (
                            <Minimize2 className="premium-control-icon" />
                          ) : (
                            <Maximize2 className="premium-control-icon" />
                          )}
                          <span className="premium-menu-item-label">
                            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                          </span>
                        </motion.button>
                      )}

                      <motion.button
                        type="button"
                        variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          setIsCatchUpOpen(true);
                        }}
                        className="premium-menu-item"
                        aria-label="Previously On... (Catch-Up Recap)"
                      >
                        <History className="premium-control-icon text-amber-500" />
                        <span className="premium-menu-item-label">
                          Previously On... (Recap)
                        </span>
                      </motion.button>

                      <div className="my-1 border-t border-[var(--ui-border)] opacity-40" />

                      <motion.div
                        variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                        onClick={() => setIsMoreMenuOpen(false)}
                      >
                        <ConvertToEpubMenuItem
                          bookId={bookId}
                          bookTitle={title}
                          format={format}
                          variant="menu"
                          reopenOnSuccess
                        />
                      </motion.div>
                    </motion.div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AmbientSoundBar open={showAmbientBar} onClose={() => setShowAmbientBar(false)} />

      <ChapterCatchUpModal
        isOpen={isCatchUpOpen}
        onClose={() => setIsCatchUpOpen(false)}
        bookId={bookId}
        bookTitle={title}
        currentChapterIndex={currentChapterIndex}
        lastRead={savedLastRead}
        onNavigateToChapter={(idx) => {
          setIsCatchUpOpen(false);
          onNavigateToChapter?.(idx);
        }}
      />
    </div>
  );
}