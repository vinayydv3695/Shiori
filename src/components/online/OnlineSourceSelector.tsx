import { useMemo, useState } from 'react';
import { Globe, Wrench, AlertCircle, ChevronDown, Check, X } from 'lucide-react';
import { useSourceStore, type SourceKind } from '@/store/sourceStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isAndroid } from '@/lib/tauri';
import { useIsMobile } from '@/hooks/useIsMobile';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  mangadex: 'Official API • Multi-Language Scans',
  mangafire: 'Popular Manga & Manhwa Scraper',
  manhwahub: 'Manhwa & Webtoons Scraper',
  weebrook: 'Webcomics & Manga Scraper',
  toongod: 'Korean Webtoons & Comics',
  toonily: 'Manhwa & Webtoon Scraper',
  toontop: 'Webtoon & Comics Scraper',
  manhwaread: 'HD Manhwa & Webtoons',
  gutenberg: 'Public Domain Books (EPUB / TXT)',
  libgen: 'Direct Mirrors (EPUB / PDF)',
  'annas-archive': 'Multi-Source Shadow Library',
};

interface OnlineSourceSelectorProps {
  kind: SourceKind;
  className?: string;
  variant?: "link" | "default" | "destructive" | "outline" | "secondary" | "ghost";
  iconOnly?: boolean;
}

