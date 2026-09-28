import type {
  AIProvider,
  AIProviderConfig,
  AIMessage,
  ReadingContext,
  AICompletionOptions,
  ModelOption
} from './types';
import { PROVIDER_AVAILABLE_MODELS } from './types';
import { api, type SearchResult } from '@/lib/tauri';
import { isTauri } from '@/lib/tauri';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { logger } from '@/lib/logger';
import { useAIStore } from '@/store/aiStore';

/** Default ceiling for a single AI request (includes streaming). */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Builds the system prompt ensuring strict anti-spoiler discipline and book awareness.
 */
export function buildBookSystemPrompt(context?: ReadingContext, customInstruction?: string): string {
  const parts: string[] = [
    'You are Shiori AI, an insightful, concise, and articulate reading companion embedded inside Shiori Reader.',
  ];

  if (context?.bookTitle) {
    parts.push(`The user is currently reading "${context.bookTitle}"${context.author ? ` by ${context.author}` : ''}.`);
  }
  if (context?.chapterTitle) {
    parts.push(`Current location: ${context.chapterTitle}${context.chapterIndex !== undefined ? ` (Chapter ${context.chapterIndex + 1})` : ''}.`);
  }
  if (context?.readingPercent !== undefined) {
    parts.push(`Reading progress: ${Math.round(context.readingPercent)}% into the book.`);
  }

  parts.push(
    'CRITICAL INSTRUCTION - NO SPOILERS: You must NEVER reveal or hint at plot twists, character deaths, traitor reveals, or endings that occur after the user’s current chapter/progress.',
    'Focus explanations precisely on the passage, vocabulary, historical context, or character relationships established up to this point in the story.',
    'Keep explanations clear, engaging, and easy to read. Use clean Markdown (bullet points, bold highlights) when helpful.'
  );

  if (customInstruction) {
    parts.push(customInstruction);
  }

  return parts.join('\n');
}

const LIBRARY_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'do', 'does', 'did',
  'how', 'what', 'where', 'who', 'why', 'when', 'and', 'or', 'to', 'of',
  'in', 'for', 'on', 'with', 'my', 'i', 'me', 'about', 'tell',
]);

/**
 * Runs a full-text search over the user's library for books matching the question
 * and returns a compact human-readable list for prompt injection.
 * Never throws: on failure it logs a warning and returns ''.
 */
export async function retrieveLibraryContext(question: string, limit = 8): Promise<string> {
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !LIBRARY_STOPWORDS.has(t));
  const uniqueTokens = [...new Set(tokens)].slice(0, 6);

  if (uniqueTokens.length === 0) return '';

  let res: SearchResult | undefined;
  try {
    res = await api.searchBooks({ query: uniqueTokens.join(' '), limit, offset: 0 });
  } catch (e) {
    console.warn('[ai] library context search failed', e);
    return '';
  }

  const lines = (res?.books || [])
    .filter((b) => b.title?.trim().length > 0)
    .map((b) => {
      let line = `- "${b.title.trim()}"`;
      if (b.authors?.length) {
        line += ` by ${b.authors.map((a) => a.name).filter(Boolean).join(', ')}`;
      }
      if (b.series) {
        line += ` (${b.series}${b.series_index !== undefined ? ` #${b.series_index}` : ''})`;
      }
      if (b.reading_status) {
        line += ` [${b.reading_status}]`;
      }
      return line;
    });

  return lines.join('\n');
}

/**
 * Robust fetch that routes through the Tauri Rust backend (`tauri-plugin-http`,
 * a reqwest client) when running inside the app — this completely eliminates
 * webview CORS rejections from AI providers (see docs/ai-audit.md F-01). Falls
 * back to `window.fetch` in a plain browser and whenever the plugin fails.
 */
