import { useOnboardingStore } from "../../../store/onboardingStore";
import { BookOpen, CheckCircle2 } from "lucide-react";

export function WelcomeStep() {
    return (
        <div className="text-center space-y-8 py-8 animate-in fade-in zoom-in duration-500">
            <div className="flex justify-center">
                <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center ring-8 ring-primary/5">
                    <BookOpen className="w-14 h-14 text-primary" />
                </div>
            </div>

            <div className="space-y-4 max-w-lg mx-auto">
                <h2 className="text-4xl font-extrabold tracking-tight">Welcome to Shiori</h2>
                <p className="text-lg text-muted-foreground">
                    Let's profile your reading habits to deliver the perfect desktop reading experience.
                </p>
            </div>

            <div className="bg-muted/50 rounded-xl p-6 max-w-md mx-auto space-y-4 border border-border/50">
                <ul className="text-sm font-medium space-y-3 text-left">
                    <li className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>Customize reading interfaces</span>
                    </li>
                    <li className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>Configure performance caching</span>
                    </li>
                    <li className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>Setup library directories</span>
                    </li>
                </ul>
            </div>
        </div>
    );
}
