import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { 
  AIProvider, 
  AIProviderConfig, 
  AIMessage, 
  ReadingContext 
} from '@/lib/ai/types';
import { PROVIDER_DEFAULT_MODELS } from '@/lib/ai/types';
import { executeAICompletion, buildBookSystemPrompt } from '@/lib/ai/aiClient';
import { logger } from '@/lib/logger';

/** Per-book chat histories are capped to the most recent N messages on write. */
const MAX_CHAT_HISTORY_MESSAGES = 50;
const trimHistory = (messages: AIMessage[]): AIMessage[] =>
  messages.slice(-MAX_CHAT_HISTORY_MESSAGES);

// API keys live in the OS keychain (`ai.<provider>.api_key` via the Rust
// `ai_key_*` commands) and are kept in memory only — never persisted. These
// guard the one-shot hydration so it runs once at startup and again before the
// first AI send at most.
let apiKeysHydrated = false;
let apiKeysHydratePromise: Promise<void> | null = null;

function ensureApiKeysHydrated(): Promise<void> {
  if (!apiKeysHydrated) {
    apiKeysHydrated = true;
    apiKeysHydratePromise = useAIStore.getState().hydrateApiKeys();
  }
  return apiKeysHydratePromise ?? Promise.resolve();
}

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
  deleteApiKey: (provider: AIProvider) => void;
  /** Pull provider keys from the OS keychain into memory (no-op-safe). */
  hydrateApiKeys: () => Promise<void>;
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

      setApiKey: (provider, key) => {
        const trimmed = key.trim();
        // Update memory immediately, then mirror into the OS keychain.
        // Fire-and-forget: failures surface via lastError + a log warning.
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: trimmed },
        }));
        // Empty key means "delete" on the Rust side; one call covers both.
        invoke('ai_key_set', { provider, key: trimmed }).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[ai] failed to save ${provider} API key to keychain: ${msg}`);
          set({ lastError: msg });
        });
      },

      deleteApiKey: (provider) => {
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: '' },
        }));
        invoke('ai_key_delete', { provider }).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[ai] failed to remove ${provider} API key from keychain: ${msg}`);
          set({ lastError: msg });
        });
      },

      // Fill in-memory keys from the OS keychain. Only ever ADDS keychain
      // values — never clears a key already set in memory this session, so a
      // keyring-less environment (where the keychain write failed) keeps its
      // in-memory fallback.
      hydrateApiKeys: async () => {
        try {
          const providers = Object.keys(get().apiKeys) as AIProvider[];
          const stored = await invoke<string[]>('ai_key_list', { providers });
          const keys: Record<AIProvider, string> = { ...get().apiKeys };
          for (const provider of stored) {
            if (!providers.includes(provider as AIProvider)) continue;
            const key = await invoke<string | null>('ai_key_get', { provider });
            if (key) keys[provider as AIProvider] = key;
          }
          set({ apiKeys: keys });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[ai] failed to hydrate API keys from keychain: ${msg}`);
          set({ lastError: msg });
        }
      },

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
        // Keys are never persisted; make sure the keychain copy is in memory
        // before the first send (no-op afterwards).
        await ensureApiKeysHydrated();
        const state = get();
        const config = state.getActiveConfig();

        const userMsg: AIMessage = {
          id: Math.random().toString(36).substring(2, 9),
          role: 'user',
          content: userPrompt,
          timestamp: Date.now(),
        };

        const existing = state.chatHistories[bookId] || [];
        const updatedHistory = trimHistory([...existing, userMsg]);

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
              [bookId]: trimHistory([...(s.chatHistories[bookId] || []), assistantMsg]),
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
              [bookId]: trimHistory(normalized),
            },
          };
        }),
    }),
    {
      name: 'shiori-ai-settings',
      // NOTE: apiKeys are deliberately NOT persisted — they live in the OS
      // keychain (`ai.<provider>.api_key`) and in memory only.
      partialize: (state) => ({
        enabled: state.enabled,
        activeProvider: state.activeProvider,
        selectedModels: state.selectedModels,
        customModels: state.customModels,
        ollamaBaseUrl: state.ollamaBaseUrl,
        opencodeBaseUrl: state.opencodeBaseUrl,
        temperature: state.temperature,
        chatHistories: state.chatHistories,
      }),
      merge: (persistedState, currentState) => {
        const persisted: Partial<AIState> = {
          ...(persistedState as Partial<AIState>),
        };
        // Never resurrect legacy apiKeys from pre-keychain localStorage payloads.
        delete persisted.apiKeys;
        return {
          ...currentState,
          ...persisted,
          enabled: persisted.enabled ?? false,
        };
      },
    }
  )
);

// One-shot bootstrap: pull provider keys from the OS keychain into memory at
// startup so the settings UI shows them without waiting for a first send.
// Safe at import time — invoke is available in the webview context.
void ensureApiKeysHydrated();
