import { useSourceStore } from '@/store/sourceStore';
import { ExternalLink, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SourceManager() {
  const sources = useSourceStore((state) => state.sources);
  const toggleSource = useSourceStore((state) => state.toggleSource);


  const mangaSources = sources.filter((source) => source.kind === 'manga');
  const bookSources = sources.filter((source) => source.kind === 'books' && source.id !== 'jackett');

  const CapabilityBadge = ({ capability }: { capability: string }) => {
    switch (capability) {
      case 'torbox':
        return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">Torbox-ready</span>;
      case 'direct':
        return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">Direct Download</span>;
      case 'metadata':
        return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">Metadata Only</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Source Configuration</h2>
          <p className="text-sm text-muted-foreground">Manage where SHIORI fetches content and metadata.</p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Manga sources</h3>
        <div className="space-y-2">
          {mangaSources.map((source) => (
            <div key={source.id} className={`flex items-center justify-between rounded-xl border p-4 transition-all duration-200 ${source.enabled ? 'border-primary/20 bg-primary/5 dark:bg-primary/10' : 'border-border bg-card/50 opacity-70 grayscale-[0.2]'}`}>
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <p className={`font-semibold ${source.enabled ? 'text-primary' : ''}`}>{source.name.replace(' (Planned)', '')}</p>
                  {source.status === 'planned' && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Planned</span>
                  )}
                  {source.capabilities?.map((cap) => (
                    <CapabilityBadge key={cap} capability={cap} />
                  ))}
                  {source.enabled && source.implemented && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Enabled</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{source.description}</p>
                {source.id === 'mangadex' && (
                  <p className="text-[11px] font-medium text-amber-600 dark:text-amber-500 mt-1.5">Required for SHIORI manga reader workflow.</p>
                )}
                {source.id === 'nyaa' && (
                  <p className="text-[11px] font-medium text-amber-600 dark:text-amber-500 mt-1.5">Recommended for SHIORI x Torbox manga torrent workflow.</p>
                )}
                {source.website && (
                  <a
                    href={source.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary/80 inline-flex items-center gap-1 mt-2 hover:text-primary hover:underline transition-colors"
                  >
                    Visit source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="checkbox"
                checked={source.enabled}
                onChange={() => toggleSource(source.id)}
                className="h-5 w-5 accent-primary cursor-pointer disabled:cursor-not-allowed transition-transform active:scale-95"
                aria-label={`Toggle ${source.name}`}
                disabled={!source.implemented || source.id === 'mangadex'}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Book sources</h3>
        <div className="space-y-2">
          {bookSources.map((source) => (
            <div key={source.id} className={`flex items-center justify-between rounded-xl border p-4 transition-all duration-200 ${source.enabled ? 'border-primary/20 bg-primary/5 dark:bg-primary/10' : 'border-border bg-card/50 opacity-70 grayscale-[0.2]'}`}>
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <p className={`font-semibold ${source.enabled ? 'text-primary' : ''}`}>{source.name.replace(' (Planned)', '')}</p>
                  {source.status === 'planned' && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Planned</span>
                  )}
                  {source.capabilities?.map((cap) => (
                    <CapabilityBadge key={cap} capability={cap} />
                  ))}
                  {source.enabled && source.implemented && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Enabled</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{source.description}</p>
                {source.id === 'anna-archive' && (
                  <p className="text-[11px] font-medium text-amber-600 dark:text-amber-500 mt-1.5">Required for SHIORI x Torbox books workflow.</p>
                )}
                {source.id === 'rutracker' && (
                  <p className="text-[11px] font-medium text-amber-600 dark:text-amber-500 mt-1.5">Recommended for SHIORI x Torbox direct torrent mirror workflow.</p>
                )}
                {source.id === 'bitsearch' && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">Anonymous magnet-first source. Recommended fallback when other mirrors are sparse.</p>
                )}
                {source.id === 'x1337' && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">Anonymous torrent index used as additional mirror fallback for books.</p>
                )}
                {source.website && (
                  <a
                    href={source.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary/80 inline-flex items-center gap-1 mt-2 hover:text-primary hover:underline transition-colors"
                  >
                    Visit source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="checkbox"
                checked={source.enabled}
                onChange={() => toggleSource(source.id)}
                className="h-5 w-5 accent-primary cursor-pointer disabled:cursor-not-allowed transition-transform active:scale-95"
                aria-label={`Toggle ${source.name}`}
                disabled={!source.implemented || source.id === 'anna-archive'}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
