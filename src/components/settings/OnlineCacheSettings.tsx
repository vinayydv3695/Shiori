import { useCallback, useEffect, useState } from 'react';
import { Database, HardDrive, Image as ImageIcon, Trash2 } from 'lucide-react';
import { api } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { useToast } from '@/store/toastStore';

interface OnlineCacheStat {
  entries: number;
  size_bytes: number;
  max_bytes: number;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CacheRow({
  label,
  icon,
  stat,
  onClear,
  clearing,
}: {
  label: string;
  icon: React.ReactNode;
  stat?: OnlineCacheStat;
  onClear: () => void;
  clearing: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="text-foreground/70">{icon}</div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">
            {stat
              ? `${stat.entries} entries · ${mb(stat.size_bytes)} of ${mb(stat.max_bytes)}`
              : '—'}
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={clearing}
        onClick={onClear}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="w-3.5 h-3.5 mr-1" />
        {clearing ? 'Clearing…' : 'Clear'}
      </Button>
    </div>
  );
}

/**
 * Online cache management (performance plan Slice 9): shows disk usage for
 * source data + proxied images and lets the user clear either. Caches are
 * self-cleaning (TTL + byte caps + startup sweep); clearing is for freeing
 * space on demand.
 */
export function OnlineCacheSettings() {
  const [stats, setStats] = useState<{ source?: OnlineCacheStat; images?: OnlineCacheStat }>({});
  const [clearing, setClearing] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      setStats(await api.getOnlineCacheStats());
    } catch (e) {
      console.error('Failed to load online cache stats:', e);
    }
  }, []);

  useEffect(() => {
    // Async callback setState is fine; avoid sync setState in the effect body.
    let active = true;
    api
      .getOnlineCacheStats()
      .then((s) => {
        if (active) setStats(s);
      })
      .catch((e) => console.error('Failed to load online cache stats:', e));
    return () => {
      active = false;
    };
  }, []);

  const clear = useCallback(
    async (which: 'source' | 'images') => {
      setClearing(which);
      try {
        await api.clearOnlineCache(which);
        toast.success(`${which === 'images' ? 'Image' : 'Source'} cache cleared`);
        await refresh();
      } catch (e) {
        toast.error('Failed to clear cache');
        console.error(e);
      } finally {
        setClearing(null);
      }
    },
    [refresh, toast],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        <Database className="w-4 h-4" />
        Caches are bounded (TTL + size caps) and auto-swept at startup. Clear
        manually to free space now.
      </div>
      <CacheRow
        label="Source data (search, chapters, pages)"
        icon={<HardDrive className="w-4 h-4" />}
        stat={stats.source}
        clearing={clearing === 'source'}
        onClear={() => void clear('source')}
      />
      <CacheRow
        label="Proxied images (covers, reader pages)"
        icon={<ImageIcon className="w-4 h-4" />}
        stat={stats.images}
        clearing={clearing === 'images'}
        onClear={() => void clear('images')}
      />
    </div>
  );
}