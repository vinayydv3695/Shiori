import React, { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, Filter, BookOpen, Check, Image as ImageIcon, ChevronDown, Search } from 'lucide-react';
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
import { isAndroid } from '@/lib/tauri';

interface RSSArticleListProps {
  activeFeedId?: number | null;
}

const getGradient = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c1 = `hsl(${Math.abs(hash) % 360}, 70%, 40%)`;
  const c2 = `hsl(${Math.abs(hash * 2) % 360}, 80%, 20%)`;
  return `linear-gradient(135deg, ${c1}, ${c2})`;
};

export const RSSArticleList: React.FC<RSSArticleListProps> = ({ activeFeedId = null }) => {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(activeFeedId || null);
  const [selectedArticle, setSelectedArticle] = useState<RssArticle | null>(null);
  const setView = useUIStore((s) => s.setCurrentView);

  useEffect(() => {
    loadArticles(selectedFeedId || undefined, limit);
  }, [selectedFeedId, limit, loadArticles]);

  const activeFeedName = selectedFeedId 
    ? feeds.find(f => f.id === selectedFeedId)?.title || 'Feed'
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
      await markAllArticlesRead(selectedFeedId || undefined);
    } catch (error) {
      logger.error('Failed to mark all articles as read:', error);
    }
  };

  const handleRefresh = () => {
    loadArticles(selectedFeedId || undefined, limit);
  };

  const filteredArticles = articles.filter(a => {
    if (showUnreadOnly && a.is_read) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!a.title.toLowerCase().includes(query) && !a.summary?.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

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
      <div className="flex-none p-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:pt-4 border-b border-border/40 bg-surface-1 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 min-w-[150px] max-w-full md:max-w-[250px] group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-secondary/50 border border-transparent focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg outline-none transition-all"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm bg-secondary/50 hover:bg-secondary border border-transparent rounded-lg transition-colors max-w-[150px] md:max-w-[200px] whitespace-nowrap">
                <span className="truncate">{activeFeedName}</span>
                <ChevronDown size={14} className="opacity-70 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 max-h-[300px] overflow-y-auto">
              <DropdownMenuItem onClick={() => setSelectedFeedId(null)} className="font-medium cursor-pointer">
                All Feeds
              </DropdownMenuItem>
              {feeds.map(feed => (
                <DropdownMenuItem key={feed.id} onClick={() => setSelectedFeedId(feed.id)} className="cursor-pointer">
                  <div className="truncate">{feed.title}</div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
          <button
            onClick={() => setView('rss-feeds')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition-colors whitespace-nowrap"
          >
            <Settings size={16} />
            Manage Feeds
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm bg-secondary/50 hover:bg-secondary border border-border/50 text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors whitespace-nowrap">
                {limit} Items <ChevronDown size={14} className="opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32 bg-background border-border shadow-xl backdrop-blur-xl">
              {[50, 100, 200, 500].map(val => (
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
                      <div 
                        className="w-full h-full flex flex-col items-center justify-center text-white/90 shadow-inner p-4"
                        style={{ background: getGradient(feed?.title || article.title || 'Unknown') }}
                      >
                         {(article.url || feed?.url) ? (
                           <img 
                             src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(article.url || feed!.url)}&size=128`}
                             alt=""
                             className="w-16 h-16 rounded-xl mb-4 shadow-lg bg-white/20 p-2 backdrop-blur-md"
                             onError={(e) => {
                               (e.target as HTMLImageElement).style.display = 'none';
                             }}
                           />
                         ) : null}
                         <span className="font-bold text-center drop-shadow-md line-clamp-2 overflow-hidden text-ellipsis px-2 text-sm leading-snug">
                           {feed?.title || article.title}
                         </span>
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
      {selectedArticle && (() => {
        const currentIndex = filteredArticles.findIndex(a => a.id === selectedArticle.id);
        const handlePrev = currentIndex > 0 ? () => setSelectedArticle(filteredArticles[currentIndex - 1]) : undefined;
        const handleNext = currentIndex < filteredArticles.length - 1 ? () => setSelectedArticle(filteredArticles[currentIndex + 1]) : undefined;

        return (
          <RSSArticleReader
            article={selectedArticle}
            onClose={() => {
              setSelectedArticle(null);
              if (!selectedArticle.is_read) {
                markArticleRead(selectedArticle.id).catch(console.error);
              }
            }}
            feedName={feeds.find(f => f.id === selectedArticle.feed_id)?.title ?? undefined}
            onNext={handleNext}
            onPrev={handlePrev}
          />
        );
      })()}
    </div>
  );
};
