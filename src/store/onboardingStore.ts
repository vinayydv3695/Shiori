import { logger } from '@/lib/logger';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/tauri';
import { usePreferencesStore } from './preferencesStore';
import type { UserPreferences } from '../types/preferences';

// The ID's of the possible steps in the Onboarding flow
export type StepId =
    | 'enhanced-welcome'
    | 'welcome'
    | 'features-overview'
    | 'content-type'
    | 'library-setup'
    | 'comic-setup'
    | 'theme'
    | 'reading-prefs'
    | 'manga-prefs'
    | 'manga-series-grouping'
    | 'auto-group-manga'
    | 'series-management'
    | 'collections-tutorial'
    | 'reader-modes'
    | 'reading-goal'
    | 'reading-status'
    | 'translation'
    | 'metadata'
    | 'metadata-search'
    | 'rss-setup'
    | 'info-button-tutorial'
    | 'shortcuts'
    | 'ui-scale'
    | 'review'
    | 'success';

export interface StepRegistryItem {
    id: StepId;
    /** Evaluate if this step should be included in the flow based on current draft */
    condition?: (draft: Partial<UserPreferences>) => boolean;
}

// Global registry defining the logical order of steps
export const ONBOARDING_STEPS: StepRegistryItem[] = [
    { id: 'welcome' },
    { id: 'content-type' },
    { id: 'library-setup' },
    { 
        id: 'manga-prefs',
        condition: (draft) => draft.preferredContentType === 'manga' || draft.preferredContentType === 'both'
    },
    { 
        id: 'manga-series-grouping',
        condition: (draft) => draft.preferredContentType === 'manga' || draft.preferredContentType === 'both'
    },
    { 
        id: 'auto-group-manga',
        condition: (draft) => draft.preferredContentType === 'manga' || draft.preferredContentType === 'both'
    },
    { id: 'theme' },
    { id: 'ui-scale' },
    { id: 'reading-prefs' },
    { id: 'translation' },
    { id: 'metadata' },
    { id: 'shortcuts' },
    { id: 'review' }
];

interface OnboardingState {
    currentStepId: StepId;
    draftConfig: Partial<UserPreferences>;
    isCommitting: boolean;
    skipped: boolean;
    scanComplete: boolean;
    libraryPath: string;
    contentType: string;
    selectedTheme: string;
    uiScale: number;
    readingMode: string;
    readingDirection: string;
    autoGroupSeries: boolean;
    imagePreloadCount: number;
    reduceAnimations: boolean;
    features: Record<string, boolean>;
    readingGoal: number;
    booksImportedCount: number;
    booksDuplicateCount: number;
    mangaImportedCount: number;
    mangaDuplicateCount: number;
    comicsImportedCount: number;
    comicsDuplicateCount: number;

    // Actions
    /** Initializes the onboarding FSM. Pass existing prefs to re-run setup. */
    init: (initialPrefs?: Partial<UserPreferences>) => void;

    /** Update a key in the transient draft configuration */
    setDraftValue: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
    setDraftValues: (values: Partial<UserPreferences>) => void;

    /** Progress FSM forward evaluating conditions */
    nextStep: () => void;

    /** Regress FSM backward evaluating conditions */
    prevStep: () => void;

    /** Commits the draft payload to the backend and marks onboarding complete */
    commit: () => Promise<void>;

    /** Returns the computed progress percentage (0 - 100) */
    getProgress: () => number;
    setSkipped: (v: boolean) => void;
    setScanComplete: (v: boolean) => void;
    setLibraryPath: (path: string) => void;
    setContentType: (type: string) => void;
    setTheme: (theme: string) => void;
    setUiScale: (scale: number) => void;
    setReadingMode: (mode: string) => void;
    setReadingDirection: (direction: string) => void;
    setAutoGroupSeries: (enabled: boolean) => void;
    setImagePreloadCount: (count: number) => void;
    setReduceAnimations: (enabled: boolean) => void;
    setFeatures: (features: Record<string, boolean>) => void;
    setReadingGoal: (goal: number) => void;
    setBooksImportSummary: (importedCount: number, duplicateCount: number) => void;
    setMangaImportSummary: (importedCount: number, duplicateCount: number) => void;
    setComicsImportSummary: (importedCount: number, duplicateCount: number) => void;
}

