import React from 'react';
import { ArrowLeft, ExternalLink, Share } from 'lucide-react';
import { sanitizeArticleHTML } from '@/lib/sanitize';
import { type RssArticle } from '@/store/rssStore';
import { open } from '@tauri-apps/plugin-shell';

interface RSSArticleReaderProps {
  article: RssArticle;
  onClose: () => void;
  feedName?: string;
}

export const RSSArticleReader: React.FC<RSSArticleReaderProps> = ({ article, onClose, feedName }) => {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground animate-in slide-in-from-right-8 duration-300">
      {/* Top Navigation Bar */}
      <div className="flex-none flex items-center justify-between px-4 h-14 bg-background/80 backdrop-blur-md border-b border-border/40 sticky top-0 z-10">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="text-xs font-medium text-muted-foreground truncate px-4 flex-1 text-center">
          {feedName || 'Article'}
        </div>
        <div className="flex items-center gap-1">
          {article.url && (
            <button
              onClick={() => open(article.url!)}
              className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Open in Browser"
            >
              <ExternalLink size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Article Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
          <header className="mb-10">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-tight mb-4">
              {article.title}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              {article.author && <span className="font-semibold text-foreground/80">{article.author}</span>}
              {article.author && <span>•</span>}
              <span>{formatDate(article.published)}</span>
            </div>
            {article.summary && (
              <p className="text-lg text-muted-foreground leading-relaxed italic border-l-4 border-primary/40 pl-4">
                {article.summary}
              </p>
            )}
          </header>

          <article
            className="prose prose-base md:prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary prose-img:rounded-xl prose-img:shadow-md"
            dangerouslySetInnerHTML={{ __html: sanitizeArticleHTML(article.content) }}
          />
        </div>
      </div>
    </div>
  );
};
