import { useCallback, useEffect, useState } from "react";
import { useOnboardingStore } from "../../../../store/onboardingStore";
import type { Direction, MangaMode, Theme } from "../../../../types/preferences";
import { DEFAULT_BOOK_PREFERENCES, DEFAULT_MANGA_PREFERENCES } from "../../../../types/preferences";

interface ReadingPrefsStepProps {
  onNext?: () => void;
  registerStep?: (config: {
    nextDisabled?: boolean;
    nextLabel?: string;
    onNext?: () => void | boolean | Promise<void | boolean>;
  }) => void;
}

type ThemeOption = "White" | "Black" | "Rose Pine Moon" | "Catppuccin Mocha" | "Nord" | "Dracula" | "Tokyo Night";

const themeMap: Record<ThemeOption, Theme> = {
  White: "white",
  Black: "black",
  "Rose Pine Moon": "rose-pine-moon",
  "Catppuccin Mocha": "catppuccin-mocha",
  Nord: "nord",
  Dracula: "dracula",
  "Tokyo Night": "tokyo-night",
};

const themePreviewColors: Record<ThemeOption, string> = {
  White: "#f5f5f0",
  Black: "#0d0d0f",
  "Rose Pine Moon": "#232136",
  "Catppuccin Mocha": "#1e1e2e",
  Nord: "#2e3440",
  Dracula: "#282a36",
  "Tokyo Night": "#1a1b26",
};

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  const toggle = () => onChange(!checked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      className={`inline-flex h-5 w-9 items-center rounded-full border border-border/60 transition ${checked ? "bg-primary" : "bg-muted"}`}
      aria-label={label}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-background transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        aria-hidden="true"
      />
    </button>
  );
}

