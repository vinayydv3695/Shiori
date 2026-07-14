import { useMemo } from 'react';
import { Cloud, Database, Shield } from 'lucide-react';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { useSourceStore } from '@/store/sourceStore';
import { useOnboardingState } from '../hooks/useOnboardingState';

type CloudIntegrationStepProps = {
  onBack: () => void;
  onNext: () => void;
};

export function CloudIntegrationStep({ onBack, onNext }: CloudIntegrationStepProps) {
  const { state, setDefaultMangaSource, setDefaultBookSource } = useOnboardingState();
  const primaryManga = state.defaultMangaSource;
  const primaryBooks = state.defaultBookSource;
  const preferredContentType = state.preferredContentType;
  const sources = useSourceStore(s => s.sources);
  const mangaSources = useMemo(() => sources.filter(x => x.kind === 'manga' && x.enabled), [sources]);
  const bookSources = useMemo(() => sources.filter(x => x.kind === 'books' && x.enabled), [sources]);

  const preferredDebridProvider = useSourceStore((state) => state.preferredDebridProvider);
  const setPreferredDebridProvider = useSourceStore((state) => state.setPreferredDebridProvider);

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-foreground md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(161,161,170,0.14),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-border/40 bg-card/60 p-4 backdrop-blur-xl md:p-6">
        <div className="onb-fade-up flex flex-wrap items-center gap-3">
          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 bg-primary/5 text-foreground">
            <Cloud className="onb-icon-inner h-5 w-5" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Cloud Integrations</h2>
        </div>

        <p className="onb-fade-up onb-delay-100 mt-2 max-w-3xl text-sm text-foreground/65 md:text-base">
          Tune recommended online providers and your debrid preference. Safe to keep defaults and continue.
        </p>

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-3 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            <div className="onb-fade-up onb-delay-200 mt-2 grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <section className="rounded-2xl border border-border/40 bg-card/50 p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-primary/5 text-foreground">
                      <Database className="onb-icon-inner h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/90">Primary Source Selection</h3>
                  </div>
                  
                  <div className="space-y-4">
                    {(preferredContentType === 'manga' || preferredContentType === 'both') && (
                      <div>
                        <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Manga & Comics</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {mangaSources.map(source => (
                            <label key={source.id} className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${primaryManga === source.id ? 'border-primary/50 bg-primary/5' : 'border-border/20 bg-card hover:border-border/60'}`}>
                              <span className={`text-sm font-medium ${primaryManga === source.id ? 'text-primary' : 'text-foreground/80'}`}>{source.name}</span>
                              <div className="relative flex h-4 w-4 items-center justify-center rounded-full border border-border/60 bg-zinc-950">
                                {primaryManga === source.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                                <input type="radio" name="onboarding-primary-manga" checked={primaryManga === source.id} onChange={() => setDefaultMangaSource(source.id)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Set ${source.name} as primary`} />
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {(preferredContentType === 'books' || preferredContentType === 'both') && (
                      <div>
                        <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Books</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {bookSources.map(source => (
                            <label key={source.id} className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${primaryBooks === source.id ? 'border-primary/50 bg-primary/5' : 'border-border/20 bg-card hover:border-border/60'}`}>
                              <span className={`text-sm font-medium ${primaryBooks === source.id ? 'text-primary' : 'text-foreground/80'}`}>{source.name}</span>
                              <div className="relative flex h-4 w-4 items-center justify-center rounded-full border border-border/60 bg-zinc-950">
                                {primaryBooks === source.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                                <input type="radio" name="onboarding-primary-books" checked={primaryBooks === source.id} onChange={() => setDefaultBookSource(source.id)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Set ${source.name} as primary`} />
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="flex flex-col gap-4">
                <section className="rounded-2xl border border-border/40 bg-card/50 p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="onb-icon-badge inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-primary/5 text-foreground">
                      <Shield className="onb-icon-inner h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/90">Debrid Provider Preference</h3>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center justify-between rounded-lg border border-border/40 bg-card px-3 py-2 text-sm">
                      <span className="text-foreground/90">Auto</span>
                      <input
                        type="radio"
                        name="onboarding-debrid"
                        checked={preferredDebridProvider === 'auto'}
                        onChange={() => setPreferredDebridProvider('auto')}
                        className="h-4 w-4 accent-zinc-400"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-border/40 bg-card px-3 py-2 text-sm">
                      <span className="text-foreground/90">Torbox</span>
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
              </div>
            </div>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-300 mt-3 flex shrink-0 items-center justify-between border-t border-border/40 pt-3">
          <GlowButton variant="secondary" onClick={onBack} className="px-6">
            ← Back
          </GlowButton>
          <GlowButton variant="primary" onClick={onNext} className="onb-cta-glow px-8">
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default CloudIntegrationStep;
