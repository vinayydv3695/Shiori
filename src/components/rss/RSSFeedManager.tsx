import React, { useEffect, useState } from 'react';
import { useRssStore, RssFeed } from '../../store/rssStore';
import { Plus, Trash2, Edit2, RefreshCw, Power, Clock, AlertCircle, BookOpen, Rss, X, ArrowLeft, Search } from 'lucide-react';
import { useToast } from '@/store/toastStore';
import { openExternal } from '@/lib/externalLinks';
import { cn } from '@/lib/utils';

import { DISCOVER_FEEDS } from './DiscoverFeeds';

interface AddFeedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (url: string, checkIntervalHours?: number) => Promise<void>;
}

const AddFeedDialog: React.FC<AddFeedDialogProps> = ({ isOpen, onClose, onAdd }) => {
  const [activeTab, setActiveTab] = useState<'custom' | 'discover'>('discover');
  const [url, setUrl] = useState('');
  const [checkInterval, setCheckInterval] = useState(6);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [addingAllProgress, setAddingAllProgress] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          normalizedUrl = 'https://' + normalizedUrl;
      }
      try {
        new URL(normalizedUrl);
      } catch {
        throw new Error('Please enter a valid URL');
      }

      await onAdd(normalizedUrl, checkInterval);
      setUrl('');
      setCheckInterval(6);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAllDiscoverFeeds = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const allFeeds = DISCOVER_FEEDS.flatMap(cat => cat.feeds);
      const filtered = allFeeds.filter(feed => 
        feed.title.toLowerCase().includes(discoverSearch.toLowerCase()) || 
        feed.description.toLowerCase().includes(discoverSearch.toLowerCase())
      );

      for (let i = 0; i < filtered.length; i++) {
        setAddingAllProgress(`Adding feed ${i + 1} of ${filtered.length}: ${filtered[i].title}...`);
        try {
          await onAdd(filtered[i].url, 6);
        } catch (e) {
          // Ignore individual duplicate/failed feeds during bulk add
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
      setAddingAllProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in-0 duration-200">
      <div className="bg-background border border-border/80 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] duration-200 animate-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50 bg-secondary/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
              <Rss className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight leading-none">
                Add RSS Feed
              </h2>
              <p className="text-xs text-muted-foreground font-medium mt-1">
                Discover popular feeds or add a custom URL
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Control */}
        <div className="p-2 bg-secondary/30 border-b border-border/50 flex items-center gap-1 shrink-0">
          <button
            type="button"
            className={cn(
              "flex-1 py-2 px-4 text-xs font-extrabold rounded-xl transition-all outline-none",
              activeTab === 'discover'
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            )}
            onClick={() => setActiveTab('discover')}
          >
            Discover Feeds
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 py-2 px-4 text-xs font-extrabold rounded-xl transition-all outline-none",
              activeTab === 'custom'
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            )}
            onClick={() => setActiveTab('custom')}
          >
            Custom Feed URL
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {activeTab === 'custom' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-extrabold text-foreground uppercase tracking-wider mb-2">
                  Feed URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="w-full px-4 py-2.5 text-xs font-extrabold bg-secondary/40 border border-border/60 rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none transition-all"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-foreground uppercase tracking-wider mb-2">
                  Check Interval (hours)
                </label>
                <input
                  type="number"
                  value={checkInterval}
                  onChange={(e) => setCheckInterval(parseInt(e.target.value))}
                  min="1"
                  max="168"
                  className="w-full px-4 py-2.5 text-xs font-extrabold bg-secondary/40 border border-border/60 rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none transition-all"
                />
                <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                  How often to automatically poll for new articles (1-168 hours)
                </p>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs font-bold text-destructive">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-border/40">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 text-xs font-extrabold text-foreground bg-secondary/50 border border-border/50 rounded-xl hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !url}
                  className="flex-1 px-4 py-2.5 text-xs font-extrabold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-primary/20"
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
          ) : (
            <div className="space-y-6">
              {/* Discover Search & Add All Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1 group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Search discover feeds..."
                    value={discoverSearch}
                    onChange={(e) => setDiscoverSearch(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs font-bold bg-secondary/40 border border-border/60 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl outline-none transition-all"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddAllDiscoverFeeds}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 text-xs font-extrabold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl shadow-md shadow-primary/20 flex items-center justify-center gap-2 transition-all shrink-0 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      Add All Feeds
                    </>
                  )}
                </button>
              </div>

              {addingAllProgress && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs font-bold text-primary flex items-center gap-2 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{addingAllProgress}</span>
                </div>
              )}

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs font-bold text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-6">
                {DISCOVER_FEEDS.map((category) => {
                  const filteredFeeds = category.feeds.filter(feed => 
                    feed.title.toLowerCase().includes(discoverSearch.toLowerCase()) || 
                    feed.description.toLowerCase().includes(discoverSearch.toLowerCase())
                  );
                  
                  if (filteredFeeds.length === 0) return null;

                  return (
                    <div key={category.category} className="space-y-3">
                      <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                        <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest">{category.category}</h3>
                        <button
                          type="button"
                          onClick={async () => {
                            setIsSubmitting(true);
                            setError(null);
                            try {
                              for (const f of filteredFeeds) {
                                try { await onAdd(f.url, 6); } catch (e) {}
                              }
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          disabled={isSubmitting}
                          className="text-[10px] font-extrabold text-primary hover:underline"
                        >
                          + Add Category
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {filteredFeeds.map((feed) => (
                          <div key={feed.url} className="p-4 border border-border/60 rounded-2xl bg-secondary/15 hover:bg-secondary/35 hover:border-primary/40 transition-all flex flex-col justify-between h-full gap-3 shadow-xs">
                            <div>
                              <h4 className="font-extrabold text-xs text-foreground mb-1 line-clamp-1">{feed.title}</h4>
                              <p className="text-[11px] font-medium text-muted-foreground leading-relaxed line-clamp-2">{feed.description}</p>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  setIsSubmitting(true);
                                  setError(null);
                                  await onAdd(feed.url, 6);
                                  onClose();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : String(err));
                                } finally {
                                  setIsSubmitting(false);
                                }
                              }}
                              disabled={isSubmitting}
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-all border border-primary/20"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Feed
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in-0 duration-200">
      <div className="bg-background border border-border/80 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col duration-200 animate-in zoom-in-95">
        <div className="px-6 py-4 border-b border-border/50 bg-secondary/20 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-foreground">
            Edit Feed Settings
          </h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-extrabold text-foreground uppercase tracking-wider mb-2">
              Feed Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 text-xs font-extrabold bg-secondary/40 border border-border/60 rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none transition-all"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-foreground uppercase tracking-wider mb-2">
              Check Interval (hours)
            </label>
            <input
              type="number"
              value={checkInterval}
              onChange={(e) => setCheckInterval(parseInt(e.target.value))}
              min="1"
              max="168"
              className="w-full px-4 py-2.5 text-xs font-extrabold bg-secondary/40 border border-border/60 rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none transition-all"
            />
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs font-bold text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 text-xs font-extrabold text-foreground bg-secondary/50 border border-border/50 rounded-xl hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title}
              className="flex-1 px-4 py-2.5 text-xs font-extrabold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-primary/20"
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
  const feeds = useRssStore(state => state.feeds);
  const isLoading = useRssStore(state => state.isLoading);
  const loadFeeds = useRssStore(state => state.loadFeeds);
  const addFeed = useRssStore(state => state.addFeed);
  const updateFeed = useRssStore(state => state.updateFeed);
  const deleteFeed = useRssStore(state => state.deleteFeed);
  const toggleFeed = useRssStore(state => state.toggleFeed);
  const updateAllFeeds = useRssStore(state => state.updateAllFeeds);
  const updateFeedArticles = useRssStore(state => state.updateFeedArticles);
  const generateDailyEpub = useRssStore(state => state.generateDailyEpub);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingFeed, setEditingFeed] = useState<typeof feeds[0] | null>(null);
  const [deletingFeedId, setDeletingFeedId] = useState<number | null>(null);
  const [updatingFeedIds, setUpdatingFeedIds] = useState<Set<number>>(new Set());
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [isGeneratingEpub, setIsGeneratingEpub] = useState(false);
  const toast = useToast();

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
      toast.success('Daily EPUB generated successfully!');
    } catch (error) {
      toast.error(`Failed to generate EPUB: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header Bar */}
      <div className="flex-none px-4 sm:px-6 py-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:pt-4 border-b border-border/50 bg-background/95 backdrop-blur-xl flex flex-col gap-3.5 shadow-xs z-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          <div className="flex items-center justify-between min-w-0">
            {onClose && (
              <button
                onClick={onClose}
                className="flex md:hidden items-center justify-center w-8 h-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40 transition-colors shrink-0 mr-2"
                title="Back to articles"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
                <Rss className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight leading-none">
                    RSS Feed Library
                  </h1>
                  <span className="px-2.5 py-0.5 text-[10px] font-extrabold bg-secondary border border-border/50 text-foreground rounded-full shrink-0">
                    {feeds.length} feeds
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-semibold mt-1">
                  Manage external subscriptions, auto-sync intervals, and EPUB digests
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            <button
              onClick={() => setShowAddDialog(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-extrabold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Feed
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="hidden md:flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40 transition-colors shrink-0"
                title="Back to articles"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {onClose && (
            <button
              onClick={onClose}
              className="shrink-0 flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-extrabold text-primary bg-primary/12 border border-primary/25 rounded-xl hover:bg-primary/20 transition-all"
            >
              <BookOpen className="w-3.5 h-3.5" />
              View Articles
            </button>
          )}
          <button
            onClick={handleUpdateAll}
            disabled={isUpdatingAll || feeds.length === 0}
            className="shrink-0 flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-extrabold text-foreground bg-secondary/50 border border-border/50 rounded-xl hover:bg-secondary transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingAll ? 'animate-spin text-primary' : ''}`} />
            Update All
          </button>
          <button
            onClick={handleGenerateDailyEpub}
            disabled={isGeneratingEpub || feeds.length === 0}
            className="shrink-0 flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-extrabold text-foreground bg-secondary/50 border border-border/50 rounded-xl hover:bg-secondary transition-all disabled:opacity-40"
          >
            <BookOpen className={`w-3.5 h-3.5 ${isGeneratingEpub ? 'animate-pulse text-primary' : ''}`} />
            Generate Daily EPUB
          </button>
        </div>
      </div>

      {/* Feed List Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : feeds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-3 text-center">
            <div className="w-16 h-16 rounded-3xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500 shadow-inner">
              <Rss className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-foreground">No RSS feeds yet</h3>
              <p className="text-xs text-muted-foreground mt-1">Click Add Feed above to discover or subscribe to news feeds.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="bg-card border border-border/70 rounded-3xl p-5 hover:border-primary/50 hover:shadow-xl transition-all duration-300 flex flex-col justify-between gap-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-extrabold text-foreground truncate mb-1">
                      {feed.title}
                    </h3>
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => { e.preventDefault(); void openExternal(feed.url); }}
                      className="text-xs text-primary/80 hover:text-primary hover:underline truncate block font-medium"
                    >
                      {feed.url}
                    </a>
                  </div>
                  <button
                    onClick={() => handleToggleFeed(feed.id)}
                    className={cn(
                      "p-2 rounded-xl transition-all border shrink-0",
                      feed.is_active
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/25'
                        : 'bg-secondary text-muted-foreground border-border/50'
                    )}
                    title={feed.is_active ? 'Active (Click to pause)' : 'Paused (Click to activate)'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/50 border border-border/40 text-foreground">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span>Every {feed.check_interval_hours}h</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/50 border border-border/40 text-foreground">
                    <Rss className="w-3.5 h-3.5 text-primary" />
                    <span>Active Feed</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground border-t border-border/40 pt-3 mt-1">
                  <span>Last checked: {formatLastChecked(feed.last_checked)}</span>
                  {feed.failure_count > 0 && (
                    <span className="flex items-center gap-1 text-destructive font-bold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {feed.failure_count} failures
                    </span>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleUpdateFeedNow(feed.id)}
                    disabled={updatingFeedIds.has(feed.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-extrabold text-foreground bg-secondary/50 hover:bg-secondary border border-border/50 rounded-xl transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${updatingFeedIds.has(feed.id) ? 'animate-spin text-primary' : ''}`} />
                    Update
                  </button>
                  <button
                    onClick={() => handleEditFeed(feed)}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40 rounded-xl transition-all"
                    title="Edit Feed"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteFeed(feed.id)}
                    disabled={deletingFeedId === feed.id}
                    className="p-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 border border-border/40 rounded-xl transition-all disabled:opacity-50"
                    title="Delete Feed"
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
