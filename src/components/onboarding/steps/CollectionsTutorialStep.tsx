import { motion } from "framer-motion";
import { FolderHeart, Layers, Filter } from "lucide-react";
import { CreateCollectionDialog } from "../../collections/CreateCollectionDialog";
import { useState } from "react";
import { Button } from "../../ui/button";

export function CollectionsTutorialStep() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-700 max-w-3xl mx-auto">
            <div className="text-center space-y-4">
                <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-blue-500/5 rotate-3 hover:rotate-6 transition-transform mb-6"
                >
                    <FolderHeart className="w-10 h-10 text-blue-500" />
                </motion.div>
                
                <h2 className="text-4xl font-extrabold tracking-tight">Organize Your Way</h2>
                <p className="text-muted-foreground text-lg max-w-lg mx-auto leading-relaxed">
                    Create manual collections or set up smart collections that automatically gather books based on tags, authors, or reading status.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="bg-card border border-border/50 rounded-2xl p-6 hover:border-blue-500/30 transition-colors group cursor-pointer shadow-sm relative overflow-hidden"
                    onClick={() => setIsDialogOpen(true)}
                >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
                    <Layers className="w-8 h-8 text-blue-500 mb-4" />
                    <h3 className="text-xl font-bold mb-2 group-hover:text-blue-500 transition-colors">Manual Collections</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Hand-pick your favorite reads into curated shelves. Perfect for series, recommendations, or custom groupings.
                    </p>
                    <div className="mt-6 flex justify-end">
                        <Button variant="ghost" className="text-blue-500 group-hover:bg-blue-500/10 rounded-xl">Create One</Button>
                    </div>
                </motion.div>

                <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-card border border-border/50 rounded-2xl p-6 hover:border-purple-500/30 transition-colors group cursor-pointer shadow-sm relative overflow-hidden"
                    onClick={() => setIsDialogOpen(true)}
                >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
                    <Filter className="w-8 h-8 text-purple-500 mb-4" />
                    <h3 className="text-xl font-bold mb-2 group-hover:text-purple-500 transition-colors">Smart Collections</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Set rules (like "Tag: Fantasy" AND "Status: Unread") and let Shiori automatically populate the collection for you.
                    </p>
                    <div className="mt-6 flex justify-end">
                        <Button variant="ghost" className="text-purple-500 group-hover:bg-purple-500/10 rounded-xl">Try It</Button>
                    </div>
                </motion.div>
            </div>

            <CreateCollectionDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
        </div>
    );
}
