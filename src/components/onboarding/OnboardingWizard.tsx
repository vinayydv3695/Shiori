import { logger } from '@/lib/logger';
import { useOnboardingStore, ONBOARDING_STEPS } from "../../store/onboardingStore";
import { Button } from "../ui/button";
import { Card } from "../ui/Card";
import { ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// Steps
import { WelcomeStep } from "./steps/WelcomeStep";
import { FeaturesOverviewStep } from "./steps/FeaturesOverviewStep";
import { ContentTypeStep } from "./steps/ContentTypeStep";
import { ComicSetupStep } from "./steps/ComicSetupStep";
import { ThemeStep } from "./steps/ThemeStep";
import { ReadingPrefsStep } from "./steps/ReadingPrefsStep";
import { MangaPrefsStep } from "./steps/MangaPrefsStep";
import { MangaSeriesGroupingStep } from "./steps/MangaSeriesGroupingStep";
import { AutoGroupMangaStep } from "./steps/AutoGroupMangaStep";
import { SeriesManagementStep } from "./steps/SeriesManagementStep";
import { ReadingGoalStep } from "./steps/ReadingGoalStep";
import { ReadingStatusStep } from "./steps/ReadingStatusStep";
import { TranslationStep } from "./steps/TranslationStep";
import { PerformanceStep } from "./steps/PerformanceStep";
import { MetadataStep } from "./steps/MetadataStep";
import { MetadataSearchStep } from "./steps/MetadataSearchStep";
import { InfoButtonTutorialStep } from "./steps/InfoButtonTutorialStep";
import { LibrarySetupStep } from "./steps/LibrarySetupStep";
import { UiScaleStep } from "./steps/UiScaleStep";
import { ReviewStep } from "./steps/ReviewStep";

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

    const progress = getProgress();

    const activeSteps = ONBOARDING_STEPS.filter(step => !step.condition || step.condition(draftConfig));
    const currentIndex = activeSteps.findIndex(s => s.id === currentStepId);
    const isLastStep = currentIndex === activeSteps.length - 1;
    const isFirstStep = currentIndex === 0;

    const handleNext = async () => {
        if (isLastStep) {
            try {
                await commit();
                onComplete();
            } catch (error) {
                logger.error("Failed to commit onboarding", error);
            }
        } else {
            nextStep();
        }
    };

    const renderStep = () => {
        switch (currentStepId) {
            case 'welcome': return <WelcomeStep />;
            case 'features-overview': return <FeaturesOverviewStep />;
            case 'content-type': return <ContentTypeStep />;
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
            case 'performance': return <PerformanceStep />;
            case 'metadata': return <MetadataStep />;
            case 'metadata-search': return <MetadataSearchStep />;
            case 'info-button-tutorial': return <InfoButtonTutorialStep />;
            case 'library-setup': return <LibrarySetupStep />;
            case 'ui-scale': return <UiScaleStep />;
            case 'review': return <ReviewStep />;
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-md z-50 flex items-center justify-center p-6">
            <Card className="w-full max-w-3xl p-8 space-y-8 shadow-2xl border-primary/10 relative overflow-hidden">

                {/* Progress indicator */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground mb-2 font-medium">
                        <span>Setup Wizard</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Content Viewport with Animations */}
                <div className="relative min-h-[400px] flex items-center justify-center py-4">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStepId}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="w-full h-full"
                        >
                            {renderStep()}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Navigation Controls */}
                <div className="flex justify-between pt-4 border-t border-border">
                    <Button
                        variant="outline"
                        onClick={prevStep}
                        disabled={isFirstStep || isCommitting}
                        className="w-32"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>

                    <Button
                        onClick={handleNext}
                        disabled={isCommitting}
                        className="w-40"
                    >
                        {isCommitting ? (
                            "Saving..."
                        ) : isLastStep ? (
                            <>
                                Finish Setup
                                <CheckCircle2 className="w-4 h-4 ml-2" />
                            </>
                        ) : (
                            <>
                                Next
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
