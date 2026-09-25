import { useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Download, Loader2, PackagePlus, Puzzle, RefreshCw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/errors';
import { isTauri } from '@/lib/tauri';
import { useExtensionsStore } from '@/store/extensionsStore';
import { useToast } from '@/store/toastStore';
import type { ExtensionInfo, RepoEntry } from '@/lib/extensions';

function LangBadge({ lang }: { lang?: string | null }) {
  if (!lang) return null;
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-2 text-muted-foreground border border-border/50">
      {lang}
    </span>
  );
}

function NsfwBadge({ nsfw }: { nsfw: boolean }) {
  if (!nsfw) return null;
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/25">
      NSFW
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function ExtensionsSection() {
  const installed = useExtensionsStore((s) => s.installed);
  const repo = useExtensionsStore((s) => s.repo);
  const updates = useExtensionsStore((s) => s.updates);
  const isLoading = useExtensionsStore((s) => s.isLoading);
  const error = useExtensionsStore((s) => s.error);
  const actionId = useExtensionsStore((s) => s.actionId);
  const loadInstalled = useExtensionsStore((s) => s.loadInstalled);
  const loadRepo = useExtensionsStore((s) => s.loadRepo);
  const installFromRepo = useExtensionsStore((s) => s.installFromRepo);
  const installLocal = useExtensionsStore((s) => s.installLocal);
  const remove = useExtensionsStore((s) => s.remove);
  const setEnabled = useExtensionsStore((s) => s.setEnabled);
  const checkUpdates = useExtensionsStore((s) => s.checkUpdates);
  const update = useExtensionsStore((s) => s.update);
  const clearError = useExtensionsStore((s) => s.clearError);
  const toast = useToast();

  useEffect(() => {
    void loadInstalled();
    void loadRepo();
  }, [loadInstalled, loadRepo]);

  const updateIds = new Set(updates.map((u) => u.id));
  const installedById = new Map(installed.map((ext) => [ext.id, ext]));

  const handleRefresh = () => {
    void loadInstalled();
    void loadRepo();
  };

  const handleInstallLocal = async () => {
    if (!isTauri) {
      toast.error('Extension installs require the desktop app');
      return;
    }
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'WASM', extensions: ['wasm'] }],
      });
      if (typeof selected === 'string') {
        await installLocal(selected);
        toast.success('Extension installed');
      }
    } catch (err) {
      toast.error('Failed to install extension', getErrorMessage(err));
    }
  };

  const handleRemove = (ext: ExtensionInfo) => {
    if (confirm(`Remove extension "${ext.name}"?`)) {
      void remove(ext.id);
    }
  };

  return (
    <div className="space-y-4 pb-8 mb-8 border-b border-border/20">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-[1.15rem] font-medium tracking-tight text-foreground/90 flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-primary" />
            Extensions
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Community-built WASM extensions for online sources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
          <Button variant="default" size="sm" onClick={() => void handleInstallLocal()} className="gap-1.5">
            <PackagePlus className="w-3.5 h-3.5" />
            Install from file…
          </Button>
        </div>
      </div>

      {actionId === '__local__' && (
        <div className="px-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Installing…
        </div>
      )}

      {error && (
        <div className="mx-2 flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/25 text-sm text-destructive">
          <span className="leading-snug">{error}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss error" className="shrink-0 opacity-70 hover:opacity-100 transition-opacity">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Installed */}
      <div className="flex items-center gap-3 px-2 pb-2">
        <h4 className="text-xs font-bold tracking-[0.15em] uppercase text-foreground/80">Installed</h4>
        <span className="text-[11px] text-muted-foreground">{installed.length}</span>
        <button
          type="button"
          onClick={() => void checkUpdates()}
          disabled={isLoading}
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <Download className="w-3 h-3" />
          Check updates
        </button>
      </div>

      {isLoading && installed.length === 0 ? (
        <ListSkeleton />
      ) : installed.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">No extensions installed</p>
      ) : (
        <div className="flex flex-col gap-1">
          {installed.map((ext) => {
            const busy = actionId === ext.id;
            const isUpdating = updateIds.has(ext.id);
            return (
              <div
                key={ext.id}
                className="flex items-center justify-between gap-3 px-3 md:px-4 py-3 rounded-xl hover:bg-muted/40 transition-colors duration-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground">
                    <Puzzle className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold tracking-tight text-foreground/90 truncate">{ext.name}</span>
                      <LangBadge lang={ext.lang} />
                      <NsfwBadge nsfw={ext.nsfw} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      v{ext.version} · {ext.contentType === 'manga' ? 'Manga' : 'Book'}
                      {ext.baseUrl ? ` · ${ext.baseUrl}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isUpdating && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void update(ext.id)}
                      disabled={busy || isLoading}
                      className="gap-1.5"
                    >
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {busy ? 'Updating…' : 'Update'}
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(ext)}
                    disabled={busy || isLoading}
                    aria-label={`Remove ${ext.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <Switch
                    checked={ext.enabled}
                    onChange={(checked) => void setEnabled(ext.id, checked)}
                    disabled={busy || isLoading}
                    aria-label={`Enable ${ext.name}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Repository */}
      <div className="flex items-center gap-3 px-2 pb-2 pt-2">
        <h4 className="text-xs font-bold tracking-[0.15em] uppercase text-foreground/80">Repository</h4>
        <span className="text-[11px] text-muted-foreground">{repo.length}</span>
      </div>

      {isLoading && repo.length === 0 ? (
        <ListSkeleton />
      ) : repo.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">Repository unavailable</p>
      ) : (
        <div className="flex flex-col gap-1">
          {repo.map((entry: RepoEntry) => {
            const busy = actionId === entry.id;
            const alreadyInstalled = installedById.has(entry.id);
            const needsUpdate = updateIds.has(entry.id);
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 px-3 md:px-4 py-3 rounded-xl hover:bg-muted/40 transition-colors duration-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground overflow-hidden">
                    {entry.iconUrl ? (
                      <img src={entry.iconUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Puzzle className="w-5 h-5" strokeWidth={2} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold tracking-tight text-foreground/90 truncate">{entry.name}</span>
                      <LangBadge lang={entry.lang} />
                      <NsfwBadge nsfw={entry.nsfw} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      v{entry.version} · {entry.contentType === 'manga' ? 'Manga' : 'Book'}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  {alreadyInstalled ? (
                    <Button
                      variant={needsUpdate ? 'outline' : 'ghost'}
                      size="sm"
                      onClick={() => void update(entry.id)}
                      disabled={busy || isLoading}
                      className="gap-1.5"
                    >
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {needsUpdate ? (busy ? 'Updating…' : 'Update') : 'Installed'}
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => void installFromRepo(entry.id)}
                      disabled={busy || isLoading}
                      className="gap-1.5"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {busy ? 'Installing…' : 'Install'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}