export async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  if (isTauri) {
    try {
      return await tauriFetch(url, init as unknown as Parameters<typeof tauriFetch>[1]);
    } catch (err) {
      logger.debug('[ai] plugin-http fetch failed, falling back to window.fetch:', err);
    }
  }
  return fetch(url, init);
}

export interface ComposedSignal {
  signal: AbortSignal;
  /** True when the *timeout* (not the caller's signal) fired. */
  timedOut: boolean;
  cleanup: () => void;
}

/**
 * Composes an optional caller AbortSignal with a hard timeout into a single
 * AbortSignal. The caller's signal takes precedence (stop button), the timeout
 * is a safety net so a hung provider can never spin forever (audit F-10).
 */
export function composeAbortSignal(parent?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): ComposedSignal {
  const controller = new AbortController();
  const composed: ComposedSignal = {
    signal: controller.signal,
    timedOut: false,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
  };
  const onParentAbort = () => controller.abort(parent?.reason);
  const timer = setTimeout(() => {
    composed.timedOut = true;
    controller.abort(new DOMException('AI request timed out', 'TimeoutError'));
  }, timeoutMs);

  if (parent?.aborted) {
    onParentAbort();
  } else {
    parent?.addEventListener('abort', onParentAbort, { once: true });
  }
  return composed;
}

/**
 * Executes a streaming or batch completion across the configured AI provider.
 */
export async function executeAICompletion(
  config: AIProviderConfig,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: AICompletionOptions
): Promise<string> {
  const { provider, apiKey, model, baseUrl, temperature = 0.7, maxTokens: configMaxTokens } = config;
  // Effective token cap = options override > config value > per-provider default.
  const maxTokens = options?.maxTokens ?? configMaxTokens;

  if (provider !== 'ollama' && !apiKey) {
    throw new Error(`API key for ${provider.toUpperCase()} is required. Please add your key in AI Settings.`);
  }

  // The user's question is the last user-role message in the request history.
  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  // Retrieve library context via FTS5; retrieval is best-effort and must never
  // block or fail the answer.
  const libraryContext = await retrieveLibraryContext(lastUserMessage).catch(() => '');

  const basePrompt = options?.systemPrompt || buildBookSystemPrompt(options?.context);
  const systemPrompt = `${basePrompt}\n\nLibrary context (retrieved from the user's library via full-text search; use ONLY this for factual claims about their library):\n${libraryContext || 'No matching books found in this library.'}`;
  const fullMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages,
  ];

  // Compose the caller's abort signal (stop button) with a hard timeout.
  const composed = composeAbortSignal(options?.signal);
  const runOptions: AICompletionOptions = {
    ...options,
    signal: composed.signal,
  };

  try {
    let result: string;
    switch (provider) {
      case 'ollama':
        result = await callOllama(baseUrl || 'http://localhost:11434', model, fullMessages, runOptions, maxTokens);
        break;

      case 'groq':
        result = await callOpenAICompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          apiKey!,
          model,
          fullMessages,
          temperature,
          runOptions,
          maxTokens,
          'Groq'
        );
        break;

      case 'openai':
        result = await callOpenAICompatible(
          'https://api.openai.com/v1/chat/completions',
          apiKey!,
          model,
          fullMessages,
          temperature,
          runOptions,
          maxTokens,
          'OpenAI'
        );
        break;

      case 'deepseek':
        result = await callOpenAICompatible(
          'https://api.deepseek.com/chat/completions',
          apiKey!,
          model,
          fullMessages,
          temperature,
          runOptions,
          maxTokens,
          'DeepSeek'
        );
        break;

      case 'gemini':
        result = await callGemini(apiKey!, model, fullMessages, temperature, runOptions, maxTokens);
        break;

      case 'anthropic':
        result = await callAnthropic(apiKey!, model, fullMessages, temperature, runOptions, maxTokens);
        break;

      case 'opencode':
        result = await callOpenAICompatible(
          `${(baseUrl || 'https://opencode.ai/zen/go/v1').replace(/\/$/, '')}/chat/completions`,
          apiKey!,
          model,
          fullMessages,
          temperature,
          runOptions,
          maxTokens,
          'OpenCode'
        );
        break;

      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }

    if (composed.timedOut) {
      throw new Error(`AI request timed out after ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s. Check your network or provider status.`);
    }
    return result;
  } catch (err) {
    // A timeout abort should read as a timeout, not a generic abort.
    if (composed.timedOut && !(err instanceof Error && err.name === 'TimeoutError')) {
      throw new Error(`AI request timed out after ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s. Check your network or provider status.`);
    }
    throw err;
  } finally {
    composed.cleanup();
  }
}

