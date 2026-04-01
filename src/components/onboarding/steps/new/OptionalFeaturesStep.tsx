import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent } from "../../../ui/Card";
import { Input } from "../../../ui/input";
import { useOnboardingStore } from "../../../../store/onboardingStore";

interface OptionalFeaturesStepProps {
  onNext?: () => void;
  registerStep?: (config: {
    nextDisabled?: boolean;
    nextLabel?: string;
    onNext?: () => void | boolean | Promise<void | boolean>;
  }) => void;
}

type FeatureState = {
  metadata: boolean;
  seriesGrouping: boolean;
  smartCollections: boolean;
  rss: boolean;
  readingGoals: boolean;
  translation: boolean;
};

const DEFAULT_FEATURES: FeatureState = {
  metadata: true,
  seriesGrouping: true,
  smartCollections: true,
  rss: false,
  readingGoals: true,
  translation: false,
};

type FeatureCard = {
  key: keyof FeatureState;
  title: string;
  description: string;
  icon: ReactNode;
};

export default function OptionalFeaturesStep({ onNext, registerStep }: OptionalFeaturesStepProps) {
  const draft = useOnboardingStore((s) => s.draftConfig);
  const storedFeatures = useOnboardingStore((s) => s.features);

  const initialFeatures = useMemo<FeatureState>(() => ({
    metadata: (draft.metadataMode ?? "online") !== "manual",
    seriesGrouping: draft.autoGroupManga ?? true,
    smartCollections: true,
    rss: false,
    readingGoals: (draft.dailyReadingGoalMinutes ?? 0) > 0,
    translation: storedFeatures.translation ?? false,
  }), [draft, storedFeatures.translation]);

  const [features, setFeatures] = useState<FeatureState>(initialFeatures);
  const skipDefaultsRef = useRef(false);
  const [readingGoalBooks, setReadingGoalBooks] = useState<number>(() => {
    const minutes = draft.dailyReadingGoalMinutes ?? 0;
    return minutes > 0 ? Math.max(1, Math.round((minutes * 365) / 20)) : 12;
  });

  const commitStep = useCallback((featureMap: FeatureState, booksGoal: number) => {
    const current = useOnboardingStore.getState();
    const dailyMinutes = featureMap.readingGoals ? Math.max(0, Math.round((booksGoal * 20) / 365)) : 0;
    useOnboardingStore.setState({
      ...current,
      features: featureMap,
      readingGoal: featureMap.readingGoals ? booksGoal : 0,
      autoGroupSeries: featureMap.seriesGrouping,
      draftConfig: {
        ...current.draftConfig,
        autoGroupManga: featureMap.seriesGrouping,
        metadataMode: featureMap.metadata ? "online" : "manual",
        translationTargetLanguage: featureMap.translation
          ? current.draftConfig.translationTargetLanguage || "en"
          : "en",
        dailyReadingGoalMinutes: dailyMinutes,
      },
    });
  }, []);

  const skipWithDefaults = () => {
    skipDefaultsRef.current = true;
    onNext?.();
  };

  const handleNext = useCallback(() => {
    if (skipDefaultsRef.current) {
      skipDefaultsRef.current = false;
      commitStep(DEFAULT_FEATURES, 12);
      return true;
    }
    commitStep(features, readingGoalBooks);
    return true;
  }, [commitStep, features, readingGoalBooks]);

  useEffect(() => {
    registerStep?.({
      nextDisabled: false,
      onNext: handleNext,
    });
  }, [handleNext, registerStep]);

  const featureRows: FeatureCard[] = [
    {
      key: "metadata",
      title: "Metadata fetching",
      description: "Fetch title, cover, author, and details automatically.",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm11-1v5h5" /></svg>
      ),
    },
    {
      key: "smartCollections",
      title: "Smart collections",
      description: "Build dynamic shelves from rules and activity.",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M4 6h16v3H4V6zm0 5h10v3H4v-3zm0 5h16v3H4v-3zm12-4 2-2 2 2-2 2-2-2z" /></svg>
      ),
    },
    {
      key: "seriesGrouping",
      title: "Series grouping",
      description: "Keep related volumes organized together.",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M3 6h6v12H3V6zm12 0h6v12h-6V6zM10 8h4v8h-4V8z" /></svg>
      ),
    },
    {
      key: "readingGoals",
      title: "Reading goals",
      description: "Set a yearly target and track your pace.",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2zm1 5h-2v6l5 3 1-1.73-4-2.27V7z" /></svg>
      ),
    },
    {
      key: "rss",
      title: "RSS reader",
      description: "Follow feeds for release and news updates.",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M6 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-3-8v3a9 9 0 0 1 9 9h3C15 14.373 9.627 9 3 9zm0-6v3c9.941 0 18 8.059 18 18h3C24 12.402 14.598 3 3 3z" /></svg>
      ),
    },
    {
      key: "translation",
      title: "In-app translation",
      description: "Translate selected passages while reading.",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M12.87 15.07 11 13l-3 7h2l.6-1.5h3.2L14.4 20h2l-3.53-8.82zM5 5V3h14v2h-6v2h4v2h-1.2a8.2 8.2 0 0 1-1.9 3.17l.7.7-1.4 1.4-.79-.78A8.57 8.57 0 0 1 8.6 16l-.32-1.97a6.88 6.88 0 0 0 2.73-.95A6.54 6.54 0 0 1 8.4 9H7V7h4V5H5z" /></svg>
      ),
    },
  ];

  return (
    <Card className="ob-step-wrap border-border/70 shadow-sm">
      <CardContent className="space-y-5 p-6">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="ob-step-kicker">Step 7 of 9</p>
            <h2 className="ob-step-title mt-2 font-light">Choose your features</h2>
            <p className="ob-step-subtitle mt-1">All features can be changed anytime in settings.</p>
          </div>
          <span className="ob-step-index">07</span>
          <button type="button" onClick={skipWithDefaults} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Skip — use defaults
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {featureRows.map((row) => {
            const enabled = features[row.key];
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => setFeatures((prev) => ({ ...prev, [row.key]: !enabled }))}
                className={`ob-card rounded-xl border bg-card p-4 text-left transition-all hover:bg-muted/20 ${
                  enabled
                    ? "border-border/80 border-l-4 border-l-primary"
                    : "border-border/60 opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="text-muted-foreground">{row.icon}</span>
                    <span>{row.title}</span>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{enabled ? "ON" : "OFF"}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{row.description}</p>

                {row.key === "readingGoals" && (
                  <div className={`grid transition-all duration-200 ease-out ${enabled ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"}`}>
                    <div className="overflow-hidden">
                      <label htmlFor="yearly-goal-input" className="mb-1 block text-xs font-medium text-muted-foreground">Books this year</label>
                      <Input
                        id="yearly-goal-input"
                        type="number"
                        min={0}
                        value={readingGoalBooks}
                        onChange={(e) => setReadingGoalBooks(Number(e.target.value) || 0)}
                        className="h-9"
                      />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
