import { useSourceStore } from '@/store/sourceStore';
import { ExternalLink, Database, Globe, Puzzle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 }
  }
};

export function SourceManager() {
  const sources = useSourceStore((state) => state.sources);
  const toggleSource = useSourceStore((state) => state.toggleSource);

  const mangaSources = sources.filter((source) => source.kind === 'manga');
  const bookSources = sources.filter((source) => source.kind === 'books' && source.id !== 'jackett');

  const SourceCard = ({ source, icon: Icon }: { source: any, icon: any }) => (
    <motion.div 
      variants={itemVariants}
      whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
      className={cn(
        "group relative flex items-start gap-5 rounded-[1.25rem] border p-5 transition-all duration-500 overflow-hidden",
        source.enabled 
          ? "border-primary/40 bg-gradient-to-br from-primary/[0.08] to-transparent shadow-[0_0_30px_-5px_rgba(var(--primary),0.15)]" 
          : "border-border/40 bg-surface-1/40 hover:bg-surface-1/60 hover:border-border/80"
      )}
    >
      {/* Active Glow Effect */}
      {source.enabled && (
        <div className="absolute -inset-[1px] rounded-[1.25rem] bg-gradient-to-b from-primary/30 to-transparent opacity-20 pointer-events-none" />
      )}

      <div className={cn(
        "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-all duration-500 z-10",
        source.enabled 
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-105" 
          : "bg-surface-2 text-muted-foreground group-hover:bg-surface-3"
      )}>
        <Icon className="w-6 h-6" strokeWidth={source.enabled ? 2.5 : 2} />
      </div>

      <div className="flex-1 min-w-0 z-10 pt-0.5">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h4 className={cn(
              "text-base font-bold tracking-tight transition-colors duration-300", 
              source.enabled ? "text-foreground" : "text-foreground/70"
            )}>
              {source.name.replace(' (Planned)', '')}
            </h4>
            {source.status === 'planned' && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-2 text-muted-foreground border border-border/50">
                Planned
              </span>
            )}
          </div>
          <div className="shrink-0 flex items-center">
            <Switch 
              checked={source.enabled} 
              onChange={() => toggleSource(source.id)} 
              disabled={!source.implemented}
              className={cn(
                "transition-shadow duration-300",
                source.enabled && "shadow-[0_0_15px_rgba(var(--primary),0.4)]"
              )}
            />
          </div>
        </div>
        
        <p className="text-[13px] text-muted-foreground leading-relaxed pr-8 line-clamp-2">
          {source.description}
        </p>

        {source.website && (
          <a
            href={source.website}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-semibold mt-3 transition-colors duration-300",
              source.enabled ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Visit source <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </motion.div>
  );

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-10 relative"
    >
      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none -z-10" />

      <motion.div variants={itemVariants} className="relative z-10">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Sparkles className="w-6 h-6" />
          </div>
          <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Plugin Community
          </span>
        </h2>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-2xl">
          Supercharge your library with community-maintained plugins. Enable sources to instantly access massive catalogs of manga and books. Customize your experience below.
        </p>
      </motion.div>

      <motion.section variants={itemVariants} className="space-y-5 relative z-10">
        <div className="flex items-center gap-3 pb-3 border-b border-border/40">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-foreground/80">Manga Plugins</h3>
        </div>
        <div className="grid gap-4">
          {mangaSources.map((source) => (
            <SourceCard key={source.id} source={source} icon={Globe} />
          ))}
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="space-y-5 relative z-10">
        <div className="flex items-center gap-3 pb-3 border-b border-border/40">
          <Database className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-foreground/80">Book Plugins</h3>
        </div>
        <div className="grid gap-4">
          {bookSources.map((source) => (
            <SourceCard key={source.id} source={source} icon={Database} />
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}
