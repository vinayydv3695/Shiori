import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cloud, Database, Globe, Shield } from 'lucide-react';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { api } from '@/lib/tauri';
import { useSourceStore } from '@/store/sourceStore';

type CloudIntegrationStepProps = {
  onBack: () => void;
  onNext: () => void;
};

const RECOMMENDED_SOURCE_IDS = ['mangadex', 'openlibrary', 'anna-archive'] as const;

export function CloudIntegrationStep({ onBack, onNext }: CloudIntegrationStepProps) {
  const sources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const preferredDebridProvider = useSourceStore((state) => state.preferredDebridProvider);
  const toggleSource = useSourceStore((state) => state.toggleSource);
  const setPrimarySource = useSourceStore((state) => state.setPrimarySource);
  const setPreferredDebridProvider = useSourceStore((state) => state.setPreferredDebridProvider);

  const [hasTorboxKey, setHasTorboxKey] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadTorboxKey = async () => {
      try {
        const key = await api.getTorboxKey();
        if (isMounted) {
          setHasTorboxKey(Boolean(key?.trim()));
        }
      } catch {
        if (isMounted) {
          setHasTorboxKey(false);
        }
      }
    };

    void loadTorboxKey();
    return () => {
      isMounted = false;
    };
  }, []);

  const recommendedSources = useMemo(
    () => sources.filter((source) => RECOMMENDED_SOURCE_IDS.includes(source.id as (typeof RECOMMENDED_SOURCE_IDS)[number])),
    [sources]
  );

  const recommendedMangaSources = useMemo(
    () => recommendedSources.filter((source) => source.kind === 'manga' && source.implemented),
    [recommendedSources]
  );
  const recommendedBookSources = useMemo(
    () => recommendedSources.filter((source) => source.kind === 'books' && source.implemented),
    [recommendedSources]
  );

  const primaryManga = primarySourceByKind.manga;
  const primaryBooks = primarySourceByKind.books;

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-slate-950 p-8 text-white shadow-xl shadow-black/40 md:p-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="onb-fade-up flex items-center gap-3">
          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-indigo-200">
            <Cloud className="onb-icon-inner h-5 w-5" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Cloud Integrations</h2>
        </div>

        <p className="onb-fade-up onb-delay-100 mt-3 max-w-3xl text-sm text-white/65 md:text-base">
          Configure recommended providers only: MangaDex, Open Library, Anna Archive, and Torbox debrid preference.
        </p>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            <div className="onb-fade-up onb-delay-200 mt-8 space-y-5">
              <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-indigo-200">
                    <Database className="onb-icon-inner h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-white/90">Recommended Sources</h3>
                </div>

                <div className="space-y-3">
                  {recommendedSources.map((source) => {
                    const locked = source.id === 'mangadex' || source.id === 'anna-archive';
                    return (
                      <label
                        key={source.id}
                        className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-white/10 bg-slate-900 px-3 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{source.name}</p>
                          <p className="mt-1 text-xs text-white/60">{source.description}</p>
                          {locked ? <p className="mt-1 text-xs text-white/50">Required source</p> : null}
                        </div>
                        <input
                          type="checkbox"
                          checked={source.enabled}
                          onChange={() => toggleSource(source.id)}
                          disabled={locked}
                          className="mt-0.5 h-4 w-4 accent-primary"
                          aria-label={`Toggle ${source.name}`}
                        />
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-indigo-200">
                    <Globe className="onb-icon-inner h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-white/90">Primary Source Selection</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                    <p className="mb-2 text-sm font-medium text-white">Primary Manga Source</p>
                    <div className="space-y-2">
                      {recommendedMangaSources.map((source) => (
                        <label key={source.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
                          <span className="text-white/90">{source.name}</span>
                          <input
                            type="radio"
                            name="onboarding-primary-manga"
                            checked={primaryManga === source.id}
                            onChange={() => setPrimarySource('manga', source.id)}
                            disabled={!source.enabled}
                            className="h-4 w-4 accent-primary"
                            aria-label={`Set ${source.name} as primary manga source`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                    <p className="mb-2 text-sm font-medium text-white">Primary Book Source</p>
                    <div className="space-y-2">
                      {recommendedBookSources.map((source) => (
                        <label key={source.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
                          <span className="text-white/90">{source.name}</span>
                          <input
                            type="radio"
                            name="onboarding-primary-books"
                            checked={primaryBooks === source.id}
                            onChange={() => setPrimarySource('books', source.id)}
                            disabled={!source.enabled}
                            className="h-4 w-4 accent-primary"
                            aria-label={`Set ${source.name} as primary book source`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-indigo-200">
                    <Shield className="onb-icon-inner h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-white/90">Debrid Provider Preference</h3>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                    <span className="text-white/90">Auto</span>
                    <input
                      type="radio"
                      name="onboarding-debrid"
                      checked={preferredDebridProvider === 'auto'}
                      onChange={() => setPreferredDebridProvider('auto')}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                    <span className="text-white/90">Torbox</span>
                    <input
                      type="radio"
                      name="onboarding-debrid"
                      checked={preferredDebridProvider === 'torbox'}
                      onChange={() => setPreferredDebridProvider('torbox')}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                </div>

                {preferredDebridProvider === 'torbox' && hasTorboxKey === false ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span>No Torbox key detected. You can still continue and add it later.</span>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-300 mt-4 flex shrink-0 items-center justify-between border-t border-white/10 bg-slate-950/95 pt-5 pb-1 backdrop-blur z-20">
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
