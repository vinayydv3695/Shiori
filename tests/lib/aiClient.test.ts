import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildOpenAICompatPayload,
  processSSEStream,
  executeAICompletion,
  buildBookSystemPrompt,
  composeAbortSignal,
  safeFetch,
} from '@/lib/ai/aiClient';
import type { AIProviderConfig } from '@/lib/ai/types';

vi.mock('@/lib/tauri', () => ({
  api: {
    searchBooks: vi.fn().mockResolvedValue({ books: [], total: 0, query: '' }),
  },
  isTauri: false,
  isAndroid: false,
}));

vi.mock('@/store/aiStore', () => ({
  useAIStore: {
    getState: () => ({
      getActiveConfig: () => ({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-x' }),
    }),
  },
}));

describe('buildOpenAICompatPayload', () => {
  it('sends temperature + max_tokens for classic models', () => {
    const payload = buildOpenAICompatPayload('gpt-4o', [{ role: 'user', content: 'hi' }], 0.7, false, 1024);
    expect(payload).toMatchObject({
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 1024,
    });
    expect(payload.max_completion_tokens).toBeUndefined();
  });

  it('strips temperature and uses max_completion_tokens for o1/o3 reasoning models', () => {
    for (const model of ['o1', 'o3-mini', 'o4-mini']) {
      const payload = buildOpenAICompatPayload(model, [{ role: 'user', content: 'hi' }], 0.7, true, 4096);
      expect(payload.temperature).toBeUndefined();
      expect(payload.max_tokens).toBeUndefined();
      expect(payload.max_completion_tokens).toBe(4096);
      expect(payload.stream).toBe(true);
    }
  });

  it('uses a sane default token cap when none provided', () => {
    const payload = buildOpenAICompatPayload('gpt-4o', [], 0.7, false);
    expect(payload.max_tokens).toBe(2048);
  });
});

function sseStream(...frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = frames.join('').split('').map((c) => encoder.encode(c)[0] ?? c.charCodeAt(0));
  const chunk = new Uint8Array(bytes);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe('processSSEStream', () => {
  it('concatenates OpenAI-compatible deltas and stops at [DONE]', async () => {
    const chunks: string[] = [];
    const text = await processSSEStream(
      sseStream(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n'
      ),
      ({ text: t }) => chunks.push(t)
    );
    expect(text).toBe('Hello world');
    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('extracts Gemini candidates frames', async () => {
    const text = await processSSEStream(
      sseStream('data: {"candidates":[{"content":{"parts":[{"text":"Chapter"}]}}]}\n\n'),
      () => {}
    );
    expect(text).toBe('Chapter');
  });

  it('throws on mid-stream error frames', async () => {
    await expect(
      processSSEStream(
        sseStream('data: {"error":{"message":"quota exhausted"}}\n\n'),
        () => {}
      )
    ).rejects.toThrow(/quota exhausted/);
  });

  it('ignores keep-alive ping frames', async () => {
    const text = await processSSEStream(
      sseStream('data: {"type":"ping"}\n\n', 'data: [DONE]\n\n'),
      () => {}
    );
    expect(text).toBe('');
  });
});

describe('executeAICompletion', () => {
  const baseConfig = (overrides: Partial<AIProviderConfig> = {}): AIProviderConfig => ({
    provider: 'openai',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    temperature: 0.5,
    ...overrides,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws a friendly error when a key-requiring provider has no key', async () => {
    await expect(
      executeAICompletion(baseConfig({ apiKey: '' }), [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow(/API key for OPENAI is required/);
  });

  it('performs a non-streaming OpenAI-compatible call through safeFetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'answer' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAICompletion(baseConfig(), [{ role: 'user', content: 'hi' }]);
    expect(result).toBe('answer');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe('gpt-4o');
    expect(body.stream).toBe(false);
  });

  it('streams deltas to onChunk and returns the full text', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    );

    const chunks: string[] = [];
    const result = await executeAICompletion(
      baseConfig(),
      [{ role: 'user', content: 'hi' }],
      { onChunk: (c) => chunks.push(c) }
    );
    expect(chunks).toEqual(['A', 'B']);
    expect(result).toBe('AB');
  });

  it('surfaces provider HTTP errors with status codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"error":{"message":"bad key"}}', { status: 401 }))
    );
    await expect(
      executeAICompletion(baseConfig(), [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow(/AI Request Failed \(401\)/);
  });

  it('times out hung providers instead of spinning forever', async () => {
    vi.useFakeTimers();
    try {
      // A hung provider: the promise never settles on its own; only the
      // timeout's abort signal can reject it.
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true }
            );
          })
        )
      );
      const promise = executeAICompletion(baseConfig(), [{ role: 'user', content: 'hi' }]);
      const assertion = expect(promise).rejects.toThrow(/timed out after/);
      await vi.advanceTimersByTimeAsync(121_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('buildBookSystemPrompt', () => {
  it('injects book, chapter, progress and the no-spoiler discipline', () => {
    const prompt = buildBookSystemPrompt({
      bookTitle: 'Dune',
      author: 'Herbert',
      chapterTitle: 'The Sleeper',
      chapterIndex: 3,
      readingPercent: 40,
    });
    expect(prompt).toContain('"Dune"');
    expect(prompt).toContain('Herbert');
    expect(prompt).toContain('The Sleeper');
    expect(prompt).toContain('Chapter 4');
    expect(prompt).toContain('40%');
    expect(prompt).toContain('NO SPOILERS');
  });
});

describe('composeAbortSignal', () => {
  it('propagates the parent abort', () => {
    const parent = new AbortController();
    const composed = composeAbortSignal(parent.signal, 60_000);
    parent.abort();
    expect(composed.signal.aborted).toBe(true);
    composed.cleanup();
  });

  it('marks timeouts distinctly from parent aborts', () => {
    vi.useFakeTimers();
    try {
      const composed = composeAbortSignal(undefined, 10);
      expect(composed.timedOut).toBe(false);
      vi.advanceTimersByTime(20);
      expect(composed.signal.aborted).toBe(true);
      expect(composed.timedOut).toBe(true);
      composed.cleanup();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('safeFetch', () => {
  it('falls back to window.fetch when not in Tauri', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await safeFetch('https://example.test', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith('https://example.test', expect.anything());
  });
});