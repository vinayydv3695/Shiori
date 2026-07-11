import { useState } from 'react';
import {
  BookOpen,
  Check,
  Moon,
  Palette,
  Settings,
  Sliders,
  Sun,
} from 'lucide-react';
import type { ThemeName } from '../../../store/onboardingStore';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import SettingControl from '../components/SettingControl';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { THEME_OPTIONS } from '../../../store/onboardingStore';
import { READING_FONTS, normalizeLegacyFontPreference, DEFAULT_READING_FONT_ID } from '../../../lib/readingFonts';
import type { MangaPrefs, BookPrefs } from '../../../store/onboardingStore';

type AppCustomizationStepProps = {
  onBack: () => void;
  onNext: () => void;
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi',
};

const languageOptions = Object.keys(LANGUAGE_NAMES);
const cacheOptions = [100, 250, 500, 1000, 2000, -1] as const;

const previews: Record<ThemeName, { background: string; text: string; accent: string; surface: string; border: string }> = {
  'Premium Light': { background: '#f8f9fa', surface: '#ffffff', text: '#0f172a', accent: '#5a67d8', border: '#e2e8f0' },
  'OLED Midnight': { background: '#000000', surface: '#080808', text: '#fafafa', accent: '#7c3aed', border: '#262626' },
  'Rose Pine Moon': { background: '#232136', surface: '#2a273f', text: '#e0def4', accent: '#b8b0d9', border: '#524f67' },
  'Catppuccin Mocha': { background: '#1e1e2e', surface: '#181825', text: '#cdd6f4', accent: '#b8bed8', border: '#45475a' },
  Nord: { background: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#c4ccd8', border: '#4c566a' },
  Dracula: { background: '#282a36', surface: '#44475a', text: '#f8f8f2', accent: '#d4d1df', border: '#6272a4' },
  'Tokyo Night': { background: '#1a1b26', surface: '#24283b', text: '#c0caf5', accent: '#c2c8de', border: '#414868' },
  'Premium Dark': { background: '#0a0f1c', surface: '#111827', text: '#f1f5f9', accent: '#818cf8', border: '#1e293b' },
};

const isLightTheme = (themeName: ThemeName) => themeName === 'Premium Light';

type Tab = 'appearance' | 'reader' | 'general';

export function AppCustomizationStep({ onBack, onNext }: AppCustomizationStepProps) {
  const [activeTab, setActiveTab] = useState<Tab>('appearance');
  const [hardwareAcceleration, setHardwareAcceleration] = useState(true);
  const [autoScanLibrary, setAutoScanLibrary] = useState(true);

  const {
    state,
    setTranslationLanguage,
    setAutoTranslate,
    setCacheSizeMB,
    setLibrarySizeLimit,
    setSendAnalytics,
    setSendCrashReports,
    setDebugLogging,
    setUiScale,
    setEnableNotifications,
    setSelectedTheme,
    setMangaPrefs,
    setBookPrefs,
  } = useOnboardingState();

  const {
    translationLanguage, autoTranslate, cacheSizeMB, librarySizeLimit,
    sendAnalytics, sendCrashReports, debugLogging, uiScale,
    enableNotifications, selectedTheme, mangaPrefs, bookPrefs,
  } = state;

  const onMangaChange = (updates: Partial<MangaPrefs>) => setMangaPrefs(updates);
  const onBookChange = (updates: Partial<BookPrefs>) => setBookPrefs(updates);

  const selectedBookFontFamily = READING_FONTS.some((font) => font.id === normalizeLegacyFontPreference(bookPrefs.fontFamily))
    ? normalizeLegacyFontPreference(bookPrefs.fontFamily)
    : DEFAULT_READING_FONT_ID;

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(161,161,170,0.14),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-border/40 bg-card/60 p-4 text-card-foreground backdrop-blur-xl md:p-6 shadow-2xl">
        <header className="onb-fade-up mb-4 flex shrink-0 flex-col gap-4 md:mb-5">
          <div className="flex items-center gap-3">
            <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-border/50 bg-primary/5 text-primary shadow-sm">
              <Sliders size={20} strokeWidth={1.7} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">App Customization</h2>
              <p className="text-sm text-muted-foreground">Tailor the app experience to your liking.</p>
            </div>
          </div>

          <div className="flex w-full overflow-x-auto no-scrollbar p-1 bg-muted/30 rounded-xl border border-border/40">
            {[
              { id: 'appearance', label: 'Appearance', icon: Palette },
              { id: 'reader', label: 'Reader', icon: BookOpen },
              { id: 'general', label: 'General', icon: Settings },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 text-xs md:text-sm font-medium transition-all whitespace-nowrap flex-1 rounded-lg ${
                    isActive 
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 md:pr-2 pb-3 [&::-webkit-scrollbar]:w-1 md:[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50">
          
          {activeTab === 'appearance' && (
            <div className="onb-fade-up grid gap-6 xl:grid-cols-2">
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground/80">Theme Selection</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = selectedTheme === theme.name;
                    return (
                      <button
                        key={theme.name}
                        type="button"
                        onClick={() => setSelectedTheme(theme.name)}
                        className={`group relative flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                          isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border/40 bg-card/40 hover:border-border/80 hover:bg-card/80'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span 
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg shadow-inner ring-1 ring-black/10 dark:ring-white/10 ${isSelected ? 'ring-black/20 dark:ring-white/40' : 'group-hover:ring-black/15 dark:group-hover:ring-white/20'}`} 
                            style={{ backgroundColor: previews[theme.name].background, color: previews[theme.name].text }}
                          >
                            {isLightTheme(theme.name) ? <Sun size={14} /> : <Moon size={14} />}
                          </span>
                          <span className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                            {theme.name}
                          </span>
                        </div>
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition-all ${isSelected ? 'border-primary/80 bg-primary text-primary-foreground' : 'border-border/40 bg-card text-transparent opacity-0 group-hover:opacity-100'}`}>
                          <Check size={11} strokeWidth={3} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-foreground/80">Interface Settings</h3>
                <div className="space-y-3 rounded-xl border border-border/40 bg-card/40 p-4">
                  <SettingControl
                    label="UI Scale"
                    description="Scale from 75% to 150%"
                    type="slider"
                    value={uiScale}
                    min={75}
                    max={150}
                    step={1}
                    onChange={(value) => setUiScale(Number(value))}
                    theme="darkSlate"
                  />
                </div>
              </section>
            </div>
          )}

          {activeTab === 'reader' && (
            <div className="onb-fade-up grid gap-6 xl:grid-cols-2">
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground/80">Manga Settings</h3>
                <div className="space-y-3 rounded-xl border border-border/40 bg-card/40 p-4">
                  <SettingControl
                    theme="darkSlate"
                    label="Reading Direction"
                    type="radio"
                    value={mangaPrefs.readingDirection}
                    onChange={(value) => onMangaChange({ readingDirection: String(value) as MangaPrefs['readingDirection'] })}
                    options={[
                      { label: 'Right to Left', value: 'rtl' },
                      { label: 'Left to Right', value: 'ltr' },
                    ]}
                  />
                  <SettingControl
                    theme="darkSlate"
                    label="Reading Mode"
                    type="select"
                    value={mangaPrefs.readingMode}
                    onChange={(value) => onMangaChange({ readingMode: String(value) as MangaPrefs['readingMode'] })}
                    options={[
                      { label: 'Single Page', value: 'single' },
                      { label: 'Long Strip', value: 'strip' },
                      { label: 'Webtoon', value: 'webtoon' },
                    ]}
                  />
                  <SettingControl
                    theme="darkSlate"
                    label="Auto Group Volumes"
                    type="toggle"
                    value={mangaPrefs.autoGroupVolumes}
                    onChange={(value) => onMangaChange({ autoGroupVolumes: Boolean(value) })}
                  />
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground/80">Book Typography</h3>
                <div className="space-y-3 rounded-xl border border-border/40 bg-card/40 p-4">
                  <SettingControl
                    theme="darkSlate"
                    label="Font Family"
                    type="select"
                    value={selectedBookFontFamily}
                    onChange={(value) => {
                      const normalized = normalizeLegacyFontPreference(String(value));
                      const canonicalId = READING_FONTS.some((font) => font.id === normalized) ? normalized : DEFAULT_READING_FONT_ID;
                      onBookChange({ fontFamily: canonicalId });
                    }}
                    options={READING_FONTS.map((font) => ({ label: font.label, value: font.id }))}
                  />
                  <SettingControl theme="darkSlate" label="Font Size" type="slider" value={bookPrefs.fontSize} onChange={(value) => onBookChange({ fontSize: Number(value) })} min={10} max={40} step={1} />
                  <SettingControl theme="darkSlate" label="Line Height" type="slider" value={bookPrefs.lineHeight} onChange={(value) => onBookChange({ lineHeight: Number(value) })} min={1} max={2.4} step={0.05} />
                  <SettingControl theme="darkSlate" label="Page Width" type="slider" value={bookPrefs.pageWidth} onChange={(value) => onBookChange({ pageWidth: Number(value) })} min={320} max={1400} step={10} />
                </div>
              </section>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="onb-fade-up grid gap-6 xl:grid-cols-2">
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground/80">Localization</h3>
                <div className="space-y-3 rounded-xl border border-border/40 bg-card/40 p-4">
                  <SettingControl
                    label="Language"
                    description="Default translation language"
                    type="select"
                    value={translationLanguage}
                    onChange={(value) => setTranslationLanguage(String(value))}
                    options={languageOptions.map((lang) => ({ label: LANGUAGE_NAMES[lang], value: lang }))}
                    theme="darkSlate"
                  />
                  <SettingControl
                    label="Auto-translate"
                    type="toggle"
                    value={autoTranslate}
                    onChange={(value) => setAutoTranslate(Boolean(value))}
                    theme="darkSlate"
                  />
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground/80">System & Storage</h3>
                <div className="space-y-3 rounded-xl border border-border/40 bg-card/40 p-4">
                  <SettingControl
                    label="Cache size limit"
                    type="select"
                    value={cacheSizeMB}
                    onChange={(value) => setCacheSizeMB(Number(value))}
                    options={cacheOptions.map((size) => ({
                      label: size === -1 ? 'Unlimited' : `${size}MB`,
                      value: size,
                    }))}
                    theme="darkSlate"
                  />
                  <SettingControl
                    label="Hardware Acceleration"
                    description="Use GPU rendering for smoother transitions"
                    type="toggle"
                    value={hardwareAcceleration}
                    onChange={(value) => setHardwareAcceleration(Boolean(value))}
                    theme="darkSlate"
                  />
                  <SettingControl
                    label="Auto-scan Library"
                    description="Scan for new local books on app startup"
                    type="toggle"
                    value={autoScanLibrary}
                    onChange={(value) => setAutoScanLibrary(Boolean(value))}
                    theme="darkSlate"
                  />
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="onb-fade-up onb-delay-200 mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-border/40 pt-4">
          <GlowButton theme="dark" variant="secondary" onClick={onBack} className="flex-1 sm:flex-none px-2 sm:px-5 justify-center">
            ← Back
          </GlowButton>
          <GlowButton theme="dark" variant="primary" onClick={onNext} className="flex-[2] sm:flex-none onb-cta-glow px-4 sm:px-8 justify-center">
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default AppCustomizationStep;
