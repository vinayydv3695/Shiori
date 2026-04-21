import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api, isTauri, type RutrackerConfig } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/store/toastStore';
import { logger } from '@/lib/logger';

const DEFAULT_BASE_URL = 'https://rutracker.org';

const emptyConfig: RutrackerConfig = {
  baseUrl: DEFAULT_BASE_URL,
  cookie: null,
};

function normalizeConfig(config: RutrackerConfig): RutrackerConfig {
  return {
    baseUrl: config.baseUrl?.trim() || DEFAULT_BASE_URL,
    cookie: config.cookie?.trim() || null,
  };
}

export function RuTrackerSettings() {
  const [config, setConfig] = useState<RutrackerConfig>(emptyConfig);
  const [savedConfig, setSavedConfig] = useState<RutrackerConfig>(emptyConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [showCookie, setShowCookie] = useState(false);
  const toast = useToast();

  const loadConfig = useCallback(async () => {
    if (!isTauri) return;
    try {
      const loaded = await api.rutrackerGetConfig();
      const normalized = normalizeConfig(loaded);
      setConfig(normalized);
      setSavedConfig(normalized);
    } catch (err) {
      logger.error('Failed to load RuTracker config:', err);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!isTauri) {
      toast.warning('RuTracker settings only work in Tauri environment');
      return;
    }

    try {
      setIsLoading(true);
      const normalized = normalizeConfig(config);
      await api.rutrackerSetConfig(normalized);
      setConfig(normalized);
      setSavedConfig(normalized);
      toast.success('RuTracker settings saved');
    } catch (err) {
      logger.error('Failed to save RuTracker config:', err);
      toast.error('Failed to save RuTracker settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    const next = emptyConfig;
    setConfig(next);
    if (!isTauri) return;

    try {
      setIsLoading(true);
      await api.rutrackerSetConfig(next);
      setSavedConfig(next);
      toast.success('RuTracker settings reset');
    } catch (err) {
      logger.error('Failed to reset RuTracker config:', err);
      toast.error('Failed to reset RuTracker settings');
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges = JSON.stringify(normalizeConfig(config)) !== JSON.stringify(savedConfig);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Direct RuTracker integration for torrent search. Cookie is optional, but can unlock more results when anonymous access is limited.
      </p>

      <div>
        <label htmlFor="rutracker-base-url" className="text-sm font-medium mb-2 block">RuTracker Base URL</label>
        <Input
          id="rutracker-base-url"
          type="text"
          value={config.baseUrl ?? ''}
          onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
          placeholder={DEFAULT_BASE_URL}
          disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="rutracker-cookie" className="text-sm font-medium mb-2 block">RuTracker Cookie (optional)</label>
        <div className="relative">
          <Input
            id="rutracker-cookie"
            type={showCookie ? 'text' : 'password'}
            value={config.cookie ?? ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, cookie: e.target.value }))}
            placeholder="bb_session=...; bb_ssl=..."
            className="pr-10"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowCookie((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showCookie ? 'Hide RuTracker cookie' : 'Show RuTracker cookie'}
          >
            {showCookie ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isLoading || !hasChanges}>
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={isLoading}>
          Reset
        </Button>
      </div>
    </div>
  );
}
