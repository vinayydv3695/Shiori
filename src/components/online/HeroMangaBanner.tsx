import { Button } from '@/components/ui/button';
import { BookOpen, Star, Clock, User } from 'lucide-react';
import type { MangaDexManga } from '@/hooks/useMangaDex';

interface HeroMangaBannerProps {
  manga: MangaDexManga | null;
  loading?: boolean;
  onReadClick?: (manga: MangaDexManga) => void;
}

export function HeroMangaBanner({ manga, loading, onReadClick }: HeroMangaBannerProps) {
  if (loading) {
    return (
      <div className="relative w-full h-[300px] md:h-[400px] rounded-xl overflow-hidden bg-muted animate-pulse">
        <div className="absolute inset-0 bg-background/50" />
      </div>
    );
  }

  if (!manga) return null;

  return (
    <div className="relative w-full h-[350px] md:h-[450px] rounded-xl overflow-hidden group border border-border">
      {/* Blurred Background */}
      {manga.coverUrl && (
        <div className="absolute inset-0 z-0">
          <img
            src={manga.coverUrl}
            alt=""
            className="w-full h-full object-cover blur-2xl opacity-40 scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 h-full p-6 md:p-10 flex flex-col justify-end md:flex-row md:items-end gap-6 md:gap-10">
        {/* Cover Image */}
        {manga.coverUrl && (
          <div className="hidden md:block flex-shrink-0 w-48 h-72 rounded-lg overflow-hidden shadow-2xl border border-border/50 group-hover:scale-105 transition-transform duration-500">
            <img
              src={manga.coverUrl}
              alt={manga.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-4">
          {/* Tags */}
          {manga.tags && manga.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {manga.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-xs font-semibold tracking-wide uppercase backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
              {manga.contentRating && manga.contentRating !== 'safe' && (
                <span className="px-2.5 py-1 rounded-full bg-destructive/20 text-destructive text-xs font-semibold tracking-wide uppercase backdrop-blur-sm">
                  {manga.contentRating}
                </span>
              )}
            </div>
          )}

          {/* Title */}
          <h1 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight line-clamp-2 drop-shadow-md">
            {manga.title}
          </h1>

          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/80 font-medium">
            {manga.author && (
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-primary" />
                <span>{manga.author}</span>
              </div>
            )}
            {manga.year && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-primary" />
                <span>{manga.year}</span>
              </div>
            )}
            {manga.status && (
              <div className="flex items-center gap-1.5 capitalize">
                <Star className="w-4 h-4 text-primary" />
                <span>{manga.status}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {manga.description && (
            <p className="text-muted-foreground line-clamp-2 md:line-clamp-3 text-sm md:text-base max-w-3xl leading-relaxed">
              {manga.description}
            </p>
          )}

          {/* Action Button */}
          <div className="pt-2">
            <Button
              size="lg"
              className="font-bold tracking-wide shadow-lg hover:scale-105 transition-transform"
              onClick={() => onReadClick?.(manga)}
            >
              <BookOpen className="w-5 h-5 mr-2" />
              Read Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
