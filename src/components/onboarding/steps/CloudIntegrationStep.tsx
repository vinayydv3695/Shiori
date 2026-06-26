import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cloud, Database, Globe, Shield, KeyRound, Eye, EyeOff, ShieldCheck, ShieldX } from 'lucide-react';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { api } from '@/lib/tauri';
import { useSourceStore } from '@/store/sourceStore';

type CloudIntegrationStepProps = {
  onBack: () => void;
  onNext: () => void;
};

export function CloudIntegrationStep({ onBack, onNext }: CloudIntegrationStepProps) {
  const sources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const preferredDebridProvider = useSourceStore((state) => state.preferredDebridProvider);

  const setPrimarySource = useSourceStore((state) => state.setPrimarySource);
  const setPreferredDebridProvider = useSourceStore((state) => state.setPreferredDebridProvider);

  const [hasTorboxKey, setHasTorboxKey] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testValid, setTestValid] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadTorboxKey = async () => {
      try {
        const key = await api.getTorboxKey();
        if (isMounted) {
          setHasTorboxKey(Boolean(key?.trim()));
          if (key) {
            setApiKey(key);
          }
        }
      } catch {
        if (isMounted) {
          setHasTorboxKey(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadTorboxKey();
    return () => {
      isMounted = false;
    };
  }, []);

  const hasKey = useMemo(() => apiKey.trim().length > 0, [apiKey]);

  const handleSave = async () => {
    if (!hasKey || isSaving) return;
    setIsSaving(true);
    setMessage(null);

    try {
      await api.saveTorboxKey(apiKey.trim());
      setMessage('Torbox API key saved.');
      setHasTorboxKey(true);
    } catch {
      setMessage('Failed to save Torbox API key. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!hasKey || isTesting) return;
    setIsTesting(true);
    setMessage(null);
    setTestValid(null);

    try {
      const result = await api.verifyTorboxKey(apiKey.trim());
      setTestValid(result.valid);
      setMessage(result.message || (result.valid ? 'Torbox key verified.' : 'Torbox key is invalid.'));
    } catch {
      setTestValid(false);
      setMessage('Failed to verify key. You can continue and configure this later.');
    } finally {
      setIsTesting(false);
    }
  };

  const availableSources = useMemo(
    () => sources.filter((source) => source.implemented),
    [sources]
  );

  const availableMangaSources = useMemo(
    () => availableSources.filter((source) => source.kind === 'manga'),
    [availableSources]
  );
  const availableBookSources = useMemo(
    () => availableSources.filter((source) => source.kind === 'books'),
    [availableSources]
  );

  const primaryManga = primarySourceByKind.manga;
  const primaryBooks = primarySourceByKind.books;

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-white md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(161,161,170,0.14),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-zinc-950/70 p-4 backdrop-blur-xl md:p-6">
        <div className="onb-fade-up flex flex-wrap items-center gap-3">
          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200">
            <Cloud className="onb-icon-inner h-5 w-5" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Cloud Integrations</h2>
        </div>

        <p className="onb-fade-up onb-delay-100 mt-2 max-w-3xl text-sm text-white/65 md:text-base">
          Tune recommended online providers, your debrid preference, and link your Torbox account. Safe to keep defaults and continue.
        </p>

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-3 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            <div className="onb-fade-up onb-delay-200 mt-2 grid gap-4 xl:grid-cols-2">
              
              <div className="flex flex-col gap-4">
                <section className="flex h-full flex-col rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                  <div className="mb-6 flex items-center gap-3 border-b border-white/5 pb-4">
                    <span className="onb-icon-badge inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 shadow-sm">
                      <Globe className="onb-icon-inner h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-white/90">Primary Source Selection</h3>
                      <p className="text-xs text-white/50">Set your preferred default catalogs</p>
                    </div>
                  </div>

                  <div className="grid flex-1 gap-6 md:grid-cols-2">
                    <div className="flex flex-col rounded-xl border border-white/5 bg-zinc-950/40 p-4">
                      <p className="mb-4 text-sm font-medium text-white/80">Primary Manga Source</p>
                      <div className="flex flex-col gap-2">
                        {availableMangaSources.map((source) => (
                          <label key={source.id} className={`group flex cursor-pointer items-center justify-between rounded-lg border px-3 py-3 transition-colors ${primaryManga === source.id ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-white/5 bg-zinc-900 hover:border-white/20'}`}>
                            <span className={`text-sm font-medium ${primaryManga === source.id ? 'text-indigo-200' : 'text-white/80'}`}>{source.name}</span>
                            <div className="relative flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-zinc-950">
                              {primaryManga === source.id && <div className="h-2 w-2 rounded-full bg-indigo-400" />}
                              <input
                                type="radio"
                                name="onboarding-primary-manga"
                                checked={primaryManga === source.id}
                                onChange={() => setPrimarySource('manga', source.id)}
                                className="absolute inset-0 cursor-pointer opacity-0"
                                aria-label={`Set ${source.name} as primary manga source`}
                              />
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col rounded-xl border border-white/5 bg-zinc-950/40 p-4">
                      <p className="mb-4 text-sm font-medium text-white/80">Primary Book Source</p>
                      <div className="flex flex-col gap-2">
                        {availableBookSources.map((source) => (
                          <label key={source.id} className={`group flex cursor-pointer items-center justify-between rounded-lg border px-3 py-3 transition-colors ${primaryBooks === source.id ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-white/5 bg-zinc-900 hover:border-white/20'}`}>
                            <span className={`text-sm font-medium ${primaryBooks === source.id ? 'text-indigo-200' : 'text-white/80'}`}>{source.name}</span>
                            <div className="relative flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-zinc-950">
                              {primaryBooks === source.id && <div className="h-2 w-2 rounded-full bg-indigo-400" />}
                              <input
                                type="radio"
                                name="onboarding-primary-books"
                                checked={primaryBooks === source.id}
                                onChange={() => setPrimarySource('books', source.id)}
                                className="absolute inset-0 cursor-pointer opacity-0"
                                aria-label={`Set ${source.name} as primary book source`}
                              />
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex flex-col gap-4">
                <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200">
                      <Shield className="onb-icon-inner h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-white/90">Debrid Provider Preference</h3>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm">
                      <span className="text-white/90">Auto</span>
                      <input
                        type="radio"
                        name="onboarding-debrid"
                        checked={preferredDebridProvider === 'auto'}
                        onChange={() => setPreferredDebridProvider('auto')}
                        className="h-4 w-4 accent-zinc-400"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm">
                      <span className="text-white/90">Torbox</span>
                      <input
                        type="radio"
                        name="onboarding-debrid"
                        checked={preferredDebridProvider === 'torbox'}
                        onChange={() => setPreferredDebridProvider('torbox')}
                        className="h-4 w-4 accent-zinc-400"
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200">
                      <KeyRound className="onb-icon-inner h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-white/90">Torbox API Key</h3>
                  </div>

                  <p className="mb-4 text-xs text-white/60">
                    Add your Torbox key to unlock debrid-assisted downloads and direct streaming from torrent sources.
                  </p>

                  <div className="flex gap-2">
                    <input
                      id="torbox-api-key"
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(event) => {
                        setApiKey(event.target.value);
                        setMessage(null);
                        setTestValid(null);
                      }}
                      placeholder="tbx_..."
                      className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-zinc-400/60"
                      autoComplete="off"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-white transition hover:bg-white/5"
                      onClick={() => setShowKey((prev) => !prev)}
                      aria-label={showKey ? 'Hide API key' : 'Show API key'}
                      disabled={isLoading}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <GlowButton
                      theme="dark"
                      variant="secondary"
                      onClick={() => void handleSave()}
                      disabled={!hasKey || isLoading || isSaving}
                      className="border-white/10 bg-zinc-900 px-4 text-white hover:bg-white/5"
                    >
                      {isSaving ? 'Saving...' : 'Save key'}
                    </GlowButton>

                    <GlowButton
                      theme="dark"
                      variant="secondary"
                      onClick={() => void handleTest()}
                      disabled={!hasKey || isLoading || isTesting}
                      className="border-white/10 bg-zinc-900 px-4 text-white hover:bg-white/5"
                    >
                      {isTesting ? 'Testing...' : 'Test key'}
                    </GlowButton>
                  </div>

                  {message ? (
                    <div
                      className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                        testValid === null
                          ? 'border-white/10 bg-zinc-900/70 text-white/65'
                          : testValid
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {testValid === null ? null : testValid ? <ShieldCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />}
                      <span>{message}</span>
                    </div>
                  ) : null}

                  {preferredDebridProvider === 'torbox' && hasTorboxKey === false && !message ? (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                      <AlertTriangle className="h-4 w-4" />
                      <span>No Torbox key detected. Your debrid preference will fall back until a key is added.</span>
                    </div>
                  ) : null}
                </section>
              </div>

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

export default CloudIntegrationStep;
