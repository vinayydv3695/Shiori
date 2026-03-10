import { BookOpen, Settings2, Zap, Library, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function WelcomeStep() {
    const features = [
        { icon: Settings2, text: "Customize reading & manga interfaces" },
        { icon: Sparkles, text: "Set reading goals & preferences" },
        { icon: Zap, text: "Configure performance caching" },
        { icon: Library, text: "Setup library directories" }
    ];

    return (
        <div className="text-center space-y-10 py-6 max-w-2xl mx-auto">
            <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
                className="flex justify-center"
            >
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                    <div className="relative w-32 h-32 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20 shadow-xl shadow-primary/10 rotate-3 hover:rotate-0 transition-transform duration-500">
                        <BookOpen className="w-16 h-16 text-primary" />
                    </div>
                </div>
            </motion.div>

            <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="space-y-4"
            >
                <h2 className="text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    Welcome to Shiori
                </h2>
                <p className="text-xl text-muted-foreground font-medium max-w-lg mx-auto">
                    Let's profile your reading habits to deliver the perfect desktop reading experience.
                </p>
            </motion.div>

            <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto text-left"
            >
                {features.map((feature, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + (i * 0.1) }}
                        className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/50 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
                    >
                        <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <feature.icon className="w-5 h-5 flex-shrink-0" />
                        </div>
                        <span className="text-sm font-medium leading-tight">{feature.text}</span>
                    </motion.div>
                ))}
            </motion.div>
        </div>
    );
}
