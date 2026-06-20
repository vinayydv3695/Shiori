import { useSourceStore } from '@/store/sourceStore';
import { ExternalLink, Database, Globe, Puzzle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

export function SourceManager() {
  const sources = useSourceStore((state) => state.sources);
  const toggleSource = useSourceStore((state) => state.toggleSource);

  const mangaSources = sources.filter((source) => source.kind === 'manga');
  const bookSources = sources.filter((source) => source.kind === 'books' && source.id !== 'jackett');

  const SourceCard = ({ source, icon: Icon }: { source: any, icon: any }) => (
    <div 
      className={cn(
        "group relative flex items-start gap-4 rounded-2xl border p-5 transition-all duration-300",
        source.enabled 
          ? "border-primary/30 bg-primary/[0.03] dark:bg-primary/[0.05] shadow-sm" 
          : "border-border/50 bg-card/30 opacity-80 hover:opacity-100 hover:bg-card/50 hover:border-border"
      )}
    >
      <div className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
        source.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        <Icon className="w-6 h-6" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={cn("text-base font-semibold tracking-tight transition-colors", source.enabled ? "text-foreground" : "text-foreground/80")}>
              {source.name.replace(' (Planned)', '')}
            </h4>
            {source.status === 'planned' && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Planned</span>
            )}
          </div>
          <div className="shrink-0 flex items-center">
            <Switch 
              checked={source.enabled} 
              onChange={() => toggleSource(source.id)} 
              disabled={!source.implemented} 
            />
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground leading-relaxed pr-8">
          {source.description}
        </p>

        {source.website && (
          <a
            href={source.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary/70 mt-3 hover:text-primary transition-colors"
          >
            Visit source <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Puzzle className="w-5 h-5 text-primary" />
          Plugin Configuration
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage community plugins that provide content and metadata. Enable the sources you trust. All plugins are disabled by default.
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border/50">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Manga Plugins</h3>
        </div>
        <div className="grid gap-3">
          {mangaSources.map((source) => (
            <SourceCard key={source.id} source={source} icon={Globe} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border/50">
          <Database className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Book Plugins</h3>
        </div>
        <div className="grid gap-3">
          {bookSources.map((source) => (
            <SourceCard key={source.id} source={source} icon={Database} />
          ))}
        </div>
      </section>
    </div>
  );
}
