import React, { useState, useEffect } from 'react';
import { useAIStore } from '@/store/aiStore';
import type { 
  AIProvider, 
  ModelOption 
} from '@/lib/ai/types';
import { PROVIDER_AVAILABLE_MODELS } from '@/lib/ai/types';
import { 
  X, 
  Key, 
  Brain, 
  Cpu, 
  Check, 
  ExternalLink, 
  Info,
  Server,
  Sliders,
  Save,
  Eye,
  EyeOff,
  RefreshCw,
  Plus
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import { openExternal } from '@/lib/externalLinks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAvailableModels } from '@/lib/ai/aiClient';

interface AISettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROVIDER_INFO: Record<AIProvider, { name: string; tag: string; description: string; keyUrl?: string }> = {
  gemini: {
    name: 'Google Gemini',
    tag: 'Generous Free Tier',
    description: 'Fast reasoning with a generous free API tier from Google AI Studio. Supports Gemini 2.5 & 2.0.',
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
    tag: 'Ultra-Fast & Free',
    description: 'Blazing fast inference for DeepSeek R1, Llama 3.3 and Mixtral. Free API keys available.',
    keyUrl: 'https://console.groq.com/keys',
  },
  ollama: {
    name: 'Ollama (Local LLM)',
    tag: '100% Offline & Private',
    description: 'Runs completely on your computer via Ollama. No internet required, zero API cost.',
    keyUrl: 'https://ollama.com',
  },
  openai: {
    name: 'OpenAI',
    tag: 'GPT-4o & o1',
    description: 'Industry standard for text comprehension, deep reasoning (o3-mini, o1), and literary analysis.',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    name: 'DeepSeek',
    tag: 'Cost-Efficient & Smart',
    description: 'Deep reasoning (DeepSeek-R1) and chat models at low cost.',
    keyUrl: 'https://platform.deepseek.com',
  },
  anthropic: {
    name: 'Anthropic Claude',
    tag: 'Nuanced & Literary',
    description: 'Highest quality prose analysis and thoughtful literary comprehension with Claude 3.7 & 3.5 Sonnet.',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
};

export function AISettingsDialog({ open, onOpenChange }: AISettingsDialogProps) {
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

  const [draftKey, setDraftKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testingOllama, setTestingOllama] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [showCustomModelInput, setShowCustomModelInput] = useState(false);
  const [customModelDraft, setCustomModelDraft] = useState('');
  const [fetchedModels, setFetchedModels] = useState<Record<string, ModelOption[]>>({});

  useEffect(() => {
    setDraftKey(apiKeys[activeProvider] || '');
    setShowCustomModelInput(false);
    setCustomModelDraft('');
  }, [activeProvider, apiKeys]);

  const handleSaveApiKey = () => {
    setApiKey(activeProvider, draftKey.trim());
    useToastStore.getState().addToast({
      title: 'API Key Saved',
      description: `Saved key for ${PROVIDER_INFO[activeProvider].name}.`,
      variant: 'success',
    });
  };

  const handleFetchModels = async () => {
    const key = apiKeys[activeProvider] || draftKey;
    if (activeProvider !== 'ollama' && !key?.trim()) {
      useToastStore.getState().addToast({
        title: 'API Key Required',
        description: `Please enter and save your ${PROVIDER_INFO[activeProvider].name} key first.`,
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
          description: `Discovered ${models.length} available models for ${PROVIDER_INFO[activeProvider].name}.`,
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

  const testOllamaConnection = async () => {
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
        description: `Could not reach Ollama at ${ollamaBaseUrl}. Make sure 'ollama serve' is running.`,
        variant: 'error',
      });
    } finally {
      setTestingOllama(false);
    }
  };

  const providers: AIProvider[] = ['gemini', 'opencode', 'groq', 'openai', 'deepseek', 'anthropic', 'ollama'];
  const currentProviderInfo = PROVIDER_INFO[activeProvider];

  // Merge built-in models + fetched models + user-added custom models
  const baseModelList = fetchedModels[activeProvider] || PROVIDER_AVAILABLE_MODELS[activeProvider] || [];
  const userCustoms = (customModels[activeProvider] || []).filter(
    (cm) => !baseModelList.some((m) => m.id === cm)
  );
  const activeSelectedModel = selectedModels[activeProvider] || baseModelList[0]?.id || '';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[1000] backdrop-blur-sm animate-in fade-in-0 duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-card border border-border/60 rounded-2xl shadow-2xl z-[1001] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 flex flex-col max-h-[88vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Brain size={18} />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground">
                  AI Book Copilot Settings
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  Connect your preferred AI model for reading assistance, explanations, and chat
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button 
                className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* Provider Grid */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2.5">
                Select AI Provider
              </label>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {providers.map((p) => {
                  const info = PROVIDER_INFO[p];
                  const isSelected = activeProvider === p;
                  const hasKey = p === 'ollama' ? true : Boolean(apiKeys[p]?.trim());
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setActiveProvider(p)}
                      className={cn(
                        'flex flex-col text-left p-3 rounded-xl border transition-all relative overflow-hidden cursor-pointer',
                        isSelected
                          ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30'
                          : 'border-border/60 hover:border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className={cn('text-xs font-semibold', isSelected ? 'text-primary' : 'text-foreground')}>
                          {info.name.split(' ')[0]}
                        </span>
                        {isSelected && <Check size={14} className="text-primary" />}
                      </div>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[10px] text-muted-foreground line-clamp-1">
                          {info.tag}
                        </span>
                        {hasKey && !isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Configured" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Provider Configuration Card */}
            <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {currentProviderInfo.name}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentProviderInfo.description}
                  </p>
                </div>
                {currentProviderInfo.keyUrl && (
                  <button
                    type="button"
                    onClick={() => openExternal(currentProviderInfo.keyUrl!)}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium transition-colors shrink-0 cursor-pointer"
                  >
                    Get API Key <ExternalLink size={12} />
                  </button>
                )}
              </div>

              {/* API Key Input (if not Ollama) */}
              {activeProvider !== 'ollama' ? (
                <div>
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-1.5">
                    <Key size={13} className="text-muted-foreground" />
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showKey ? 'text' : 'password'}
                        value={draftKey}
                        onChange={(e) => setDraftKey(e.target.value)}
                        placeholder={`Paste ${currentProviderInfo.name} key here...`}
                        className="pr-10 text-xs font-mono"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveApiKey();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-1"
                        tabIndex={-1}
                        aria-label={showKey ? 'Hide key' : 'Show key'}
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveApiKey}
                      className="gap-1.5 shrink-0 cursor-pointer text-xs"
                    >
                      <Save size={14} />
                      Save Key
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Your key is stored strictly on your local device and never sent to any third-party server.
                  </p>
                </div>
              ) : (
                /* Ollama Local URL */
                <div>
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-1.5">
                    <Server size={13} className="text-muted-foreground" />
                    Ollama Server URL
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={ollamaBaseUrl}
                      onChange={(e) => setOllamaBaseUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="flex-1 text-xs font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={testingOllama}
                      onClick={testOllamaConnection}
                      className="text-xs shrink-0 cursor-pointer"
                    >
                      {testingOllama ? 'Testing...' : 'Test Connection'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Optional OpenCode Go Custom Base URL */}
              {activeProvider === 'opencode' && (
                <div>
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-1.5">
                    <Server size={13} className="text-muted-foreground" />
                    OpenCode API Base URL
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={opencodeBaseUrl}
                      onChange={(e) => setOpencodeBaseUrl(e.target.value)}
                      placeholder="https://opencode.ai/zen/go/v1"
                      className="flex-1 text-xs font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpencodeBaseUrl('https://opencode.ai/zen/go/v1')}
                      className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              )}

              {/* Model Selection via Radix Select with Fetch & Custom model support */}
              <div>
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-1.5">
                  <Cpu size={13} className="text-muted-foreground" />
                  Select Model
                </label>
                <div className="space-y-2">
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
                        <SelectValue placeholder="Select model..." />
                      </SelectTrigger>
                      <SelectContent className="z-[1100] max-h-[280px]">
                        {baseModelList.map((model) => (
                          <SelectItem key={model.id} value={model.id} className="text-xs">
                            {model.name} {model.recommended ? '(Recommended)' : ''}
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
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={fetchingModels}
                      onClick={handleFetchModels}
                      className="gap-1.5 shrink-0 text-xs cursor-pointer"
                      title="Discover authorized models for this key"
                    >
                      <RefreshCw size={12} className={fetchingModels ? 'animate-spin' : ''} />
                      <span>{fetchingModels ? '...' : 'Fetch'}</span>
                    </Button>

                    {/* Custom Model Toggle */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCustomModelInput(!showCustomModelInput)}
                      className="p-2 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Enter custom model name"
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
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomModel();
                          }
                        }}
                        placeholder="e.g. gemini-2.5-pro, o1, deepseek-v4-pro"
                        className="text-xs font-mono flex-1"
                        autoFocus
                      />
                      <Button
                        type="button"
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
              </div>

              {/* Temperature Slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Sliders size={13} className="text-muted-foreground" />
                    Creativity (Temperature)
                  </label>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {temperature.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>

            {/* Anti-spoiler guarantee notice */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
              <Info size={16} className="text-primary shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Spoiler Protection Active:</strong> Shiori AI automatically injects your current reading position into the context to prevent revealing future plot twists.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-border/40 bg-muted/10 flex justify-end">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-5 text-xs font-semibold cursor-pointer"
            >
              Done
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
