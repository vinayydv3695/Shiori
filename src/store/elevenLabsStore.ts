import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  fetchElevenLabsSubscription,
  fetchElevenLabsVoices,
  type ElevenLabsSubscription,
  type ElevenLabsVoice,
  DEFAULT_ELEVENLABS_MODEL,
} from '@/lib/elevenLabs';
import { logger } from '@/lib/logger';

interface ElevenLabsState {
  apiKey: string;
  selectedModel: string;
  selectedVoiceId: string;
  subscription: ElevenLabsSubscription | null;
  subscriptionLoading: boolean;
  subscriptionError: string | null;
  cachedVoices: ElevenLabsVoice[];
  voicesLoading: boolean;
  voicesError: string | null;

  // Actions
  setApiKey: (key: string) => Promise<void>;
  setSelectedModel: (model: string) => void;
  setSelectedVoiceId: (voiceId: string) => void;
  refreshSubscription: () => Promise<void>;
  refreshVoices: () => Promise<void>;
  clearApiKey: () => void;
}

export const useElevenLabsStore = create<ElevenLabsState>()(
  persist(
    (set, get) => ({
      apiKey: '',
      selectedModel: DEFAULT_ELEVENLABS_MODEL,
      selectedVoiceId: '',
      subscription: null,
      subscriptionLoading: false,
      subscriptionError: null,
      cachedVoices: [],
      voicesLoading: false,
      voicesError: null,

      setApiKey: async (key: string) => {
        const trimmed = key.trim();
        set({ apiKey: trimmed, subscriptionError: null, voicesError: null });

        if (!trimmed) {
          set({ subscription: null, cachedVoices: [] });
          return;
        }

        // Auto-refresh subscription & voices upon saving key
        await Promise.allSettled([
          get().refreshSubscription(),
          get().refreshVoices(),
        ]);
      },

      setSelectedModel: (model: string) => set({ selectedModel: model }),
      setSelectedVoiceId: (voiceId: string) => set({ selectedVoiceId: voiceId }),

      refreshSubscription: async () => {
        const key = get().apiKey;
        if (!key) return;

        set({ subscriptionLoading: true, subscriptionError: null });
        try {
          const sub = await fetchElevenLabsSubscription(key);
          set({ subscription: sub, subscriptionLoading: false });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn('[ElevenLabs] Failed to refresh subscription:', err);
          set({ subscriptionError: msg, subscriptionLoading: false });
        }
      },

      refreshVoices: async () => {
        const key = get().apiKey;
        if (!key) return;

        set({ voicesLoading: true, voicesError: null });
        try {
          const voices = await fetchElevenLabsVoices(key);
          set({
            cachedVoices: voices,
            voicesLoading: false,
            // If no voice selected yet, pick the first premade or Rachel/Adam
            selectedVoiceId:
              get().selectedVoiceId ||
              voices.find((v) => v.name.toLowerCase() === 'rachel' || v.name.toLowerCase() === 'adam')?.voice_id ||
              voices[0]?.voice_id ||
              '',
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn('[ElevenLabs] Failed to refresh voices:', err);
          set({ voicesError: msg, voicesLoading: false });
        }
      },

      clearApiKey: () => {
        set({
          apiKey: '',
          subscription: null,
          cachedVoices: [],
          subscriptionError: null,
          voicesError: null,
          selectedVoiceId: '',
        });
      },
    }),
    {
      name: 'shiori-elevenlabs-config',
      partialize: (state) => ({
        apiKey: state.apiKey,
        selectedModel: state.selectedModel,
        selectedVoiceId: state.selectedVoiceId,
        subscription: state.subscription,
        cachedVoices: state.cachedVoices,
      }),
    }
  )
);
