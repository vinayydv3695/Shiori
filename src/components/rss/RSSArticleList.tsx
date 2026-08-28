import React, { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, Filter, BookOpen, Check, ChevronDown, Search, Settings, Plus, Rss } from 'lucide-react';
import { useRssStore, type RssArticle } from '@/store/rssStore';
import { logger } from '@/lib/logger';
import { RSSArticleReader } from './RSSArticleReader';
import { extractFirstImage, stripHtmlTags, getFeedGradient } from '@/lib/rssUtils';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/store/uiStore';
import { open } from '@tauri-apps/plugin-shell';

import { FeedFavicon } from './FeedFavicon';

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
  const openAddDialog = useRssStore((s) => s.openAddDialog);

  const handleOpenAdd = () => {
    openAddDialog();
    setView('rss-feeds');
  };

  useEffect(() => {
    loadArticles(selectedFeedId || undefined, limit);
  }, [selectedFeedId, limit, loadArticles]);

  const selectedFeed = selectedFeedId ? feeds.find(f => f.id === selectedFeedId) : null;
  const activeFeedName = selectedFeed ? selectedFeed.title : 'All Feeds';
  const activeFeedUrl = selectedFeed ? selectedFeed.url : null;

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
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header Controls Bar */}
      <div 
        className="flex-none px-4 sm:px-6 pb-2.5 sm:pb-3 border-b border-border/50 bg-background/95 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs z-20"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)' }}
      >
        
        {/* Row 1 on Mobile / Left Side on Desktop: Feed Selector + Primary Quick Actions */}
        <div className="flex items-center justify-between md:justify-start gap-2.5 w-full md:w-auto">
          {/* Feed Selector Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 text-xs font-extrabold bg-secondary/50 hover:bg-secondary border border-border/50 text-foreground rounded-xl transition-all max-w-[200px] sm:max-w-[260px] shrink-0 outline-none active:scale-95">
                <FeedFavicon key={selectedFeedId ?? 'all'} url={activeFeedUrl} title={activeFeedName} className="w-5 h-5" iconClassName="w-3 h-3" />
                <span className="truncate">{activeFeedName}</span>
                <ChevronDown size={14} className="opacity-60 shrink-0 ml-auto" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60 max-h-[320px] overflow-y-auto custom-scrollbar p-1 rounded-2xl bg-background border-border/80 shadow-2xl z-[110]">
              <DropdownMenuItem onClick={() => setSelectedFeedId(null)} className="font-extrabold text-xs py-2 rounded-xl cursor-pointer flex items-center gap-2.5">
                <FeedFavicon url={null} title="All Feeds" className="w-4 h-4" iconClassName="w-2.5 h-2.5" />
                <span>All Feeds</span>
              </DropdownMenuItem>
              {feeds.map(feed => (
                <DropdownMenuItem key={feed.id} onClick={() => setSelectedFeedId(feed.id)} className="text-xs font-bold py-2 rounded-xl cursor-pointer flex items-center gap-2.5">
                  <FeedFavicon url={feed.url} title={feed.title} className="w-4 h-4" iconClassName="w-2.5 h-2.5" />
                  <div className="truncate flex-1">{feed.title}</div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Action Shortcuts (Refresh + Manage Feeds + Mark All Read) */}
          <div className="flex items-center gap-1.5 md:hidden">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 text-muted-foreground hover:text-foreground bg-secondary/50 border border-border/40 rounded-xl transition-all disabled:opacity-50 active:scale-95"
              title="Refresh articles"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin text-primary" : ""} />
            </button>
            <button
              onClick={() => setView('rss-feeds')}
              className="p-2 text-muted-foreground hover:text-foreground bg-secondary/50 border border-border/40 rounded-xl transition-all active:scale-95"
              title="Manage Feeds"
            >
              <Settings size={15} />
            </button>
            <button
              onClick={handleMarkAllRead}
              disabled={isLoading || filteredArticles.filter(a => !a.is_read).length === 0}
              className="p-2 text-primary bg-primary/15 border border-primary/30 rounded-xl transition-all disabled:opacity-40 active:scale-95"
              title="Mark All Read"
            >
              <Check size={15} />
            </button>
          </div>
        </div>

        {/* Search & Secondary Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0 md:w-56 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 sm:py-2 text-xs font-bold bg-secondary/40 border border-border/50 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl outline-none transition-all placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Filter Pills & Limit Selector */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            {/* Unread Only Toggle */}
            <button
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs font-extrabold rounded-xl transition-all shrink-0 active:scale-95",
                showUnreadOnly 
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' 
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground border border-border/40 hover:bg-secondary'
              )}
            >
              <Filter size={13} />
              <span>Unread</span>
            </button>

            {/* Items Limit Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs font-extrabold bg-secondary/50 hover:bg-secondary border border-border/50 text-foreground rounded-xl px-3 py-1.5 sm:py-2 focus:outline-none transition-all shrink-0 active:scale-95">
                  <span>{limit} Items</span>
                  <ChevronDown size={13} className="opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36 bg-background border-border/80 shadow-2xl p-1 rounded-2xl z-[110]">
                {[50, 100, 200, 500].map(val => (
                  <DropdownMenuItem 
                    key={val}
                    onClick={() => setLimit(val)}
                    className="cursor-pointer text-xs font-extrabold py-2 rounded-xl"
                  >
                    {val} Items
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Desktop-only Refresh, Manage Feeds, and Mark All Read buttons */}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary border border-border/40 rounded-xl transition-all shrink-0 disabled:opacity-50 active:scale-95"
              title="Refresh articles"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin text-primary" : ""} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setView('rss-feeds')}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary border border-border/40 rounded-xl transition-all shrink-0 active:scale-95"
            >
              <Settings size={13} />
              <span>Manage Feeds</span>
            </button>

            <button
              onClick={handleMarkAllRead}
              disabled={isLoading || filteredArticles.filter(a => !a.is_read).length === 0}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold text-primary bg-primary/15 hover:bg-primary/25 border border-primary/30 rounded-xl transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:scale-95"
            >
              <Check size={13} />
              <span>Mark All Read</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 mx-4 mt-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl text-xs font-bold flex items-center gap-2">
          {error}
        </div>
      )}

      {/* Article Grid Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 pb-28 sm:pb-6">
        {articles.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[55vh] text-muted-foreground space-y-5 text-center px-4 my-auto">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shadow-lg shadow-primary/10 animate-in zoom-in-95 duration-200">
              <Rss size={38} className="text-primary" />
            </div>
            <div className="max-w-sm space-y-1.5">
              <h3 className="text-lg font-extrabold text-foreground tracking-tight">No RSS Feeds or Articles Found</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                You haven't subscribed to any RSS feeds yet, or no articles have been fetched. Discover popular feeds or add custom URLs to start reading!
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={handleOpenAdd}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-extrabold text-primary-foreground bg-primary hover:bg-primary/90 rounded-2xl transition-all shadow-md shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <Plus size={16} />
                <span>Add Feeds</span>
              </button>
              <button
                onClick={() => setView('rss-feeds')}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-extrabold text-foreground bg-secondary/60 hover:bg-secondary border border-border/60 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <Settings size={15} />
                <span>Manage Subscriptions</span>
              </button>
            </div>
          </div>
        ) : filteredArticles.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[55vh] text-muted-foreground space-y-5 text-center px-4 my-auto">
            <div className="w-20 h-20 rounded-3xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
              <Check size={38} />
            </div>
            <div className="max-w-sm space-y-1.5">
              <h3 className="text-lg font-extrabold text-foreground tracking-tight">You're all caught up!</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">No unread articles matching your current filter.</p>
            </div>
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-extrabold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Plus size={16} />
              <span>Add More Feeds</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredArticles.map((article) => {
              const feed = feeds.find(f => f.id === article.feed_id);
              const thumbnail = extractFirstImage(article.content) || extractFirstImage(article.summary || '');
              const snippet = stripHtmlTags(article.summary || article.content);

              return (
                <div
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  className={cn(
                    "group relative flex flex-col bg-card border rounded-3xl overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300",
                    article.is_read 
                      ? 'opacity-70 border-border/40 hover:opacity-100 hover:border-primary/40' 
                      : 'border-border/70 shadow-sm hover:border-primary/50'
                  )}
                >
                  {/* Thumbnail / Header Banner */}
                  <div className="h-44 w-full bg-secondary/30 relative flex-shrink-0 overflow-hidden border-b border-border/40">
                    {thumbnail ? (
                      <img 
                        src={thumbnail} 
                        alt="" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div 
                        className="w-full h-full flex flex-col items-center justify-center text-white p-6 relative overflow-hidden"
                        style={{ background: getFeedGradient(feed?.title || article.title || 'RSS') }}
                      >
                        <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
                        {(article.url || feed?.url) && (
                          <img 
                            src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(article.url || feed!.url)}&size=128`}
                            alt=""
                            className="w-12 h-12 rounded-2xl mb-2 shadow-lg bg-white/20 p-2 backdrop-blur-md relative z-10"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <span className="font-extrabold text-center drop-shadow-md line-clamp-2 text-xs tracking-tight text-white/90 relative z-10">
                          {feed?.title || article.title}
                        </span>
                      </div>
                    )}
                    
                    {/* Glowing Unread Indicator Badge */}
                    {!article.is_read && (
                      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold tracking-wider uppercase shadow-lg shadow-primary/30 flex items-center gap-1.5 z-10 border border-primary-foreground/20">
                        <span className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
                        Unread
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-4 sm:p-5 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-2 text-[11px] font-bold text-muted-foreground">
                      <span className="truncate max-w-[130px] bg-secondary/60 px-2.5 py-0.5 rounded-lg border border-border/50 text-foreground">
                        {feed?.title || 'Feed'}
                      </span>
                      <span>•</span>
                      <span>{formatDate(article.published)}</span>
                    </div>
                    
                    <h3 className={cn(
                      "text-sm text-foreground line-clamp-2 mb-2 leading-snug group-hover:text-primary transition-colors tracking-tight",
                      article.is_read ? 'font-medium opacity-80' : 'font-extrabold'
                    )}>
                      {article.title}
                    </h3>

                    {snippet && (
                      <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed font-medium mb-3">
                        {snippet}
                      </p>
                    )}
                    
                    {/* Footer Actions Bar */}
                    <div className="mt-auto pt-3 flex items-center justify-between text-muted-foreground border-t border-border/40">
                      {!article.is_read ? (
                        <button
                          onClick={(e) => handleMarkRead(e, article.id)}
                          className="flex items-center gap-1.5 text-xs font-bold hover:text-primary transition-colors"
                        >
                          <Check size={14} />
                          Mark read
                        </button>
                      ) : (
                        <span className="text-xs font-semibold flex items-center gap-1.5 opacity-50">
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
                          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline transition-colors ml-auto"
                        >
                          Open <ExternalLink size={13} />
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
