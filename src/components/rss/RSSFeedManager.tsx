import React, { useEffect, useState } from 'react';
import { useRssStore, RssFeed } from '../../store/rssStore';
import { Plus, Trash2, Edit2, RefreshCw, Power, Clock, AlertCircle, BookOpen, Rss, X } from 'lucide-react';

interface AddFeedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (url: string, checkIntervalHours?: number) => Promise<void>;
}

const AddFeedDialog: React.FC<AddFeedDialogProps> = ({ isOpen, onClose, onAdd }) => {
  const [url, setUrl] = useState('');
  const [checkInterval, setCheckInterval] = useState(6);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Basic URL validation
      try {
        new URL(url);
      } catch {
        throw new Error('Please enter a valid URL');
      }

      await onAdd(url, checkInterval);
      setUrl('');
      setCheckInterval(6);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Add RSS Feed
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Feed URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Check Interval (hours)
            </label>
            <input
              type="number"
              value={checkInterval}
              onChange={(e) => setCheckInterval(parseInt(e.target.value))}
              min="1"
              max="168"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              How often to check for new articles (1-168 hours)
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !url}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Feed'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface EditFeedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  feed: RssFeed | null;
  onUpdate: (feedId: number, title: string, checkIntervalHours: number) => Promise<void>;
}

const EditFeedDialog: React.FC<EditFeedDialogProps> = ({ isOpen, onClose, feed, onUpdate }) => {
  const [title, setTitle] = useState('');
  const [checkInterval, setCheckInterval] = useState(6);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (feed) {
      setTitle(feed.title || 'Untitled Feed');
      setCheckInterval(feed.check_interval_hours);
    }
  }, [feed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feed) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await onUpdate(feed.id, title, checkInterval);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !feed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Edit Feed
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Feed Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Check Interval (hours)
            </label>
            <input
              type="number"
              value={checkInterval}
              onChange={(e) => setCheckInterval(parseInt(e.target.value))}
              min="1"
              max="168"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Feed'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const RSSFeedManager: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { feeds, isLoading, loadFeeds, addFeed, updateFeed, deleteFeed, toggleFeed, updateAllFeeds, updateFeedArticles, generateDailyEpub } = useRssStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingFeed, setEditingFeed] = useState<typeof feeds[0] | null>(null);
  const [deletingFeedId, setDeletingFeedId] = useState<number | null>(null);
  const [updatingFeedIds, setUpdatingFeedIds] = useState<Set<number>>(new Set());
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [isGeneratingEpub, setIsGeneratingEpub] = useState(false);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const handleAddFeed = async (url: string, checkIntervalHours?: number) => {
    await addFeed(url, checkIntervalHours);
  };

  const handleUpdateFeed = async (feedId: number, title: string, checkIntervalHours: number) => {
    await updateFeed(feedId, title, checkIntervalHours);
  };

  const handleDeleteFeed = async (feedId: number) => {
    if (confirm('Are you sure you want to delete this feed?')) {
      setDeletingFeedId(feedId);
      try {
        await deleteFeed(feedId);
      } finally {
        setDeletingFeedId(null);
      }
    }
  };

  const handleToggleFeed = async (feedId: number) => {
    await toggleFeed(feedId);
  };

  const handleUpdateFeedNow = async (feedId: number) => {
    setUpdatingFeedIds(prev => new Set(prev).add(feedId));
    try {
      await updateFeedArticles(feedId);
    } finally {
      setUpdatingFeedIds(prev => {
        const next = new Set(prev);
        next.delete(feedId);
        return next;
      });
    }
  };

  const handleUpdateAll = async () => {
    setIsUpdatingAll(true);
    try {
      await updateAllFeeds();
    } finally {
      setIsUpdatingAll(false);
    }
  };

  const handleGenerateDailyEpub = async () => {
    setIsGeneratingEpub(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await generateDailyEpub({
        title: `Daily Digest - ${today}`,
        maxArticles: 50,
      });
      alert('Daily EPUB generated successfully!');
    } catch (error) {
      alert(`Failed to generate EPUB: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingEpub(false);
    }
  };

  const handleEditFeed = (feed: typeof feeds[0]) => {
    setEditingFeed(feed);
    setShowEditDialog(true);
  };

  const formatLastChecked = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="bg-surface-1 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Rss className="w-6 h-6 text-orange-500" />
            <h1 className="text-2xl font-bold text-foreground">
              RSS Feeds
            </h1>
            <span className="px-2 py-1 text-xs font-medium bg-muted text-muted-foreground rounded-full">
              {feeds.length} feeds
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/85 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Feed
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

        {/* Actions Bar */}
        <div className="flex gap-3">
          <button
            onClick={handleUpdateAll}
            disabled={isUpdatingAll || feeds.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-muted border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${isUpdatingAll ? 'animate-spin' : ''}`} />
            Update All
          </button>
          <button
            onClick={handleGenerateDailyEpub}
            disabled={isGeneratingEpub || feeds.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-muted border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BookOpen className={`w-4 h-4 ${isGeneratingEpub ? 'animate-pulse' : ''}`} />
            Generate Daily EPUB
          </button>
        </div>
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : feeds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Rss className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium mb-2">No RSS feeds yet</p>
            <p className="text-sm">Add your first feed to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="bg-surface-1 border border-border rounded-lg p-4 hover:shadow-md hover:border-border/60 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-foreground truncate mb-1">
                      {feed.title}
                    </h3>
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary/70 hover:text-primary hover:underline truncate block"
                    >
                      {feed.url}
                    </a>
                  </div>
                  <button
                    onClick={() => handleToggleFeed(feed.id)}
                    className={`p-2 rounded-lg transition-colors ${feed.is_active
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                      : 'bg-muted text-muted-foreground'
                      }`}
                    title={feed.is_active ? 'Active' : 'Inactive'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>Every {feed.check_interval_hours}h</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Rss className="w-4 h-4" />
                    <span>Articles</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                  <span>Last checked: {formatLastChecked(feed.last_checked)}</span>
                  {feed.failure_count > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="w-3 h-3" />
                      {feed.failure_count} failures
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateFeedNow(feed.id)}
                    disabled={updatingFeedIds.has(feed.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${updatingFeedIds.has(feed.id) ? 'animate-spin' : ''}`} />
                    Update
                  </button>
                  <button
                    onClick={() => handleEditFeed(feed)}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteFeed(feed.id)}
                    disabled={deletingFeedId === feed.id}
                    className="p-2 text-destructive hover:text-destructive-foreground hover:bg-destructive rounded-lg transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AddFeedDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdd={handleAddFeed}
      />
      <EditFeedDialog
        isOpen={showEditDialog}
        onClose={() => {
          setShowEditDialog(false);
          setEditingFeed(null);
        }}
        feed={editingFeed}
        onUpdate={handleUpdateFeed}
      />
    </div>
  );
};

export default RSSFeedManager;
