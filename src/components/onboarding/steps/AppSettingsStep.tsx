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
    <section className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-8 shadow-xl md:p-12">
      <div className="relative z-10 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80">
            <Settings size={22} className="text-white" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">App Settings</h2>
        </div>

        <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-white/70">
          <Globe size={14} />
          Customize your Shiori experience
        </div>

        <div className="mt-8 max-h-[52vh] space-y-5 overflow-y-auto pr-1">
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <header className="mb-5 space-y-1">
              <div className="flex items-center gap-2">
                <Languages size={18} className="text-white/90" />
                <h3 className="text-white font-semibold">Translation Settings</h3>
              </div>
              <p className="text-white/60 text-sm">Choose your preferred translation behavior.</p>
            </header>
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
          </section>

          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <header className="mb-5 space-y-1">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-white/90" />
                <h3 className="text-white font-semibold">Storage Settings</h3>
              </div>
              <p className="text-white/60 text-sm">Control local cache and library limits.</p>
            </header>
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
              description="Set to -1 for unlimited"
              type="input"
                value={librarySizeLimit}
                onChange={(value) => setLibrarySizeLimit(Number(value))}
              theme="darkSlate"
              />
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60">
              <HardDrive size={14} />
              <span>Storage limits can be adjusted later in Settings.</span>
            </div>
          </section>

          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <header className="mb-5 space-y-1">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-white/90" />
                <h3 className="text-white font-semibold">Privacy Settings</h3>
              </div>
              <p className="text-white/60 text-sm">Choose what diagnostic data to share.</p>
            </header>
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
          </section>

          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <header className="mb-5 space-y-1">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-white/90" />
                <h3 className="text-white font-semibold">Interface Settings</h3>
              </div>
              <p className="text-white/60 text-sm">Tune the UI for your display and workflow.</p>
            </header>
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
          </section>

          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <header className="mb-5 space-y-1">
              <div className="flex items-center gap-2">
                <Keyboard size={18} className="text-white/90" />
                <h3 className="text-white font-semibold">Keyboard Shortcuts</h3>
              </div>
              <p className="text-white/60 text-sm">Quick defaults for common actions.</p>
            </header>
            <div className="space-y-2 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm">
              <div className="flex items-center justify-between"><span className="text-white/85">Open Search</span><kbd className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/80">Ctrl / ⌘ + K</kbd></div>
              <div className="flex items-center justify-between"><span className="text-white/85">Toggle Sidebar</span><kbd className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/80">Ctrl / ⌘ + B</kbd></div>
              <div className="flex items-center justify-between"><span className="text-white/85">Next Item</span><kbd className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/80">J</kbd></div>
              <div className="flex items-center justify-between"><span className="text-white/85">Previous Item</span><kbd className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/80">K</kbd></div>
            </div>
            <p className="text-xs text-white/60">Shortcuts can be customized later in settings</p>
          </section>

          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <header className="mb-5 space-y-1">
              <div className="flex items-center gap-2">
                <Cloud size={18} className="text-white/90" />
                <h3 className="text-white font-semibold">Cloud Sync</h3>
              </div>
              <p className="text-white/60 text-sm">Sync your library settings across devices.</p>
            </header>
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
            <p className="text-xs text-white/60">Cloud sync will be available in a future update</p>
          </section>
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-8">
          <GlowButton theme="dark" variant="secondary" onClick={onBack} icon={<span aria-hidden>←</span>}>
            Back
          </GlowButton>
          <GlowButton theme="dark" variant="primary" onClick={onNext} icon={<span aria-hidden>→</span>}>
            Continue
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default AppSettingsStep;
