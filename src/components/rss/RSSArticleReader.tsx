import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ExternalLink, Clock, Calendar, User, ChevronLeft, ChevronRight, Rss } from 'lucide-react';
import { sanitizeArticleHTML } from '@/lib/sanitize';
import { handleExternalLinkClick } from '@/lib/externalLinks';
import { type RssArticle } from '@/store/rssStore';
import { openExternal } from '@/lib/externalLinks';

interface RSSArticleReaderProps {
  article: RssArticle;
  onClose: () => void;
  feedName?: string;
  onNext?: () => void;
  onPrev?: () => void;
}

export const RSSArticleReader: React.FC<RSSArticleReaderProps> = ({ article, onClose, feedName, onNext, onPrev }) => {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const minSwipeDistance = 50;
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe && onNext) {
      onNext();
    }
    if (isRightSwipe && onPrev) {
      onPrev();
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const calculateReadingTime = (text: string) => {
    const plainText = text.replace(/<[^>]*>/g, '');
    const words = plainText.trim().split(/\s+/).length;
    const minutes = Math.ceil(words / 200);
    return minutes < 1 ? 1 : minutes;
  };

  if (!mounted) return null;

  const readingTime = calculateReadingTime(article.content || article.summary || '');

  return createPortal(
    <div 
      className="fixed top-0 left-0 w-screen h-[100dvh] z-[100] flex flex-col bg-background text-foreground animate-in slide-in-from-right-8 duration-300 select-text"
      style={{ position: 'fixed' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Navigation Bar */}
      <div 
        className="flex-none flex items-center justify-between px-3 sm:px-6 pb-2.5 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-20 shadow-xs"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-secondary/50 hover:bg-secondary border border-border/40 text-foreground transition-all active:scale-95 shrink-0"
            title="Back to list"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 pr-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              <p className="text-xs font-extrabold text-foreground truncate">
                {feedName || 'RSS Article'}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground font-semibold truncate hidden sm:block">
              {article.title}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onPrev && (
            <button
              onClick={onPrev}
              className="p-2 sm:p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-all active:scale-95"
              title="Previous Article"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              className="p-2 sm:p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-all active:scale-95"
              title="Next Article"
            >
              <ChevronRight size={16} />
            </button>
          )}
          {article.url && (
            <button
              onClick={() => void openExternal(article.url!)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 shrink-0 active:scale-95 ml-1"
              title="Open original webpage"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Webpage</span>
            </button>
          )}
        </div>
      </div>

      {/* Article Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-none px-6 sm:px-12 md:px-16 lg:px-24 xl:px-32 py-8 sm:py-12 pb-24">
            <header className="space-y-4 mb-8 sm:mb-12 border-b border-border/40 pb-8">
              <div className="flex items-center gap-2 flex-wrap text-xs font-extrabold">
                {feedName && (
                  <span className="px-3 py-1 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-500 flex items-center gap-1.5">
                    <Rss size={12} />
                    {feedName}
                  </span>
                )}
                <span className="px-3 py-1 rounded-xl bg-secondary/60 border border-border/40 text-muted-foreground flex items-center gap-1.5">
                  <Clock size={12} />
                  {readingTime} min read
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-snug sm:leading-tight">
                {article.title}
              </h1>

              <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground flex-wrap pt-1">
                {article.author && (
                  <span className="flex items-center gap-1.5 text-foreground/90 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/40">
                    <User size={13} className="text-primary" />
                    {article.author}
                  </span>
                )}
                {article.published && (
                  <span className="flex items-center gap-1.5">
                    <Calendar size={13} className="opacity-70" />
                    {formatDate(article.published)}
                  </span>
                )}
              </div>

              {article.summary && (
                <div className="p-4 rounded-2xl border-l-4 border-orange-500/70 bg-orange-500/8 border-y border-r border-orange-500/15 text-xs sm:text-sm text-foreground/90 font-semibold leading-relaxed shadow-xs">
                  {article.summary}
                </div>
              )}
            </header>

            <article
              ref={articleRef}
              onClick={(e) => {
                handleExternalLinkClick(e.nativeEvent, articleRef.current);
              }}
              className="prose prose-sm sm:prose-base md:prose-lg lg:prose-xl dark:prose-invert max-w-none 
                text-foreground
                prose-headings:font-extrabold prose-headings:tracking-tight prose-headings:text-foreground
                prose-p:leading-relaxed prose-p:text-foreground/90
                prose-strong:text-foreground prose-strong:font-extrabold
                prose-li:text-foreground/90 prose-ol:text-foreground prose-ul:text-foreground
                prose-a:text-primary prose-a:font-bold prose-a:no-underline hover:prose-a:underline
                prose-img:rounded-2xl prose-img:border prose-img:border-border/40 prose-img:shadow-md prose-img:mx-auto
                prose-code:text-foreground prose-code:bg-secondary/70 prose-code:border prose-code:border-border/40 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-mono prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                prose-pre:text-foreground prose-pre:bg-secondary/80 prose-pre:border prose-pre:border-border/60 prose-pre:rounded-2xl prose-pre:p-4 prose-pre:shadow-xs
                prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:bg-secondary/30 prose-blockquote:py-1 prose-blockquote:pr-3 prose-blockquote:rounded-r-xl prose-blockquote:text-foreground/80 prose-blockquote:italic
                prose-table:text-foreground prose-th:text-foreground prose-td:text-foreground/90 prose-th:border-border/60 prose-td:border-border/40"
              dangerouslySetInnerHTML={{ __html: sanitizeArticleHTML(article.content) }}
            />
          </div>
        </div>
      </div>,
      document.getElementById('root') || document.body
    );
  };