/**
 * True for OpenAI reasoning models that reject `temperature` and `max_tokens`
 * (they require `max_completion_tokens` instead) — audit F-04.
 */
function isOpenAIReasoningModel(model: string): boolean {
  return /^o[134]\b|^o[134]-|^gpt-5/i.test(model.trim());
}

/**
 * Builds the request body for OpenAI-compatible providers. Exported for tests.
 */
export function buildOpenAICompatPayload(
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  isStreaming: boolean,
  maxTokens?: number
): Record<string, unknown> {
  if (isOpenAIReasoningModel(model)) {
    // o1/o3/o4/gpt-5: temperature unsupported, max_tokens rejected — use
    // max_completion_tokens and let the model reason at its default effort.
    return {
      model,
      messages,
      stream: isStreaming,
      ...(maxTokens !== undefined ? { max_completion_tokens: maxTokens } : { max_completion_tokens: 4096 }),
    };
  }
  return {
    model,
    messages,
    temperature,
    stream: isStreaming,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : { max_tokens: 2048 }),
  };
}

/**
 * Standard OpenAI-compatible completions (OpenAI, Groq, DeepSeek, OpenCode).
 */
async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  options?: AICompletionOptions,
  maxTokens?: number,
  providerLabel = 'OpenAI'
): Promise<string> {
  const isStreaming = Boolean(options?.onChunk);

  const response = await safeFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildOpenAICompatPayload(model, messages, temperature, isStreaming, maxTokens)),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`AI Request Failed (${response.status}): ${errorText || response.statusText}`);
  }

  if (isStreaming && response.body) {
    const text = await processSSEStream(response.body, (delta) => {
      options?.onChunk?.(delta.text, delta.full);
    });
    if (!text.trim()) {
      throw new Error(`${providerLabel} returned an empty response`);
    }
    return text;
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || '';
  if (!content.trim()) {
    throw new Error(`${providerLabel} returned an empty response`);
  }
  options?.onChunk?.(content, content);
  return content;
}

/**
 * Ollama local LLM client supporting streaming via NDJSON.
 */
async function callOllama(
  baseUrl: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: AICompletionOptions,
  maxTokens?: number
): Promise<string> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`;

  const response = await safeFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: Boolean(options?.onChunk),
      ...(maxTokens !== undefined ? { options: { num_predict: maxTokens } } : {}),
    }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Ollama error (${response.status}): Is Ollama running on ${baseUrl}? ${errorText}`);
  }

  if (!options?.onChunk) {
    const data = await response.json();
    const content = data.message?.content || '';
    options?.onChunk?.(content, content);
    return content;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Ollama returned no response body');
  }
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  const consumeLine = (raw: string): string | null => {
    const line = raw.trim();
    if (!line) return null;
    try {
      const parsed = JSON.parse(line);
      if (parsed.error) {
        throw new Error(`Ollama error: ${parsed.error}`);
      }
      const delta = parsed.message?.content || '';
      if (delta) {
        accumulated += delta;
        options.onChunk?.(delta, accumulated);
      }
      return parsed.done ? 'done' : null;
    } catch (e) {
      if (e instanceof SyntaxError) return null; // partial json
      throw e;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (consumeLine(line) === 'done') {
        // Drain mode was hit: stop reading further chunks.
        return accumulated;
      }
    }
  }
  // Flush any trailing partial line that arrived without a newline.
  consumeLine(buffer);

  if (!accumulated.trim()) {
    throw new Error('Ollama returned an empty response');
  }
  return accumulated;
}

