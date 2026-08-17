import { useEffect, useRef, useState, memo } from 'react';
import { cn } from '@/lib/utils';

interface LazyCoverProps {
  src?: string;
  alt: string;
  className?: string;
  /** Root to observe viewport against (default: window). */
  root?: HTMLElement | null;
  placeholderClassName?: string;
  onLoad?: () => void;
  onError?: () => void;
  /** Extra pixels of margin before we start loading. */
  rootMargin?: string;
}

/**
 * Lazy cover image (performance plan Slice 5): the `src` is only assigned
 * once the card is within `rootMargin` of the viewport, so offscreen covers
 * are never fetched and never decoded. Always `loading="lazy" decoding="async"`.
 */
export const LazyCover = memo(function LazyCover({
  src,
  alt,
  className,
  root,
  placeholderClassName,
  onLoad,
  onError,
  rootMargin = '300px',
}: LazyCoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { root: root ?? null, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root, rootMargin]);

  const showPlaceholder = !loaded && !errored;

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden', className)}>
      {showPlaceholder && (
        <div className={cn('absolute inset-0 bg-muted/40 animate-pulse', placeholderClassName)} />
      )}
      {src && !errored && (
        <img
          src={visible ? src : undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            'w-full h-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => {
            setLoaded(true);
            onLoad?.();
          }}
          onError={() => {
            setErrored(true);
            onError?.();
          }}
        />
      )}
    </div>
  );
});