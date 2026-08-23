import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, KeyRound, Eye, EyeOff, ShieldCheck, ShieldX, Link2, Plug, Gamepad2, Image } from 'lucide-react';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { api, isAndroid } from '@/lib/tauri';
import { invoke } from '@tauri-apps/api/core';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useSourceStore } from '@/store/sourceStore';
import { anilistAuth, ViewerInfo } from '@/auth';

const ANILIST_CLIENT_ID = '45197';
const ANILIST_IMPLICIT_URL = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;

// AniList access tokens are JWT-shaped: three dot-separated base64url segments.
const ANILIST_TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

type IntegrationsStepProps = {
  onBack: () => void;
  onNext: () => void;
};

import { useOnboardingState } from '../hooks/useOnboardingState';

export function IntegrationsStep({ onBack, onNext }: IntegrationsStepProps) {
  const { state } = useOnboardingState();
  const preferredContentType = state.preferredContentType;
  const preferredDebridProvider = useSourceStore((s) => s.preferredDebridProvider);

  const preferences = usePreferencesStore((s) => s.preferences);
  const updateGeneralSettings = usePreferencesStore((s) => s.updateGeneralSettings);

  const isSepia = preferences?.theme === 'sepia' || (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'sepia');

  const activeBadgeClass = isSepia
    ? 'bg-primary/15 text-primary border border-primary/40 font-extrabold'
    : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 font-extrabold';

  const linkedBannerClass = isSepia
    ? 'border border-primary/40 bg-primary/10 text-primary font-bold shadow-2xs'
    : 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 shadow-2xs';

  const unlinkBtnClass = isSepia
    ? 'border border-primary/40 bg-primary/20 text-primary hover:bg-primary/30 font-extrabold'
    : 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-500/30 font-extrabold';

  const discordRpcEnabled = preferences?.discordRpcEnabled ?? true;
  const isOnlineMetadata = (preferences?.metadataMode ?? 'online') !== 'embedded-only';

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
  const [anilistTokenError, setAnilistTokenError] = useState<string | null>(null);

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
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden text-foreground">
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-5xl flex-1 flex-col justify-between overflow-hidden rounded-[1.8rem] border border-border/60 bg-card/75 p-6 md:p-8 backdrop-blur-2xl shadow-[0_20px_50px_-12px_hsl(var(--foreground)/0.12),0_4px_16px_-4px_hsl(var(--foreground)/0.06)]">
        <div className="onb-fade-up flex flex-wrap items-center gap-3">
          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 bg-primary/5 text-foreground shadow-2xs">
            <Plug className="onb-icon-inner h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Integrations</h2>
            <p className="text-xs text-muted-foreground md:text-sm mt-0.5">
              Connect third-party services & features to enhance your reading experience. Safe to skip and configure later.
            </p>
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-3 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            {/* Rich 2x2 Desktop Integration Grid */}
            <div className="onb-fade-up onb-delay-200 mt-1 grid gap-4 lg:grid-cols-2">
              {/* Card 1: AniList Sync */}
              <section className="flex flex-col justify-between rounded-2xl border border-border/40 bg-card/50 p-5 shadow-2xs">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-primary/5 text-foreground">
                        <Link2 className="onb-icon-inner h-4 w-4 text-primary" />
                      </span>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/90">AniList Sync</h3>
                    </div>
                    {isAniListLinked && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${activeBadgeClass}`}>
                        Connected
                      </span>
                    )}
                  </div>

                  <p className="mb-4 text-xs text-foreground/65 leading-relaxed">
                    Link your AniList account to automatically track reading progress and update scores across manga sources.
                  </p>
                </div>

                <div>
                  {isAniListLinked ? (
                    <div className={`flex w-full items-center justify-between rounded-xl px-4 py-3 ${linkedBannerClass}`}>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-semibold">{aniListViewer?.name ? `Linked as ${aniListViewer.name}` : 'Account Linked'}</span>
                      </div>
                      <GlowButton
                        variant="secondary"
                        className={`px-3 py-1.5 text-xs ${unlinkBtnClass}`}
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
                        <GlowButton
                          variant="secondary"
                          className="w-full border-border/40 bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-primary/5"
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
                      ) : (
                        <GlowButton
                          variant="secondary"
                          className="w-full border-border/40 bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-primary/5"
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
                        <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-card/30 p-2.5">
                          <p className="text-[11px] text-foreground/60">Or manually paste access token:</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="eyJ0eXAi..."
                              className="h-8 flex-1 rounded-lg border border-border/40 bg-background px-2.5 text-xs text-foreground outline-none transition focus-visible:ring-1 focus-visible:ring-primary/50"
                              onChange={(e) => {
                                const value = e.target.value;
                                if (ANILIST_TOKEN_RE.test(value)) {
                                  updateGeneralSettings({ anilistToken: value });
                                  setAnilistTokenError(null);
                                  e.target.value = '';
                                } else if (value.length > 0) {
                                  setAnilistTokenError('Invalid token format.');
                                } else {
                                  setAnilistTokenError(null);
                                }
                              }}
                            />
                          </div>
                          {anilistTokenError && (
                            <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {anilistTokenError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Card 2: Debrid Torrent Cache */}
              <section className="flex flex-col justify-between rounded-2xl border border-border/40 bg-card/50 p-5 shadow-2xs">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-primary/5 text-foreground">
                        <KeyRound className="onb-icon-inner h-4 w-4 text-primary" />
                      </span>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/90">Debrid Cache</h3>
                    </div>
                    {hasTorboxKey && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${activeBadgeClass}`}>
                        Configured
                      </span>
                    )}
                  </div>

                  <p className="mb-4 text-xs text-foreground/65 leading-relaxed">
                    Add your Torbox or Real-Debrid key to unlock high-speed cloud downloads and torrent archive streaming.
                  </p>
                </div>

                <div>
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
                      placeholder="Enter Torbox API Key (tbx_...)"
                      className="h-10 w-full rounded-xl border border-border/40 bg-background px-3 text-xs text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40"
                      autoComplete="new-password"
                      spellCheck="false"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-card text-foreground transition hover:bg-primary/5 cursor-pointer"
                      onClick={() => setShowKey((prev) => !prev)}
                      aria-label={showKey ? 'Hide API key' : 'Show API key'}
                      disabled={isLoading}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <GlowButton
                      variant="secondary"
                      onClick={() => void handleSave()}
                      disabled={!hasKey || isLoading || isSaving}
                      className="border-border/40 bg-card px-3.5 py-1.5 text-xs text-foreground hover:bg-primary/5"
                    >
                      {isSaving ? 'Saving...' : 'Save key'}
                    </GlowButton>

                    <GlowButton
                      variant="secondary"
                      onClick={() => void handleTest()}
                      disabled={!hasKey || isLoading || isTesting}
                      className="border-border/40 bg-card px-3.5 py-1.5 text-xs text-foreground hover:bg-primary/5"
                    >
                      {isTesting ? 'Testing...' : 'Test key'}
                    </GlowButton>
                  </div>

                  {message ? (
                    <div
                      className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                        testValid === null
                          ? 'border-border/40 bg-card/70 text-foreground/65'
                          : testValid
                            ? (isSepia ? 'border-primary/40 bg-primary/10 text-primary' : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300')
                            : 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {testValid === null ? null : testValid ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> : <ShieldX className="h-3.5 w-3.5 shrink-0" />}
                      <span>{message}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Card 3: Discord Rich Presence */}
              <section className="flex flex-col justify-between rounded-2xl border border-border/40 bg-card/50 p-5 shadow-2xs">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-primary/5 text-foreground">
                        <Gamepad2 className="onb-icon-inner h-4 w-4 text-primary" />
                      </span>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/90">Discord Presence</h3>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                      discordRpcEnabled ? activeBadgeClass : 'bg-muted text-muted-foreground border border-border/40 font-semibold'
                    }`}>
                      {discordRpcEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <p className="mb-4 text-xs text-foreground/65 leading-relaxed">
                    Showcase your current book, manga volume, chapter, and live reading progress on your Discord activity profile.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void updateGeneralSettings({ discordRpcEnabled: !discordRpcEnabled })}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-xs font-bold transition-all cursor-pointer ${
                    discordRpcEnabled ? 'border-2 border-primary bg-primary/10 text-foreground shadow-2xs' : 'border-border/50 bg-card text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  <span>Share live activity on Discord</span>
                  <div className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${discordRpcEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                    <div className={`h-4 w-4 rounded-full bg-white transition-transform ${discordRpcEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              </section>

              {/* Card 4: Metadata & Cover Enrichment */}
              <section className="flex flex-col justify-between rounded-2xl border border-border/40 bg-card/50 p-5 shadow-2xs">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-primary/5 text-foreground">
                        <Image className="onb-icon-inner h-4 w-4 text-primary" />
                      </span>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/90">Metadata & Covers</h3>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                      isOnlineMetadata ? activeBadgeClass : 'bg-muted text-muted-foreground border border-border/40 font-semibold'
                    }`}>
                      {isOnlineMetadata ? 'Online API' : 'Local Only'}
                    </span>
                  </div>

                  <p className="mb-4 text-xs text-foreground/65 leading-relaxed">
                    Fetch HD volume covers, author details, synopsis, and genres automatically from online metadata services.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void updateGeneralSettings({ metadataMode: isOnlineMetadata ? 'embedded-only' : 'online' })}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-xs font-bold transition-all cursor-pointer ${
                    isOnlineMetadata ? 'border-2 border-primary bg-primary/10 text-foreground shadow-2xs' : 'border-border/50 bg-card text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  <span>Auto-fetch covers & metadata online</span>
                  <div className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${isOnlineMetadata ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                    <div className={`h-4 w-4 rounded-full bg-white transition-transform ${isOnlineMetadata ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              </section>

            </div>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-300 mt-3 flex shrink-0 items-center justify-between border-t border-border/40 pt-3">
          <GlowButton variant="secondary" onClick={onBack} className="px-6">
            ← Back
          </GlowButton>
          <GlowButton variant="primary" onClick={onNext} className="px-8">
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default IntegrationsStep;
