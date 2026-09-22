import React, { useState, useEffect } from 'react';
import { useAIStore } from '@/store/aiStore';
import { AIProvider, PROVIDER_AVAILABLE_MODELS, ModelOption } from '@/lib/ai/types';
import { 
  Brain, 
  Key, 
  Server, 
  Cpu, 
  Sliders, 
  ExternalLink, 
  Check, 
  Save, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  ShieldCheck,
  Plus,
  Compass,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import { openExternal } from '@/lib/externalLinks';
import { SettingSection, SettingItem } from './SettingsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAvailableModels } from '@/lib/ai/aiClient';

const PROVIDER_METADATA: Record<AIProvider, { name: string; tag: string; desc: string; url?: string }> = {
  gemini: {
    name: 'Google Gemini',
    tag: 'Free Tier & Fast',
    desc: 'High-speed reasoning with generous free tier from Google AI Studio. Supports Gemini 2.5 & 2.0.',
    url: 'https://aistudio.google.com/app/apikey',
  },
  opencode: {
    name: 'OpenCode Go',
    tag: 'Coding & Reasoning',
    desc: 'DeepSeek-V4, Kimi K2.7, GLM-5, and Qwen models via OpenCode Go subscription.',
    url: 'https://opencode.ai',
  },
  groq: {
    name: 'Groq',
    tag: 'Ultra-Fast',
    desc: 'Lightning-fast DeepSeek R1 and Llama 3.3 inference with free tier available.',
    url: 'https://console.groq.com/keys',
  },
  openai: {
    name: 'OpenAI',
    tag: 'GPT-4o & o1',
    desc: 'Industry standard for complex analysis, deep reasoning (o3-mini, o1), and book comprehension.',
    url: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    name: 'DeepSeek',
    tag: 'Deep Reasoning',
    desc: 'DeepSeek-V3 and DeepSeek-R1 reasoning models at low cost.',
    url: 'https://platform.deepseek.com',
  },
  anthropic: {
    name: 'Anthropic Claude',
    tag: 'Literary Nuance',
    desc: 'Claude 3.7 & 3.5 Sonnet: the gold standard for literary nuance and narrative comprehension.',
    url: 'https://console.anthropic.com/settings/keys',
  },
  ollama: {
    name: 'Ollama (Local LLM)',
    tag: 'Free & Offline',
    desc: 'Runs on your local hardware via Ollama. 100% private, zero API cost.',
    url: 'https://ollama.com',
  },
};

export function AISettingsSection() {
  const enabled = useAIStore((s) => s.enabled);
  const setEnabled = useAIStore((s) => s.setEnabled);
  const activeProvider = useAIStore((s) => s.activeProvider);
  const setActiveProvider = useAIStore((s) => s.setActiveProvider);
  const apiKeys = useAIStore((s) => s.apiKeys);
  const setApiKey = useAIStore((s) => s.setApiKey);
  const selectedModels = useAIStore((s) => s.selectedModels);
  const setSelectedModel = useAIStore((s) => s.setSelectedModel);
  const ollamaBaseUrl = useAIStore((s) => s.ollamaBaseUrl);
  const setOllamaBaseUrl = useAIStore((s) => s.setOllamaBaseUrl);
  const temperature = useAIStore((s) => s.temperature);
  const setTemperature = useAIStore((s) => s.setTemperature);

  const opencodeBaseUrl = useAIStore((s) => s.opencodeBaseUrl);
  const setOpencodeBaseUrl = useAIStore((s) => s.setOpencodeBaseUrl);
  const customModels = useAIStore((s) => s.customModels);
  const addCustomModel = useAIStore((s) => s.addCustomModel);

  // Local draft states
  const [draftKey, setDraftKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [testingOllama, setTestingOllama] = useState<boolean>(false);
  const [fetchingModels, setFetchingModels] = useState<boolean>(false);
  const [showCustomModelInput, setShowCustomModelInput] = useState<boolean>(false);
  const [customModelDraft, setCustomModelDraft] = useState<string>('');
  const [fetchedModels, setFetchedModels] = useState<Record<string, ModelOption[]>>({});

  // Sync draftKey when activeProvider changes
  useEffect(() => {
    setDraftKey(apiKeys[activeProvider] || '');
    setShowCustomModelInput(false);
    setCustomModelDraft('');
  }, [activeProvider, apiKeys]);

  const handleSaveApiKey = () => {
    setApiKey(activeProvider, draftKey.trim());
    useToastStore.getState().addToast({
      title: 'API Key Saved',
      description: `Saved key for ${PROVIDER_METADATA[activeProvider].name}.`,
      variant: 'success',
    });
  };

  const handleTestOllama = async () => {
    setTestingOllama(true);
    try {
      const res = await fetch(`${ollamaBaseUrl.replace(/\/$/, '')}/api/tags`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        useToastStore.getState().addToast({
          title: 'Ollama Connected!',
          description: 'Successfully reached local Ollama server.',
          variant: 'success',
        });
      } else {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
    } catch {
      useToastStore.getState().addToast({
        title: 'Connection Failed',
        description: `Could not reach Ollama at ${ollamaBaseUrl}. Ensure 'ollama serve' is running.`,
        variant: 'error',
      });
    } finally {
      setTestingOllama(false);
    }
  };

  const handleFetchModels = async () => {
    const key = apiKeys[activeProvider] || draftKey;
    if (activeProvider !== 'ollama' && !key?.trim()) {
      useToastStore.getState().addToast({
        title: 'API Key Required',
        description: `Please enter and save your ${PROVIDER_METADATA[activeProvider].name} key first.`,
        variant: 'error',
      });
      return;
    }

    setFetchingModels(true);
    try {
      const models = await fetchAvailableModels(
        activeProvider,
        key.trim(),
        activeProvider === 'ollama' ? ollamaBaseUrl : opencodeBaseUrl
      );
      if (models.length > 0) {
        setFetchedModels((prev) => ({ ...prev, [activeProvider]: models }));
        useToastStore.getState().addToast({
          title: 'Models Discovered!',
          description: `Discovered ${models.length} available models for ${PROVIDER_METADATA[activeProvider].name}.`,
          variant: 'success',
        });
      } else {
        useToastStore.getState().addToast({
          title: 'No Models Found',
          description: 'Provider returned an empty model list.',
          variant: 'error',
        });
      }
    } catch (e: any) {
      useToastStore.getState().addToast({
        title: 'Fetch Models Failed',
        description: e?.message || 'Could not retrieve models from provider.',
        variant: 'error',
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const handleAddCustomModel = () => {
    const trimmed = customModelDraft.trim();
    if (!trimmed) return;
    addCustomModel(activeProvider, trimmed);
    setCustomModelDraft('');
    setShowCustomModelInput(false);
    useToastStore.getState().addToast({
      title: 'Custom Model Added',
      description: `Activated custom model "${trimmed}".`,
      variant: 'success',
    });
  };

  const providers: AIProvider[] = ['gemini', 'opencode', 'groq', 'openai', 'deepseek', 'anthropic', 'ollama'];
  const currentProviderMeta = PROVIDER_METADATA[activeProvider];
  const isKeyConfigured = Boolean(apiKeys[activeProvider]?.trim());

  // Merge built-in models + fetched models + user-added custom models
  const baseModelList = fetchedModels[activeProvider] || PROVIDER_AVAILABLE_MODELS[activeProvider] || [];
  const userCustoms = (customModels[activeProvider] || []).filter(
    (cm) => !baseModelList.some((m) => m.id === cm)
  );

  const activeSelectedModel = selectedModels[activeProvider] || baseModelList[0]?.id || '';

  return (
    <div className="space-y-8">
      {/* 0. Master AI Features Toggle */}
      <SettingSection
        title="AI Features"
        description="Enable or disable all AI-powered features across Shiori, including Book Copilot and text selection prompts."
      >
        <div className="flex items-center justify-between p-4 rounded-xl border border-border/70 bg-card/50">
          <div className="space-y-0.5 pr-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Enable AI Features</span>
              <span
                className={cn(
                  'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                  enabled
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-muted text-muted-foreground border-border'
                )}
              >
                {enabled ? 'Enabled' : 'Disabled (Default)'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? 'AI features are enabled. You can use Book Copilot in the reader sidebar and Ask AI on text selections.'
                : 'AI features are turned off. Book Copilot and Ask AI shortcuts will not be displayed.'}
            </p>
          </div>
          <Switch checked={enabled} onChange={setEnabled} aria-label="Toggle AI Features" />
        </div>

        {!enabled && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
            <Info size={16} className="shrink-0 mt-0.5" />
            <span>
              AI features are disabled by default. When disabled, no network requests are sent to AI providers, and reader AI tabs remain hidden. You can configure your provider credentials below before toggling this on.
            </span>
          </div>
        )}
      </SettingSection>

      {/* 1. Provider Selection */}
      <SettingSection
        title="AI Intelligence Provider"
        description="Choose which AI service powers book explanations, chapter summaries, character recall, and reading chat."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 my-2">
          {providers.map((p) => {
            const meta = PROVIDER_METADATA[p];
            const isSelected = activeProvider === p;
            const hasKey = p === 'ollama' ? true : Boolean(apiKeys[p]?.trim());

            return (
              <button
                key={p}
                type="button"
                onClick={() => setActiveProvider(p)}
                className={cn(
                  'flex flex-col text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer relative',
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/25'
                    : 'border-border/60 bg-background hover:border-primary/40 hover:bg-muted/40 text-muted-foreground'
                )}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className={cn('text-xs font-semibold', isSelected ? 'text-primary' : 'text-foreground')}>
                    {meta.name.split(' ')[0]}
                  </span>
                  {isSelected && <Check size={14} className="text-primary shrink-0" />}
                </div>
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] text-muted-foreground/80 line-clamp-1">{meta.tag}</span>
                  {hasKey && !isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" aria-label="Configured" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </SettingSection>

      {/* 2. Provider Configuration */}
      <SettingSection
        title={`${currentProviderMeta.name} Setup`}
        description={currentProviderMeta.desc}
      >
        {/* API Key or Ollama URL */}
        {activeProvider !== 'ollama' ? (
          <SettingItem
            label="API Key"
            description={
              isKeyConfigured
                ? 'Key configured and saved locally on this device'
                : 'Enter your API key to activate AI features in the reader'
            }
          >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-[260px]">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveApiKey();
                  }}
                  placeholder={`Paste ${currentProviderMeta.name} API key...`}
                  className="font-mono text-xs pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              <Button
                variant="default"
                size="sm"
                onClick={handleSaveApiKey}
                className="gap-1.5 shrink-0 cursor-pointer"
                title="Save API Key"
              >
                <Save size={14} />
                <span>Save Key</span>
              </Button>

              {currentProviderMeta.url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openExternal(currentProviderMeta.url!)}
                  className="gap-1.5 shrink-0 cursor-pointer"
                  title="Get API Key"
                >
                  <ExternalLink size={13} />
                  <span>Get Key</span>
                </Button>
              )}
            </div>
          </SettingItem>
        ) : (
          <SettingItem
            label="Ollama Server URL"
            description="Local Ollama instance endpoint (default: http://localhost:11434)"
          >
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Input
                type="text"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full md:w-[260px] font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={testingOllama}
                onClick={handleTestOllama}
                className="gap-1.5 shrink-0 cursor-pointer"
              >
                <RefreshCw size={13} className={testingOllama ? 'animate-spin' : ''} />
                <span>{testingOllama ? 'Testing...' : 'Test'}</span>
              </Button>
            </div>
          </SettingItem>
        )}

        {/* Optional OpenCode Go Custom Base URL */}
        {activeProvider === 'opencode' && (
          <SettingItem
            label="OpenCode API Base URL"
            description="Endpoint for OpenCode Go completions (default: https://opencode.ai/zen/go/v1)"
          >
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Input
                type="text"
                value={opencodeBaseUrl}
                onChange={(e) => setOpencodeBaseUrl(e.target.value)}
                placeholder="https://opencode.ai/zen/go/v1"
                className="w-full md:w-[260px] font-mono text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpencodeBaseUrl('https://opencode.ai/zen/go/v1')}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Reset
              </Button>
            </div>
          </SettingItem>
        )}

        {/* Model Selection with live Fetch Models & Custom Model support */}
        <SettingItem
          label="Model"
          description="Choose a top reasoning model or fetch live models from your key"
        >
          <div className="flex flex-col gap-2 w-full md:w-[320px]">
            <div className="flex items-center gap-2">
              <Select
                value={activeSelectedModel}
                onValueChange={(val) => {
                  if (val === '__custom__') {
                    setShowCustomModelInput(true);
                  } else {
                    setSelectedModel(activeProvider, val);
                  }
                }}
              >
                <SelectTrigger className="flex-1 text-xs">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {baseModelList.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.name} {m.recommended ? '(Recommended)' : ''}
                    </SelectItem>
                  ))}
                  {userCustoms.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Custom Models
                      </div>
                      {userCustoms.map((cm) => (
                        <SelectItem key={cm} value={cm} className="text-xs font-mono">
                          {cm} (Custom)
                        </SelectItem>
                      ))}
                    </>
                  )}
                  <SelectItem value="__custom__" className="text-xs text-primary font-medium">
                    + Enter Custom Model ID...
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Fetch Models button */}
              <Button
                variant="outline"
                size="sm"
                disabled={fetchingModels}
                onClick={handleFetchModels}
                className="gap-1.5 shrink-0 text-xs cursor-pointer"
                title="Query provider to discover all available models"
              >
                <RefreshCw size={12} className={fetchingModels ? 'animate-spin' : ''} />
                <span>{fetchingModels ? '...' : 'Fetch'}</span>
              </Button>

              {/* Custom Model Toggle button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCustomModelInput(!showCustomModelInput)}
                className="p-2 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Enter custom model ID"
              >
                <Plus size={14} />
              </Button>
            </div>

            {/* Inline Custom Model Input */}
            {showCustomModelInput && (
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="text"
                  value={customModelDraft}
                  onChange={(e) => setCustomModelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCustomModel();
                  }}
                  placeholder="e.g. gemini-2.5-pro, o1, deepseek-v4-pro"
                  className="text-xs font-mono flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleAddCustomModel}
                  disabled={!customModelDraft.trim()}
                  className="text-xs shrink-0 cursor-pointer"
                >
                  Use Model
                </Button>
              </div>
            )}
          </div>
        </SettingItem>

        {/* Temperature */}
        <SettingItem
          label="Creativity (Temperature)"
          description={`Values around 0.7 balance factual book accuracy with lively prose (${temperature.toFixed(1)})`}
        >
          <div className="flex items-center gap-3 w-full md:w-[260px]">
            <input
              type="range"
              min="0.0"
              max="1.2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="flex-1 cursor-pointer accent-primary"
            />
            <span className="text-xs font-mono text-muted-foreground w-8 text-right">
              {temperature.toFixed(1)}
            </span>
          </div>
        </SettingItem>
      </SettingSection>

      {/* 3. Anti-Spoiler Guarantee */}
      <SettingSection
        title="Anti-Spoiler Discipline"
        description="Shiori AI guarantees reading safety by automatically injecting your current chapter position into every request."
      >
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/40 flex items-start gap-3">
          <ShieldCheck size={18} className="text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Zero Future Plot Twists</p>
            <p className="leading-relaxed">
              When you ask for character reminders, passage explanations, or chapter summaries, the AI is strictly forbidden from revealing any event, death, or revelation that occurs beyond your current reading page.
            </p>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
