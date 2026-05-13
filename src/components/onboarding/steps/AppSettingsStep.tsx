import {
  Cloud,
  Database,
  Globe,
  HardDrive,
  Keyboard,
  Languages,
  Lock,
  Settings,
  Shield,
  Sliders,
} from 'lucide-react';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import SettingControl from '../components/SettingControl';
import { useOnboardingState } from '../hooks/useOnboardingState';

type AppSettingsStepProps = {
  onBack: () => void;
  onNext: () => void;
};

const languageOptions = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ru',
  'ja',
  'ko',
  'zh',
  'ar',
  'hi',
] as const;

const cacheOptions = [100, 250, 500, 1000, 2000, -1] as const;

export function AppSettingsStep({ onBack, onNext }: AppSettingsStepProps) {
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
    setEnableCloudSync,
  } = useOnboardingState();

  const {
    translationLanguage,
    autoTranslate,
    cacheSizeMB,
    librarySizeLimit,
    sendAnalytics,
    sendCrashReports,
    debugLogging,
    uiScale,
    enableNotifications,
    enableCloudSync,
  } = state;

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(161,161,170,0.14),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-zinc-950/70 p-4 text-white backdrop-blur-xl md:p-6">
        <div className="onb-fade-up flex items-center gap-3">
          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200">
            <Settings size={20} className="onb-icon-inner" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">App Settings</h2>
        </div>

        <div className="onb-fade-up onb-delay-100 mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-white/70">
          <Globe size={14} />
          Required step • saved as you change
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-3 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            <div className="onb-fade-up onb-delay-200 mt-1 grid gap-4 xl:grid-cols-2">
              <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
                <header className="mb-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200">
                      <Languages size={16} className="onb-icon-inner text-zinc-200" />
                    </span>
                    <h3 className="font-semibold text-white">Translation Settings</h3>
                  </div>
                  <p className="text-sm text-white/60">Choose your preferred translation behavior.</p>
                </header>
                <div className="space-y-3">
                  <SettingControl
                    label="Language"
                    description="Default translation language"
                    type="select"
                    value={translationLanguage}
                    onChange={(value) => setTranslationLanguage(String(value))}
                    options={languageOptions.map((lang) => ({ label: lang.toUpperCase(), value: lang }))}
                    theme="darkSlate"
                  />
                  <SettingControl
                    label="Auto-translate"
                    description="Automatically translate supported metadata"
                    type="toggle"
                    value={autoTranslate}
                    onChange={(value) => setAutoTranslate(Boolean(value))}
                    theme="darkSlate"
                  />
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
                <header className="mb-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200">
                      <Database size={16} className="onb-icon-inner text-zinc-200" />
                    </span>
                    <h3 className="font-semibold text-white">Storage Settings</h3>
                  </div>
                  <p className="text-sm text-white/60">Control local cache and library limits.</p>
                </header>
                <div className="space-y-3">
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
                    label="Library size limit"
                    description="Set -1 for unlimited"
                    type="input"
                    value={librarySizeLimit}
                    onChange={(value) => setLibrarySizeLimit(Number(value))}
                    theme="darkSlate"
                  />
                  <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60">
                    <HardDrive size={14} />
                    <span>Storage limits editable later in Settings.</span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
                <header className="mb-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200">
                      <Shield size={16} className="onb-icon-inner text-zinc-200" />
                    </span>
                    <h3 className="font-semibold text-white">Privacy Settings</h3>
                  </div>
                  <p className="text-sm text-white/60">Choose what diagnostic data to share.</p>
                </header>
                <div className="space-y-3">
                  <SettingControl
                    label="Send analytics"
                    type="toggle"
                    value={sendAnalytics}
                    onChange={(value) => setSendAnalytics(Boolean(value))}
                    theme="darkSlate"
                  />
                  <SettingControl
                    label="Send crash reports"
                    type="toggle"
                    value={sendCrashReports}
                    onChange={(value) => setSendCrashReports(Boolean(value))}
                    theme="darkSlate"
                  />
                  <SettingControl
                    label="Debug logging"
                    type="toggle"
                    value={debugLogging}
                    onChange={(value) => setDebugLogging(Boolean(value))}
                    theme="darkSlate"
                  />
                  <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60">
                    <Lock size={14} />
                    <span>You can change privacy options any time.</span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
                <header className="mb-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200">
                      <Sliders size={16} className="onb-icon-inner text-zinc-200" />
                    </span>
                    <h3 className="font-semibold text-white">Interface Settings</h3>
                  </div>
                  <p className="text-sm text-white/60">Tune UI scale and behavior.</p>
                </header>
                <div className="space-y-3">
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
                  <SettingControl
                    label="Enable notifications"
                    description="Placeholder for upcoming notification channels"
                    type="toggle"
                    value={enableNotifications}
                    onChange={(value) => setEnableNotifications(Boolean(value))}
                    theme="darkSlate"
                  />
                  <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60">
                    <Settings size={14} />
                    <span>Current UI scale: {uiScale}%</span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
                <header className="mb-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200">
                      <Keyboard size={16} className="onb-icon-inner text-zinc-200" />
                    </span>
                    <h3 className="font-semibold text-white">Keyboard Shortcuts</h3>
                  </div>
                  <p className="text-sm text-white/60">Quick defaults for common actions.</p>
                </header>
                <div className="space-y-2 rounded-2xl border border-white/15 bg-white/5 p-3 text-sm">
                  <div className="flex items-center justify-between"><span className="text-white/85">Open Search</span><kbd className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/80">Ctrl / ⌘ + K</kbd></div>
                  <div className="flex items-center justify-between"><span className="text-white/85">Toggle Sidebar</span><kbd className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/80">Ctrl / ⌘ + B</kbd></div>
                  <div className="flex items-center justify-between"><span className="text-white/85">Next Item</span><kbd className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/80">J</kbd></div>
                  <div className="flex items-center justify-between"><span className="text-white/85">Previous Item</span><kbd className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/80">K</kbd></div>
                </div>
                <p className="mt-2 text-xs text-white/60">Shortcuts can be customized later in settings</p>
              </section>

              <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
                <header className="mb-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200">
                      <Cloud size={16} className="onb-icon-inner text-zinc-200" />
                    </span>
                    <h3 className="font-semibold text-white">Cloud Sync</h3>
                  </div>
                  <p className="text-sm text-white/60">Sync your library settings across devices.</p>
                </header>
                <div className="space-y-3">
                  <SettingControl
                    label="Enable cloud sync"
                    description="Coming soon"
                    type="toggle"
                    value={enableCloudSync}
                    disabled
                    onChange={(value) => setEnableCloudSync(Boolean(value))}
                    theme="darkSlate"
                  />
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                    <Cloud size={14} />
                    Coming soon
                  </div>
                  <p className="text-xs text-white/60">Cloud sync available in future update</p>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-300 mt-3 flex shrink-0 items-center justify-between border-t border-white/10 pt-3">
          <GlowButton theme="dark" variant="secondary" onClick={onBack} className="px-6">
            ← Back
          </GlowButton>
          <GlowButton theme="dark" variant="primary" onClick={onNext} className="onb-cta-glow px-8">
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default AppSettingsStep;
