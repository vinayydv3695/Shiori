import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReaderUIStore } from '@/store/premiumReaderStore';
import { ArrowLeft, Maximize2, Minimize2, MoreVertical } from '@/components/icons';
import { Headphones, History, Moon, Settings } from 'lucide-react';
import { ReaderTooltip } from './ReaderTooltip';
import { ReaderSettings, type ReaderFormat } from './ReaderSettings';
import { AmbientSoundBar } from './AmbientSoundBar';
import { SleepTimerDialog } from './SleepTimerDialog';
import { useSleepTimerStore } from '@/store/sleepTimerStore';
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
  const [isSleepTimerOpen, setIsSleepTimerOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const sleepTimerButtonRef = React.useRef<HTMLButtonElement>(null);
  const isSleepTimerActive = useSleepTimerStore(state => state.isActive);
  const sleepTimerRemaining = useSleepTimerStore(state => state.remainingSeconds);
  const sleepTimerDuration = useSleepTimerStore(state => state.duration);
  const [savedLastRead, setSavedLastRead] = React.useState<string | undefined>(lastRead);

  const sleepTimerBadge = sleepTimerRemaining !== null
    ? `${Math.ceil(sleepTimerRemaining / 60)}m`
    : sleepTimerDuration === 'chapter'
    ? 'Ch'
    : '';

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
      setIsSleepTimerOpen(false);
      setIsSettingsOpen(false);
    }
  }, [isTopBarVisible, isSidebarOpen]);

  React.useEffect(() => {
    setIsMoreMenuOpen(false);
    setIsDesktopMenuOpen(false);
    setShowAmbientBar(false);
    setIsSleepTimerOpen(false);
    setIsSettingsOpen(false);
  }, [bookId]);

  const extraChildren = React.Children.toArray(
    React.isValidElement(rightExtra) && rightExtra.type === React.Fragment
      ? (rightExtra.props as any).children
      : rightExtra
  );

  const getChildLabel = (child: React.ReactNode): string => {
    if (!React.isValidElement(child)) return '';
    const actualChild = (child.type === ReaderTooltip && (child.props as any).children)
      ? (child.props as any).children
      : child;
    const label = (child.type === ReaderTooltip ? (child.props as any).content : '')
      || actualChild.props?.['aria-label']
      || actualChild.props?.title
      || '';
    return String(label).toLowerCase();
  };

  // Identify Search and Bookmark specifically for minimalist Android bar
  const searchChild = extraChildren.find(c => getChildLabel(c).includes('search'));
  const bookmarkChild = extraChildren.find(c => getChildLabel(c).includes('bookmark'));

  // Android: Strictly Search & Bookmark as visible action buttons; all else into triple colons
  const androidPrimaryItems = [searchChild, bookmarkChild].filter(Boolean);
  const androidOverflowItems = extraChildren.filter(c => c !== searchChild && c !== bookmarkChild);

  // Desktop: First 3 items (Search, TOC, Bookmark), remainder in overflow
  const desktopPrimaryItems = extraChildren.slice(0, 3);
  const desktopOverflowItems = extraChildren.slice(3);

  const primaryToolbarItems = isAndroid ? androidPrimaryItems : desktopPrimaryItems;
  const overflowToolbarItems = isAndroid ? androidOverflowItems : desktopOverflowItems;

  return (
    <div
      className={`premium-top-bar ${isAndroid ? 'premium-top-bar--android' : ''} ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''} ${isSidebarOpen ? 'premium-top-bar--sidebar-open' : ''}`}
      data-tauri-drag-region
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="premium-top-bar-content">
        {/* ── LEFT: Back Button (Title & Subtitle hidden on Android per media_1792380973427_dab28333.png) ── */}
        <div className="premium-top-bar-left min-w-0 flex-1 md:max-w-[440px] lg:max-w-[560px]">
          <ReaderTooltip content="Back to library">
            <button
              onClick={onClose}
              className="premium-control-button shrink-0 cursor-pointer"
              aria-label="Back to library"
            >
              <ArrowLeft className="premium-control-icon" />
            </button>
          </ReaderTooltip>
          {!isAndroid && (
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
          )}
          {!isAndroid && isHiatus && (
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
        <div className="premium-top-bar-right flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1 sm:gap-1.5">
            {primaryToolbarItems}

            {!isAndroid && (
              <>
                <ReaderSettings format={format} />
                <ReaderTooltip content="Ambient Soundscapes">
                  <button
                    type="button"
                    className={`premium-control-button ${showAmbientBar ? 'premium-control-button--active' : ''}`}
                    aria-label="Ambient Soundscapes"
                    onClick={() => {
                      setShowAmbientBar(!showAmbientBar);
                      setIsMoreMenuOpen(false);
                      setIsSleepTimerOpen(false);
                    }}
                  >
                    <Headphones className="premium-control-icon" />
                  </button>
                </ReaderTooltip>

                <div className="relative flex items-center">
                  <ReaderTooltip content={isSleepTimerActive ? `Sleep Timer: ${sleepTimerBadge} left` : "Bedtime Sleep Timer"}>
                    <button
                      ref={sleepTimerButtonRef}
                      type="button"
                      className={`premium-control-button relative ${
                        (isSleepTimerOpen || isSleepTimerActive) ? 'premium-control-button--active' : ''
                      }`}
                      aria-label="Sleep Timer"
                      onClick={() => {
                        setIsSleepTimerOpen(!isSleepTimerOpen);
                        setIsMoreMenuOpen(false);
                        setShowAmbientBar(false);
                      }}
                    >
                      <Moon className={`premium-control-icon transition-colors ${isSleepTimerActive ? 'text-[var(--ui-focus)]' : ''}`} />
                      {isSleepTimerActive && (
                        <span
                          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full text-[9px] font-black text-white shadow-xs pointer-events-none"
                          style={{ background: 'var(--ui-focus, #eab308)' }}
                        >
                          {sleepTimerBadge}
                        </span>
                      )}
                    </button>
                  </ReaderTooltip>
                </div>
              </>
            )}

            {/* Controlled ReaderSettings on Android — invisible trigger in bar, opens bottom sheet */}
            {isAndroid && (
              <ReaderSettings
                format={format}
                isOpen={isSettingsOpen}
                onOpenChange={setIsSettingsOpen}
                hideTrigger
              />
            )}
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
                  setIsSleepTimerOpen(false);
                }}
              >
                <MoreVertical className="premium-control-icon" />
              </button>
            </ReaderTooltip>

            {/* SleepTimerDialog positioned relative to right area */}
            <SleepTimerDialog
              open={isSleepTimerOpen}
              onClose={() => setIsSleepTimerOpen(false)}
              buttonRef={sleepTimerButtonRef}
            />

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
                      {overflowToolbarItems.map((child, i) => {
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

                      {/* On Android: Reading Settings tucked into the 3-dots menu */}
                      {isAndroid && (
                        <motion.button
                          type="button"
                          variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                          onClick={() => {
                            setIsMoreMenuOpen(false);
                            setIsSettingsOpen(true);
                          }}
                          className="premium-menu-item"
                          aria-label="Reading Settings"
                        >
                          <Settings className="premium-control-icon" />
                          <span className="premium-menu-item-label">Reading Settings</span>
                        </motion.button>
                      )}

                      {/* On Android: Ambient Soundscapes and Bedtime Sleep Timer are tucked neatly in the 3-dots menu */}
                      {isAndroid && (
                        <>
                          <motion.button
                            type="button"
                            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                            onClick={() => {
                              setIsMoreMenuOpen(false);
                              setShowAmbientBar(true);
                            }}
                            className="premium-menu-item"
                            aria-label="Ambient Soundscapes"
                          >
                            <Headphones className="premium-control-icon" />
                            <span className="premium-menu-item-label">Ambient Soundscapes</span>
                            {showAmbientBar && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--ui-focus,#eab308)] ml-auto" />
                            )}
                          </motion.button>

                          <motion.button
                            type="button"
                            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                            onClick={() => {
                              setIsMoreMenuOpen(false);
                              setIsSleepTimerOpen(true);
                            }}
                            className="premium-menu-item"
                            aria-label="Bedtime Sleep Timer"
                          >
                            <Moon className={`premium-control-icon ${isSleepTimerActive ? 'text-[var(--ui-focus)]' : ''}`} />
                            <span className="premium-menu-item-label">Sleep Timer</span>
                            {isSleepTimerActive && (
                              <span
                                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white ml-auto"
                                style={{ background: 'var(--ui-focus, #eab308)' }}
                              >
                                {sleepTimerBadge} left
                              </span>
                            )}
                          </motion.button>
                        </>
                      )}

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