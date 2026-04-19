import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api, isTauri, type AnnaArchiveConfig } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/store/toastStore';
import { logger } from '@/lib/logger';

const emptyConfig: AnnaArchiveConfig = {
  apiKey: null,
};

export function AnnaArchiveSettings() {
  const [config, setConfig] = useState<AnnaArchiveConfig>(emptyConfig);
  const [savedConfig, setSavedConfig] = useState<AnnaArchiveConfig>(emptyConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const toast = useToast();

  const loadConfig = useCallback(async () => {
    if (!isTauri) return;
    try {
      const loaded = await api.annaArchiveGetConfig();
      const normalized: AnnaArchiveConfig = {
        apiKey: loaded.apiKey?.trim() || null,
      };
      setConfig(normalized);
      setSavedConfig(normalized);
    } catch (err) {
      logger.error('Failed to load Anna Archive config:', err);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!isTauri) {
      toast.warning('Anna Archive settings only work in Tauri environment');
      return;
    }

    try {
      setIsLoading(true);
      const normalized: AnnaArchiveConfig = {
        apiKey: config.apiKey?.trim() || null,
      };
      await api.annaArchiveSetConfig(normalized);
      setConfig(normalized);
      setSavedConfig(normalized);
      toast.success('Anna RapidAPI key saved');
    } catch (err) {
      logger.error('Failed to save Anna Archive config:', err);
      toast.error('Failed to save Anna RapidAPI key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    setConfig(emptyConfig);
    if (!isTauri) return;
    try {
      setIsLoading(true);
      await api.annaArchiveSetConfig(emptyConfig);
      setSavedConfig(emptyConfig);
      toast.success('Anna RapidAPI key cleared');
    } catch (err) {
      logger.error('Failed to clear Anna Archive config:', err);
      toast.error('Failed to clear Anna RapidAPI key');
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(savedConfig);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        RapidAPI-only Anna setup: provide your Anna RapidAPI key. No base URL, auth key, membership key, or cookie is required.
      </p>

      <div>
        <label htmlFor="anna-api-key" className="text-sm font-medium mb-2 block">Anna RapidAPI Key</label>
        <div className="relative">
          <Input
            id="anna-api-key"
            type={showApiKey ? 'text' : 'password'}
            value={config.apiKey ?? ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
            placeholder="x-rapidapi-key"
            className="pr-10"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Used for Anna RapidAPI download lookup by MD5. This key is enough for Torbox workflow.
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isLoading || !hasChanges}>
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="outline" onClick={handleClear} disabled={isLoading}>
          Clear
        </Button>
      </div>
    </div>
  );
}
