import { useSourceStore } from '@/store/sourceStore';

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
                <p className="font-medium">{source.name}</p>
                <p className="text-xs text-muted-foreground">{source.description}</p>
              </div>
              <input
                type="checkbox"
                checked={source.enabled}
                onChange={() => toggleSource(source.id)}
                className="h-5 w-5"
                aria-label={`Toggle ${source.name}`}
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
                <p className="font-medium">{source.name}</p>
                <p className="text-xs text-muted-foreground">{source.description}</p>
              </div>
              <input
                type="checkbox"
                checked={source.enabled}
                onChange={() => toggleSource(source.id)}
                className="h-5 w-5"
                aria-label={`Toggle ${source.name}`}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