export function OnlineSourceSelector({ kind, className, variant = "outline", iconOnly = false }: OnlineSourceSelectorProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const allSources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const setPrimarySource = useSourceStore((state) => state.setPrimarySource);
  const isMobile = useIsMobile();
  const isMobileLayout = isMobile || isAndroid;

  const sources = useMemo(() => {
    return [...allSources]
      .filter((source) => source.kind === kind && source.id !== 'nyaa');
  }, [allSources, kind]);

  const activeSources = useMemo(
    () => sources.filter((source) => source.enabled && source.implemented),
    [sources]
  );

  const primarySource = useMemo(() => {
    const preferredId = primarySourceByKind[kind];
    const preferred = activeSources.find((source) => source.id === preferredId);
    return preferred ?? activeSources[0];
  }, [activeSources, kind, primarySourceByKind]);

  const sourceLabel = primarySource?.name ?? 'Select source';

  // ── Mobile / Android: Fitted Bottom Sheet ──
  if (isMobileLayout) {
    return (
      <>
        <Button 
          variant={variant} 
          title={sourceLabel}
          onClick={() => setSheetOpen(true)}
          className={cn(
            iconOnly 
              ? "w-9 h-9 p-0 flex items-center justify-center rounded-full outline-none select-none transition-all duration-200 shrink-0 cursor-pointer active:scale-95"
              : "group gap-2.5 outline-none select-none transition-all duration-200 cursor-pointer active:scale-95", 
            className
          )}
        >
          <Globe className="w-4 h-4 text-primary shrink-0" />
          {!iconOnly && (
            <>
              <span className="truncate max-w-[160px] font-bold">{sourceLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0 group-hover:opacity-100 transition-opacity ml-0.5" />
            </>
          )}
        </Button>

        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {sheetOpen && (
              <>
                {/* Dimmed Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setSheetOpen(false)}
                  className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs"
                />

                {/* Fitted Bottom Sheet Drawer */}
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 350 }}
                  className="fixed bottom-0 inset-x-0 z-[121] flex flex-col rounded-t-[32px] bg-background/95 backdrop-blur-2xl border-t border-border/60 shadow-2xl max-h-[85vh] select-none overflow-hidden"
                  style={{
                    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                  }}
                >
                  {/* Drag Handle */}
                  <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 mx-auto mt-3.5 mb-2 shrink-0" />

                  {/* Header */}
                  <div className="px-5 pt-1 pb-3 flex items-center justify-between border-b border-border/40 shrink-0">
                    <div>
                      <h2 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
                        {kind === 'books' ? 'Book Sources' : 'Manga Sources'}
                      </h2>
                      <p className="text-xs text-muted-foreground font-medium">
                        {activeSources.length} of {sources.length} sources active
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-transform cursor-pointer"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Source List */}
                  <div className="p-4 overflow-y-auto flex flex-col gap-2.5 max-h-[60vh] custom-scrollbar">
                    {sources.map((source) => {
                      const isSelected = primarySource?.id === source.id;
                      const isAvailable = source.enabled && source.implemented;
                      const desc = SOURCE_DESCRIPTIONS[source.id] || (source.status === 'planned' ? 'Planned integration' : 'Online Source');

                      return (
                        <div
                          key={source.id}
                          onClick={() => {
                            if (isAvailable) {
                              setPrimarySource(kind, source.id);
                              setTimeout(() => setSheetOpen(false), 120);
                            }
                          }}
                          className={cn(
                            "flex items-center justify-between gap-3.5 p-3 rounded-2xl transition-all select-none border",
                            isSelected
                              ? "bg-primary/10 border-primary/40 shadow-xs text-primary"
                              : isAvailable
                                ? "bg-card/70 hover:bg-secondary/60 border-border/50 text-foreground cursor-pointer active:scale-[0.98]"
                                : "opacity-40 cursor-not-allowed border-border/30 bg-muted/20"
                          )}
                        >
                          {/* Left: Icon Box */}
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-secondary/70 text-muted-foreground border-border/40"
                          )}>
                            {source.status === 'planned' ? (
                              <Wrench className="w-4 h-4" />
                            ) : (
                              <Globe className="w-4 h-4" />
                            )}
                          </div>

                          {/* Middle: Name & Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-sm font-bold truncate",
                                isSelected ? "text-primary" : "text-foreground"
                              )}>
                                {source.name.replace(' (Planned)', '')}
                              </span>
                              {isSelected && (
                                <span className="px-2 py-0.2 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-primary/20 text-primary border border-primary/30">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {desc}
                            </p>
                          </div>

                          {/* Right: Radio / Check Indicator */}
                          <div className="shrink-0 flex items-center justify-center">
                            {isSelected ? (
                              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full border-2 border-border/60" />
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {activeSources.length === 0 && (
                      <div className="p-3.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-2xl border border-amber-500/20 flex items-center gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>No sources currently enabled. Enable at least one source in Settings → Online Sources.</span>
                      </div>
                    )}
                  </div>

                  {/* Footer Note */}
                  <div className="px-5 py-2.5 bg-secondary/30 border-t border-border/30 text-center text-[11px] text-muted-foreground">
                    Manage and configure sources in Settings → Online Sources
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
      </>
    );
  }

  // ── Desktop: Context Dropdown Menu ──
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={variant} 
          title={sourceLabel}
          className={cn(
            iconOnly 
              ? "w-9 h-9 p-0 flex items-center justify-center rounded-full outline-none select-none transition-all duration-200 shrink-0"
              : "group gap-2.5 outline-none select-none transition-all duration-200", 
            className
          )}
        >
          <Globe className="w-4 h-4 text-primary shrink-0" />
          {!iconOnly && (
            <>
              <span className="truncate max-w-[160px] font-bold">{sourceLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0 group-hover:opacity-100 transition-opacity ml-0.5" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="start" 
        className="w-[240px] sm:w-[260px] bg-popover/95 backdrop-blur-2xl border border-border/60 shadow-2xl rounded-2xl p-1.5 z-[150] animate-in fade-in zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
      >
        <DropdownMenuLabel className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>{kind === 'books' ? 'Book Sources' : 'Manga Sources'}</span>
          <span className="text-[10px] font-semibold text-muted-foreground/60 tracking-normal normal-case">
            {activeSources.length} active
          </span>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator className="my-1 bg-border/40" />

        <div className="flex flex-col gap-0.5 max-h-[380px] overflow-y-auto custom-scrollbar p-0.5">
          {sources.map((source) => {
            const isSelected = primarySource?.id === source.id;
            const isAvailable = source.enabled && source.implemented;

            return (
              <DropdownMenuItem
                key={source.id}
                onClick={() => {
                  if (isAvailable) {
                    setPrimarySource(kind, source.id);
                  }
                }}
                className={cn(
                  "flex items-center justify-between gap-3 py-2 px-3 rounded-xl transition-all cursor-pointer select-none outline-none",
                  isSelected
                    ? "bg-primary/10 text-primary border border-primary/25 font-bold shadow-xs"
                    : isAvailable
                      ? "hover:bg-secondary/70 text-foreground border border-transparent"
                      : "opacity-45 cursor-not-allowed border border-transparent"
                )}
                disabled={!isAvailable}
              >
                <div className="flex items-center gap-2.5 truncate min-w-0">
                  <div className="flex-shrink-0 flex items-center justify-center w-4 h-4 text-muted-foreground">
                    {source.status === 'planned' ? (
                      <Wrench className="w-3.5 h-3.5 text-muted-foreground/60" />
                    ) : (
                      <Globe className={cn("w-3.5 h-3.5", isSelected ? "text-primary" : "text-muted-foreground/70")} />
                    )}
                  </div>

                  <span className={cn("text-xs sm:text-sm font-semibold truncate", isSelected && "text-primary font-bold")}>
                    {source.name.replace(' (Planned)', '')}
                  </span>
                </div>

                {isSelected && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            );
          })}
        </div>

        {activeSources.length === 0 && (
          <div className="p-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-xl border border-amber-500/20 flex items-center gap-2 m-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Enable at least one source in Settings → Online Sources.</span>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
