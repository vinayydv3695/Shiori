import { useSourceStore } from '@/store/sourceStore';
import { ExternalLink } from 'lucide-react';

export function SourceManager() {
  const sources = useSourceStore((state) => state.sources);
  const toggleSource = useSourceStore((state) => state.toggleSource);

  const mangaSources = sources.filter((source) => source.kind === 'manga');
  const bookSources = sources.filter((source) => source.kind === 'books');

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Manga sources</h3>
        <div className="space-y-2">
          {mangaSources.map((source) => (
            <div key={source.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{source.name.replace(' (Planned)', '')}</p>
                  {source.status === 'planned' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Planned</span>
                  )}
                  {source.torboxCompatible && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">Torbox-ready</span>
                  )}
                  {source.enabled && source.implemented && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Enabled</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{source.description}</p>
                {source.id === 'mangadex' && (
                  <p className="text-[11px] text-muted-foreground mt-1">Required for SHIORI manga reader workflow.</p>
                )}
                {source.id === 'nyaa' && (
                  <p className="text-[11px] text-muted-foreground mt-1">Recommended for SHIORI x Torbox manga torrent workflow.</p>
                )}
                {source.website && (
                  <a
                    href={source.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline"
                  >
                    Visit source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="checkbox"
                checked={source.enabled}
                onChange={() => toggleSource(source.id)}
                className="h-5 w-5"
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
            <div key={source.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{source.name.replace(' (Planned)', '')}</p>
                  {source.status === 'planned' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Planned</span>
                  )}
                  {source.torboxCompatible && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">Torbox-ready</span>
                  )}
                  {source.enabled && source.implemented && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Enabled</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{source.description}</p>
                {source.id === 'anna-archive' && (
                  <p className="text-[11px] text-muted-foreground mt-1">Required for SHIORI x Torbox books workflow.</p>
                )}
                {source.website && (
                  <a
                    href={source.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline"
                  >
                    Visit source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="checkbox"
                checked={source.enabled}
                onChange={() => toggleSource(source.id)}
                className="h-5 w-5"
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
