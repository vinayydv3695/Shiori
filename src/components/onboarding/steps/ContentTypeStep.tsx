import { useOnboardingStore } from "../../../store/onboardingStore";
import { Book, Image as ImageIcon, Layers } from "lucide-react";
import { cn } from "../../../lib/utils";
import { motion } from "framer-motion";

export function ContentTypeStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const selectedType = draftConfig.preferredContentType || 'both';

    const options = [
        { id: "books" as const, name: "Books Only", icon: Book, desc: "EPUB, PDF, MOBI, AZW3" },
        { id: "manga" as const, name: "Manga Only", icon: ImageIcon, desc: "CBZ, CBR, Archives" },
        { id: "both" as const, name: "Both", icon: Layers, desc: "I read everything" },
    ];

    return (
        <div className="space-y-10 py-6 max-w-4xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
            >
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6 shadow-inner ring-1 ring-primary/20">
                    <Layers className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">What do you read?</h2>
                <p className="text-lg text-muted-foreground font-medium">
                    We'll streamline your setup by hiding settings for formats you don't use.
                </p>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full px-4"
            >
                {options.map((opt, i) => (
                    <motion.button
                        key={opt.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 + (i * 0.1) }}
                        onClick={() => setDraftValue('preferredContentType', opt.id)}
                        className={cn(
                            "p-8 rounded-3xl border-2 transition-all duration-300 text-left space-y-6 group relative overflow-hidden",
                            selectedType === opt.id
                                ? "border-primary bg-primary/5 ring-4 ring-primary/20 shadow-xl shadow-primary/10"
                                : "border-border bg-card hover:border-primary/40 hover:shadow-lg hover:-translate-y-1"
                        )}
                    >
                        {selectedType === opt.id && (
                            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-bl-[100px] -z-10" />
                        )}
                        
                        <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300",
                            selectedType === opt.id 
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110" 
                                : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                        )}>
                            <opt.icon className="w-7 h-7" />
                        </div>

                        <div className="space-y-2">
                            <div className="font-bold text-xl">{opt.name}</div>
                            <div className="text-sm text-muted-foreground font-medium leading-relaxed">{opt.desc}</div>
                        </div>
                        
                        {/* Background flourish */}
                        {selectedType === opt.id && (
                            <motion.div 
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 0.05 }}
                                transition={{ duration: 0.4 }}
                                className="absolute -bottom-8 -right-8 pointer-events-none"
                            >
                                <opt.icon className="w-40 h-40" />
                            </motion.div>
                        )}
                    </motion.button>
                ))}
            </motion.div>
        </div>
    );
}
