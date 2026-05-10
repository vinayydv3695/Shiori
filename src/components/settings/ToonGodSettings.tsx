import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { isTauri } from '@/lib/tauri';
import { Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';

interface ToonGodConfig {
  cfClearance: string | null;
  flaresolverrUrl: string | null;
}

const emptyConfig: ToonGodConfig = {
  cfClearance: null,
  flaresolverrUrl: null,
};

export function ToonGodSettings() {
  // Expanded state — the config is only loaded when the section is first expanded.
  // This avoids adding an eager useEffect to an already deep settings-dialog tree,
  // which was causing React's reconnectPassiveEffects to stack-overflow.
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [config, setConfig] = useState<ToonGodConfig>(emptyConfig);
  const [showClearance, setShowClearance] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!isTauri || loaded) return;
    try {
      const cfg = await invoke<ToonGodConfig>('toongod_get_config');
      setConfig(cfg ?? emptyConfig);
    } catch (err) {
      logger.error('Failed to load ToonGod config:', err);
    } finally {
      setLoaded(true);
    }
  }, [loaded]);

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) {
      void loadConfig();
    }
  };

  const handleSave = async () => {
    if (!isTauri) {
      toast.warning('ToonGod settings only work in the desktop app.');
      return;
    }
    setSaving(true);
    try {
      await invoke('toongod_set_config', { config });
      toast.success('ToonGod settings saved');
    } catch (err) {
      logger.error('Failed to save ToonGod config:', err);
      toast.error('Failed to save ToonGod settings');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!isTauri) return;
    const cleared: ToonGodConfig = { cfClearance: null, flaresolverrUrl: null };
    try {
      await invoke('toongod_set_config', { config: cleared });
      setConfig(cleared);
      toast.success('ToonGod settings cleared');
    } catch (err) {
      logger.error('Failed to clear ToonGod config:', err);
      toast.error('Failed to clear ToonGod settings');
    }
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Collapsed header — clicking expands and lazy-loads the config */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <span>Cloudflare Bypass</span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-4 border-t border-border bg-muted/10">
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
            <p>ToonGod is protected by Cloudflare. Use one of the methods below:</p>
            <p>
              <strong className="text-foreground">Method 1 — CF Clearance:</strong> Open toongod.org in your
              browser, solve the Cloudflare CAPTCHA, then copy the{' '}
              <code className="bg-muted px-1 rounded">cf_clearance</code> cookie from
              DevTools → Application → Cookies.
            </p>
            <p>
              <strong className="text-foreground">Method 2 — FlareSolverr:</strong> Run a local FlareSolverr
              instance{' '}
              <span className="font-mono text-[10px] bg-muted px-1 rounded select-all">
                github.com/FlareSolverr/FlareSolverr
              </span>{' '}
              and paste its URL below (e.g.{' '}
              <code className="bg-muted px-1 rounded">http://localhost:8191</code>).
              FlareSolverr takes priority when both are set.
            </p>
          </div>

          {/* CF Clearance Cookie */}
          <div>
            <label htmlFor="toongod-cf-clearance" className="text-sm font-medium mb-1.5 block">
              CF Clearance Cookie{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <div className="relative">
              <input
                id="toongod-cf-clearance"
                type={showClearance ? 'text' : 'password'}
                value={config.cfClearance ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, cfClearance: e.target.value || null }))}
                placeholder="Paste cf_clearance cookie value here…"
                autoComplete="off"
                className="w-full pr-9 px-3 py-2 text-sm rounded-md border border-border bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowClearance((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showClearance ? 'Hide CF clearance' : 'Show CF clearance'}
              >
                {showClearance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* FlareSolverr URL — type="text" avoids WebKitGTK rendering bugs with type="url" */}
          <div>
            <label htmlFor="toongod-flaresolverr-url" className="text-sm font-medium mb-1.5 block">
              FlareSolverr URL{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="toongod-flaresolverr-url"
              type="text"
              value={config.flaresolverrUrl ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, flaresolverrUrl: e.target.value || null }))}
              placeholder="http://localhost:8191"
              autoComplete="off"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
