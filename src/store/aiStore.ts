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
import { executeAICompletion } from '@/lib/ai/aiClient';
import { isTauri } from '@/lib/tauri';
import { logger } from '@/lib/logger';

/** Per-book chat histories are capped to the most recent N messages on write. */
const MAX_CHAT_HISTORY_MESSAGES = 50;
const trimHistory = (messages: AIMessage[]): AIMessage[] =>
  messages.slice(-MAX_CHAT_HISTORY_MESSAGES);

/**
 * Web (non-Tauri) fallback for key persistence: a plain localStorage entry.
 * Used only when running in a browser where `invoke` doesn't exist — the
 * desktop/mobile app always uses the Rust keyring + DB fallback commands.
 */
const WEB_KEYS_STORAGE_KEY = 'shiori-ai-web-keys';

export interface KeySaveResult {
  provider: string;
  /** Where the key landed: OS keychain (preferred) or the app-data fallback. */
  method: 'keyring' | 'fallback';
  keyringAvailable: boolean;
}

function loadWebKeys(): Partial<Record<AIProvider, string>> {
  try {
    const raw = localStorage.getItem(WEB_KEYS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveWebKeys(keys: Partial<Record<AIProvider, string>>) {
  try {
    localStorage.setItem(WEB_KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch (e) {
    logger.warn('[ai] failed to persist web-mode API keys:', e);
  }
}

/**
 * Key storage state for the settings UI:
 * - `keyring`: last save landed in the OS keychain (ideal)
 * - `fallback`: keyring unavailable — key kept in app data (survives restarts
 *   but is not OS-secured); surfaced as a warning banner
 * - `memoryOnly`: last save failed everywhere — key survives only this session
 * - `null`: nothing saved in this session yet
 */
export type KeyStorageStatus = 'keyring' | 'fallback' | 'memoryOnly' | null;

/** Abort handle for the in-flight sidebar chat generation (Stop button). */
let activeAbort: AbortController | null = null;

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
  /** bookId currently streaming an answer, or null. */
  generatingBookId: number | null;
  /** Live streaming text per book (key = bookId). */
  streams: Record<number, string>;
  lastError: string | null;
  /** Where the last-saved key landed (settings warning banner). */
  keyStorage: KeyStorageStatus;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setActiveProvider: (provider: AIProvider) => void;
  setApiKey: (provider: AIProvider, key: string) => Promise<KeySaveResult | null>;
  deleteApiKey: (provider: AIProvider) => Promise<void>;
  /** Pull provider keys from the OS keychain + DB fallback into memory (no-op-safe). */
  hydrateApiKeys: () => Promise<void>;
  setSelectedModel: (provider: AIProvider, model: string) => void;
  addCustomModel: (provider: AIProvider, model: string) => void;
  setOllamaBaseUrl: (url: string) => void;
  setOpencodeBaseUrl: (url: string) => void;
  setTemperature: (temp: number) => void;
  getActiveConfig: () => AIProviderConfig;
  clearError: () => void;
  /** Aborts the in-flight chat generation (Stop button). */
  abortGeneration: () => void;

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
      generatingBookId: null,
      streams: {},
      lastError: null,
      keyStorage: null,

      setEnabled: (enabled) => set({ enabled }),
      setActiveProvider: (provider) => set({ activeProvider: provider }),

      setApiKey: async (provider, key) => {
        const trimmed = key.trim();
        // Update memory immediately (works this session no matter what).
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: trimmed },
        }));

        if (!isTauri) {
          // Browser mode: keep keys in localStorage (best-effort, audit F-07).
          const webKeys = loadWebKeys();
          if (!trimmed) {
            delete webKeys[provider];
          } else {
            webKeys[provider] = trimmed;
          }
          saveWebKeys(webKeys);
          set({ keyStorage: trimmed ? 'fallback' : null });
          return { provider, method: 'fallback', keyringAvailable: false };
        }

        try {
          const result = await invoke<KeySaveResult>('ai_key_set', { provider, key: trimmed });
          set({
            keyStorage: result.method === 'keyring' && result.keyringAvailable ? 'keyring' : result.method === 'fallback' ? 'fallback' : 'memoryOnly',
          });
          return result;
        } catch (err) {
          // Keyring and fallback both failed — the key stays in memory for
          // this session only. Log; never touch lastError (that's for request
          // failures, not storage problems — audit F-06).
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[ai] failed to save ${provider} API key: ${msg}`);
          set({ keyStorage: 'memoryOnly' });
          return null;
        }
      },

      deleteApiKey: async (provider) => {
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: '' },
        }));
        if (!isTauri) {
          const webKeys = loadWebKeys();
          delete webKeys[provider];
          saveWebKeys(webKeys);
          return;
        }
        try {
          await invoke('ai_key_delete', { provider });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[ai] failed to remove ${provider} API key: ${msg}`);
        }
      },

      // Fill in-memory keys from the OS keychain / DB fallback. Only ever ADDS
      // stored values — never clears a key already set in memory this session.
      // Failures are logged, not surfaced as request errors (audit F-06).
      hydrateApiKeys: async () => {
        if (!isTauri) {
          // Browser mode: load from the localStorage fallback.
          const webKeys = loadWebKeys();
          set((state) => {
            const keys = { ...state.apiKeys };
            for (const [provider, key] of Object.entries(webKeys)) {
              if (key) keys[provider as AIProvider] = key;
            }
            return { apiKeys: keys };
          });
          return;
        }
        try {
          const providers = Object.keys(get().apiKeys) as AIProvider[];
          const stored = await invoke<string[]>('ai_key_list', { providers });
          const keys: Record<AIProvider, string> = { ...get().apiKeys };
          const storedProviders: AIProvider[] = [];
          for (const provider of stored) {
            if (!providers.includes(provider as AIProvider)) continue;
            storedProviders.push(provider as AIProvider);
          }
          // Fetch actual values in parallel; a missing entry just yields null.
          const values = await Promise.all(
            storedProviders.map((provider) =>
              invoke<string | null>('ai_key_get', { provider }).catch(() => null)
            )
          );
          storedProviders.forEach((provider, i) => {
            if (values[i]) keys[provider] = values[i]!;
          });
          set({ apiKeys: keys });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[ai] failed to hydrate API keys: ${msg}`);
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

      abortGeneration: () => {
        activeAbort?.abort();
        activeAbort = null;
        set((state) => {
          const streams = { ...state.streams };
          if (state.generatingBookId !== null) delete streams[state.generatingBookId];
          return { generatingBookId: null, streams };
        });
      },

      sendMessage: async (bookId, userPrompt, context) => {
        // One chat generation at a time — claim synchronously (before any
        // await) so concurrent sends from any panel are rejected reliably.
        if (get().generatingBookId !== null) {
          throw new Error('An AI response is already generating.');
        }

        const userMsg: AIMessage = {
          id: Math.random().toString(36).substring(2, 9),
          role: 'user',
          content: userPrompt,
          timestamp: Date.now(),
        };

        const existing = get().chatHistories[bookId] || [];
        const updatedHistory = trimHistory([...existing, userMsg]);

        set((s) => ({
          chatHistories: { ...s.chatHistories, [bookId]: updatedHistory },
          generatingBookId: bookId,
          streams: { ...s.streams, [bookId]: '' },
          lastError: null,
        }));

        // Newest request takes over the abort handle (Stop button). Claimed
        // synchronously so an immediate abortGeneration() cannot miss it.
        activeAbort?.abort();
        const controller = new AbortController();
        activeAbort = controller;

        try {
          // Keys are never persisted; make sure the keychain copy is in memory
          // before the first send (no-op afterwards).
          await get().hydrateApiKeys();
          const state = get();
          const config = state.getActiveConfig();

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
            signal: controller.signal,
            onChunk: (_, fullText) => {
              set((s) => ({
                streams: { ...s.streams, [bookId]: fullText },
              }));
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
            generatingBookId: null,
            streams: { ...s.streams, [bookId]: '' },
          }));

          return responseText;
        } catch (err) {
          const errObj = err as { name?: string } | null;
          const isAbort = !!errObj && errObj.name === 'AbortError';
          const message = err instanceof Error ? err.message : String(err);
          set((s) => {
            const streams = { ...s.streams };
            delete streams[bookId];
            // Roll back the user message this call appended so a failed send
            // never leaves a question with no answer (or two consecutive user
            // roles, which Anthropic rejects). Empty histories are removed.
            const next = { ...s.chatHistories };
            const kept = (s.chatHistories[bookId] || []).filter((m) => m.id !== userMsg.id);
            if (kept.length > 0) {
              next[bookId] = kept;
            } else {
              delete next[bookId];
            }
            return {
              chatHistories: next,
              generatingBookId: null,
              streams,
              // A deliberate stop is not an error — clear any stale bubble.
              lastError: isAbort ? null : message,
            };
          });
          if (isAbort) {
            throw new DOMException('Generation stopped', 'AbortError');
          }
          throw err;
        } finally {
          if (activeAbort === controller) activeAbort = null;
        }
      },

      clearChat: (bookId) =>
        set((state) => {
          const next = { ...state.chatHistories };
          delete next[bookId];
          const streams = { ...state.streams };
          delete streams[bookId];
          return { chatHistories: next, streams };
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
      // NOTE: apiKeys are deliberately NOT persisted in this payload — they
      // live in the OS keychain (`ai.<provider>.api_key`) / DB fallback, or in
      // the web-mode localStorage fallback (separate key).
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

// One-shot bootstrap: pull provider keys from the OS keychain / DB fallback
// into memory at startup so the settings UI shows them without waiting for a
// first send. Safe at import time — invoke is available in the webview context.
void useAIStore.getState().hydrateApiKeys();