const getActiveSteps = (draft: Partial<UserPreferences>): StepId[] => {
    return ONBOARDING_STEPS
        .filter(step => !step.condition || step.condition(draft))
        .map(step => step.id);
};

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set, get) => ({
            currentStepId: 'welcome',
            draftConfig: {},
            isCommitting: false,
            skipped: false,
            scanComplete: false,
            libraryPath: '',
            contentType: 'Both',
            selectedTheme: 'White',
            uiScale: 100,
            readingMode: 'single',
            readingDirection: 'ltr',
            autoGroupSeries: true,
            imagePreloadCount: 2,
            reduceAnimations: false,
            features: {
                metadata: true,
                seriesGrouping: true,
                smartCollections: true,
                rss: false,
                readingGoals: true,
                translation: false,
            },
            readingGoal: 0,
            booksImportedCount: 0,
            booksDuplicateCount: 0,
            mangaImportedCount: 0,
            mangaDuplicateCount: 0,
            comicsImportedCount: 0,
            comicsDuplicateCount: 0,

            init: (initialPrefs = {}) => {
                set({
                    currentStepId: 'welcome',
                    draftConfig: initialPrefs,
                    isCommitting: false,
                    skipped: false,
                    scanComplete: false,
                    libraryPath: '',
                    contentType: 'Both',
                    selectedTheme: 'White',
                    uiScale: 100,
                    readingMode: 'single',
                    readingDirection: 'ltr',
                    autoGroupSeries: true,
                    imagePreloadCount: 2,
                    reduceAnimations: false,
                    features: {
                        metadata: true,
                        seriesGrouping: true,
                        smartCollections: true,
                        rss: false,
                        readingGoals: true,
                        translation: false,
                    },
                    readingGoal: 0,
                    booksImportedCount: 0,
                    booksDuplicateCount: 0,
                    mangaImportedCount: 0,
                    mangaDuplicateCount: 0,
                    comicsImportedCount: 0,
                    comicsDuplicateCount: 0,
                });
            },

            setSkipped: (v: boolean) => {
                set({ skipped: v });
            },

            setScanComplete: (v: boolean) => {
                set({ scanComplete: v });
            },

            setLibraryPath: (path: string) => {
                set({ libraryPath: path });
            },

            setContentType: (type: string) => {
                set({ contentType: type });
            },

            setTheme: (theme: string) => {
                set({ selectedTheme: theme });
            },

            setUiScale: (scale: number) => {
                set({ uiScale: scale });
            },

            setReadingMode: (mode: string) => {
                set({ readingMode: mode });
            },

            setReadingDirection: (direction: string) => {
                set({ readingDirection: direction });
            },

            setAutoGroupSeries: (enabled: boolean) => {
                set({ autoGroupSeries: enabled });
            },

            setImagePreloadCount: (count: number) => {
                set({ imagePreloadCount: count });
            },

            setReduceAnimations: (enabled: boolean) => {
                set({ reduceAnimations: enabled });
            },

            setFeatures: (features: Record<string, boolean>) => {
                set({ features });
            },

            setReadingGoal: (goal: number) => {
                set({ readingGoal: goal });
            },

            setBooksImportSummary: (importedCount: number, duplicateCount: number) => {
                set({
                    booksImportedCount: Math.max(0, importedCount),
                    booksDuplicateCount: Math.max(0, duplicateCount),
                });
            },

            setMangaImportSummary: (importedCount: number, duplicateCount: number) => {
                set({
                    mangaImportedCount: Math.max(0, importedCount),
                    mangaDuplicateCount: Math.max(0, duplicateCount),
                });
            },

            setComicsImportSummary: (importedCount: number, duplicateCount: number) => {
                set({
                    comicsImportedCount: Math.max(0, importedCount),
                    comicsDuplicateCount: Math.max(0, duplicateCount),
                });
            },

            setDraftValue: (key, value) => {
                set((state) => ({
                    draftConfig: { ...state.draftConfig, [key]: value }
                }));
            },

            setDraftValues: (values: Partial<UserPreferences>) => {
                set((state) => ({
                    draftConfig: { ...state.draftConfig, ...values }
                }));
            },

            nextStep: () => {
                const { currentStepId, draftConfig } = get();
                const activeSteps = getActiveSteps(draftConfig);
                const currentIndex = activeSteps.indexOf(currentStepId);

                if (currentIndex < activeSteps.length - 1) {
                    set({ currentStepId: activeSteps[currentIndex + 1] });
                }
            },

            prevStep: () => {
                const { currentStepId, draftConfig } = get();
                const activeSteps = getActiveSteps(draftConfig);
                const currentIndex = activeSteps.indexOf(currentStepId);

                if (currentIndex > 0) {
                    set({ currentStepId: activeSteps[currentIndex - 1] });
                }
            },

            commit: async () => {
                console.log("=== ONBOARDING COMMIT START ===");
                set({ isCommitting: true });
                try {
                    const { draftConfig } = get();
                    console.log("Draft config:", draftConfig);

                    // 1. Send transient FSM config to Rust backend SQLite
                    console.log("Step 1: Updating user preferences...");
                    await api.updateUserPreferences(draftConfig as Partial<UserPreferences>);
                    console.log("✓ User preferences updated");

                    // 1b. Save reading goal separately (stored in reading_goals table, not user_preferences)
                    if (draftConfig.dailyReadingGoalMinutes) {
                        console.log("Step 1b: Updating reading goal...", draftConfig.dailyReadingGoalMinutes);
                        await api.updateReadingGoal(draftConfig.dailyReadingGoalMinutes);
                        console.log("✓ Reading goal updated");
                    } else {
                        console.log("Step 1b: No reading goal to update");
                    }

                    // 2. Mark onboarding as officially completed
                    // Compute which steps were skipped based on their conditions
                    const skippedSteps = ONBOARDING_STEPS
                        .filter(step => step.condition && !step.condition(draftConfig))
                        .map(step => step.id);
                    console.log("Step 2: Completing onboarding, skipped steps:", skippedSteps);
                    await api.completeOnboarding(skippedSteps);
                    console.log("✓ Onboarding marked complete in DB");

                    // 3. Hydrate the main preferences store so the app catches up (deferred to background)
                    console.log("Step 3: Triggering background preferences reload...");
                    usePreferencesStore.getState().loadPreferences().catch(err => {
                        logger.error('Background preference load failed:', err);
                    });
                    console.log("✓ Background preferences reload triggered");

                    // 4. Reset our own state to clean up localStorage transient
                    console.log("Step 4: Resetting onboarding store state...");
                    get().init({});
                    console.log("✓ Onboarding store reset");

                    // 5. Reset isCommitting flag on success
                    set({ isCommitting: false });
                    console.log("=== ONBOARDING COMMIT SUCCESS ===");
                } catch (error) {
                    console.error("=== ONBOARDING COMMIT FAILED ===", error);
                    logger.error("Failed to commit onboarding setup:", error);
                    set({ isCommitting: false });
                    throw error;
                }
            },

            getProgress: () => {
                const { currentStepId, draftConfig } = get();
                const activeSteps = getActiveSteps(draftConfig);
                const currentIndex = activeSteps.indexOf(currentStepId);
                if (currentIndex === -1 || activeSteps.length <= 1) return 0;

                // Return percentage completed (0 to 100)
                return Math.floor((currentIndex / (activeSteps.length - 1)) * 100);
            }
        }),
        {
            name: 'shiori-onboarding-fsm',
            version: 2,
            partialize: (state) => ({
                currentStepId: state.currentStepId,
                draftConfig: state.draftConfig
            }),
            migrate: (persistedState: unknown, version: number) => {
                const state = (persistedState && typeof persistedState === 'object'
                    ? persistedState
                    : {}) as { currentStepId?: StepId; draftConfig?: Partial<UserPreferences> };
                console.log('[OnboardingStore] Migration check - version:', version, 'persistedState:', persistedState);
                
                if (version < 2) {
                    console.log('[OnboardingStore] Migrating from version', version, 'to version 2');
                    
                    if (state.currentStepId === 'enhanced-welcome') {
                        console.log('[OnboardingStore] Fixing invalid step: enhanced-welcome → welcome');
                        state.currentStepId = 'welcome';
                    }
                    
                    const validStepIds = ONBOARDING_STEPS.map(s => s.id);
                    if (state.currentStepId && !validStepIds.includes(state.currentStepId)) {
                        console.warn('[OnboardingStore] Invalid step ID detected:', state.currentStepId, '- resetting to welcome');
                        state.currentStepId = 'welcome';
                        state.draftConfig = {};
                    }
                }
                
                console.log('[OnboardingStore] Migration complete - final state:', state);
                return state;
            },
        }
    )
);
