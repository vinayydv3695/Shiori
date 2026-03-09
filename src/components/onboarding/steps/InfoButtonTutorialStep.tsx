import { Info, Command, CommandIcon } from "lucide-react";

export function InfoButtonTutorialStep() {
    return (
        <div className="space-y-8 py-4 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Quick Access to Book Details</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                    Instantly view, edit, or search for missing metadata online. Everything you need to know about your current read is beautifully presented in one place.
                </p>
            </div>

            <div className="bg-muted/30 rounded-xl p-8 max-w-lg mx-auto border border-border/50 shadow-sm relative overflow-hidden flex flex-col items-center">
                <div className="relative w-full max-w-sm">
                    <div className="absolute inset-0 bg-background/50 blur-sm rounded-lg" />
                    
                    <div className="relative bg-card border border-border rounded-lg shadow-md p-3 flex justify-between items-center z-10">
                        <div className="flex gap-2">
                            <div className="w-4 h-4 rounded-full bg-muted-foreground/20" />
                            <div className="w-4 h-4 rounded-full bg-muted-foreground/20" />
                        </div>
                        <div className="h-2 w-32 bg-muted-foreground/20 rounded-full" />
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                                <div className="w-4 h-4 bg-muted-foreground/30 rounded-sm" />
                            </div>
                            <div className="relative w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center border border-primary/30 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                                <Info className="w-5 h-5 text-primary" />
                                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
                            </div>
                        </div>
                    </div>
                    
                    <div className="absolute right-0 top-[120%] w-48 h-32 bg-card/80 backdrop-blur-md border border-border rounded-lg shadow-xl p-4 flex flex-col gap-2 opacity-80 translate-y-2 translate-x-2">
                        <div className="w-full h-24 bg-muted/50 rounded flex-shrink-0" />
                        <div className="w-3/4 h-3 bg-muted rounded" />
                        <div className="w-1/2 h-2 bg-muted/70 rounded" />
                    </div>
                </div>

                <div className="mt-16 text-center z-10 relative bg-background/80 p-4 rounded-xl backdrop-blur-sm border border-border/50">
                    <p className="text-sm font-medium text-foreground mb-3">
                        Click the <Info className="inline w-4 h-4 mx-1 text-primary" /> icon in the top toolbar
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <span>Or use shortcut:</span>
                        <div className="flex items-center gap-1">
                            <kbd className="px-2 py-1 bg-muted rounded-md border border-border flex items-center gap-1 shadow-sm font-sans font-medium text-foreground">
                                <CommandIcon className="w-3 h-3" /> Cmd
                            </kbd>
                            <span>/</span>
                            <kbd className="px-2 py-1 bg-muted rounded-md border border-border shadow-sm font-sans font-medium text-foreground">
                                Ctrl
                            </kbd>
                            <span>+</span>
                            <kbd className="px-2 py-1 bg-muted rounded-md border border-border shadow-sm font-sans font-medium text-foreground">
                                I
                            </kbd>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
