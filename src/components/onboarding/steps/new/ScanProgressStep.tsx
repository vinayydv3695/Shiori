import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Card, CardContent } from "../../../ui/Card";
import { useOnboardingStore } from "../../../../store/onboardingStore";

interface ScanProgressStepProps {
  onNext?: () => void;
  registerStep?: (config: {
    nextDisabled?: boolean;
    nextLabel?: string;
    onNext?: () => void | boolean | Promise<void | boolean>;
  }) => void;
}

type ScanProgressPayload = {
  scanned?: number;
  total?: number;
  current_file?: string;
};

type ContentType = "Manga" | "Book" | "Both";

export default function ScanProgressStep({ onNext, registerStep }: ScanProgressStepProps) {
  const [scanned, setScanned] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [scanComplete, setScanCompleteState] = useState(false);

  const state = useOnboardingStore((s) => s);
  const path = state.libraryPath || state.draftConfig.defaultImportPath || state.draftConfig.defaultMangaPath || "";
  const contentType: ContentType =
    state.contentType === "Manga" || state.contentType === "Book" || state.contentType === "Both"
      ? state.contentType
      : state.draftConfig.preferredContentType === "manga"
        ? "Manga"
        : state.draftConfig.preferredContentType === "books"
          ? "Book"
          : "Both";

  useEffect(() => {
    let active = true;
    let unlistenProgress: undefined | (() => void);
    let unlistenComplete: undefined | (() => void);

    const setup = async () => {
      unlistenProgress = await listen<ScanProgressPayload>("scan_progress", (event) => {
        if (!active) return;
        const payload = event.payload || {};
        if (typeof payload.scanned === "number") setScanned(Math.max(0, payload.scanned));
        if (typeof payload.total === "number") setTotal(Math.max(0, payload.total));
        if (payload.current_file) setCurrentFile(payload.current_file);
      });

      unlistenComplete = await listen("scan_complete", () => {
        if (!active) return;
        setScanCompleteState(true);
        useOnboardingStore.getState().setScanComplete(true);
      });

      if (path) {
        setScanCompleteState(false);
        await invoke("start_background_scan", { library_path: path, content_type: contentType });
      } else {
        setScanCompleteState(true);
      }
    };

    void setup();
    return () => {
      active = false;
      unlistenProgress?.();
      unlistenComplete?.();
    };
  }, [contentType, path]);

  const filename = useMemo(() => {
    const parts = currentFile.split(/[/\\]/);
    return parts[parts.length - 1] || "Waiting for files...";
  }, [currentFile]);

  const progress = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;
  const nextLabel = scanComplete ? "All done →" : "Continue in background →";
  const ringRadius = 54;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (progress / 100) * ringCircumference;

  useEffect(() => {
    registerStep?.({
      nextLabel,
      onNext: () => {
        return true;
      },
    });
  }, [nextLabel, registerStep]);

  return (
    <Card className="ob-step-wrap border-border/70 shadow-sm">
      <CardContent className="space-y-5 p-6">
        <div className="relative ob-step-head">
          <p className="ob-step-kicker">Step 8 of 9</p>
          <h2 className="ob-step-title font-light">Indexing your library</h2>
          <p className="ob-step-subtitle">This runs in the background — you can continue while it works.</p>
          <span className="ob-step-index">08</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Library scan progress ring">
            <circle cx="60" cy="60" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle
              cx="60"
              cy="60"
              r={ringRadius}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset 200ms ease" }}
            />
            <text x="60" y="58" textAnchor="middle" className="fill-white text-[24px] font-light">{progress}%</text>
            <text x="60" y="76" textAnchor="middle" className="fill-white/40 text-[11px]">files</text>
          </svg>

          <p className="w-full max-w-xl truncate text-center text-sm text-muted-foreground">{filename}</p>
          <p className="w-full max-w-xl text-center text-xs text-muted-foreground">{scanned} of {total || 0} files</p>

          <div className="w-full max-w-xl">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className={`text-center text-[11px] text-white/30 transition-opacity duration-300 ${scanComplete ? "opacity-0" : "opacity-100"}`}>
            Your library will be ready when you finish setup.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
