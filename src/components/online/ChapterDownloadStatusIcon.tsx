import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type { ChapterDownloadStatus } from "./mangaDownloadUtils";

/** Per-chapter download lifecycle icon (idle → queued → downloading → done/failed). */
export function ChapterDownloadStatusIcon({
  status,
}: {
  status?: ChapterDownloadStatus;
}) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />;
    case "failed":
      return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    case "downloading":
      return (
        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
      );
    case "queued":
      return <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
    case "cancelled":
      // Cancelled = partial pages kept; the row click resumes the download.
      return <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    default:
      return <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  }
}
