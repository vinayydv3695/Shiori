import { motion } from "framer-motion";
import { Rss, Newspaper, BellRing } from "lucide-react";
import { useOnboardingStore } from "../../../store/onboardingStore";

export function RSSSetupStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-left-8 duration-500 max-w-2xl mx-auto py-12">
            <div className="text-center space-y-6">
                <motion.div 
                    initial={{ rotate: -180, scale: 0 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 150, damping: 20 }}
                    className="w-24 h-24 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto ring-8 ring-orange-500/5 shadow-inner shadow-orange-500/20"
                >
                    <Rss className="w-12 h-12 text-orange-500" />
                </motion.div>
                
                <h2 className="text-4xl font-extrabold tracking-tight">Stay Updated</h2>
                <p className="text-muted-foreground text-lg max-w-lg mx-auto leading-relaxed">
                    Read your favorite blogs, newsletters, and manga release feeds directly in Shiori.
                </p>
            </div>

            <div className="bg-card border border-border/50 rounded-3xl p-8 relative overflow-hidden group hover:border-orange-500/30 transition-all duration-300 shadow-xl shadow-orange-500/5">
                <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/5 rounded-bl-[100px] -z-10 group-hover:scale-125 transition-transform duration-700" />
                
                <div className="space-y-6 relative z-10">
                    <div className="flex items-center gap-4 text-orange-500">
                        <div className="p-3 bg-orange-500/10 rounded-2xl">
                            <Newspaper className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">RSS Feed Reader</h3>
                            <p className="text-sm text-muted-foreground">Built-in distraction-free reading</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-border/50">
                        <div className="flex gap-3 items-start">
                            <BellRing className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-sm">Background Sync</h4>
                                <p className="text-xs text-muted-foreground mt-1">Fetches new articles automatically</p>
                            </div>
                        </div>
                        <div className="flex gap-3 items-start">
                            <Rss className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-sm">Offline Support</h4>
                                <p className="text-xs text-muted-foreground mt-1">Read synced feeds without internet</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-center text-sm text-muted-foreground bg-muted/30 p-4 rounded-xl max-w-sm mx-auto border border-border/50"
            >
                You can add feed URLs later from the RSS section in the sidebar.
            </motion.div>
        </div>
    );
}
