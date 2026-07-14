import { useMemo } from 'react';
import { Globe, CheckCircle2, Wrench, AlertCircle, Zap } from 'lucide-react';
import { useSourceStore, type SourceKind } from '@/store/sourceStore';
import { useSourceHealthStore } from '@/store/sourceHealthStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface OnlineSourceSelectorProps {
  kind: SourceKind;
  className?: string;
  variant?: "link" | "default" | "destructive" | "outline" | "secondary" | "ghost";
}

export function OnlineSourceSelector({ kind, className, variant = "outline" }: OnlineSourceSelectorProps) {
  const allSources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const setPrimarySource = useSourceStore((state) => state.setPrimarySource);
  const getSourceHealthLevel = useSourceHealthStore((state) => state.getSourceHealthLevel);

  const sources = useMemo(() => {
    return [...allSources]
      .filter((source) => source.kind === kind)
      .sort((a, b) => {
        if (a.torboxCompatible && !b.torboxCompatible) return -1;
        if (!a.torboxCompatible && b.torboxCompatible) return 1;
        return 0;
      });
  }, [allSources, kind]);
  const activeSources = useMemo(
    () => sources.filter((source) => source.enabled && source.implemented),
    [sources]
  );
  const primarySource = useMemo(() => {
    const preferredId = primarySourceByKind[kind];
    const preferred = activeSources.find((source) => source.id === preferredId);
    return preferred ?? activeSources[0];
  }, [activeSources, kind, primarySourceByKind]);
  const sourceLabel = primarySource?.name ?? 'Select source';

  const CapabilityBadge = ({ capability }: { capability: string }) => {
    switch (capability) {
      case 'torbox':
        return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">Torbox-ready</span>;
      case 'direct':
        return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">Direct</span>;
      case 'metadata':
        return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">Metadata</span>;
      default:
        return null;
    }
  };

  const getRecommendedSourceId = (kind: SourceKind) => {
    if (kind === 'books') return 'anna-archive';
    if (kind === 'manga') return 'toongod';
    return null;
  };

  const HealthBadge = ({ sourceId }: { sourceId: string }) => {
    const health = getSourceHealthLevel(sourceId);
    if (health === 'unknown') {
      return <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" title="Health unknown" />;
    }
    if (health === 'good') {
      return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="Healthy" />;
    }
    if (health === 'degraded') {
      return <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" title="Degraded" />;
    }
    return <span className="w-1.5 h-1.5 rounded-full bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" title="Unavailable" />;
  };

  const recommendedSourceId = getRecommendedSourceId(kind);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} className={`gap-2 ${className || ''}`}>
          {primarySource?.torboxCompatible ? <Zap className="w-4 h-4 text-cyan-500" /> : <Globe className="w-4 h-4" />}
          <span className="truncate max-w-[180px]">{sourceLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px] md:w-[300px] bg-background/95 backdrop-blur-xl shadow-xl border-white/10">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {kind === 'books' ? 'Book sources' : 'Manga sources'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {sources.map((source) => {
          const isSelected = primarySource?.id === source.id;
          const isAvailable = source.enabled && source.implemented;
          const isRecommended = source.id === recommendedSourceId;

          return (
            <DropdownMenuItem
              key={source.id}
              onClick={() => {
                if (isAvailable) {
                  setPrimarySource(kind, source.id);
                }
              }}
              className={`flex items-center gap-3 py-2 px-3 transition-colors cursor-pointer rounded-md ${isSelected ? 'bg-primary/10 dark:bg-primary/15' : 'hover:bg-white/5'}`}
              disabled={!isAvailable}
            >
              <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                {isSelected ? (
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                ) : source.status === 'planned' ? (
                  <Wrench className="w-4 h-4 text-muted-foreground/50" />
                ) : source.torboxCompatible ? (
                  <Zap className="w-4 h-4 text-cyan-500/50" />
                ) : (
                  <Globe className="w-4 h-4 text-muted-foreground/50" />
                )}
              </div>

              <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 truncate">
                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
                    {source.name.replace(' (Planned)', '')}
                  </p>
                  <HealthBadge sourceId={source.id} />
                </div>
                
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isRecommended && (
                    <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Best</span>
                  )}
                  {source.capabilities?.map((cap) => (
                    <CapabilityBadge key={cap} capability={cap} />
                  ))}
                  {!source.enabled && (
                    <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground border border-border">Off</span>
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}

        {activeSources.length === 0 && (
          <div className="px-2 py-2 text-xs text-amber-600 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Enable at least one source in Settings → Online Sources.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
