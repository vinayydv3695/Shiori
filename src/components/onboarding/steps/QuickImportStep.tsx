import { motion } from "framer-motion";
import { ImportDialog } from "../../library/ImportDialog";
import { FolderUp, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/button";

export function QuickImportStep() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500 max-w-2xl mx-auto">
            <div className="text-center space-y-4">
                <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/5 mb-6"
                >
                    <FolderUp className="w-10 h-10 text-emerald-500" />
                </motion.div>
                
                <h2 className="text-4xl font-bold tracking-tight">Bring Your Library</h2>
                <p className="text-muted-foreground text-lg max-w-md mx-auto">
                    Let's get some books into Shiori. You can skip this and do it later, but having a few books now will make the next steps better.
                </p>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
                
                <div className="flex flex-col items-center justify-center space-y-6 text-center">
                    <div className="space-y-2">
                        <h3 className="text-xl font-semibold">Import from Folder</h3>
                        <p className="text-sm text-muted-foreground">Select a folder containing your EPUBs, PDFs, or Manga archives (CBZ/CBR).</p>
                    </div>

                    <Button 
                        size="lg" 
                        onClick={() => setIsDialogOpen(true)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-500/20 px-8 group-hover:-translate-y-0.5 transition-all"
                    >
                        <FolderUp className="w-5 h-5 mr-2" />
                        Select Folder to Import
                    </Button>
                </div>
            </div>

            <ImportDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
        </div>
    );
}