/** Shape of a Gemini ListModels entry. */
interface GeminiModelEntry {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

/** Shape of an OpenCode /models entry (string id or object). */
type OpenCodeModel = string | { id?: string; name?: string; description?: string };

/** Unified SSE frame shape across OpenAI-compatible, Gemini and Anthropic. */
interface SSEFrame {
  type?: string;
  delta?: { type?: string; text?: string };
  error?: { message?: string } | string;
  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Discovers available Gemini models for the given API key via Google's ListModels API.
 */
async function discoverGeminiModel(apiKey: string): Promise<string | null> {
  try {
    const res = await safeFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const available = (data.models as GeminiModelEntry[] | undefined || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => m.name?.replace(/^models\//, '') || '')
      .filter(Boolean);

    // Preference order: 2.5-flash > 2.5-pro > 2.0-flash > 2.0-flash-lite > any flash > any
    const preferred = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ];
    for (const p of preferred) {
      if (available.includes(p)) return p;
    }
    const anyFlash = available.find((name: string) => name.includes('flash'));
    if (anyFlash) return anyFlash;
    const anyGemini = available.find((name: string) => name.includes('gemini'));
    return anyGemini || available[0] || null;
  } catch {
    return null;
  }
}

/**
 * Live queries a provider's model endpoint to retrieve all models authorized for the given key.
 */
export async function fetchAvailableModels(
  provider: AIProvider,
  apiKey: string,
  baseUrl?: string
): Promise<ModelOption[]> {
  switch (provider) {
    case 'gemini': {
      const res = await safeFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        headers: { 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Google API error (HTTP ${res.status})`);
      }
      const data = await res.json();
      const rawModels = (data.models as GeminiModelEntry[] | undefined) || [];
      const chatModels: ModelOption[] = rawModels
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => {
          const id = m.name?.replace(/^models\//, '') || '';
          return {
            id,
            name: m.displayName || id,
            description: m.description ? m.description.slice(0, 90) + '...' : undefined,
            recommended: id === 'gemini-2.5-flash' || id === 'gemini-2.5-pro',
          };
        })
        .filter((m) => m.id.length > 0);

      return chatModels.sort((a, b) => {
        if (a.recommended && !b.recommended) return -1;
        if (!a.recommended && b.recommended) return 1;
        return a.id.localeCompare(b.id);
      });
    }

    case 'opencode': {
      const targetBase = (baseUrl || 'https://opencode.ai/zen/go/v1').replace(/\/$/, '');
      const res = await safeFetch(`${targetBase}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        throw new Error(`OpenCode error (HTTP ${res.status}): could not fetch models.`);
      }
      const data = await res.json();
      const list = (Array.isArray(data) ? data : data.data || []) as OpenCodeModel[];
      return list
        .map((m) => {
          const id = typeof m === 'string' ? m : m.id || '';
          return {
            id,
            name: typeof m === 'object' && m.name ? m.name : id,
            description: typeof m === 'object' && m.description ? m.description : undefined,
            recommended: id.includes('deepseek-v4') || id.includes('kimi-k2.7'),
          };
        })
        .filter((m) => m.id.length > 0);
    }

    case 'openai':
    case 'groq':
    case 'deepseek': {
      const endpoints: Record<string, string> = {
        openai: 'https://api.openai.com/v1',
        groq: 'https://api.groq.com/openai/v1',
        deepseek: 'https://api.deepseek.com',
      };
      const base = endpoints[provider];
      const res = await safeFetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        throw new Error(`${provider.toUpperCase()} error (HTTP ${res.status}): could not fetch models.`);
      }
      const data = await res.json();
      const list = (data.data || []) as Array<{ id: string }>;
      return list.map((m) => ({
        id: m.id,
        name: m.id,
        recommended: m.id.includes('4o') || m.id.includes('llama-3.3') || m.id.includes('chat'),
      }));
    }

    case 'ollama': {
      const base = (baseUrl || 'http://localhost:11434').replace(/\/$/, '');
      const res = await safeFetch(`${base}/api/tags`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        throw new Error(`Ollama error (HTTP ${res.status}): could not reach ${base}`);
      }
      const data = await res.json();
      const models = (data.models || []) as Array<{ name: string; details?: { parameter_size?: string } }>;
      return models.map((m) => ({
        id: m.name,
        name: m.name,
        description: m.details?.parameter_size ? `${m.details.parameter_size} params` : undefined,
      }));
    }

    case 'anthropic': {
      return PROVIDER_AVAILABLE_MODELS.anthropic;
    }

    default:
      return [];
  }
}

/**
 * Google Gemini REST API with intelligent auto-discovery, 503/429/404 failover cascade,
 * 400 recovery, real SSE streaming and a max-output-token cap.
 */
async function callGemini(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  options?: AICompletionOptions,
  maxTokens?: number,
  retryWithFallback = true,
  triedModels: string[] = [],
  inlinedSystem = false
): Promise<string> {
  // Strip models/ prefix if present
  let targetModel = model.replace(/^models\//, '').trim();
  // Migrate deprecated models
  if (targetModel === 'gemini-1.5-flash') {
    targetModel = 'gemini-2.5-flash';
  } else if (targetModel === 'gemini-1.5-pro') {
    targetModel = 'gemini-2.5-pro';
  }

  // Recommended Gemini fallback chain (Flash 2.5 -> Pro 2.5 -> 2.0 Flash -> 2.0 Flash Lite)
  const fallbackChain = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ];

  const isStreaming = Boolean(options?.onChunk);
  const method = isStreaming ? 'streamGenerateContent' : 'generateContent';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:${method}?key=${apiKey}${isStreaming ? '&alt=sse' : ''}`;

  const systemMsg = messages.find((m) => m.role === 'system');
  const userAssistantMsgs = messages.filter((m) => m.role !== 'system');

  // Build clean, alternating contents to prevent 400 Bad Request
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (let i = 0; i < userAssistantMsgs.length; i++) {
    const m = userAssistantMsgs[i];
    const role = m.role === 'assistant' ? ('model' as const) : ('user' as const);
    let text = m.content || ' ';
    if (inlinedSystem && i === 0 && systemMsg) {
      text = `[Instructions]\n${systemMsg.content}\n\n[Message]\n${text}`;
    }
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push({ text });
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  if (contents.length === 0) {
    const text = inlinedSystem && systemMsg ? `[Instructions]\n${systemMsg.content}\n\nHello` : 'Hello';
    contents.push({ role: 'user', parts: [{ text }] });
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens ?? 2048,
    },
  };

  if (systemMsg && !inlinedSystem) {
    payload.systemInstruction = {
      parts: [{ text: systemMsg.content }],
    };
  }

  const response = await safeFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    let cleanMessage = errorText;
    try {
      const parsed = JSON.parse(errorText) as { error?: { message?: string } };
      if (parsed?.error?.message) {
        cleanMessage = parsed.error.message;
      }
    } catch {
      // non-JSON error body — keep the raw text
    }

    const currentTried = [...triedModels, targetModel];

    // 1. If 400 Bad Request and systemInstruction was used, retry once by inlining instructions into the prompt
    if (response.status === 400 && systemMsg && !inlinedSystem) {
      logger.warn(`Gemini model ${targetModel} returned 400. Retrying with inlined prompt...`);
      return callGemini(apiKey, targetModel, messages, temperature, options, maxTokens, retryWithFallback, triedModels, true);
    }

    // 2. If 503 (Overloaded/Service Unavailable) or 429 (Resource Exhausted) or 404 (Not Found), cascade through fallback models
    if ((response.status === 503 || response.status === 429 || response.status === 404) && retryWithFallback) {
      const nextCandidate = fallbackChain.find((candidate) => !currentTried.includes(candidate));
      if (nextCandidate) {
        logger.warn(
          `Gemini model ${targetModel} returned HTTP ${response.status} (${response.statusText}). Automatically failing over to ${nextCandidate}...`
        );
        return callGemini(apiKey, nextCandidate, messages, temperature, options, maxTokens, true, currentTried, inlinedSystem);
      }

      // If all built-in fallback chain models tried, query ListModels for any available chat model
      logger.info('Querying Google ListModels API to discover any active model for this key...');
      const discovered = await discoverGeminiModel(apiKey);
      if (discovered && !currentTried.includes(discovered)) {
        logger.info(`Auto-discovered valid Gemini model for this key: ${discovered}. Retrying...`);
        return callGemini(apiKey, discovered, messages, temperature, options, maxTokens, false, currentTried, inlinedSystem);
      }
    }

    throw new Error(`Gemini Error (${response.status}): ${cleanMessage || response.statusText}`);
  }

  if (isStreaming && response.body) {
    const text = await processSSEStream(response.body, (delta) => {
      options?.onChunk?.(delta.text, delta.full);
    });
    if (!text.trim()) {
      throw new Error('Gemini returned an empty response');
    }
    return text;
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text.trim()) {
    throw new Error('Gemini returned an empty response');
  }
  options?.onChunk?.(text, text);
  return text;
}

/**
 * Anthropic Claude Messages API with SSE streaming.
 */
async function callAnthropic(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  options?: AICompletionOptions,
  maxTokens?: number
): Promise<string> {
  const url = 'https://api.anthropic.com/v1/messages';
  const isStreaming = Boolean(options?.onChunk);

  const systemMsg = messages.find((m) => m.role === 'system');
  const userAssistantMsgs = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const response = await safeFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemMsg?.content,
      messages: userAssistantMsgs,
      max_tokens: maxTokens ?? 2048,
      temperature,
      stream: isStreaming,
    }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Anthropic Error (${response.status}): ${errorText || response.statusText}`);
  }

