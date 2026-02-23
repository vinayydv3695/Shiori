import { useOnboardingStore } from "../../../store/onboardingStore";
import { DEFAULT_BOOK_PREFERENCES } from "../../../types/preferences";

export function ReadingPrefsStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    // Initialize nested config if missing
    const bookPrefs = draftConfig.book || DEFAULT_BOOK_PREFERENCES;

    const updateBookPref = (key: keyof typeof DEFAULT_BOOK_PREFERENCES, value: any) => {
        setDraftValue('book', { ...bookPrefs, [key]: value });
    };

    return (
        <div className="w-full space-y-8 py-4 px-2 max-w-xl mx-auto">
            <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold tracking-tight">Book Typography</h2>
                <p className="text-muted-foreground text-sm">
                    Set up your ideal reading environment.
                </p>
            </div>

            <div className="space-y-8 bg-card border border-border p-6 rounded-xl shadow-sm">

                {/* Font Size */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Base Font Size</label>
                        <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded text-sm font-semibold">
                            {bookPrefs.fontSize}px
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground font-medium w-8 text-right">12px</span>
                        <input
                            type="range"
                            min="12"
                            max="32"
                            step="1"
                            value={bookPrefs.fontSize}
                            onChange={(e) => updateBookPref('fontSize', Number(e.target.value))}
                            className="flex-1 accent-primary"
                        />
                        <span className="text-xs text-muted-foreground font-medium w-10 text-left">32px</span>
                    </div>
                </div>

                {/* Line Height */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                    <div className="flex justify-between items-center">
                        <label className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Line Spacing</label>
                        <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded text-sm font-semibold">
                            {bookPrefs.lineHeight.toFixed(1)}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground font-medium w-8 text-right">Tight</span>
                        <input
                            type="range"
                            min="1.2"
                            max="2.4"
                            step="0.1"
                            value={bookPrefs.lineHeight}
                            onChange={(e) => updateBookPref('lineHeight', Number(e.target.value))}
                            className="flex-1 accent-primary"
                        />
                        <span className="text-xs text-muted-foreground font-medium w-10 text-left">Loose</span>
                    </div>
                </div>

                {/* Live Preview Box */}
                <div className="mt-8 pt-6 border-t border-border">
                    <div
                        className="p-6 rounded-lg bg-muted border border-border overflow-hidden relative"
                        style={{
                            fontFamily: bookPrefs.fontFamily,
                            fontSize: `${bookPrefs.fontSize}px`,
                            lineHeight: bookPrefs.lineHeight,
                        }}
                    >
                        <div className="absolute top-2 right-3 text-[10px] text-muted-foreground font-sans uppercase tracking-widest font-bold">Preview</div>
                        <p className="mt-2 text-foreground/90">
                            The quick brown fox jumps over the lazy dog.
                            Reading should be an effortless experience.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
