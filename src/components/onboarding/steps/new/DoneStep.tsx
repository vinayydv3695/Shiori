import { useEffect } from "react";
import { useOnboardingStore } from "../../../../store/onboardingStore";

type OnboardingStoreCompatState = {
  contentType?: "Manga" | "Book" | "Both";
  libraryPath?: string;
  booksImportedCount?: number;
  booksDuplicateCount?: number;
  mangaImportedCount?: number;
  mangaDuplicateCount?: number;
  comicsImportedCount?: number;
  comicsDuplicateCount?: number;
};

interface DoneStepProps {
  onNext?: () => void;
  onComplete?: () => void;
  registerStep?: (config: {
    nextDisabled?: boolean;
    nextLabel?: string;
    onNext?: () => void | boolean | Promise<void | boolean>;
  }) => void;
}

const getLastTwoSegments = (value?: string) => {
  if (!value) return "";
  const segments = value.split(/[/\\]/).filter(Boolean);
  if (segments.length === 0) return "";
  return segments.slice(-2).join("/");
};

export default function DoneStep({ onComplete, registerStep }: DoneStepProps) {
  useEffect(() => {
    registerStep?.({
      nextDisabled: false,
      nextLabel: "Open Shiori",
    });
  }, [registerStep]);

  const store = useOnboardingStore((s) => s);
  const storeCompat = store as typeof store & OnboardingStoreCompatState;
  const contentType = String(storeCompat.contentType || store.draftConfig.preferredContentType || "");
  const libraryPath = storeCompat.libraryPath || store.draftConfig.defaultImportPath || store.draftConfig.defaultMangaPath || "";
  const selectedTheme = String(store.selectedTheme || store.draftConfig.theme || "");
  const scanComplete = Boolean(store.scanComplete);
  const booksImportedCount = Number(storeCompat.booksImportedCount || 0);
  const booksDuplicateCount = Number(storeCompat.booksDuplicateCount || 0);
  const mangaImportedCount = Number(storeCompat.mangaImportedCount || 0);
  const mangaDuplicateCount = Number(storeCompat.mangaDuplicateCount || 0);
  const comicsImportedCount = Number(storeCompat.comicsImportedCount || 0);
  const comicsDuplicateCount = Number(storeCompat.comicsDuplicateCount || 0);
  const contentDisplay =
    contentType === "Manga" || contentType === "manga"
      ? "Manga"
      : contentType === "Book" || contentType === "books"
        ? "Book"
        : contentType === "Both" || contentType === "both"
          ? "Both"
          : "";

  const libraryDisplay = getLastTwoSegments(libraryPath);
  const themeDisplay = selectedTheme && selectedTheme !== "system" ? selectedTheme : "";

  return (
    <section className="ob-step-wrap ob-step-card">
      <div aria-hidden="true" className="ob-step-index">
        09
      </div>

      <div className="relative z-10 space-y-5">
        <div className="flex flex-col items-center gap-4 text-center">
          <svg viewBox="0 0 60 60" className="h-[60px] w-[60px]" aria-hidden="true">
            <circle
              cx="30"
              cy="30"
              r="28"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              style={{
                animation: "ob-circle-in 560ms ease-out forwards",
                opacity: 0,
              }}
            />
            <path
              d="M20 31l7 7 14-15"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 40,
                strokeDashoffset: 40,
                animation: "ob-check 500ms ease-out 250ms forwards",
              }}
            />
          </svg>

          <div>
            <p className="ob-step-kicker">Step 9 of 9</p>
            <h2 className="ob-step-title font-light">You&apos;re all set</h2>
            <p className="ob-step-subtitle">
              Shiori is ready. Your library is being indexed in the background.
            </p>
          </div>
        </div>

        {(contentDisplay || libraryDisplay || themeDisplay || booksImportedCount > 0 || booksDuplicateCount > 0 || mangaImportedCount > 0 || mangaDuplicateCount > 0 || comicsImportedCount > 0 || comicsDuplicateCount > 0) && (
          <div className="ob-card rounded-xl border border-border/70 bg-[hsl(var(--foreground)/0.03)] p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--foreground)/0.5)]">Configuration summary</p>
            <div className="space-y-2">
              {contentDisplay && (
                <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground)/0.7)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    <span className="text-[hsl(var(--foreground)/0.5)]">Content:</span> {" "}
                    {contentDisplay}
                  </span>
                </p>
              )}
              {libraryDisplay && (
                <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground)/0.7)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    <span className="text-[hsl(var(--foreground)/0.5)]">Library:</span>{" "}
                    <span className="font-mono">{libraryDisplay}</span>
                  </span>
                </p>
              )}
              {themeDisplay && (
                <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground)/0.7)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    <span className="text-[hsl(var(--foreground)/0.5)]">Theme:</span> {" "}
                    {themeDisplay}
                  </span>
                </p>
              )}
              {booksImportedCount > 0 && (
                <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground)/0.7)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    <span className="text-[hsl(var(--foreground)/0.5)]">Books imported:</span>{" "}
                    {booksImportedCount}
                  </span>
                </p>
              )}
              {booksDuplicateCount > 0 && (
                <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground)/0.7)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    <span className="text-[hsl(var(--foreground)/0.5)]">Books duplicates skipped:</span>{" "}
                    {booksDuplicateCount}
                  </span>
                </p>
              )}
              {mangaImportedCount > 0 && (
                <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground)/0.7)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    <span className="text-[hsl(var(--foreground)/0.5)]">Manga imported:</span>{" "}
                    {mangaImportedCount}
                  </span>
                </p>
              )}
              {mangaDuplicateCount > 0 && (
                <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground)/0.7)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    <span className="text-[hsl(var(--foreground)/0.5)]">Manga duplicates skipped:</span>{" "}
                    {mangaDuplicateCount}
                  </span>
                </p>
              )}
              {comicsImportedCount > 0 && (
                <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground)/0.7)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    <span className="text-[hsl(var(--foreground)/0.5)]">Comics imported:</span>{" "}
                    {comicsImportedCount}
                  </span>
                </p>
              )}
              {comicsDuplicateCount > 0 && (
                <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground)/0.7)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    <span className="text-[hsl(var(--foreground)/0.5)]">Comics duplicates skipped:</span>{" "}
                    {comicsDuplicateCount}
                  </span>
                </p>
              )}
            </div>
          </div>
        )}

        {scanComplete ? (
          <span className="ob-status ob-status-success transition-[opacity,background-color] duration-300">
            <span className="ob-status-dot" aria-hidden="true" />
            Library ready
          </span>
        ) : (
          <span className="ob-status ob-status-warning transition-[opacity,background-color] duration-300">
            <span className="ob-status-spinner" aria-hidden="true" />
            Indexing library...
          </span>
        )}

        <div className="pt-1">
          <button
            type="button"
            onClick={() => {
              onComplete?.();
            }}
            className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open Shiori
            <span className="transition-transform duration-200 group-hover:translate-x-[4px]">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
