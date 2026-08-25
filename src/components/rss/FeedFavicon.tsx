import React, { useState } from 'react';
import { Rss } from 'lucide-react';
import { cn } from '@/lib/utils';

export function getFeedFaviconUrl(urlStr: string): string | null {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    const domain = parsed.hostname;
    if (!domain) return null;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return null;
  }
}

interface FeedFaviconProps {
  url?: string | null;
  title?: string | null;
  className?: string;
  iconClassName?: string;
}

export const FeedFavicon: React.FC<FeedFaviconProps> = ({
  url,
  title,
  className = "w-5 h-5",
  iconClassName = "w-3 h-3"
}) => {
  const [hasError, setHasError] = useState(false);
  const faviconUrl = url ? getFeedFaviconUrl(url) : null;

  if (!faviconUrl || hasError) {
    return (
      <div className={cn("rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0", className)}>
        <Rss className={cn("text-orange-500", iconClassName)} />
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg bg-card/60 border border-border/40 flex items-center justify-center shrink-0 overflow-hidden p-0.5 shadow-xs", className)}>
      <img
        src={faviconUrl}
        alt={title || 'Feed icon'}
        onError={() => setHasError(true)}
        className="w-full h-full object-contain rounded-md"
        loading="lazy"
      />
    </div>
  );
};
