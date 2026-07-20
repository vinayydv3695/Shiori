import React, { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, Filter, BookOpen, Check, Image as ImageIcon, ChevronDown } from 'lucide-react';
import { useRssStore, type RssArticle } from '@/store/rssStore';
import { logger } from '@/lib/logger';
import { RSSArticleReader } from './RSSArticleReader';
import { extractFirstImage } from '@/lib/rssUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/store/uiStore';
import { Settings } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';

interface RSSArticleListProps {
  activeFeedId: number | null;
}

export const RSSArticleList: React.FC<RSSArticleListProps> = ({ activeFeedId }) => {
  const {
    articles,
    feeds,
    isLoading,
    error,
    loadArticles,
    markArticleRead,
    markAllArticlesRead
  } = useRssStore();

  const [limit, setLimit] = useState(50);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<RssArticle | null>(null);
  const setView = useUIStore((s) => s.setCurrentView);

  useEffect(() => {
    loadArticles(activeFeedId || undefined, limit);
  }, [activeFeedId, limit, loadArticles]);

  const activeFeedName = activeFeedId 
    ? feeds.find(f => f.id === activeFeedId)?.title || 'Feed'
    : 'All Feeds';

  const handleMarkRead = async (e: React.MouseEvent, articleId: number) => {
    e.stopPropagation();
    try {
      await markArticleRead(articleId);
    } catch (error) {
      logger.error('Failed to mark article as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllArticlesRead(activeFeedId || undefined);
    } catch (error) {
      logger.error('Failed to mark all articles as read:', error);
    }
  };

  const handleRefresh = () => {
    loadArticles(activeFeedId || undefined, limit);
  };

  const filteredArticles = showUnreadOnly
    ? articles.filter(a => !a.is_read)
    : articles;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      {/* Header Controls */}
      <div className="flex-none p-4 border-b border-border/40 bg-surface-1 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
          
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              showUnreadOnly 
                ? 'bg-primary/10 text-primary border border-primary/20' 
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            <Filter size={16} />
            Unread Only
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('rss-feeds')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition-colors whitespace-nowrap"
          >
            <Settings size={16} />
            Manage Feeds
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm bg-secondary/50 hover:bg-secondary border border-border/50 text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors">
                {limit} Items <ChevronDown size={14} className="opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32 bg-background border-border shadow-xl backdrop-blur-xl">
              {[50, 100, 200].map(val => (
                <DropdownMenuItem 
                  key={val}
                  onClick={() => setLimit(val)}
                  className="cursor-pointer"
                >
                  {val} Items
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <button
            onClick={handleMarkAllRead}
            disabled={isLoading || filteredArticles.filter(a => !a.is_read).length === 0}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} />
            Mark All Read
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 mx-4 mt-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg flex items-center gap-2">
          {error}
        </div>
      )}

      {/* Article Grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {articles.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
            <BookOpen size={48} className="opacity-20" />
            <p className="text-lg">No articles found</p>
          </div>
        ) : filteredArticles.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
            <Check size={48} className="opacity-20 text-green-500" />
            <p className="text-lg">You're all caught up!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {filteredArticles.map((article) => {
              const feed = feeds.find(f => f.id === article.feed_id);
              const thumbnail = extractFirstImage(article.content) || extractFirstImage(article.summary || '');

              return (
                <div
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  className={`group relative flex flex-col bg-surface-1 border rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300 hover:border-primary/30 ${
                    article.is_read 
                      ? 'opacity-70 border-border/40 hover:opacity-100' 
                      : 'border-border/80 shadow-sm'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="h-48 w-full bg-secondary/30 relative flex-shrink-0 overflow-hidden border-b border-border/40">
                    {thumbnail ? (
                      <img 
                        src={thumbnail} 
                        alt="" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <ImageIcon size={48} />
                      </div>
                    )}
                    
                    {/* Unread Badge */}
                    {!article.is_read && (
                      <div className="absolute top-3 right-3 w-3 h-3 bg-primary rounded-full shadow-sm ring-2 ring-background z-10" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                      <span className="truncate max-w-[120px] bg-secondary px-2 py-0.5 rounded-full">
                        {feed?.title || 'Unknown Feed'}
                      </span>
                      <span>•</span>
                      <span>{formatDate(article.published)}</span>
                    </div>
                    
                    <h3 className={`font-semibold text-foreground line-clamp-3 mb-2 leading-snug group-hover:text-primary transition-colors ${
                      article.is_read ? 'font-medium' : 'font-bold'
                    }`}>
                      {article.title}
                    </h3>
                    
                    {/* Footer Actions */}
                    <div className="mt-auto pt-4 flex items-center justify-between text-muted-foreground border-t border-border/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!article.is_read ? (
                        <button
                          onClick={(e) => handleMarkRead(e, article.id)}
                          className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors"
                        >
                          <Check size={14} />
                          Mark read
                        </button>
                      ) : (
                        <span className="text-xs flex items-center gap-1.5 opacity-50">
                          <Check size={14} />
                          Read
                        </span>
                      )}
                      
                      {article.url && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            open(article.url!);
                          }}
                          className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors"
                        >
                          Open <ExternalLink size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Article Reader overlay */}
      {selectedArticle && (
        <RSSArticleReader
          article={selectedArticle}
          onClose={() => {
            setSelectedArticle(null);
            if (!selectedArticle.is_read) {
              markArticleRead(selectedArticle.id).catch(console.error);
            }
          }}
          feedName={feeds.find(f => f.id === selectedArticle.feed_id)?.title}
        />
      )}
    </div>
  );
};
