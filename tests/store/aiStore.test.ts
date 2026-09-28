import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAIStore } from '@/store/aiStore';

vi.mock('@/lib/tauri', () => ({
  isTauri: false, // browser mode: keys live in the localStorage fallback
  isAndroid: false,
}));

vi.mock('@/lib/ai/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/aiClient')>();
  return {
    ...actual,
    executeAICompletion: vi.fn(),
  };
});

import { executeAICompletion } from '@/lib/ai/aiClient';
const mockedExecute = vi.mocked(executeAICompletion);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Reset the persisted store to a clean slate.
  useAIStore.setState({
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
    selectedModels: {
      ollama: 'llama3.2',
      groq: 'llama-3.3-70b-versatile',
      gemini: 'gemini-2.5-flash',
      openai: 'gpt-4o',
      deepseek: 'deepseek-chat',
      anthropic: 'claude-3-5-sonnet-latest',
      opencode: 'deepseek-v4-pro',
    },
    customModels: { ollama: [], groq: [], gemini: [], openai: [], deepseek: [], anthropic: [], opencode: [] },
    ollamaBaseUrl: 'http://localhost:11434',
    opencodeBaseUrl: 'https://opencode.ai/zen/go/v1',
    temperature: 0.7,
    chatHistories: {},
    generatingBookId: null,
    streams: {},
    lastError: null,
    keyStorage: null,
  });
});

describe('aiStore — browser mode key persistence', () => {
  it('stores, hydrates and deletes keys via the localStorage fallback', async () => {
    await useAIStore.getState().setApiKey('gemini', 'sk-browser-key');
    expect(useAIStore.getState().apiKeys.gemini).toBe('sk-browser-key');
    expect(useAIStore.getState().keyStorage).toBe('fallback');
    expect(localStorage.getItem('shiori-ai-web-keys')).toContain('sk-browser-key');

    // A fresh store instance (simulated by clearing the session state) picks
    // the key back up on hydration.
    useAIStore.setState({ apiKeys: { ...useAIStore.getState().apiKeys, gemini: '' } });
    await useAIStore.getState().hydrateApiKeys();
    expect(useAIStore.getState().apiKeys.gemini).toBe('sk-browser-key');

    await useAIStore.getState().deleteApiKey('gemini');
    expect(useAIStore.getState().apiKeys.gemini).toBe('');
    expect(localStorage.getItem('shiori-ai-web-keys')).not.toContain('sk-browser-key');
  });

  it('normalizes whitespace around saved keys', async () => {
    await useAIStore.getState().setApiKey('openai', '  sk-padded  ');
    expect(useAIStore.getState().apiKeys.openai).toBe('sk-padded');
  });
});

describe('aiStore — chat lifecycle', () => {
  it('rolls back the user message and records lastError on failure', async () => {
    mockedExecute.mockRejectedValueOnce(new Error('AI Request Failed (401): bad key'));
    useAIStore.setState({ apiKeys: { ...useAIStore.getState().apiKeys, gemini: 'sk-test' } });

    await expect(
      useAIStore.getState().sendMessage(7, 'Who is Paul?', { bookId: 7, bookTitle: 'Dune' })
    ).rejects.toThrow(/401/);

    const state = useAIStore.getState();
    expect(state.chatHistories[7]).toBeUndefined(); // no orphaned user question
    expect(state.generatingBookId).toBeNull();
    expect(state.lastError).toContain('401');
  });

  it('appends the assistant answer and clears generation state on success', async () => {
    mockedExecute.mockResolvedValueOnce('Paul Atreides is the protagonist.');
    useAIStore.setState({ apiKeys: { ...useAIStore.getState().apiKeys, gemini: 'sk-test' } });

    const answer = await useAIStore.getState().sendMessage(7, 'Who is Paul?');
    expect(answer).toBe('Paul Atreides is the protagonist.');

    const history = useAIStore.getState().chatHistories[7]!;
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
    expect(useAIStore.getState().generatingBookId).toBeNull();
    expect(useAIStore.getState().streams[7]).toBe('');
  });

  it('streams chunk text into the per-book stream slot', async () => {
    mockedExecute.mockImplementationOnce(async (_config, _messages, options) => {
      options?.onChunk?.('Part 1', 'Part 1');
      options?.onChunk?.('Part 2', 'Part 1Part 2');
      return 'Part 1Part 2';
    });
    useAIStore.setState({ apiKeys: { ...useAIStore.getState().apiKeys, gemini: 'sk-test' } });

    await useAIStore.getState().sendMessage(3, 'Summarize', { bookId: 3 });
    expect(useAIStore.getState().chatHistories[3]![1].content).toBe('Part 1Part 2');
  });

  it('abortGeneration stops an in-flight stream and clears state', async () => {
    mockedExecute.mockImplementationOnce(
      (_config, _messages, options) =>
        new Promise<string>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true }
          );
        })
    );
    useAIStore.setState({ apiKeys: { ...useAIStore.getState().apiKeys, gemini: 'sk-test' } });

    const promise = useAIStore.getState().sendMessage(5, 'Long question', { bookId: 5 });
    expect(useAIStore.getState().generatingBookId).toBe(5);
    // Let the request start so the mock has attached its abort listener.
    await new Promise((resolve) => setTimeout(resolve, 0));
    useAIStore.getState().abortGeneration();
    await expect(promise).rejects.toThrow(/stopped/);
    expect(useAIStore.getState().generatingBookId).toBeNull();
    expect(useAIStore.getState().lastError).toBeNull();
  });

  it('refuses concurrent sends for different books', async () => {
    mockedExecute.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('slow answer'), 50);
        })
    );
    useAIStore.setState({ apiKeys: { ...useAIStore.getState().apiKeys, gemini: 'sk-test' } });

    const first = useAIStore.getState().sendMessage(1, 'Q1', { bookId: 1 });
    await expect(
      useAIStore.getState().sendMessage(2, 'Q2', { bookId: 2 })
    ).rejects.toThrow(/already generating/);
    await first;
  });
});