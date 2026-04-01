import { useEffect, useState } from "react";
import { api, type ImportResult } from "../../../../lib/tauri";
import { useOnboardingStore } from "../../../../store/onboardingStore";

interface ImportMangaStepProps {
  onNext?: () => void;
  registerStep?: (config: {
    nextDisabled?: boolean;
    nextLabel?: string;
    onNext?: () => void | boolean | Promise<void | boolean>;
  }) => void;
}

export default function ImportMangaStep({ registerStep }: ImportMangaStepProps) {
  const contentType = useOnboardingStore((s) => s.contentType);
  const preferred = useOnboardingStore((s) => s.draftConfig.preferredContentType);
  const setMangaImportSummary = useOnboardingStore((s) => s.setMangaImportSummary);
  const includeManga =
    contentType === "Manga" ||
    contentType === "Both" ||
    preferred === "manga" ||
    preferred === "both";
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    registerStep?.({
      nextDisabled: false,
      nextLabel: "Continue",
      onNext: () => true,
    });
  }, [registerStep]);

  const applyResult = (importResult: ImportResult, successMessage: string) => {
    setResult(importResult);
    setMangaImportSummary(importResult.success.length, importResult.duplicates.length);
    setStatus({ type: "success", message: successMessage });
  };

  const handleImportFiles = async () => {
    if (!includeManga) return;
    setIsLoading(true);
    setStatus(null);
    try {
      const paths = await api.openFileDialog();
      if (!paths || paths.length === 0) {
        setStatus({ type: "error", message: "No files selected." });
        return;
      }

      const importResult = await api.importManga(paths);
      applyResult(importResult, "Manga imported successfully.");
    } catch {
      setStatus({ type: "error", message: "Failed to import selected manga files." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanFolder = async () => {
    if (!includeManga) return;
    setIsLoading(true);
    setStatus(null);
    try {
      const folderPath = await api.openFolderDialog();
      if (!folderPath) {
        setStatus({ type: "error", message: "No folder selected." });
        return;
      }

      const importResult = await api.scanFolderForManga(folderPath);
      applyResult(importResult, "Manga folder scan completed.");
    } catch {
      setStatus({ type: "error", message: "Failed to scan manga folder." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="ob-step-wrap ob-step-card space-y-5">
      <div className="relative ob-step-head">
        <p className="ob-step-kicker">Step 4 of 9</p>
        <h2 className="ob-step-title font-light">Import your manga</h2>
        <p className="ob-step-subtitle">
          Add CBZ, CBR and supported archives to your library.
        </p>
        <span className="ob-step-index">04</span>
      </div>

      <div className="rounded-xl border border-border/70 bg-[hsl(var(--foreground)/0.02)] p-5 text-sm text-muted-foreground">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleImportFiles}
              disabled={!includeManga || isLoading}
              className="rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:border-border/60 disabled:bg-muted/40 disabled:text-[hsl(var(--foreground)/0.45)]"
            >
              {isLoading ? "Importing..." : "Import selected manga files"}
            </button>
            <button
              type="button"
              onClick={handleScanFolder}
              disabled={!includeManga || isLoading}
              className="rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:border-border/60 disabled:bg-muted/40 disabled:text-[hsl(var(--foreground)/0.45)]"
            >
              {isLoading ? "Scanning..." : "Scan manga folder"}
            </button>
          </div>

          {!includeManga && (
            <p className="ob-status ob-status-muted">
              <span className="ob-status-dot" aria-hidden="true" />
              Manga import skipped for books-only setup.
            </p>
          )}

          {status && (
            <p className={`ob-status ${status.type === "success" ? "ob-status-success" : "ob-status-error"}`}>
              <span className="ob-status-dot" aria-hidden="true" />
              {status.message}
            </p>
          )}

          {result && (
            <div className="ob-metric-grid">
              <div className="ob-metric-card">
                <p className="ob-metric-label">Imported</p>
                <p className="ob-metric-value ob-metric-value-success">{result.success.length}</p>
              </div>
              <div className="ob-metric-card">
                <p className="ob-metric-label">Duplicates</p>
                <p className="ob-metric-value ob-metric-value-warning">{result.duplicates.length}</p>
              </div>
              <div className="ob-metric-card">
                <p className="ob-metric-label">Failed</p>
                <p className="ob-metric-value ob-metric-value-error">{result.failed.length}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
