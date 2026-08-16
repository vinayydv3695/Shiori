import { useMemo } from 'react';
import { Globe, CheckCircle2, Wrench, AlertCircle, Zap, ChevronDown, Check } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface OnlineSourceSelectorProps {
  kind: SourceKind;
  className?: string;
  variant?: "link" | "default" | "destructive" | "outline" | "secondary" | "ghost";
  iconOnly?: boolean;
}

export function OnlineSourceSelector({ kind, className, variant = "outline", iconOnly = false }: OnlineSourceSelectorProps) {
  const allSources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const setPrimarySource = useSourceStore((state) => state.setPrimarySource);

  const sources = useMemo(() => {
    return [...allSources]
      .filter((source) => source.kind === kind && source.id !== 'nyaa');
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={variant} 
          title={sourceLabel}
          className={cn(
            iconOnly 
              ? "w-9 h-9 p-0 flex items-center justify-center rounded-full outline-none select-none transition-all duration-200 shrink-0"
              : "group gap-2.5 outline-none select-none transition-all duration-200", 
            className
          )}
        >
          <Globe className="w-4 h-4 text-primary shrink-0" />
          {!iconOnly && (
            <>
              <span className="truncate max-w-[160px] font-bold">{sourceLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0 group-hover:opacity-100 transition-opacity ml-0.5" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="start" 
        className="w-[240px] sm:w-[260px] bg-popover/95 backdrop-blur-2xl border border-border/60 shadow-2xl rounded-2xl p-1.5 z-[150] animate-in fade-in zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
      >
        <DropdownMenuLabel className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>{kind === 'books' ? 'Book Sources' : 'Manga Sources'}</span>
          <span className="text-[10px] font-semibold text-muted-foreground/60 tracking-normal normal-case">
            {activeSources.length} active
          </span>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator className="my-1 bg-border/40" />

        <div className="flex flex-col gap-0.5 max-h-[380px] overflow-y-auto custom-scrollbar p-0.5">
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
                className={cn(
                  "flex items-center justify-between gap-3 py-2 px-3 rounded-xl transition-all cursor-pointer select-none outline-none",
                  isSelected
                    ? "bg-primary/10 text-primary border border-primary/25 font-bold shadow-xs"
                    : isAvailable
                      ? "hover:bg-secondary/70 text-foreground border border-transparent"
                      : "opacity-45 cursor-not-allowed border border-transparent"
                )}
                disabled={!isAvailable}
              >
                <div className="flex items-center gap-2.5 truncate min-w-0">
                  <div className="flex-shrink-0 flex items-center justify-center w-4 h-4 text-muted-foreground">
                    {source.status === 'planned' ? (
                      <Wrench className="w-3.5 h-3.5 text-muted-foreground/60" />
                    ) : (
                      <Globe className={cn("w-3.5 h-3.5", isSelected ? "text-primary" : "text-muted-foreground/70")} />
                    )}
                  </div>

                  <span className={cn("text-xs sm:text-sm font-semibold truncate", isSelected && "text-primary font-bold")}>
                    {source.name.replace(' (Planned)', '')}
                  </span>
                </div>

                {isSelected && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            );
          })}
        </div>

        {activeSources.length === 0 && (
          <div className="p-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-xl border border-amber-500/20 flex items-center gap-2 m-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Enable at least one source in Settings → Online Sources.</span>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
