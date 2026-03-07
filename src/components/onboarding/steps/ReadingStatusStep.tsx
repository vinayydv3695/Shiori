import { BookCheck, BookOpen, Clock, XCircle, PauseCircle } from "lucide-react";

export function ReadingStatusStep() {
    return (
        <div className="space-y-8 py-4 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Track Your Reading Journey</h2>
                <p className="text-muted-foreground">
                    Keep your library organized by marking books with their current reading status.
                </p>
            </div>

            <div className="bg-muted/30 rounded-xl p-6 max-w-lg mx-auto border border-border/50 shadow-sm">
                <div className="space-y-4">
                    <div className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <div className="font-semibold text-foreground">Reading</div>
                            <div className="text-xs text-muted-foreground">Currently enjoying these books</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                            <BookCheck className="w-5 h-5 text-green-500" />
                        </div>
                        <div>
                            <div className="font-semibold text-foreground">Completed</div>
                            <div className="text-xs text-muted-foreground">Finished and added to your read list</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                            <div className="font-semibold text-foreground">Planning</div>
                            <div className="text-xs text-muted-foreground">Next up on your to-read list</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                            <PauseCircle className="w-5 h-5 text-yellow-500" />
                        </div>
                        <div>
                            <div className="font-semibold text-foreground">On Hold</div>
                            <div className="text-xs text-muted-foreground">Taking a break for now</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                            <XCircle className="w-5 h-5 text-red-500" />
                        </div>
                        <div>
                            <div className="font-semibold text-foreground">Dropped</div>
                            <div className="text-xs text-muted-foreground">Decided not to finish</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
