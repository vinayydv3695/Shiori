import { useCallback, useEffect, useState } from 'react';
import { api, isTauri, type AnnaArchiveConfig } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { useToast } from '@/store/toastStore';
import { logger } from '@/lib/logger';

const keylessConfig: AnnaArchiveConfig = {
  baseUrl: null,
  authKey: null,
  membershipKey: null,
  authCookie: null,
  apiKey: null,
};

export function AnnaArchiveSettings() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const loadConfig = useCallback(async () => {
    if (!isTauri) return;
    try {
      await api.annaArchiveGetConfig();
      setIsConfigured(true);
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
      await api.annaArchiveSetConfig(keylessConfig);
      setIsConfigured(true);
      toast.success('Anna settings saved');
    } catch (err) {
      logger.error('Failed to save Anna Archive config:', err);
      toast.error('Failed to save Anna settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    if (!isTauri) return;
    try {
      setIsLoading(true);
      await api.annaArchiveSetConfig(keylessConfig);
      setIsConfigured(false);
      toast.success('Anna settings reset');
    } catch (err) {
      logger.error('Failed to clear Anna Archive config:', err);
      toast.error('Failed to reset Anna settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Anna Archive is configured for keyless torrent/magnet extraction. No API key is required for Torbox flow.
      </p>

      <p className="text-xs text-muted-foreground">
        Status: {isConfigured ? 'Keyless mode active' : 'Not saved yet'}
      </p>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="outline" onClick={handleClear} disabled={isLoading}>
          Reset
        </Button>
      </div>
    </div>
  );
}
