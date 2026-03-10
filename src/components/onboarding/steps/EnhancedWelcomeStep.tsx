import { motion } from "framer-motion";
import { BookOpen, Sparkles, Wand2, Zap } from "lucide-react";

export function EnhancedWelcomeStep() {
    return (
        <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-3xl bg-background/50 border border-border/50 shadow-2xl p-8 sm:p-12 text-center space-y-10 animate-in fade-in zoom-in-95 duration-700 backdrop-blur-sm">
            
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[80px]" />
            </div>

            <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 100, delay: 0.1 }}
                className="flex justify-center"
            >
                <div className="relative w-32 h-32 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-inner group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <BookOpen className="w-16 h-16 text-primary drop-shadow-md" />
                </div>
            </motion.div>

            <div className="space-y-6">
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                >
                    <h1 className="text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 pb-2">
                        Welcome to Shiori
                    </h1>
                    <p className="text-xl text-muted-foreground mt-4 max-w-md mx-auto leading-relaxed">
                        Your ultimate manga and eBook sanctuary. Let's craft your perfect reading environment.
                    </p>
                </motion.div>
            </div>

            <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left"
            >
                {[
                    { icon: Zap, title: "Blazing Fast", desc: "Native performance" },
                    { icon: Sparkles, title: "Beautiful UI", desc: "Tailored to you" },
                    { icon: Wand2, title: "Smart Org", desc: "Auto-magic sorting" }
                ].map((feature, i) => (
                    <div key={i} className="bg-card/50 border border-border/50 rounded-2xl p-4 flex flex-col items-center text-center space-y-2 hover:bg-card hover:border-primary/30 transition-all duration-300">
                        <div className="p-2 bg-primary/10 rounded-xl text-primary mb-1">
                            <feature.icon className="w-6 h-6" />
                        </div>
                        <h3 className="font-semibold text-sm">{feature.title}</h3>
                        <p className="text-xs text-muted-foreground">{feature.desc}</p>
                    </div>
                ))}
            </motion.div>
        </div>
    );
}