  if (!isStreaming) {
    const json = await response.json();
    const text = json.content?.[0]?.text || '';
    if (!text.trim()) {
      throw new Error('Anthropic returned an empty response');
    }
    options?.onChunk?.(text, text);
    return text;
  }

  if (!response.body) {
    throw new Error('Anthropic returned no response body');
  }

  // Anthropic SSE: `event: content_block_delta` / `data: {"type":"content_block_delta",...}`,
  // `event: error` / `data: {"type":"error",...}`, terminated by `message_stop`.
  let fullText = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.substring(6).trim();
      if (!dataStr) continue; // ping keep-alives
      let parsed: SSEFrame;
      try {
        parsed = JSON.parse(dataStr) as SSEFrame;
      } catch {
        continue; // skip unparseable frames
      }
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
        fullText += parsed.delta.text;
        options?.onChunk?.(parsed.delta.text, fullText);
      } else if (parsed.type === 'error') {
        const errMsg =
          typeof parsed.error === 'string'
            ? parsed.error
            : parsed.error?.message || JSON.stringify(parsed.error);
        throw new Error(`Anthropic Error: ${errMsg}`);
      } else if (parsed.type === 'message_stop') {
        return fullText;
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error('Anthropic returned an empty response');
  }
  return fullText;
}

/**
 * Draws a plain-text payload out of any streamed SSE `data:` frame shape.
 *
 * OpenAI-compatible: `{ choices: [{ delta: { content } }] }`
 * Gemini SSE:        `{ candidates: [{ content: { parts: [{ text }] } }] }`
 */
