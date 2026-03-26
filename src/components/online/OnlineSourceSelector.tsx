import { useMemo } from 'react';
import { Globe, CheckCircle2, Wrench, AlertCircle } from 'lucide-react';
import { useSourceStore, type SourceKind } from '@/store/sourceStore';
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
}

export function OnlineSourceSelector({ kind }: OnlineSourceSelectorProps) {
  const allSources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const setPrimarySource = useSourceStore((state) => state.setPrimarySource);

  const sources = useMemo(
    () => allSources.filter((source) => source.kind === kind),
    [allSources, kind]
  );
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Globe className="w-4 h-4" />
          <span className="truncate max-w-[180px]">{sourceLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px]">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {kind === 'books' ? 'Book sources' : 'Manga sources'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {sources.map((source) => {
          const isSelected = primarySource?.id === source.id;
          const isAvailable = source.enabled && source.implemented;

          return (
            <DropdownMenuItem
              key={source.id}
              onClick={() => {
                if (isAvailable) {
                  setPrimarySource(kind, source.id);
                }
              }}
              className="items-start gap-3 py-2"
              disabled={!isAvailable}
            >
              <div className="pt-0.5">
                {isSelected ? (
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                ) : source.status === 'planned' ? (
                  <Wrench className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Globe className="w-4 h-4 text-muted-foreground" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{source.name.replace(' (Planned)', '')}</p>
                  {!source.enabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Disabled</span>
                  )}
                  {source.status === 'planned' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Planned</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{source.description}</p>
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
