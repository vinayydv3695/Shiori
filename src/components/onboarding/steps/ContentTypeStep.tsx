import { useOnboardingStore } from "../../../store/onboardingStore";
import { Book, Image as ImageIcon, Layers } from "lucide-react";
import { cn } from "../../../lib/utils";

export function ContentTypeStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const selectedType = draftConfig.preferredContentType || 'both';

    const options = [
        { id: "books", name: "Books Only", icon: Book, desc: "EPUB, PDF, MOBI, AZW3" },
        { id: "manga", name: "Manga Only", icon: ImageIcon, desc: "CBZ, CBR, Archives" },
        { id: "both", name: "Both", icon: Layers, desc: "I read everything" },
    ];

    return (
        <div className="space-y-8 py-4">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">What do you read?</h2>
                <p className="text-muted-foreground">
                    We'll skip settings for formats you don't care about.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full px-4">
                {options.map((opt) => (
                    <button
                        key={opt.id}
                        onClick={() => setDraftValue('preferredContentType', opt.id)}
                        className={cn(
                            "p-6 rounded-xl border-2 transition-all duration-200 text-left space-y-4 group",
                            selectedType === opt.id
                                ? "border-primary bg-primary/10 ring-4 ring-primary/20 scale-[1.02]"
                                : "border-border bg-card hover:border-primary/50 hover:bg-muted"
                        )}
                    >
                        <div className={cn(
                            "w-12 h-12 rounded-lg flex items-center justify-center transition-colors",
                            selectedType === opt.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                        )}>
                            <opt.icon className="w-6 h-6" />
                        </div>

                        <div>
                            <div className="font-bold text-lg">{opt.name}</div>
                            <div className="text-sm text-muted-foreground mt-1">{opt.desc}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
