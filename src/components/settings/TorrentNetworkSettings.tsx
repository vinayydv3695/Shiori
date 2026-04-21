import { useCallback, useEffect, useState } from 'react';
import { api, isTauri, type TorrentNetworkConfig } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/store/toastStore';
import { logger } from '@/lib/logger';

const defaultConfig: TorrentNetworkConfig = {
  proxyUrl: null,
  timeoutSeconds: 30,
  maxRetries: 2,
};

function normalize(config: TorrentNetworkConfig): TorrentNetworkConfig {
  return {
    proxyUrl: config.proxyUrl?.trim() || null,
    timeoutSeconds: Math.min(120, Math.max(8, Number(config.timeoutSeconds) || 30)),
    maxRetries: Math.min(6, Math.max(0, Number(config.maxRetries) || 0)),
  };
}

export function TorrentNetworkSettings() {
  const [config, setConfig] = useState<TorrentNetworkConfig>(defaultConfig);
  const [savedConfig, setSavedConfig] = useState<TorrentNetworkConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const loadConfig = useCallback(async () => {
    if (!isTauri) return;
    try {
      const loaded = await api.torrentNetworkGetConfig();
      const normalized = normalize(loaded);
      setConfig(normalized);
      setSavedConfig(normalized);
    } catch (err) {
      logger.error('Failed to load torrent network config:', err);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const hasChanges = JSON.stringify(normalize(config)) !== JSON.stringify(savedConfig);

  const handleSave = async () => {
    if (!isTauri) {
      toast.warning('Network settings only work in Tauri environment');
      return;
    }

    try {
      setIsLoading(true);
      const normalized = normalize(config);
      await api.torrentNetworkSetConfig(normalized);
      setConfig(normalized);
      setSavedConfig(normalized);
      toast.success('Torrent network settings saved');
    } catch (err) {
      logger.error('Failed to save torrent network config:', err);
      toast.error('Failed to save network settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setConfig(defaultConfig);
    if (!isTauri) return;

    try {
      setIsLoading(true);
      await api.torrentNetworkSetConfig(defaultConfig);
      setSavedConfig(defaultConfig);
      toast.success('Torrent network settings reset');
    } catch (err) {
      logger.error('Failed to reset torrent network config:', err);
      toast.error('Failed to reset network settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Optional global network fallback for torrent sources. Use proxy only if your network blocks torrent index domains.
      </p>

      <p className="text-xs text-muted-foreground">
        Leave proxy empty unless you already have a working proxy. Shiori works without proxy when your network allows these domains.
      </p>

      <div>
        <label htmlFor="torrent-proxy" className="text-sm font-medium mb-2 block">Proxy URL (optional)</label>
        <Input
          id="torrent-proxy"
          type="text"
          value={config.proxyUrl ?? ''}
          onChange={(e) => setConfig((prev) => ({ ...prev, proxyUrl: e.target.value }))}
          placeholder="http://127.0.0.1:8080 or socks5://127.0.0.1:9050"
          disabled={isLoading}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="torrent-timeout" className="text-sm font-medium mb-2 block">Timeout (seconds)</label>
          <Input
            id="torrent-timeout"
            type="number"
            min={8}
            max={120}
            value={config.timeoutSeconds}
            onChange={(e) => setConfig((prev) => ({ ...prev, timeoutSeconds: Number(e.target.value) }))}
            disabled={isLoading}
          />
        </div>
        <div>
          <label htmlFor="torrent-retries" className="text-sm font-medium mb-2 block">Max retries</label>
          <Input
            id="torrent-retries"
            type="number"
            min={0}
            max={6}
            value={config.maxRetries}
            onChange={(e) => setConfig((prev) => ({ ...prev, maxRetries: Number(e.target.value) }))}
            disabled={isLoading}
          />
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
