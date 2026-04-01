import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useOnboardingStore } from "../../../../store/onboardingStore";

type ContentType = "Manga" | "Book" | "Both";

interface ContentSetupStepProps {
  onNext?: () => void;
  registerStep?: (config: {
    nextDisabled?: boolean;
    nextLabel?: string;
    onNext?: () => void | boolean | Promise<void | boolean>;
  }) => void;
}

const toPreferred = (value: ContentType): "manga" | "books" | "both" => {
  if (value === "Manga") return "manga";
  if (value === "Book") return "books";
  return "both";
};

const getLastTwoSegments = (path: string) => {
  const normalized = path.replace(/\\+/g, "/").replace(/\/+$/g, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 2) return path;
  return `…/${segments.slice(-2).join("/")}`;
};

export default function ContentSetupStep({ registerStep }: ContentSetupStepProps) {
  const draftConfig = useOnboardingStore((s) => s.draftConfig);
  const initialType: ContentType | null =
    draftConfig.preferredContentType === "manga"
      ? "Manga"
      : draftConfig.preferredContentType === "books"
        ? "Book"
        : null;

  const [contentType, setContentType] = useState<ContentType | null>(initialType);
  const [libraryPath, setLibraryPath] = useState<string>(draftConfig.defaultImportPath || "");
  const [showValidationError, setShowValidationError] = useState(false);
  const [flashErrorBorder, setFlashErrorBorder] = useState(false);
  const flashTimerRef = useRef<number | null>(null);

  const isValid = Boolean(contentType) && Boolean(libraryPath.trim());

  const displayedPath = useMemo(() => {
    if (!libraryPath) return "Choose your library folder";
    return getLastTwoSegments(libraryPath);
  }, [libraryPath]);

  const pickDirectory = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setLibraryPath(selected);
  };

  const handleNext = useCallback(() => {
    if (!isValid || !contentType) {
      setShowValidationError(true);
      setFlashErrorBorder(true);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setFlashErrorBorder(false), 600);
      return false;
    }

    const current = useOnboardingStore.getState();
    const preferred = toPreferred(contentType);
    const defaultMangaPath =
      contentType === "Manga" || contentType === "Both"
        ? libraryPath
        : current.draftConfig.defaultMangaPath;

    useOnboardingStore.setState({
      ...current,
      contentType,
      libraryPath,
      draftConfig: {
        ...current.draftConfig,
        preferredContentType: preferred,
        defaultImportPath: libraryPath,
        defaultMangaPath,
      },
    });
    return true;
  }, [contentType, isValid, libraryPath]);

  useEffect(() => {
    if (isValid) setShowValidationError(false);
  }, [isValid]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!registerStep) return;
    registerStep({
      nextDisabled: !isValid,
      onNext: handleNext,
    });
  }, [handleNext, isValid, registerStep]);

  const options: { id: ContentType; title: string; desc: string; icon: ReactNode }[] = [
    {
      id: "Manga",
      title: "Manga & Comics",
      desc: "CBZ, CBR, image folders and comic archives.",
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <rect x="3" y="4" width="7" height="16" rx="1.5" fill="currentColor" opacity="0.9" />
          <rect x="11" y="4" width="10" height="16" rx="1.5" fill="currentColor" opacity="0.45" />
          <line x1="14" y1="8" x2="19" y2="8" stroke="currentColor" strokeWidth="1.5" />
          <line x1="14" y1="11" x2="19" y2="11" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      id: "Book",
      title: "Books & EPUB",
      desc: "EPUB, PDF, MOBI and other ebook formats.",
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v14H6.5A2.5 2.5 0 0 0 4 20.5v-14Z" fill="currentColor" opacity="0.5" />
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v14H6.5A2.5 2.5 0 0 0 4 20.5v-14Z" fill="currentColor" />
          <line x1="8" y1="8" x2="14" y2="8" stroke="hsl(var(--background))" strokeWidth="1.5" />
          <line x1="8" y1="11" x2="14" y2="11" stroke="hsl(var(--background))" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      id: "Both",
      title: "Both",
      desc: "Use one library for manga and books together.",
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <rect x="3" y="5" width="7" height="14" rx="1.5" fill="currentColor" opacity="0.9" />
          <path d="M12 6.5A2.5 2.5 0 0 1 14.5 4H21v14h-6.5A2.5 2.5 0 0 0 12 20.5v-14Z" fill="currentColor" opacity="0.45" />
        </svg>
      ),
    },
  ];

  return (
    <div className="ob-step-wrap space-y-5">
      <div className="relative ob-step-head">
        <p className="ob-step-kicker">Step 2 of 9</p>
        <h2 className="ob-step-title font-light">What will you read?</h2>
        <p className="ob-step-subtitle">Shiori adapts its interface to your collection type.</p>
        <span className="ob-step-index">02</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
          {options.map((option) => {
            const active = option.id === contentType;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setContentType(option.id)}
                className={`ob-card rounded-xl border bg-card p-5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "selected border-primary/80 bg-primary/5 shadow-[0_8px_24px_hsl(var(--primary)/0.18)]"
                    : "unselected border-border/70 hover:bg-muted/30"
                }`}
                aria-pressed={active}
              >
                <div className="mb-3 text-primary">{option.icon}</div>
                <p className="font-semibold">{option.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{option.desc}</p>
              </button>
            );
          })}
      </div>

      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[hsl(var(--foreground)/0.45)]">Library folder</p>
        <button
          type="button"
          onClick={pickDirectory}
          className={`w-full rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            flashErrorBorder ? "border-destructive" : "border-border/70"
          }`}
          aria-label="Choose library folder"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true">
                <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill="currentColor" />
              </svg>
              <span className="truncate text-sm text-foreground">{displayedPath}</span>
            </span>
            <span className="shrink-0 rounded-md border border-primary/40 px-2 py-1 text-sm font-medium text-primary">Browse</span>
          </div>
        </button>
        {libraryPath ? (
          <p className="ob-status ob-status-success ob-label-fade">
            <span className="ob-status-dot" aria-hidden="true" />
            Folder selected
          </p>
        ) : null}
      </div>

      {showValidationError && !isValid && (
        <p className="ob-status ob-status-error">
          <span className="ob-status-dot" aria-hidden="true" />
          Please choose both a content type and library folder to continue.
        </p>
      )}
    </div>
  );
}
