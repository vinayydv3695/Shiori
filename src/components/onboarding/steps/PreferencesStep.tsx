import type { BookPrefs, MangaPrefs } from '../../../store/onboardingStore';

type PreferencesStepProps = {
  mangaPrefs: MangaPrefs;
  bookPrefs: BookPrefs;
  onMangaChange: (updates: Partial<MangaPrefs>) => void;
  onBookChange: (updates: Partial<BookPrefs>) => void;
  onBack: () => void;
  onNext: () => void;
};

const getModeClass = (isActive: boolean) =>
  `relative overflow-hidden rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    isActive
      ? 'border-primary bg-primary/10 text-primary shadow-sm shadow-primary/10'
      : 'border-border/60 bg-card hover:border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground'
  }`;

export function PreferencesStep({ mangaPrefs, bookPrefs, onMangaChange, onBookChange, onBack, onNext }: PreferencesStepProps) {
  return (
    <section className="relative w-full overflow-hidden rounded-[2rem] border border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-xl md:p-12">
      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-primary/5 to-transparent opacity-30" />
      
      <div className="relative z-10">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How Do You Read?</h2>
        <p className="mt-3 text-lg text-muted-foreground">
          Tailor Shiori to your preferred reading experience.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {/* Manga Preferences */}
          <div className="relative overflow-hidden rounded-[1.5rem] border border-border/60 bg-background/40 p-6 shadow-sm backdrop-blur-md transition-all hover:border-primary/30 hover:shadow-md md:p-8">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />
            
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-lg font-bold tracking-tight">Manga</h3>
            </div>

            <div className="space-y-8">
              <div>
                <p className="mb-3 text-sm font-semibold text-muted-foreground">Reading direction</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => onMangaChange({ readingDirection: 'rtl' })}
                    className={getModeClass(mangaPrefs.readingDirection === 'rtl')}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                      Right to Left
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onMangaChange({ readingDirection: 'ltr' })}
                    className={getModeClass(mangaPrefs.readingDirection === 'ltr')}
                  >
                    <span className="flex items-center gap-2">
                      Left to Right
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-muted-foreground">View mode</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Single', value: 'single' as const, icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="5" y="4" width="14" height="16" rx="2" strokeWidth={2} /></svg> },
                    { label: 'Spread', value: 'double' as const, icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m-8-2h16a2 2 0 002-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
                    { label: 'Scroll', value: 'scroll' as const, icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg> },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => onMangaChange({ viewMode: mode.value })}
                      className={getModeClass(mangaPrefs.viewMode === mode.value)}
                    >
                      <span className="flex items-center justify-center gap-2">
                        {mode.icon}
                        {mode.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/30">
                <div>
                  <span className="block text-sm font-medium text-foreground">Auto-group volumes</span>
                  <span className="text-xs text-muted-foreground">Group chapters into virtual volumes</span>
                </div>
                <button
                  type="button"
                  onClick={() => onMangaChange({ autoGroupVolumes: !mangaPrefs.autoGroupVolumes })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    mangaPrefs.autoGroupVolumes ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      mangaPrefs.autoGroupVolumes ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Book Preferences */}
          <div className="relative overflow-hidden rounded-[1.5rem] border border-border/60 bg-background/40 p-6 shadow-sm backdrop-blur-md transition-all hover:border-emerald-500/30 hover:shadow-md md:p-8">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />
            
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-lg font-bold tracking-tight">Books</h3>
            </div>

            <div className="space-y-8">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-muted-foreground">Font size</p>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{bookPrefs.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={24}
                  value={bookPrefs.fontSize}
                  onChange={(e) => onBookChange({ fontSize: Number(e.target.value) })}
                  className="h-2 w-full appearance-none rounded-full bg-muted accent-emerald-500 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                  aria-label="Font size"
                />
                <div className="mt-4 flex h-12 items-center justify-center rounded-xl border border-border/40 bg-muted/10 overflow-hidden px-4">
                  <p className="truncate text-center font-serif text-muted-foreground" style={{ fontSize: `${bookPrefs.fontSize}px` }}>
                    In the beginning was the word...
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-muted-foreground">Line spacing</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Comfortable', value: 'comfortable' as const },
                    { label: 'Compact', value: 'compact' as const },
                    { label: 'Relaxed', value: 'relaxed' as const },
                  ].map((line) => (
                    <button
                      key={line.value}
                      type="button"
                      onClick={() => onBookChange({ lineSpacing: line.value })}
                      className={getModeClass(bookPrefs.lineSpacing === line.value)}
                    >
                      {line.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-muted-foreground">Default page mode</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onBookChange({ pageMode: 'paginated' })}
                    className={getModeClass(bookPrefs.pageMode === 'paginated')}
                  >
                    Paginated
                  </button>
                  <button
                    type="button"
                    onClick={() => onBookChange({ pageMode: 'scroll' })}
                    className={getModeClass(bookPrefs.pageMode === 'scroll')}
                  >
                    Scroll
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between border-t border-border/30 pt-8">
          <button type="button" onClick={onBack} className="rounded-full px-6 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-muted">
            ← Back
          </button>
          <button type="button" onClick={onNext} className="group flex items-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-sm font-bold text-background transition-all hover:bg-foreground/90 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            Continue
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}

export default PreferencesStep;