function extractSSEText(parsed: SSEFrame): string {
  if (!parsed || typeof parsed !== 'object') return '';
  if (Array.isArray(parsed.choices)) {
    return parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || '';
  }
  if (Array.isArray(parsed.candidates)) {
    return parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  return '';
}

/**
 * Generic SSE processor supporting OpenAI-compatible + Gemini `data:` frames.
 * Stops at `[DONE]`, surfaces `{error}` frames as thrown errors (F-08).
 */
export async function processSSEStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (delta: { text: string; full: string }) => void
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let done = false;

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.substring(6).trim();
      if (dataStr === '[DONE]') {
        done = true;
        break;
      }

      try {
        const parsed = JSON.parse(dataStr) as SSEFrame;
        if (parsed?.error) {
          // Providers can push errors mid-stream (quota, model rotated).
          const message =
            typeof parsed.error === 'string'
              ? parsed.error
              : parsed.error?.message || JSON.stringify(parsed.error);
          throw new Error(`AI Request Stream Error: ${message}`);
        }
        const textChunk = extractSSEText(parsed);
        if (textChunk) {
          fullText += textChunk;
          onDelta({ text: textChunk, full: fullText });
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue; // partial frame
        throw e;
      }
    }
  }

  return fullText;
}

/**
 * Helper prompt actions for quick reading queries.
 */
