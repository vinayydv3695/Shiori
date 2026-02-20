import { useState } from "react";
import { api } from "../../lib/tauri";
import { usePreferencesStore } from "../../store/preferencesStore";
import { Button } from "../ui/button";
import { Card } from "../ui/Card";
import {
  BookOpen,
  Moon,
  Sun,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FolderOpen,
  Type,
  Layout,
  Book,
  Image,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { Theme, BookPreferences, MangaPreferences } from "../../types/preferences";

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const preferences = usePreferencesStore((state) => state.preferences);
  const updateTheme = usePreferencesStore((state) => state.updateTheme);
  const updateBookDefaults = usePreferencesStore((state) => state.updateBookDefaults);
  const updateMangaDefaults = usePreferencesStore((state) => state.updateMangaDefaults);
  const updateGeneralSettings = usePreferencesStore((state) => state.updateGeneralSettings);

  const [selectedTheme, setSelectedTheme] = useState<Theme>(preferences?.theme ?? "white");
  const [bookFontSize, setBookFontSize] = useState(preferences?.book.fontSize ?? 18);
  const [bookLineHeight, setBookLineHeight] = useState(preferences?.book.lineHeight ?? 1.6);
  const [mangaMode, setMangaMode] = useState(preferences?.manga.mode ?? "single");
  const [mangaDirection, setMangaDirection] = useState(preferences?.manga.direction ?? "ltr");
  const [importPath, setImportPath] = useState(preferences?.defaultImportPath ?? "");
  const [isCompleting, setIsCompleting] = useState(false);

  const steps = [
    {
      title: "Welcome to Shiori",
      description: "Your personal library for books and manga",
      component: <WelcomeStep />,
    },
    {
      title: "Choose Your Theme",
      description: "Select how Shiori should look",
      component: (
        <ThemeStep
          value={selectedTheme}
          onChange={async (theme) => {
            setSelectedTheme(theme);
            await updateTheme(theme);
          }}
        />
      ),
    },
    {
      title: "Book Reading",
      description: "Customize your book reading experience",
      component: (
        <BookSettingsStep
          fontSize={bookFontSize}
          lineHeight={bookLineHeight}
          onFontSizeChange={async (size) => {
            setBookFontSize(size);
            await updateBookDefaults({ fontSize: size });
          }}
          onLineHeightChange={async (height) => {
            setBookLineHeight(height);
            await updateBookDefaults({ lineHeight: height });
          }}
        />
      ),
    },
    {
      title: "Manga Reading",
      description: "Configure manga and comic preferences",
      component: (
        <MangaSettingsStep
          mode={mangaMode}
          direction={mangaDirection}
          onModeChange={async (mode) => {
            setMangaMode(mode);
            await updateMangaDefaults({ mode });
          }}
          onDirectionChange={async (direction) => {
            setMangaDirection(direction);
            await updateMangaDefaults({ direction });
          }}
        />
      ),
    },
    {
      title: "Library Setup",
      description: "Set your default import location",
      component: (
        <LibraryStep
          path={importPath}
          onPathChange={async (path) => {
            setImportPath(path);
            await updateGeneralSettings({ defaultImportPath: path });
          }}
        />
      ),
    },
  ];

  const handleNext = async () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      setIsCompleting(true);
      try {
        await api.completeOnboarding([]);
        onComplete();
      } catch (error) {
        console.error("Failed to complete onboarding:", error);
        setIsCompleting(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl p-8 space-y-8">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>
              Step {step + 1} of {steps.length}
            </span>
            <span>{Math.round(((step + 1) / steps.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">{steps[step].title}</h2>
            <p className="text-muted-foreground">{steps[step].description}</p>
          </div>

          <div className="min-h-[300px] flex items-center justify-center">
            {steps[step].component}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={handleBack} disabled={step === 0}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <Button onClick={handleNext} disabled={isCompleting}>
            {isCompleting ? (
              "Completing..."
            ) : step === steps.length - 1 ? (
              <>
                Get Started
                <CheckCircle2 className="w-4 h-4 ml-2" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}

const WelcomeStep = () => (
  <div className="text-center space-y-6 py-8">
    <div className="flex justify-center">
      <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
        <BookOpen className="w-12 h-12 text-primary" />
      </div>
    </div>
    <div className="space-y-3 max-w-md mx-auto">
      <p className="text-lg">
        Organize your books and manga in one beautiful library
      </p>
      <ul className="text-sm text-muted-foreground space-y-2 text-left">
        <li className="flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <span>Support for EPUB, PDF, CBZ, CBR, and more formats</span>
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <span>Automatic metadata fetching from AniList and Open Library</span>
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <span>Resume reading exactly where you left off</span>
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <span>Customizable reading experience</span>
        </li>
      </ul>
    </div>
  </div>
);

interface ThemeStepProps {
  value: Theme;
  onChange: (theme: Theme) => void;
}

const ThemeStep = ({ value, onChange }: ThemeStepProps) => {
  const themes = [
    { id: "white" as const, name: "White", icon: Sun, desc: "Paper white theme" },
    { id: "black" as const, name: "Black", icon: Moon, desc: "Pure black theme" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 w-full">
      {themes.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onChange(theme.id)}
          className={cn(
            "p-6 rounded-lg border-2 transition-all space-y-3 hover:border-primary/50",
            value === theme.id
              ? "border-primary bg-primary/5"
              : "border-border bg-background"
          )}
        >
          <div className="flex justify-center">
            <theme.icon className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <div className="font-semibold">{theme.name}</div>
            <div className="text-xs text-muted-foreground">{theme.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
};

interface BookSettingsStepProps {
  fontSize: number;
  lineHeight: number;
  onFontSizeChange: (size: number) => void;
  onLineHeightChange: (height: number) => void;
}

const BookSettingsStep = ({
  fontSize,
  lineHeight,
  onFontSizeChange,
  onLineHeightChange,
}: BookSettingsStepProps) => {
  return (
    <div className="w-full space-y-8">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <label className="font-medium">Font Size</label>
          <span className="text-sm text-muted-foreground">{fontSize}px</span>
        </div>
        <input
          type="range"
          min="12"
          max="32"
          value={fontSize}
          onChange={(e) => onFontSizeChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Small</span>
          <span>Large</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <label className="font-medium">Line Height</label>
          <span className="text-sm text-muted-foreground">{lineHeight.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="1.2"
          max="2.4"
          step="0.1"
          value={lineHeight}
          onChange={(e) => onLineHeightChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Compact</span>
          <span>Spacious</span>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-muted border border-border">
        <p style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}` }}>
          The quick brown fox jumps over the lazy dog. This is how your text will look with the
          current settings.
        </p>
      </div>
    </div>
  );
};

interface MangaSettingsStepProps {
  mode: "long-strip" | "single" | "double";
  direction: "ltr" | "rtl";
  onModeChange: (mode: "long-strip" | "single" | "double") => void;
  onDirectionChange: (direction: "ltr" | "rtl") => void;
}

const MangaSettingsStep = ({
  mode,
  direction,
  onModeChange,
  onDirectionChange,
}: MangaSettingsStepProps) => {
  const modes = [
    { id: "single" as const, name: "Single Page", icon: Layout, desc: "One page at a time" },
    { id: "double" as const, name: "Double Page", icon: Book, desc: "Two pages side-by-side" },
    { id: "long-strip" as const, name: "Long Strip", icon: Type, desc: "Continuous scroll" },
  ];

  const directions = [
    { id: "ltr" as const, name: "Left to Right", desc: "Western style" },
    { id: "rtl" as const, name: "Right to Left", desc: "Japanese manga" },
  ];

  return (
    <div className="w-full space-y-6">
      <div className="space-y-3">
        <label className="font-medium">Reading Mode</label>
        <div className="grid grid-cols-3 gap-3">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              className={cn(
                "p-4 rounded-lg border-2 transition-all space-y-2 hover:border-primary/50",
                mode === m.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background"
              )}
            >
              <div className="flex justify-center">
                <m.icon className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-sm">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="font-medium">Reading Direction</label>
        <div className="grid grid-cols-2 gap-3">
          {directions.map((d) => (
            <button
              key={d.id}
              onClick={() => onDirectionChange(d.id)}
              className={cn(
                "p-4 rounded-lg border-2 transition-all hover:border-primary/50",
                direction === d.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background"
              )}
            >
              <div className="font-semibold text-sm">{d.name}</div>
              <div className="text-xs text-muted-foreground">{d.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

interface LibraryStepProps {
  path: string;
  onPathChange: (path: string) => void;
}

const LibraryStep = ({ path, onPathChange }: LibraryStepProps) => {
  const [isSelecting, setIsSelecting] = useState(false);

  const handleSelectFolder = async () => {
    setIsSelecting(true);
    try {
      const folder = await api.openFolderDialog();
      if (folder) {
        onPathChange(folder);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <div className="w-full space-y-6 py-8">
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <FolderOpen className="w-10 h-10 text-primary" />
        </div>
      </div>

      <div className="text-center space-y-2 max-w-md mx-auto">
        <p className="text-sm text-muted-foreground">
          Choose a default folder for importing books and manga. You can always change this later
          or import from other locations.
        </p>
      </div>

      <Button
        onClick={handleSelectFolder}
        disabled={isSelecting}
        className="w-full"
        variant="outline"
      >
        <FolderOpen className="w-4 h-4 mr-2" />
        {isSelecting ? "Opening..." : path ? "Change Folder" : "Select Folder"}
      </Button>

      {path && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="text-xs text-muted-foreground mb-1">Selected folder:</div>
          <div className="text-sm font-mono break-all">{path}</div>
        </div>
      )}
    </div>
  );
};
