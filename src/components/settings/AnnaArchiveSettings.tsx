import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api, isTauri, type AnnaArchiveConfig } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/store/toastStore';
import { logger } from '@/lib/logger';

const emptyConfig: AnnaArchiveConfig = {
  baseUrl: null,
  authKey: null,
  membershipKey: null,
  authCookie: null,
  apiKey: null,
};

export function AnnaArchiveSettings() {
  const [config, setConfig] = useState<AnnaArchiveConfig>(emptyConfig);
  const [savedConfig, setSavedConfig] = useState<AnnaArchiveConfig>(emptyConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthKey, setShowAuthKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const toast = useToast();

  const loadConfig = useCallback(async () => {
    if (!isTauri) return;
    try {
      const loaded = await api.annaArchiveGetConfig();
      setConfig(loaded);
      setSavedConfig(loaded);
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
        baseUrl: config.baseUrl?.trim() || null,
        authKey: config.authKey?.trim() || null,
        membershipKey: config.membershipKey?.trim() || null,
        authCookie: config.authCookie?.trim() || null,
        apiKey: config.apiKey?.trim() || null,
      };
      await api.annaArchiveSetConfig(normalized);
      setConfig(normalized);
      setSavedConfig(normalized);
      toast.success('Anna Archive settings saved');
    } catch (err) {
      logger.error('Failed to save Anna Archive config:', err);
      toast.error('Failed to save Anna Archive settings');
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
      toast.success('Anna Archive settings cleared');
    } catch (err) {
      logger.error('Failed to clear Anna Archive config:', err);
      toast.error('Failed to clear Anna Archive settings');
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(savedConfig);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Account-first Anna setup: base URL + membership key + auth cookie improve access to fast/member download links.
      </p>

      <div>
        <label htmlFor="anna-base-url" className="text-sm font-medium mb-2 block">Base URL</label>
        <Input
          id="anna-base-url"
          type="text"
          value={config.baseUrl ?? ''}
          onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
          placeholder="https://annas-archive.gl"
          disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="anna-auth-key" className="text-sm font-medium mb-2 block">Auth Key (optional)</label>
        <div className="relative">
          <Input
            id="anna-auth-key"
            type={showAuthKey ? 'text' : 'password'}
            value={config.authKey ?? ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, authKey: e.target.value }))}
            placeholder="Bearer token or raw key"
            className="pr-10"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowAuthKey(!showAuthKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showAuthKey ? 'Hide auth key' : 'Show auth key'}
          >
            {showAuthKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="anna-membership-key" className="text-sm font-medium mb-2 block">Membership Key (optional)</label>
        <Input
          id="anna-membership-key"
          type="text"
          value={config.membershipKey ?? ''}
          onChange={(e) => setConfig((prev) => ({ ...prev, membershipKey: e.target.value }))}
          placeholder="Used for /dyn/api/fast_download.json"
          disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="anna-auth-cookie" className="text-sm font-medium mb-2 block">Auth Cookie (optional)</label>
        <Input
          id="anna-auth-cookie"
          type="text"
          value={config.authCookie ?? ''}
          onChange={(e) => setConfig((prev) => ({ ...prev, authCookie: e.target.value }))}
          placeholder="session=...; member_id=..."
          disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="anna-api-key" className="text-sm font-medium mb-2 block">API Key (optional)</label>
        <div className="relative">
          <Input
            id="anna-api-key"
            type={showApiKey ? 'text' : 'password'}
            value={config.apiKey ?? ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
            placeholder="Anna fast_download API key"
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
          RapidAPI key for Anna endpoint (used for /download by MD5). If this is set, cookie/auth key is optional.
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
