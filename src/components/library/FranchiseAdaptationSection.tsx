import { memo } from 'react';
import {
  Tv, Film, ExternalLink, Star, Calendar, PlaySquare,
  BookOpen, Layers, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { openExternal } from '@/lib/externalLinks';
import type { FranchiseMediaNode, FranchiseTransmediaData } from '@/lib/franchiseHub';
import { Button } from '@/components/ui/button';
import { AppTooltip } from '@/components/ui/tooltip';

interface FranchiseAdaptationSectionProps {
  data: FranchiseTransmediaData | null;
  isLoading: boolean;
  onRetry?: () => void;
  franchiseTitle: string;
}

function getRelationBadgeClass(relationType?: string): string {
  switch (relationType?.toUpperCase()) {
    case 'SOURCE':
      return 'bg-primary text-primary-foreground border-transparent uppercase font-black text-[9px] tracking-wider shadow-xs';
    case 'ADAPTATION':
      return 'bg-primary/10 text-primary border-primary/25 font-bold';
    default:
      return 'bg-secondary/70 text-foreground/85 border-border/40 font-medium';
  }
}

function formatRelationLabel(relationType?: string): string {
  switch (relationType?.toUpperCase()) {
    case 'SOURCE':
      return 'Original Source';
    case 'ADAPTATION':
      return 'Anime Adaptation';
    case 'SEQUEL':
      return 'Sequel';
    case 'PREQUEL':
      return 'Prequel';
    case 'SPIN_OFF':
      return 'Spin-off';
    case 'SIDE_STORY':
      return 'Side Story';
    case 'SUMMARY':
      return 'Recap / Summary';
    default:
      return relationType || 'Related';
  }
}

function formatMediaStatus(status?: string): { label: string; color: string } {
  switch (status?.toUpperCase()) {
    case 'FINISHED':
      return { label: 'Completed', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 font-bold' };
    case 'RELEASING':
      return { label: 'Airing', color: 'bg-primary/10 text-primary border-primary/25 font-bold' };
    default:
      return { label: status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ') : 'Upcoming', color: 'bg-secondary/60 text-muted-foreground border-border/40 font-medium' };
  }
}

const AdaptationCard = memo(function AdaptationCard({ item }: { item: FranchiseMediaNode }) {
  const title = item.title.english || item.title.userPreferred || item.title.romaji;
  const subtitle = item.title.english && item.title.romaji !== item.title.english ? item.title.romaji : null;
  const statusInfo = formatMediaStatus(item.status);
  const relationBadge = getRelationBadgeClass(item.relationType);

  const malUrl = item.idMal
    ? `https://myanimelist.net/${item.type === 'ANIME' ? 'anime' : 'manga'}/${item.idMal}`
    : null;

  return (
    <div className="flex flex-col sm:flex-row gap-3.5 p-3.5 rounded-xl bg-card border border-border/50 hover:border-border/80 transition-all duration-200 shadow-xs hover:shadow-md group">
      {/* Poster Image */}
      <div className="relative w-full sm:w-28 h-40 sm:h-auto rounded-lg overflow-hidden shrink-0 bg-muted/60 border border-border/30 shadow-xs">
        {item.coverImage?.large ? (
          <img
            src={item.coverImage.large}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
            {item.type === 'ANIME' ? <Tv className="w-8 h-8" /> : <BookOpen className="w-8 h-8" />}
          </div>
        )}

        {/* Format Pill (Overlay on image) */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-background/90 dark:bg-card/90 backdrop-blur-md border border-border/50 shadow-xs text-foreground">
          {item.format?.replace('_', ' ') || item.type}
        </div>

        {item.averageScore != null && item.averageScore > 0 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-background/90 dark:bg-card/90 backdrop-blur-md text-foreground border border-border/50 shadow-xs">
            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
            <span>{item.averageScore}%</span>
          </div>
        )}
      </div>

      {/* Info Column */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          {/* Top badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {item.relationType && (
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] border', relationBadge)}>
                {formatRelationLabel(item.relationType)}
              </span>
            )}
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] border', statusInfo.color)}>
              {statusInfo.label}
            </span>
          </div>

          {/* Titles */}
          <h4 className="text-sm font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors leading-snug">
            {title}
          </h4>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {subtitle}
            </p>
          )}

          {/* Release & Episode details */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-2 font-medium">
            {item.seasonYear && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {item.season ? `${item.season.charAt(0) + item.season.slice(1).toLowerCase()} ` : ''}
                {item.seasonYear}
              </span>
            )}
            {item.episodes != null && (
              <span className="flex items-center gap-1">
                <PlaySquare className="w-3.5 h-3.5" />
                {item.episodes} {item.episodes === 1 ? 'Episode' : 'Episodes'}
              </span>
            )}
            {item.chapters != null && (
              <span className="flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                {item.chapters} Chapters
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons: AniList & MyAnimeList */}
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/30">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openExternal(item.siteUrl)}
            className="h-7 text-xs px-2.5 rounded-lg gap-1.5 font-semibold bg-secondary/60 hover:bg-secondary text-foreground/90 border border-border/40 hover:border-border/70 backdrop-blur-xl shadow-xs transition-all"
          >
            <span>AniList</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Button>

          {malUrl && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openExternal(malUrl)}
              className="h-7 text-xs px-2.5 rounded-lg gap-1.5 font-semibold bg-secondary/60 hover:bg-secondary text-foreground/90 border border-border/40 hover:border-border/70 backdrop-blur-xl shadow-xs transition-all"
            >
              <span>MyAnimeList</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

export const FranchiseAdaptationSection = memo(function FranchiseAdaptationSection({
  data,
  isLoading,
  onRetry,
  franchiseTitle,
}: FranchiseAdaptationSectionProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 py-6">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-primary/30 animate-pulse" />
          <div className="h-4 w-48 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-44 rounded-xl bg-muted/40 border border-border/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const animeList = data?.anime ?? [];
  const novelList = data?.lightNovels ?? [];
  const mangaList = data?.manga ?? [];
  const hasTransmedia = animeList.length > 0 || novelList.length > 0 || mangaList.length > 0;

  if (!hasTransmedia) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-border/60 bg-card/30">
        <Tv className="w-10 h-10 text-muted-foreground/40 mb-2" />
        <h4 className="text-sm font-bold text-foreground">No External Transmedia Detected</h4>
        <p className="text-xs text-muted-foreground max-w-sm mt-1">
          Could not locate official anime seasons or adaptation links on AniList for &ldquo;{franchiseTitle}&rdquo;.
        </p>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3 text-xs h-8 rounded-lg font-semibold">
            Retry AniList Search
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Anime TV & Movies Section */}
      {animeList.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Tv className="w-4 h-4 text-primary" />
              <span>Anime Adaptations & TV Seasons</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/30">
                {animeList.length}
              </span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {animeList.map((item) => (
              <AdaptationCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Light Novels & Manga Adaptations */}
      {(novelList.length > 0 || mangaList.length > 0) && (
        <div className="flex flex-col gap-3 pt-4 border-t border-border/40">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <span>Registered Novels & Manga Adaptations</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground border border-border/30">
                {novelList.length + mangaList.length}
              </span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[...novelList, ...mangaList].map((item) => (
              <AdaptationCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
