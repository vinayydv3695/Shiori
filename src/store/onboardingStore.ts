import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/tauri';
import { usePreferencesStore } from './preferencesStore';
import type { UserPreferences } from '../types/preferences';

// The ID's of the possible steps in the Onboarding flow
export type StepId =
    | 'welcome'
    | 'content-type'
    | 'theme'
    | 'reading-prefs'
    | 'manga-prefs'
    | 'performance'
    | 'metadata'
    | 'library-setup'
    | 'ui-scale'
    | 'review';

export interface StepRegistryItem {
    id: StepId;
    /** Evaluate if this step should be included in the flow based on current draft */
    condition?: (draft: Partial<UserPreferences>) => boolean;
}

// Global registry defining the logical order of steps
export const ONBOARDING_STEPS: StepRegistryItem[] = [
    { id: 'welcome' },
    { id: 'content-type' },
    { id: 'theme' },
    {
        id: 'reading-prefs',
        condition: (draft) => draft.preferredContentType === 'both' || draft.preferredContentType === 'books'
    },
    {
        id: 'manga-prefs',
        condition: (draft) => draft.preferredContentType === 'both' || draft.preferredContentType === 'manga'
    },
    { id: 'performance' },
    {
        id: 'metadata',
        condition: () => navigator.onLine // Only ask about metadata if they have internet 
    },
    { id: 'library-setup' },
    { id: 'ui-scale' },
    { id: 'review' }
];

interface OnboardingState {
    currentStepId: StepId;
    draftConfig: Partial<UserPreferences>;
    isCommitting: boolean;

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

            init: (initialPrefs = {}) => {
                set({
                    currentStepId: 'welcome',
                    draftConfig: initialPrefs,
                    isCommitting: false
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
                set({ isCommitting: true });
                try {
                    const { draftConfig } = get();

                    // 1. Send transient FSM config to Rust backend SQLite
                    await api.updateUserPreferences(draftConfig as any);

                    // 2. Mark onboarding as officially completed
                    await api.completeOnboarding([]);

                    // 3. Hydrate the main preferences store so the app catches up
                    await usePreferencesStore.getState().loadPreferences();

                    // 4. Reset our own state to clean up localStorage transient
                    get().init({});
                } catch (error) {
                    console.error("Failed to commit onboarding setup:", error);
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
            partialize: (state) => ({
                // We persist draftConfig and currentStepId so users can resume if they close the app
                currentStepId: state.currentStepId,
                draftConfig: state.draftConfig
            }),
        }
    )
);
