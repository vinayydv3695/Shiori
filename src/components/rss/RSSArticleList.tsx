import React, { useEffect, useState } from 'react';
import { sanitizeArticleHTML } from '@/lib/sanitize';
import { useRssStore } from '../../store/rssStore';
import { logger } from '@/lib/logger';
import { BookOpen, ExternalLink, Check, RefreshCw, Eye, EyeOff, X } from 'lucide-react';

interface RSSArticleListProps {
  feedId?: number | null;
  onClose?: () => void;
}

const RSSArticleList: React.FC<RSSArticleListProps> = ({ feedId = null, onClose }) => {
  const articles = useRssStore(state => state.articles);
  const feeds = useRssStore(state => state.feeds);
  const selectedFeedId = useRssStore(state => state.selectedFeedId);
  const isLoading = useRssStore(state => state.isLoading);
  const loadArticles = useRssStore(state => state.loadArticles);
  const markArticleRead = useRssStore(state => state.markArticleRead);
  const setSelectedFeed = useRssStore(state => state.setSelectedFeed);
  const [limit, setLimit] = useState(25);
  const [expandedArticleId, setExpandedArticleId] = useState<number | null>(null);
  const [showRead, setShowRead] = useState(false);

  // Use passed feedId or selectedFeedId from store
  const activeFeedId = feedId !== undefined ? feedId : selectedFeedId;

  useEffect(() => {
    loadArticles(activeFeedId || undefined, limit);
  }, [activeFeedId, limit, loadArticles]);

  const handleMarkRead = async (articleId: number) => {
    try {
      await markArticleRead(articleId);
      // Reload articles to reflect changes
      await loadArticles(activeFeedId || undefined, limit);
    } catch (error) {
      logger.error('Failed to mark article as read:', error);
    }
  };

  const handleToggleExpand = (articleId: number) => {
    setExpandedArticleId(expandedArticleId === articleId ? null : articleId);
  };

  const handleFeedSelect = (newFeedId: number | null) => {
    setSelectedFeed(newFeedId);
  };

  const handleRefresh = () => {
    loadArticles(activeFeedId || undefined, limit);
  };

  // Filter articles based on showRead toggle
  const filteredArticles = showRead
    ? articles
    : articles.filter(article => !article.is_read);

  // Get feed name for display
  const getFeedName = (feedId: number) => {
    const feed = feeds.find(f => f.id === feedId);
    return feed?.title || feed?.url || 'Unknown Feed';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const sanitizeHTML = sanitizeArticleHTML;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="bg-surface-1 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">
              RSS Articles
            </h1>
            <span className="px-2 py-1 text-xs font-medium bg-muted text-muted-foreground rounded-full">
              {filteredArticles.length} articles
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRead(!showRead)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${showRead
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
            >
              {showRead ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {showRead ? 'All' : 'Unread Only'}
            </button>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Back to library"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Feed Filter & Limit */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <select
              value={activeFeedId || 'all'}
              onChange={(e) => handleFeedSelect(e.target.value === 'all' ? null : parseInt(e.target.value))}
              className="w-full px-4 py-2 text-sm border border-border/60 rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
            >
              <option value="all">All Feeds</option>
              {feeds.map(feed => (
                <option key={feed.id} value={feed.id}>
                  {feed.title || feed.url}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="px-4 py-2 text-sm border border-border/60 rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
            >
              <option value={10}>10 articles</option>
              <option value={25}>25 articles</option>
              <option value={50}>50 articles</option>
              <option value={100}>100 articles</option>
            </select>
          </div>
        </div>
      </div>

      {/* Article List */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <BookOpen className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium mb-2">No articles found</p>
            <p className="text-sm">
              {showRead ? 'No articles available' : 'No unread articles'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredArticles.map((article) => {
              const isExpanded = expandedArticleId === article.id;
              return (
                <div
                  key={article.id}
                  className={`bg-surface-1 border rounded-lg transition-all ${article.is_read
                      ? 'border-border/40 opacity-60'
                      : 'border-primary/30 shadow-sm'
                    }`}
                >
                  {/* Article Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                    onClick={() => handleToggleExpand(article.id)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className={`text-lg font-semibold flex-1 ${article.is_read
                          ? 'text-muted-foreground'
                          : 'text-foreground'
                        }`}>
                        {article.title}
                      </h3>
                      {!article.is_read && (
                        <span className="px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full whitespace-nowrap">
                          NEW
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                      {article.author && (
                        <span className="font-medium">{article.author}</span>
                      )}
                      <span>{formatDate(article.published)}</span>
                      <span className="text-xs text-muted-foreground/80">
                        {getFeedName(article.feed_id)}
                      </span>
                    </div>

                    {/* Summary Preview */}
                    {article.summary && !isExpanded && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {article.summary}
                      </p>
                    )}
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-border">
                      <div
                        className="p-4 prose prose-sm dark:prose-invert max-w-none text-foreground"
                        dangerouslySetInnerHTML={{ __html: sanitizeHTML(article.content) }}
                      />

                      {/* Actions */}
                      <div className="px-4 pb-4 flex items-center gap-3">
                        {!article.is_read && (
                          <button
                            onClick={() => handleMarkRead(article.id)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                            Mark as Read
                          </button>
                        )}
                        {article.url && (
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-secondary/50 rounded-lg hover:bg-secondary transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Open Original
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RSSArticleList;
