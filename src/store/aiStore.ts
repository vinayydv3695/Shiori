import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  AIProvider, 
  AIProviderConfig, 
  AIMessage, 
  ReadingContext 
} from '@/lib/ai/types';
import { PROVIDER_DEFAULT_MODELS } from '@/lib/ai/types';
import { executeAICompletion, buildBookSystemPrompt } from '@/lib/ai/aiClient';

interface AIState {
  enabled: boolean;
  activeProvider: AIProvider;
  apiKeys: Record<AIProvider, string>;
  selectedModels: Record<AIProvider, string>;
  customModels: Record<AIProvider, string[]>;
  ollamaBaseUrl: string;
  opencodeBaseUrl: string;
  temperature: number;
  // Per-book chat history: key = bookId
  chatHistories: Record<number, AIMessage[]>;
  isGenerating: boolean;
  currentResponse: string;
  lastError: string | null;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setActiveProvider: (provider: AIProvider) => void;
  setApiKey: (provider: AIProvider, key: string) => void;
  setSelectedModel: (provider: AIProvider, model: string) => void;
  addCustomModel: (provider: AIProvider, model: string) => void;
  setOllamaBaseUrl: (url: string) => void;
  setOpencodeBaseUrl: (url: string) => void;
  setTemperature: (temp: number) => void;
  getActiveConfig: () => AIProviderConfig;
  clearError: () => void;

  // Chat Actions
  sendMessage: (
    bookId: number,
    content: string,
    context?: ReadingContext
  ) => Promise<string>;
  clearChat: (bookId: number) => void;
  deleteMessage: (bookId: number, messageId: string) => void;
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      enabled: false,
      activeProvider: 'gemini',
      apiKeys: {
        ollama: '',
        groq: '',
        gemini: '',
        openai: '',
        deepseek: '',
        anthropic: '',
        opencode: '',
      },
      selectedModels: { ...PROVIDER_DEFAULT_MODELS },
      customModels: {
        ollama: [],
        groq: [],
        gemini: [],
        openai: [],
        deepseek: [],
        anthropic: [],
        opencode: [],
      },
      ollamaBaseUrl: 'http://localhost:11434',
      opencodeBaseUrl: 'https://opencode.ai/zen/go/v1',
      temperature: 0.7,
      chatHistories: {},
      isGenerating: false,
      currentResponse: '',
      lastError: null,

      setEnabled: (enabled) => set({ enabled }),
      setActiveProvider: (provider) => set({ activeProvider: provider }),

      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key.trim() },
        })),

      setSelectedModel: (provider, model) =>
        set((state) => ({
          selectedModels: { ...state.selectedModels, [provider]: model },
        })),

      addCustomModel: (provider, model) =>
        set((state) => {
          const trimmed = model.trim();
          if (!trimmed) return state;
          const existing = state.customModels?.[provider] || [];
          if (existing.includes(trimmed)) {
            return {
              selectedModels: { ...state.selectedModels, [provider]: trimmed },
            };
          }
          return {
            customModels: {
              ...state.customModels,
              [provider]: [trimmed, ...existing],
            },
            selectedModels: { ...state.selectedModels, [provider]: trimmed },
          };
        }),

      setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url.trim() }),

      setOpencodeBaseUrl: (url) => set({ opencodeBaseUrl: url.trim() }),

      setTemperature: (temp) => set({ temperature: temp }),

      clearError: () => set({ lastError: null }),

      getActiveConfig: () => {
        const state = get();
        const provider = state.activeProvider;
        let model = state.selectedModels[provider] || PROVIDER_DEFAULT_MODELS[provider];
        // Upgrade deprecated Gemini models from previous local storage to current defaults
        if (provider === 'gemini') {
          if (model === 'gemini-1.5-flash') model = 'gemini-2.5-flash';
          if (model === 'gemini-1.5-pro') model = 'gemini-2.5-pro';
        }
        const baseUrl =
          provider === 'ollama'
            ? state.ollamaBaseUrl
            : provider === 'opencode'
            ? state.opencodeBaseUrl || 'https://opencode.ai/zen/go/v1'
            : undefined;

        return {
          provider,
          apiKey: state.apiKeys[provider],
          model,
          baseUrl,
          temperature: state.temperature,
        };
      },

      sendMessage: async (bookId, userPrompt, context) => {
        const state = get();
        const config = state.getActiveConfig();

        const userMsg: AIMessage = {
          id: Math.random().toString(36).substring(2, 9),
          role: 'user',
          content: userPrompt,
          timestamp: Date.now(),
        };

        const existing = state.chatHistories[bookId] || [];
        const updatedHistory = [...existing, userMsg];

        set((s) => ({
          chatHistories: { ...s.chatHistories, [bookId]: updatedHistory },
          isGenerating: true,
          currentResponse: '',
          lastError: null,
        }));

        try {
          // Send at most the last 20 messages, always starting with a user turn
          // (Anthropic rejects leading assistant entries).
          const windowed = updatedHistory.slice(-20);
          while (windowed.length > 0 && windowed[0].role === 'assistant') {
            windowed.shift();
          }
          const messagesForAI = windowed.map((m) => ({
            role: m.role,
            content: m.content,
          }));

          const responseText = await executeAICompletion(config, messagesForAI, {
            context,
            onChunk: (_, fullText) => {
              set({ currentResponse: fullText });
            },
          });

          const assistantMsg: AIMessage = {
            id: Math.random().toString(36).substring(2, 9),
            role: 'assistant',
            content: responseText,
            timestamp: Date.now(),
          };

          set((s) => ({
            chatHistories: {
              ...s.chatHistories,
              [bookId]: [...(s.chatHistories[bookId] || []), assistantMsg],
            },
            isGenerating: false,
            currentResponse: '',
          }));

          return responseText;
        } catch (err) {
          set((s) => ({
            // Roll back the user message this call appended so a failed send
            // never leaves a question with no answer (or two consecutive user
            // roles, which Anthropic rejects).
            chatHistories: {
              ...s.chatHistories,
              [bookId]: (s.chatHistories[bookId] || []).filter((m) => m.id !== userMsg.id),
            },
            isGenerating: false,
            currentResponse: '',
            lastError: err instanceof Error ? err.message : String(err),
          }));
          throw err;
        }
      },

      clearChat: (bookId) =>
        set((state) => {
          const next = { ...state.chatHistories };
          delete next[bookId];
          return { chatHistories: next };
        }),

      deleteMessage: (bookId, messageId) =>
        set((state) => {
          const current = (state.chatHistories[bookId] || []).filter((m) => m.id !== messageId);
          // Normalize so the history never starts with an assistant message or
          // contains consecutive same-role messages (Anthropic rejects those).
          const normalized: AIMessage[] = [];
          for (const m of current) {
            if (normalized.length === 0 && m.role === 'assistant') continue;
            const last = normalized[normalized.length - 1];
            if (last && last.role === m.role) continue;
            normalized.push(m);
          }
          return {
            chatHistories: {
              ...state.chatHistories,
              [bookId]: normalized,
            },
          };
        }),
    }),
    {
      name: 'shiori-ai-settings',
      partialize: (state) => ({
        enabled: state.enabled,
        activeProvider: state.activeProvider,
        apiKeys: state.apiKeys,
        selectedModels: state.selectedModels,
        customModels: state.customModels,
        ollamaBaseUrl: state.ollamaBaseUrl,
        opencodeBaseUrl: state.opencodeBaseUrl,
        temperature: state.temperature,
        chatHistories: state.chatHistories,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<AIState>),
        enabled: (persistedState as Partial<AIState>)?.enabled ?? false,
      }),
    }
  )
);
