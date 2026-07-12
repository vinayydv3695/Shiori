import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, KeyRound, Eye, EyeOff, ShieldCheck, ShieldX, Link2, Plug } from 'lucide-react';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { api, isAndroid } from '@/lib/tauri';
import { invoke } from '@tauri-apps/api/core';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useSourceStore } from '@/store/sourceStore';
import { anilistAuth, ViewerInfo } from '@/auth';

const ANILIST_CLIENT_ID = '45197';
const ANILIST_IMPLICIT_URL = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;

type IntegrationsStepProps = {
  onBack: () => void;
  onNext: () => void;
};

import { useOnboardingState } from '../hooks/useOnboardingState';

export function IntegrationsStep({ onBack, onNext }: IntegrationsStepProps) {
  const { state } = useOnboardingState();
  const preferredContentType = state.preferredContentType;
  const preferredDebridProvider = useSourceStore((s) => s.preferredDebridProvider);

  const updateGeneralSettings = usePreferencesStore((s) => s.updateGeneralSettings);

  const [hasTorboxKey, setHasTorboxKey] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testValid, setTestValid] = useState<boolean | null>(null);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAniListLinked, setIsAniListLinked] = useState(false);
  const [aniListViewer, setAniListViewer] = useState<ViewerInfo | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAniListState = async () => {
      const linked = await anilistAuth.isAuthenticated();
      if (!isMounted) return;

      setIsAniListLinked(linked);
      if (linked) {
        const viewer = await anilistAuth.getViewerInfo();
        if (!isMounted) return;
        setAniListViewer(viewer);
      } else {
        setAniListViewer(null);
      }
      setIsLoggingIn(false);
    };

    void loadAniListState();

    const handleAniListChange = () => {
      void loadAniListState();
    };
    window.addEventListener('anilist-auth-changed', handleAniListChange);

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
      window.removeEventListener('anilist-auth-changed', handleAniListChange);
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

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-foreground md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(161,161,170,0.14),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-border/40 bg-card/60 p-4 backdrop-blur-xl md:p-6">
        <div className="onb-fade-up flex flex-wrap items-center gap-3">
          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 bg-primary/5 text-foreground">
            <Plug className="onb-icon-inner h-5 w-5" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Integrations</h2>
        </div>

        <p className="onb-fade-up onb-delay-100 mt-2 max-w-3xl text-sm text-foreground/65 md:text-base">
          Connect third-party services to enhance your experience. Safe to skip and configure later.
        </p>

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-3 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            <div className="onb-fade-up onb-delay-200 mt-2 grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                {(preferredContentType === 'manga' || preferredContentType === 'both') && (
                  <section className="rounded-2xl border border-border/40 bg-card/50 p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-primary/5 text-foreground">
                        <Link2 className="onb-icon-inner h-4 w-4" />
                      </span>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/90">AniList Integration</h3>
                    </div>

                    <p className="mb-4 text-xs text-foreground/60">
                      Link your AniList account to automatically track your reading progress across online manga sources.
                    </p>

                    <div className="flex items-center gap-3">
                      {isAniListLinked ? (
                        <div className="flex w-full items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                          <div className="flex items-center gap-2 text-emerald-300">
                            <ShieldCheck className="h-4 w-4" />
                            <span className="text-sm font-medium">{aniListViewer?.name ? `Linked as ${aniListViewer.name}` : 'Account Linked'}</span>
                          </div>
                          <GlowButton
                            theme="dark"
                            variant="secondary"
                            className="border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
                            onClick={() => {
                              void anilistAuth.logout();
                            }}
                          >
                            Unlink
                          </GlowButton>
                        </div>
                      ) : (
                        <div className="flex w-full flex-col gap-3">
                          {isAndroid ? (
                            <div className="flex flex-col gap-2">
                              <p className="text-xs text-foreground/60 leading-relaxed">
                                Link AniList with the Android login flow to sync reading progress without copying tokens manually.
                              </p>
                              <GlowButton
                                theme="dark"
                                variant="secondary"
                                className="w-full border-border/40 bg-card px-4 py-3 text-sm text-foreground hover:bg-primary/5"
                                onClick={async () => {
                                  setIsLoggingIn(true);
                                  try {
                                    await anilistAuth.login();
                                  } finally {
                                    setIsLoggingIn(false);
                                  }
                                }}
                                disabled={isLoggingIn}
                              >
                                {isLoggingIn ? 'Awaiting Login...' : 'Login with AniList'}
                              </GlowButton>
                            </div>
                          ) : (
                            <GlowButton
                              theme="dark"
                              variant="secondary"
                              className="w-full border-border/40 bg-card px-4 py-3 text-sm text-foreground hover:bg-primary/5"
                              onClick={() => {
                                setIsLoggingIn(true);
                                invoke('start_anilist_login').catch(() => setIsLoggingIn(false));
                              }}
                              disabled={isLoggingIn}
                            >
                              {isLoggingIn ? 'Awaiting Login...' : 'Login with AniList'}
                            </GlowButton>
                          )}
                          {!isAndroid && (
                            <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-card/30 p-3">
                              <p className="text-xs text-foreground/60">Or manually paste your AniList token:</p>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="eyJ0eXAi..."
                                  className="h-9 flex-1 rounded-lg border border-border/40 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-1 focus-visible:ring-primary/50"
                                  onChange={(e) => {
                                    if (e.target.value.length > 50) {
                                      updateGeneralSettings({ anilistToken: e.target.value });
                                      e.target.value = '';
                                    }
                                  }}
                                />
                              </div>
                              <a
                                href={ANILIST_IMPLICIT_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-primary/80 hover:text-primary hover:underline"
                              >
                                Get a token here
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <section className="rounded-2xl border border-border/40 bg-card/50 p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-primary/5 text-foreground">
                      <KeyRound className="onb-icon-inner h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/90">Torbox API Key</h3>
                  </div>

                  <p className="mb-4 text-xs text-foreground/60">
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
                      className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-zinc-400/60"
                      autoComplete="off"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-card text-foreground transition hover:bg-primary/5"
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
                      className="border-border/40 bg-card px-4 text-foreground hover:bg-primary/5"
                    >
                      {isSaving ? 'Saving...' : 'Save key'}
                    </GlowButton>

                    <GlowButton
                      theme="dark"
                      variant="secondary"
                      onClick={() => void handleTest()}
                      disabled={!hasKey || isLoading || isTesting}
                      className="border-border/40 bg-card px-4 text-foreground hover:bg-primary/5"
                    >
                      {isTesting ? 'Testing...' : 'Test key'}
                    </GlowButton>
                  </div>

                  {message ? (
                    <div
                      className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                        testValid === null
                          ? 'border-border/40 bg-card/70 text-foreground/65'
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

        <div className="onb-fade-up onb-delay-300 mt-3 flex shrink-0 items-center justify-between border-t border-border/40 pt-3">
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

export default IntegrationsStep;
