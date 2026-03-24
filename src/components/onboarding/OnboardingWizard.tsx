import { logger } from '@/lib/logger';
import { useOnboardingStore, ONBOARDING_STEPS } from "../../store/onboardingStore";
import type { StepId } from "../../store/onboardingStore";
import { useToast } from '../../store/toastStore';
import { Button } from "../ui/button";
import { Card } from "../ui/Card";
import { ArrowRight, ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// Steps
import { EnhancedWelcomeStep } from "./steps/EnhancedWelcomeStep";
import { CollectionsTutorialStep } from "./steps/CollectionsTutorialStep";
import { ReaderModesStep } from "./steps/ReaderModesStep";
import { RSSSetupStep } from "./steps/RSSSetupStep";
import { SuccessStep } from "./steps/SuccessStep";
import { WelcomeStep } from "./steps/WelcomeStep";
import { FeaturesOverviewStep } from "./steps/FeaturesOverviewStep";
import { ContentTypeStep } from "./steps/ContentTypeStep";
import { ComicSetupStep } from "./steps/ComicSetupStep";
import { ThemeStep } from "./steps/ThemeStep";
import { ReadingPrefsStep } from "./steps/ReadingPrefsStep";
import { LibrarySetupStep } from "./steps/LibrarySetupStep";
import { MangaPrefsStep } from "./steps/MangaPrefsStep";
import { MangaSeriesGroupingStep } from "./steps/MangaSeriesGroupingStep";
import { AutoGroupMangaStep } from "./steps/AutoGroupMangaStep";
import { SeriesManagementStep } from "./steps/SeriesManagementStep";
import { ReadingGoalStep } from "./steps/ReadingGoalStep";
import { ReadingStatusStep } from "./steps/ReadingStatusStep";
import { TranslationStep } from "./steps/TranslationStep";
import { MetadataStep } from "./steps/MetadataStep";
import { MetadataSearchStep } from "./steps/MetadataSearchStep";
import { InfoButtonTutorialStep } from "./steps/InfoButtonTutorialStep";
import { ShortcutsStep } from "./steps/ShortcutsStep";
import { UiScaleStep } from "./steps/UiScaleStep";
import { ReviewStep } from "./steps/ReviewStep";

const STEP_NAMES: Record<StepId, string> = {
    'enhanced-welcome': 'Welcome',
    'welcome': 'Welcome',
    'features-overview': 'Features',
    'content-type': 'Content Type',
    'library-setup': 'Library Setup',
    'comic-setup': 'Comic Setup',
    'theme': 'Appearance',
    'reading-prefs': 'Reading',
    'manga-prefs': 'Manga',
    'manga-series-grouping': 'Series Grouping',
    'auto-group-manga': 'Auto Grouping',
    'series-management': 'Series',
    'collections-tutorial': 'Collections',
    'reader-modes': 'Reader Modes',
    'reading-goal': 'Reading Goal',
    'reading-status': 'Status',
    'translation': 'Translation',
    'metadata': 'Metadata',
    'metadata-search': 'Metadata Search',
    'rss-setup': 'RSS',
    'info-button-tutorial': 'Info Button',
    'shortcuts': 'Shortcuts',
    'ui-scale': 'UI Scale',
    'review': 'Review',
    'success': 'Success'
};

interface OnboardingWizardProps {
    onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
    const currentStepId = useOnboardingStore(state => state.currentStepId);
    const nextStep = useOnboardingStore(state => state.nextStep);
    const prevStep = useOnboardingStore(state => state.prevStep);
    const commit = useOnboardingStore(state => state.commit);
    const isCommitting = useOnboardingStore(state => state.isCommitting);
    const getProgress = useOnboardingStore(state => state.getProgress);
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const toast = useToast();

    const progress = getProgress();

    const activeSteps = ONBOARDING_STEPS.filter(step => !step.condition || step.condition(draftConfig));
    const currentIndex = activeSteps.findIndex(s => s.id === currentStepId);
    const isLastStep = currentIndex === activeSteps.length - 1;
    const isFirstStep = currentIndex === 0;

    const handleNext = async () => {
        console.log("=== HANDLE NEXT CALLED ===");
        console.log("isLastStep:", isLastStep);
        console.log("currentStepId:", currentStepId);
        console.log("activeSteps:", activeSteps);
        
        if (isLastStep) {
            try {
                console.log("Last step detected - starting onboarding completion...");
                logger.info("Starting onboarding completion...");
                
                console.log("Calling commit()...");
                await commit();
                console.log("commit() returned successfully");
                
                logger.info("Onboarding completed successfully");
                toast.success(
                    "Setup Complete!",
                    "Your preferences have been saved. Ready to explore Shiori!"
                );
                
                console.log("Calling onComplete callback...");
                onComplete();
                console.log("=== ONBOARDING FLOW COMPLETE ===");
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("=== ONBOARDING FLOW FAILED ===", error);
                logger.error("Failed to commit onboarding", error);
                toast.error(
                    "Setup Failed",
                    `Unable to save your preferences: ${errorMessage}`
                );
            }
        } else {
            console.log("Not last step - calling nextStep()");
            nextStep();
        }
    };

    const renderStep = () => {
        switch (currentStepId) {
            case 'enhanced-welcome': return <EnhancedWelcomeStep />;
            case 'collections-tutorial': return <CollectionsTutorialStep />;
            case 'reader-modes': return <ReaderModesStep />;
            case 'rss-setup': return <RSSSetupStep />;
            case 'success': return <SuccessStep />;
            case 'welcome': return <WelcomeStep />;
            case 'features-overview': return <FeaturesOverviewStep />;
            case 'content-type': return <ContentTypeStep />;
            case 'library-setup': return <LibrarySetupStep />;
            case 'comic-setup': return <ComicSetupStep />;
            case 'theme': return <ThemeStep />;
            case 'reading-prefs': return <ReadingPrefsStep />;
            case 'manga-prefs': return <MangaPrefsStep />;
            case 'manga-series-grouping': return <MangaSeriesGroupingStep />;
            case 'auto-group-manga': return <AutoGroupMangaStep />;
            case 'series-management': return <SeriesManagementStep />;
            case 'reading-goal': return <ReadingGoalStep />;
            case 'reading-status': return <ReadingStatusStep />;
            case 'translation': return <TranslationStep />;
            case 'metadata': return <MetadataStep />;
            case 'metadata-search': return <MetadataSearchStep />;
            case 'info-button-tutorial': return <InfoButtonTutorialStep />;
            case 'shortcuts': return <ShortcutsStep />;
            case 'ui-scale': return <UiScaleStep />;
            case 'review': return <ReviewStep />;
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-accent/20 rounded-full blur-[120px] pointer-events-none" />

            <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-primary/20 relative overflow-hidden bg-card/80 backdrop-blur-3xl rounded-3xl">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />

                {/* Progress indicator */}
                <div className="flex-shrink-0 p-8 pb-6 space-y-4">
                    <div className="flex justify-between items-end mb-2">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-primary">
                                <Sparkles className="w-5 h-5" />
                                <span className="font-semibold text-sm uppercase tracking-wider">Setup Wizard</span>
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight">
                                {STEP_NAMES[currentStepId as StepId] || 'Welcome'}
                            </h2>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-sm font-medium text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                                Step {currentIndex + 1} of {activeSteps.length}
                            </span>
                        </div>
                    </div>
                    
                    <div className="h-2.5 bg-muted/50 rounded-full overflow-hidden backdrop-blur-sm border border-border/50">
                        <motion.div
                            className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full relative"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </motion.div>
                    </div>
                </div>

                {/* Content Viewport with Animations - Scrollable */}
                <div className="flex-1 overflow-y-auto px-8 py-2 min-h-[400px]">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStepId}
                            initial={{ opacity: 0, y: 15, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -15, scale: 0.98 }}
                            transition={{ 
                                duration: 0.4, 
                                ease: [0.25, 0.1, 0.25, 1.0] 
                            }}
                            className="w-full h-full flex flex-col justify-center"
                        >
                            {renderStep()}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Navigation Controls - Always Visible */}
                <div className="flex-shrink-0 flex justify-between items-center p-8 pt-6 bg-gradient-to-t from-background via-background/95 to-transparent border-t border-border/50 mt-4">
                    <Button
                        variant="ghost"
                        onClick={prevStep}
                        disabled={isFirstStep || isCommitting}
                        className="w-32 hover:bg-muted/50 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>

                    <Button
                        onClick={handleNext}
                        disabled={isCommitting}
                        size="lg"
                        className="w-44 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5"
                    >
                        {isCommitting ? (
                            <span className="flex items-center">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                    className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full mr-2"
                                />
                                Saving...
                            </span>
                        ) : isLastStep ? (
                            <>
                                Finish Setup
                                <CheckCircle2 className="w-5 h-5 ml-2" />
                            </>
                        ) : (
                            <>
                                Next Step
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
