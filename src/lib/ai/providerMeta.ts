import type { AIProvider } from './types';

/**
 * Single source of truth for AI provider display metadata (name, tag,
 * description, API-key signup URL). Both the settings section and the reader
 * quick-settings dialog import from here so the two surfaces can never drift
 * apart (audit F-09).
 */
export interface AIProviderMeta {
  name: string;
  tag: string;
  description: string;
  /** Where to get an API key / download the server (opened in the system browser). */
  keyUrl?: string;
}

export const PROVIDER_METADATA: Record<AIProvider, AIProviderMeta> = {
  gemini: {
    name: 'Google Gemini',
    tag: 'Free Tier & Fast',
    description: 'High-speed reasoning with a generous free tier from Google AI Studio. Supports Gemini 2.5 & 2.0.',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  opencode: {
    name: 'OpenCode Go',
    tag: 'Coding & Reasoning',
    description: 'DeepSeek-V4, Kimi K2.7, GLM-5, and Qwen models via OpenCode Go subscription.',
    keyUrl: 'https://opencode.ai',
  },
  groq: {
    name: 'Groq',
    tag: 'Ultra-Fast',
    description: 'Lightning-fast DeepSeek R1 and Llama 3.3 inference with a free tier available.',
    keyUrl: 'https://console.groq.com/keys',
  },
  openai: {
    name: 'OpenAI',
    tag: 'GPT-4o & o1',
    description: 'Industry standard for complex analysis, deep reasoning (o3-mini, o1), and book comprehension.',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    name: 'DeepSeek',
    tag: 'Deep Reasoning',
    description: 'DeepSeek-V3 and DeepSeek-R1 reasoning models at low cost.',
    keyUrl: 'https://platform.deepseek.com',
  },
  anthropic: {
    name: 'Anthropic Claude',
    tag: 'Literary Nuance',
    description: 'Claude 3.7 & 3.5 Sonnet: the gold standard for literary nuance and narrative comprehension.',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  ollama: {
    name: 'Ollama (Local LLM)',
    tag: 'Free & Offline',
    description: 'Runs on your local hardware via Ollama. 100% private, zero API cost.',
    keyUrl: 'https://ollama.com',
  },
};

/** All providers in display order (settings grids). */
export const PROVIDER_ORDER: AIProvider[] = [
  'gemini',
  'opencode',
  'groq',
  'openai',
  'deepseek',
  'anthropic',
  'ollama',
];