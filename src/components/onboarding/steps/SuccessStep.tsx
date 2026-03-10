import { motion } from "framer-motion";
import { CheckCircle2, LibraryBig, Gamepad2 } from "lucide-react";

export function SuccessStep() {
    return (
        <div className="space-y-12 animate-in fade-in zoom-in-95 duration-1000 max-w-2xl mx-auto py-16 relative">
            
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] bg-primary/20 blur-[150px] rounded-full pointer-events-none -z-10 animate-pulse" />

            <div className="text-center space-y-6 relative z-10">
                <motion.div 
                    initial={{ scale: 0, rotate: 180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="w-32 h-32 bg-primary/20 rounded-[2.5rem] flex items-center justify-center mx-auto ring-[12px] ring-primary/10 shadow-inner shadow-primary/30"
                >
                    <CheckCircle2 className="w-16 h-16 text-primary drop-shadow-lg" />
                </motion.div>
                
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    <h2 className="text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/50 pb-2">
                        You're All Set!
                    </h2>
                    <p className="text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed mt-4">
                        Your library is configured. Time to dive into your next great read.
                    </p>
                </motion.div>
            </div>

            <motion.div 
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-16 max-w-xl mx-auto"
            >
                <div className="bg-card/60 backdrop-blur-md border border-border/50 rounded-3xl p-6 flex flex-col items-center text-center space-y-4 hover:border-primary/40 hover:bg-card hover:-translate-y-1 transition-all duration-300 shadow-xl shadow-black/5 group cursor-default">
                    <div className="p-4 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform">
                        <LibraryBig className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg mb-1">Explore Library</h3>
                        <p className="text-sm text-muted-foreground leading-snug">Browse your imported books and series</p>
                    </div>
                </div>

                <div className="bg-card/60 backdrop-blur-md border border-border/50 rounded-3xl p-6 flex flex-col items-center text-center space-y-4 hover:border-primary/40 hover:bg-card hover:-translate-y-1 transition-all duration-300 shadow-xl shadow-black/5 group cursor-default">
                    <div className="p-4 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform">
                        <Gamepad2 className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg mb-1">Start Reading</h3>
                        <p className="text-sm text-muted-foreground leading-snug">Pick up right where you left off</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
