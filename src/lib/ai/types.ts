export type AIProvider = 'ollama' | 'groq' | 'gemini' | 'openai' | 'deepseek' | 'anthropic' | 'opencode';

export interface AIMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ReadingContext {
  bookId?: number;
  bookTitle?: string;
  author?: string;
  chapterTitle?: string;
  chapterIndex?: number;
  percent?: number;
  readingPercent?: number;
  selectedText?: string;
}

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  // Optional cap on generated tokens (default 2048 if the provider offers a default)
  maxTokens?: number;
}

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  recommended?: boolean;
}

export const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  ollama: 'llama3.2',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
  anthropic: 'claude-3-5-sonnet-latest',
  opencode: 'deepseek-v4-pro',
};

export const PROVIDER_DEFAULT_BASE_URLS: Partial<Record<AIProvider, string>> = {
  ollama: 'http://localhost:11434',
  opencode: 'https://opencode.ai/zen/go/v1',
};

export const PROVIDER_AVAILABLE_MODELS: Record<AIProvider, ModelOption[]> = {
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast current-gen workhorse with strong reasoning', recommended: true },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Flagship deep reasoning and complex literary analysis' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast, highly capable, free tier available' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Ultra-fast lightweight responses' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Flagship omni model with exceptional prose and nuance', recommended: true },
    { id: 'o3-mini', name: 'o3-mini', description: 'High-performance frontier STEM & logical reasoning' },
    { id: 'o1', name: 'o1', description: 'Flagship deep reasoning and philosophical analysis' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Cost-effective, intelligent & fast' },
    { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest', description: 'Dynamically updated flagship model' },
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet', description: 'Hybrid reasoning flagship, state-of-the-art literary intelligence' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', description: 'Gold standard for literary nuance and narrative comprehension', recommended: true },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', description: 'Blazing fast, sharp comprehension' },
    { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', description: 'Deep contextual analysis and scholarly reflection' },
  ],
  opencode: [
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', description: 'Flagship open reasoning model via OpenCode Go', recommended: true },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', description: 'Fast DeepSeek reasoning inference' },
    { id: 'kimi-k2.7-code', name: 'Kimi K2.7', description: 'Top-tier context handling and deep reasoning' },
    { id: 'kimi-k2.5', name: 'Kimi K2.5', description: 'Strong conversational and analytical reasoning' },
    { id: 'glm-5', name: 'GLM 5', description: 'Multilingual frontier foundation model' },
    { id: 'qwen3.7-max', name: 'Qwen 3.7 Max', description: 'High capacity advanced reasoning' },
    { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', description: 'Performant agentic intelligence' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', description: 'Industry-leading value & intelligence', recommended: true },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', description: 'Chain-of-thought deep reasoning & reflection' },
  ],
  groq: [
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', description: 'DeepSeek R1 reasoning at lightning Groq speeds' },
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Near-instant, highly capable literary reasoning', recommended: true },
    { id: 'qwen-2.5-32b', name: 'Qwen 2.5 32B', description: 'Outstanding multilingual and narrative comprehension' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: 'Ultra-low latency instant replies' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', description: 'High context window' },
  ],
  ollama: [
    { id: 'llama3.3:70b', name: 'Llama 3.3 70B', description: 'Powerful local reasoning on high-spec hardware' },
    { id: 'llama3.2', name: 'Llama 3.2 (3B/1B)', description: 'Fast, lightweight local model', recommended: true },
    { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', description: 'Exceptional reasoning & multilingual' },
    { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', description: 'Local deep reasoning model' },
    { id: 'mistral:7b', name: 'Mistral 7B', description: 'Reliable general knowledge' },
  ],
};

export interface AICompletionOptions {
  systemPrompt?: string;
  context?: ReadingContext;
  onChunk?: (chunk: string, fullText: string) => void;
  signal?: AbortSignal;
}
