import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FeatureId =
  | 'info-button'
  | 'manga-series-card'
  | 'auto-group-manga'
  | 'series-management'
  | 'series-assignment'
  | 'metadata-search'
  | 'batch-operations';

interface FeatureDiscoveryState {
  discoveredFeatures: Set<FeatureId>;
  dismissedHints: Set<FeatureId>;
  
  // Actions
  markFeatureDiscovered: (featureId: FeatureId) => void;
  dismissHint: (featureId: FeatureId) => void;
  shouldShowHint: (featureId: FeatureId) => boolean;
  resetDiscovery: () => void;
}

export const useFeatureDiscoveryStore = create<FeatureDiscoveryState>()(
  persist(
    (set, get) => ({
      discoveredFeatures: new Set(),
      dismissedHints: new Set(),

      markFeatureDiscovered: (featureId) => {
        set((state) => ({
          discoveredFeatures: new Set([...state.discoveredFeatures, featureId]),
        }));
      },

      dismissHint: (featureId) => {
        set((state) => ({
          dismissedHints: new Set([...state.dismissedHints, featureId]),
        }));
      },

      shouldShowHint: (featureId) => {
        const state = get();
        return (
          !state.discoveredFeatures.has(featureId) &&
          !state.dismissedHints.has(featureId)
        );
      },

      resetDiscovery: () => {
        set({
          discoveredFeatures: new Set(),
          dismissedHints: new Set(),
        });
      },
    }),
    {
      name: 'shiori-feature-discovery',
      // Custom storage to handle Set serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          return {
            state: {
              ...parsed.state,
              discoveredFeatures: new Set(parsed.state.discoveredFeatures || []),
              dismissedHints: new Set(parsed.state.dismissedHints || []),
            },
          };
        },
        setItem: (name, value) => {
          const toStore = {
            state: {
              ...value.state,
              discoveredFeatures: Array.from(value.state.discoveredFeatures),
              dismissedHints: Array.from(value.state.dismissedHints),
            },
          };
          localStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