export async function explainSelection(
  config: AIProviderConfig,
  selection: string,
  context?: ReadingContext,
  options?: AICompletionOptions
): Promise<string> {
  const prompt = `Please explain the following passage clearly, highlighting its significance, underlying meaning, or any challenging words:\n\n"${selection}"`;
  return executeAICompletion(config, [{ role: 'user', content: prompt }], {
    ...options,
    context: { ...context, selectedText: selection },
  });
}

export async function summarizeSelection(
  config: AIProviderConfig,
  selection: string,
  context?: ReadingContext,
  options?: AICompletionOptions
): Promise<string> {
  const prompt = `Provide a concise 2-3 bullet point summary of the key takeaways from this passage:\n\n"${selection}"`;
  return executeAICompletion(config, [{ role: 'user', content: prompt }], {
    ...options,
    context: { ...context, selectedText: selection },
  });
}

export async function explainCharacter(
  config: AIProviderConfig,
  characterName: string,
  context?: ReadingContext,
  options?: AICompletionOptions
): Promise<string> {
  const prompt = `Who is the character "${characterName}" in this book? Provide a brief recap of who they are and their role up to this point. REMINDER: Do NOT reveal any future plot spoilers beyond the current chapter.`;
  return executeAICompletion(config, [{ role: 'user', content: prompt }], {
    ...options,
    context,
  });
}

export async function getCharacterRecap(
  characterName: string,
  context?: ReadingContext,
  options?: AICompletionOptions
): Promise<string> {
  const config = useAIStore.getState().getActiveConfig();
  return explainCharacter(config, characterName, context, options);
}

export async function getChapterCatchUpRecap(
  bookTitle: string,
  chapterTitle: string,
  chapterExcerpt: string,
  options?: AICompletionOptions
): Promise<string> {
  const config = useAIStore.getState().getActiveConfig();
  const prompt = `You are a literary assistant. Write an engaging, crisp "Previously on ${bookTitle}..." catch-up recap of ${chapterTitle}.
Format as 3 to 4 bullet points highlighting:
- The central conflict or scene that unfolded
- Key actions and emotional turning points for the active characters
- Exactly where the story left off heading into the next chapter

IMPORTANT: Be dramatic yet factual. Rely solely on the provided chapter excerpt and DO NOT invent or reveal any future spoilers beyond this chapter.

Excerpt:
"""
${chapterExcerpt.slice(0, 4500)}
"""`;

  return executeAICompletion(config, [{ role: 'user', content: prompt }], {
    ...options,
    maxTokens: options?.maxTokens ?? 2048,
  });
}

export type { AIMessage };