export default function ReadingPrefsStep({ registerStep }: ReadingPrefsStepProps) {
  const draft = useOnboardingStore((s) => s.draftConfig);
  const [selectedTheme, setSelectedTheme] = useState<Theme>(draft.theme ?? "white");
  const [uiScale, setUiScale] = useState<number>(Math.round((draft.uiScale ?? 1) * 100));
  const [readingMode, setReadingMode] = useState<MangaMode>(draft.manga?.mode ?? "single");
  const [readingDirection, setReadingDirection] = useState<Direction>(draft.manga?.direction ?? "ltr");
  const [autoGroupSeries, setAutoGroupSeries] = useState<boolean>(draft.autoGroupManga ?? true);
  const [imagePreloadCount, setImagePreloadCount] = useState<number>(draft.manga?.preloadCount ?? 2);
  const [reduceAnimations, setReduceAnimations] = useState<boolean>((draft.performanceMode || "") === "low_memory");

  const sampleFontSize = `${Math.max(12, Math.round((16 * uiScale) / 100))}px`;

  const applyTheme = (nextTheme: Theme) => {
    const domTheme = nextTheme === "light" ? "white" : nextTheme === "dark" ? "black" : nextTheme;
    document.documentElement.setAttribute("data-theme", domTheme);
    setSelectedTheme(nextTheme);
  };

  const toggleReduceMotion = (value: boolean) => {
    setReduceAnimations(value);
    document.documentElement.classList.toggle("reduce-motion", value);
  };

  const handleNext = useCallback(() => {
    const current = useOnboardingStore.getState();
    const baseBook = current.draftConfig.book ?? DEFAULT_BOOK_PREFERENCES;
    const baseManga = current.draftConfig.manga ?? DEFAULT_MANGA_PREFERENCES;
    useOnboardingStore.setState({
      ...current,
      selectedTheme,
      uiScale,
      readingMode,
      readingDirection,
      autoGroupSeries,
      imagePreloadCount,
      reduceAnimations,
      draftConfig: {
        ...current.draftConfig,
        theme: selectedTheme,
        uiScale: uiScale / 100,
        uiDensity: uiScale <= 90 ? "compact" : "comfortable",
        book: {
          ...baseBook,
          fontSize: Math.max(14, Math.round((16 * uiScale) / 100)),
          lineHeight: uiScale <= 90 ? 1.45 : uiScale >= 110 ? 1.7 : 1.6,
        },
        autoGroupManga: autoGroupSeries,
        performanceMode: reduceAnimations ? "low_memory" : "standard",
        manga: {
          ...baseManga,
          mode: readingMode,
          direction: readingDirection,
          preloadCount: imagePreloadCount,
        },
      },
    });
    return true;
  }, [autoGroupSeries, imagePreloadCount, readingDirection, readingMode, reduceAnimations, selectedTheme, uiScale]);

  useEffect(() => {
    registerStep?.({ onNext: handleNext, nextDisabled: false });
  }, [handleNext, registerStep]);

  return (
    <div className="ob-step-wrap space-y-5">
      <header className="relative ob-step-head">
        <p className="ob-step-kicker">Step 6 of 9</p>
        <h2 className="ob-step-title font-light">Make it yours</h2>
        <p className="ob-step-subtitle">Shiori&apos;s interface adapts to how you read.</p>
        <span className="ob-step-index">06</span>
      </header>

      <section className="space-y-3">
        <p className="text-sm font-semibold">Theme</p>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {(Object.keys(themeMap) as ThemeOption[]).map((label) => {
            const value = themeMap[label];
            const active = value === selectedTheme;
            const previewTextClass = label === "White" ? "text-black" : "text-white";
            return (
              <button
                key={label}
                type="button"
                onClick={() => applyTheme(value)}
                className={`min-w-[120px] flex-shrink-0 rounded-xl border p-3 text-left transition-all ${
                  active
                    ? "scale-105 border-2 border-primary shadow-[0_0_0_1px_hsl(var(--primary)),0_0_20px_hsl(var(--primary)/0.35)]"
                    : "border-border/70 opacity-60 hover:opacity-100"
                }`}
              >
                <div
                  className={`flex h-16 w-[88px] items-center justify-center rounded-lg border border-white/10 text-xs ${previewTextClass}`}
                  style={{ backgroundColor: themePreviewColors[label] }}
                >
                  Aa
                </div>
                <p className="mt-2 text-xs font-medium leading-tight">{label}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold">Reading mode</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            { mode: "single" as const, label: "Single", desc: "Focused", icon: <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" focusable="false"><rect x="6" y="4" width="12" height="16" rx="1.5" fill="currentColor" /></svg> },
            { mode: "double" as const, label: "Double", desc: "Spread", icon: <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" focusable="false"><rect x="3" y="5" width="8" height="14" rx="1.5" fill="currentColor" /><rect x="13" y="5" width="8" height="14" rx="1.5" fill="currentColor" /></svg> },
            { mode: "long-strip" as const, label: "Long strip", desc: "Scroll", icon: <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" focusable="false"><rect x="8" y="2" width="8" height="20" rx="1.5" fill="currentColor" /></svg> },
          ]).map((option) => {
            const active = readingMode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => setReadingMode(option.mode)}
                className={`rounded-xl border p-4 text-left transition ${active ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/30"}`}
              >
                <span className="mb-3 block text-primary">{option.icon}</span>
                <span className="text-sm font-medium">{option.label}</span>
                <p className="mt-1 text-xs text-muted-foreground">{option.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border/70 bg-card p-5">
        <p className="text-sm font-semibold">Preferences</p>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-card p-3">
            <div>
              <p className="text-sm font-medium">Auto-group series</p>
              <p className="text-xs text-muted-foreground">Keep related manga volumes grouped automatically.</p>
            </div>
            <ToggleSwitch checked={autoGroupSeries} onChange={setAutoGroupSeries} label="Auto-group series" />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-card p-3">
            <div>
              <p className="text-sm font-medium">RTL reading</p>
              <p className="text-xs text-muted-foreground">Use right-to-left page order for manga reading.</p>
            </div>
            <ToggleSwitch checked={readingDirection === "rtl"} onChange={(next) => setReadingDirection(next ? "rtl" : "ltr")} label="RTL reading" />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-card p-3">
            <div>
              <p className="text-sm font-medium">Reduce motion</p>
              <p className="text-xs text-muted-foreground">Minimize animation for a calmer, lower-power UI.</p>
            </div>
            <ToggleSwitch checked={reduceAnimations} onChange={toggleReduceMotion} label="Reduce motion" />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border/70 bg-card p-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">UI scale: {uiScale}%</p>
          <input
            type="range"
            min={80}
            max={120}
            step={10}
            value={uiScale}
            onChange={(e) => setUiScale(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-sm text-muted-foreground" style={{ fontSize: sampleFontSize }}>
            This sample text scales with your chosen interface size.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Image preload: {imagePreloadCount}</p>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={imagePreloadCount}
            onChange={(e) => setImagePreloadCount(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </section>
    </div>
  );
}
