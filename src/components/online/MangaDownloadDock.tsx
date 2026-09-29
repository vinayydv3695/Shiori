import { useMemo, useState } from "react";
import { BookDown, ChevronDown, ChevronUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChapterDownloadStatusIcon } from "./ChapterDownloadStatusIcon";
import type { UnifiedChapter } from "./OnlineMangaDetailView";
import {
  chapterDisplayLabel,
  countChapterStatuses,
  type ChapterDownloadStatusMap,
} from "./mangaDownloadUtils";

interface MangaDownloadDockProps {
  chapters: UnifiedChapter[];
  status: ChapterDownloadStatusMap;
  onDownloadChapter: (chapter: UnifiedChapter) => void;
  onDownloadAll: () => void;
  /** Cancel an in-flight download (slice F9); partial pages are kept for resume. */
  onCancelChapter: (chapter: UnifiedChapter) => void;
}

/**
 * Floating download dock shown while a manga's detail view is open.
 * Offers per-chapter "Download Chapter" buttons (top quality) and a
 * "Download Manga" action that downloads every chapter. Uniform across
 * every manga source.
 */
export function MangaDownloadDock({
  chapters,
  status,
  onDownloadChapter,
  onDownloadAll,
  onCancelChapter,
}: MangaDownloadDockProps) {
  const [open, setOpen] = useState(false);
  const counts = useMemo(() => countChapterStatuses(status), [status]);

  if (chapters.length === 0) return null;

  const finished = counts.done + counts.failed;

  // Mobile uses inline per-chapter download buttons in the chapter list and
  // the header "Download Manga" action, so the floating dock is desktop-only.
  return (
    <div className="fixed z-40 hidden md:flex md:bottom-6 md:right-6 flex-col items-end gap-2">
      {/* Per-chapter download picker */}
      {open && (
        <div className="w-72 max-h-96 overflow-y-auto custom-scrollbar rounded-2xl border border-border/50 bg-background/95 backdrop-blur-2xl shadow-[0_0_50px_-10px_rgba(0,0,0,0.7)] p-2 flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-4">
          <p className="px-2.5 pt-1.5 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Download chapters individually
          </p>
          <ul className="flex flex-col gap-0.5">
            {chapters.map((ch) => {
              const chStatus = status[ch.id];
              const isDownloading = chStatus === "downloading";
              return (
                <li key={ch.id}>
                  <button
                    type="button"
                    data-status={chStatus ?? "idle"}
                    aria-label={isDownloading ? `Cancel download of ${chapterDisplayLabel(ch)}` : `Download ${chapterDisplayLabel(ch)}`}
                    onClick={() => (isDownloading ? onCancelChapter(ch) : onDownloadChapter(ch))}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs font-medium text-foreground/90 hover:bg-secondary transition-colors"
                  >
                    <span className="truncate">{chapterDisplayLabel(ch)}</span>
                    {isDownloading ? (
                      <span className="text-[10px] text-destructive font-bold shrink-0">Cancel</span>
                    ) : (
                      <ChapterDownloadStatusIcon status={chStatus} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="gap-1.5 h-9 px-3.5 rounded-full bg-background/90 backdrop-blur-md border-border/50 shadow-lg text-xs font-medium"
          aria-expanded={open}
        >
          <Download className="w-4 h-4 text-muted-foreground" />
          Chapters
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </Button>
        <Button
          size="sm"
          onClick={onDownloadAll}
          className="gap-1.5 h-9 px-3.5 rounded-full shadow-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <BookDown className="w-4 h-4" />
          Download All
        </Button>
      </div>

      {/* Overall batch status */}
      {finished > 0 && (
        <p className="text-[10px] font-medium text-muted-foreground bg-background/80 backdrop-blur-md rounded-full px-2.5 py-1 border border-border/40">
          {finished}/{chapters.length} chapters done
          {counts.failed > 0 && (
            <span className="text-red-400"> · {counts.failed} failed</span>
          )}
        </p>
      )}
    </div>
  );
}
