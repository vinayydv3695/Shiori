import { useOnboardingStore } from "../../../store/onboardingStore";
import { DEFAULT_MANGA_PREFERENCES } from "../../../types/preferences";
import { cn } from "../../../lib/utils";
import { Layout, Type, Book } from "lucide-react";

export function MangaPrefsStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const mangaPrefs = draftConfig.manga || DEFAULT_MANGA_PREFERENCES;

    const updateMangaPref = (key: keyof typeof DEFAULT_MANGA_PREFERENCES, value: any) => {
        setDraftValue('manga', { ...mangaPrefs, [key]: value });
    };

    const modes = [
        { id: "single" as const, name: "Single Page", icon: Layout, desc: "Classic vertical scrolling, one page per block" },
        { id: "double" as const, name: "Spread", icon: Book, desc: "Two pages side-by-side" },
        { id: "long-strip" as const, name: "Webtoon Strip", icon: Type, desc: "Continuous seamless images" },
    ];

    const directions = [
        { id: "ltr" as const, name: "Left to Right", desc: "Common for western comics" },
        { id: "rtl" as const, name: "Right to Left", desc: "Standard for Japanese Manga" },
    ];

    return (
        <div className="w-full space-y-8 py-4 px-2 max-w-xl mx-auto">
            <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold tracking-tight">Comic & Manga Render</h2>
                <p className="text-muted-foreground text-sm">
                    Set the default image rendering engine properties for CBZ/CBR files.
                </p>
            </div>

            <div className="space-y-6">

                {/* Reading Mode */}
                <div className="space-y-4 bg-card border border-border p-6 rounded-xl shadow-sm">
                    <label className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Mode</label>
                    <div className="grid grid-cols-1 gap-3">
                        {modes.map((m) => (
                            <button
                                key={m.id}
                                onClick={() => updateMangaPref('mode', m.id)}
                                className={cn(
                                    "flex items-center gap-4 p-4 rounded-lg border-2 transition-all w-full text-left",
                                    mangaPrefs.mode === m.id
                                        ? "border-primary bg-primary/5 shadow-sm"
                                        : "border-border bg-background hover:bg-muted"
                                )}
                            >
                                <div className="flex justify-center text-primary/80">
                                    <m.icon className="w-6 h-6 flex-shrink-0" />
                                </div>
                                <div>
                                    <div className="font-semibold text-sm">{m.name}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Direction */}
                <div className="space-y-4 bg-card border border-border p-6 rounded-xl shadow-sm">
                    <label className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Paging Direction</label>
                    <div className="grid grid-cols-2 gap-3">
                        {directions.map((d) => (
                            <button
                                key={d.id}
                                onClick={() => updateMangaPref('direction', d.id)}
                                className={cn(
                                    "p-4 rounded-lg border-2 transition-all text-left",
                                    mangaPrefs.direction === d.id
                                        ? "border-primary bg-primary/5"
                                        : "border-border bg-background hover:bg-muted"
                                )}
                            >
                                <div className="font-semibold text-sm">{d.name}</div>
                                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{d.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
