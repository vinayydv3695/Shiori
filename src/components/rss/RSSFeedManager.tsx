import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useRssStore, RssFeed, formatErrorMessage } from '../../store/rssStore';
import { Plus, Trash2, Edit2, RefreshCw, Power, Clock, AlertCircle, BookOpen, Rss, X, ArrowLeft, Search, ExternalLink, Globe, Users } from 'lucide-react';
import { FeedFavicon } from './FeedFavicon';
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

  interface DiscoveredOnlineFeed {
    title: string;
    description?: string;
    url: string;
    website?: string;
    visual_url?: string;
    subscribers?: number;
  }

  const [onlineResults, setOnlineResults] = useState<DiscoveredOnlineFeed[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  useEffect(() => {
    if (!discoverSearch.trim() || discoverSearch.trim().length < 2) {
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingOnline(true);
      try {
        const results = await invoke<DiscoveredOnlineFeed[]>('search_online_rss_feeds', {
          query: discoverSearch.trim(),
          count: 30,
        });
        setOnlineResults(results);
      } catch (err) {
        console.warn('Online RSS search failed:', err);
      } finally {
        setIsSearchingOnline(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [discoverSearch]);

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
      setError(formatErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const addFeedsBatch = useRssStore(state => state.addFeedsBatch);

  const handleAddAllDiscoverFeeds = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      let allFeeds = DISCOVER_FEEDS.flatMap(cat => cat.feeds);
      if (selectedCategory !== 'all') {
        const found = DISCOVER_FEEDS.find(c => c.category === selectedCategory);
        if (found) allFeeds = found.feeds;
      }
      const filtered = allFeeds.filter(feed => 
        feed.title.toLowerCase().includes(discoverSearch.toLowerCase()) || 
        feed.description.toLowerCase().includes(discoverSearch.toLowerCase())
      );

      const urls = filtered.map(f => f.url);
      setAddingAllProgress(`Adding ${urls.length} feeds in parallel...`);
      await addFeedsBatch(urls, 6);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
      setAddingAllProgress(null);
    }
  };

  if (!isOpen) return null;

  const totalPresetFeedsCount = DISCOVER_FEEDS.reduce((acc, cat) => acc + cat.feeds.length, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/65 backdrop-blur-xl p-3 sm:p-6 animate-in fade-in-0 duration-200">
      <div className="bg-background/95 backdrop-blur-2xl border border-border/80 rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] md:h-[85vh] overflow-hidden flex flex-col duration-200 animate-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50 bg-secondary/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
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
            Discover Feeds ({totalPresetFeedsCount}+)
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
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-6">
          {activeTab === 'custom' ? (
            <form onSubmit={handleSubmit} className="space-y-5 max-w-xl mx-auto py-4">
              <div>
                <label className="block text-xs font-extrabold text-foreground uppercase tracking-wider mb-2">
                  Feed URL or Website Domain
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="e.g. https://example.com or https://example.com/feed.xml"
                  className="w-full px-4 py-3 text-xs font-extrabold bg-secondary/40 border border-border/60 rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none transition-all"
                  required
                  autoFocus
                />
                <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                  Enter any website URL or RSS/Atom XML link. Shiori will auto-discover the feed automatically.
                </p>
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
                  className="w-full px-4 py-3 text-xs font-extrabold bg-secondary/40 border border-border/60 rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none transition-all"
                />
                <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                  How often to automatically poll for new articles (1-168 hours)
                </p>
              </div>

              {error && (
                <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-xl space-y-1.5">
                  <p className="text-xs font-extrabold text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Could not add this feed
                  </p>
                  <p className="text-[11px] font-semibold text-destructive/80 leading-relaxed">{error}</p>
                  {(error.includes('webpage') || error.includes('HTML') || error.includes('removed')) && (
                    <p className="text-[11px] font-medium text-muted-foreground pt-1 border-t border-destructive/15">
                      💡 Try searching for this site in the <button type="button" onClick={() => setActiveTab('discover')} className="underline text-primary font-bold">Discover tab</button>, or find their official feed URL from the site itself.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-border/40">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 text-xs font-extrabold text-foreground bg-secondary/50 border border-border/50 rounded-xl hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !url}
                  className="flex-1 px-4 py-3 text-xs font-extrabold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-primary/20"
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
            <div className="space-y-5">
              {/* Search Bar & Action Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1 group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Search 250+ preset feeds or type any topic to search web..."
                    value={discoverSearch}
                    onChange={(e) => setDiscoverSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 text-xs font-extrabold bg-secondary/40 border border-border/60 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl outline-none transition-all"
                  />
                  {discoverSearch && (
                    <button
                      onClick={() => setDiscoverSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAddAllDiscoverFeeds}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 text-xs font-extrabold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl shadow-md shadow-primary/20 flex items-center justify-center gap-2 transition-all shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      Add All Selected Feeds
                    </>
                  )}
                </button>
              </div>

              {/* Horizontal Category Filter Pills (Desktop Only) */}
              <div className="hidden md:flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 pb-2 border-b border-border/40">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={cn(
                    "px-3 py-1.5 text-[11px] font-extrabold rounded-xl shrink-0 transition-all cursor-pointer border",
                    selectedCategory === 'all'
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-secondary/40 text-muted-foreground border-border/50 hover:bg-secondary hover:text-foreground"
                  )}
                >
                  All Categories ({totalPresetFeedsCount})
                </button>
                {DISCOVER_FEEDS.map((cat) => {
                  const isSelected = selectedCategory === cat.category;
                  return (
                    <button
                      key={cat.category}
                      onClick={() => setSelectedCategory(cat.category)}
                      className={cn(
                        "px-3 py-1.5 text-[11px] font-extrabold rounded-xl shrink-0 transition-all cursor-pointer border flex items-center gap-1.5",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-secondary/40 text-muted-foreground border-border/50 hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <span>{cat.category}</span>
                      <span className="px-1.5 py-0.2 text-[9px] rounded-md bg-black/15 text-current font-black">
                        {cat.feeds.length}
                      </span>
                    </button>
                  );
                })}
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

              {/* Online Global Directory Results (Feedly 40M Feed Search API) */}
              {discoverSearch.trim().length >= 2 && (
                <div className="space-y-3 pb-4 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      <span>Global Feed Directory Search ({onlineResults.length} feeds)</span>
                    </h3>
                    {isSearchingOnline && (
                      <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                        Searching Web...
                      </span>
                    )}
                  </div>

                  {onlineResults.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {onlineResults.map((item) => (
                        <div key={item.url} className="p-4 border border-primary/30 rounded-2xl bg-primary/5 hover:bg-primary/10 transition-all flex flex-col justify-between gap-3 shadow-xs">
                          <div className="flex items-start gap-3">
                            {item.visual_url ? (
                              <img src={item.visual_url} alt={item.title} className="w-10 h-10 rounded-xl object-cover shrink-0 border border-border/50 bg-card" />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 text-primary">
                                <Rss className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <h4 className="font-extrabold text-xs text-foreground truncate leading-tight">{item.title}</h4>
                              {item.description && (
                                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2 text-[10px] font-semibold text-muted-foreground">
                                {item.subscribers && item.subscribers > 0 && (
                                  <span className="flex items-center gap-1 text-primary font-bold">
                                    <Users className="w-3 h-3" />
                                    {item.subscribers.toLocaleString()} readers
                                  </span>
                                )}
                                <span className="truncate">{item.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={async () => {
                              try {
                                setIsSubmitting(true);
                                setError(null);
                                await onAdd(item.url, 6);
                                onClose();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            disabled={isSubmitting}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-xs cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Feed
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : !isSearchingOnline ? (
                    <div className="p-4 rounded-xl bg-secondary/30 text-center text-xs text-muted-foreground">
                      No online feeds found matching "{discoverSearch}". Try another keyword or paste a website URL.
                    </div>
                  ) : null}
                </div>
              )}

              {/* Preset Categories Catalog in 3-Column Grid */}
              <div className="space-y-6">
                {DISCOVER_FEEDS.map((category) => {
                  if (selectedCategory !== 'all' && selectedCategory !== category.category) {
                    return null;
                  }

                  const filteredFeeds = category.feeds.filter(feed => 
                    feed.title.toLowerCase().includes(discoverSearch.toLowerCase()) || 
                    feed.description.toLowerCase().includes(discoverSearch.toLowerCase())
                  );
                  
                  if (filteredFeeds.length === 0) return null;

                  return (
                    <div key={category.category} className="space-y-3.5">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2">
                          <span>{category.category}</span>
                          <span className="px-2 py-0.5 text-[10px] font-extrabold bg-secondary border border-border/50 text-muted-foreground rounded-full">
                            {filteredFeeds.length} feeds
                          </span>
                        </h3>
                        <button
                          type="button"
                          onClick={async () => {
                            setIsSubmitting(true);
                            setError(null);
                            try {
                              const urls = filteredFeeds.map(f => f.url);
                              await addFeedsBatch(urls, 6);
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          disabled={isSubmitting}
                          className="text-xs font-extrabold text-primary hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Category
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-all border border-primary/20 cursor-pointer"
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/65 backdrop-blur-xl p-4 animate-in fade-in-0 duration-200">
      <div className="bg-background/95 backdrop-blur-2xl border border-border/80 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col duration-200 animate-in zoom-in-95">
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
  const storeError = useRssStore(state => state.error);
  const loadFeeds = useRssStore(state => state.loadFeeds);
  const addFeed = useRssStore(state => state.addFeed);
  const updateFeed = useRssStore(state => state.updateFeed);
  const deleteFeed = useRssStore(state => state.deleteFeed);
  const toggleFeed = useRssStore(state => state.toggleFeed);
  const updateAllFeeds = useRssStore(state => state.updateAllFeeds);
  const updateFeedArticles = useRssStore(state => state.updateFeedArticles);
  const generateDailyEpub = useRssStore(state => state.generateDailyEpub);
  const isAddDialogOpen = useRssStore(state => state.isAddDialogOpen);
  const closeAddDialog = useRssStore(state => state.closeAddDialog);
  const openAddDialog = useRssStore(state => state.openAddDialog);
  const [localShowAddDialog, setLocalShowAddDialog] = useState(false);

  const showAddDialog = isAddDialogOpen || localShowAddDialog;
  const handleCloseAddDialog = () => {
    closeAddDialog();
    setLocalShowAddDialog(false);
  };
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingFeed, setEditingFeed] = useState<typeof feeds[0] | null>(null);
  const [deletingFeedId, setDeletingFeedId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
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

  const handleDeleteFeed = (feedId: number) => {
    setPendingDeleteId(feedId);
  };

  const confirmDeleteFeed = async () => {
    if (pendingDeleteId === null) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setDeletingFeedId(id);
    try {
      await deleteFeed(id);
    } finally {
      setDeletingFeedId(null);
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

  const getCleanDomain = (urlStr: string) => {
    try {
      const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return urlStr.replace(/^https?:\/\//, '').split('/')[0];
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header Bar */}
      <div className="flex-none px-4 sm:px-6 py-3.5 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:pt-4 border-b border-border/50 bg-background/95 backdrop-blur-xl flex flex-col gap-3 shadow-xs z-20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {onClose && (
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40 transition-colors shrink-0"
                title="Back to articles"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
              <Rss className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight leading-none truncate">
                  RSS Feed Library
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-secondary border border-border/50 text-foreground rounded-full shrink-0">
                  {feeds.length}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-semibold mt-0.5 truncate hidden xs:block">
                Manage external subscriptions & EPUB digests
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setLocalShowAddDialog(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 shrink-0 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Feed</span>
            </button>
          </div>
        </div>

        {/* Action Controls Toolbar - Single Compact Row */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-primary bg-primary/12 border border-primary/25 rounded-xl hover:bg-primary/20 transition-all cursor-pointer shrink-0 active:scale-95"
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>Articles</span>
            </button>
          )}
          <button
            onClick={handleUpdateAll}
            disabled={isUpdatingAll || feeds.length === 0}
            className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-foreground bg-secondary/50 border border-border/50 rounded-xl hover:bg-secondary transition-all disabled:opacity-40 cursor-pointer shrink-0 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isUpdatingAll ? 'animate-spin text-primary' : ''}`} />
            <span>Sync All</span>
          </button>
          <button
            onClick={handleGenerateDailyEpub}
            disabled={isGeneratingEpub || feeds.length === 0}
            className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-foreground bg-secondary/50 border border-border/50 rounded-xl hover:bg-secondary transition-all disabled:opacity-40 cursor-pointer shrink-0 active:scale-95"
          >
            <BookOpen className={`w-3.5 h-3.5 shrink-0 ${isGeneratingEpub ? 'animate-pulse text-primary' : ''}`} />
            <span>Daily EPUB</span>
          </button>
        </div>
      </div>

      {/* Store Error Alert Banner */}
      {storeError && (
        <div className="mx-4 sm:mx-6 mt-3.5 p-3.5 bg-destructive/10 border border-destructive/25 rounded-2xl text-xs font-semibold text-destructive flex items-center justify-between gap-3 shadow-xs animate-in fade-in-0 duration-200 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
            <span className="truncate">{formatErrorMessage(storeError)}</span>
          </div>
          <button
            onClick={() => useRssStore.setState({ error: null })}
            className="p-1 hover:bg-destructive/20 rounded-lg shrink-0 text-destructive/80 hover:text-destructive transition-colors cursor-pointer"
            title="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Feed List Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 pb-28 sm:pb-6">
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
                className={cn(
                  "group relative border rounded-2xl sm:rounded-3xl p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between gap-3.5 shadow-xs hover:shadow-xl",
                  feed.is_active
                    ? "bg-card/90 border-border/80 hover:border-primary/50"
                    : "bg-card/50 border-border/40 opacity-75 hover:opacity-100 hover:border-border/80"
                )}
              >
                {/* Card Top Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <FeedFavicon url={feed.url} title={feed.title} className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl" iconClassName="w-4 h-4 sm:w-5 sm:h-5" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-extrabold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                        {feed.title}
                      </h3>
                      <a
                        href={feed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => { e.preventDefault(); void openExternal(feed.url); }}
                        className="text-[11px] sm:text-xs text-muted-foreground hover:text-primary transition-colors truncate flex items-center gap-1 mt-0.5 font-semibold"
                        title={feed.url}
                      >
                        <span className="truncate max-w-[200px] sm:max-w-[320px]">{getCleanDomain(feed.url)}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                      </a>
                    </div>
                  </div>

                  {/* Power Toggle Button - Theme Adaptive */}
                  <button
                    onClick={() => handleToggleFeed(feed.id)}
                    className={cn(
                      "p-2 sm:p-2.5 rounded-2xl transition-all border shrink-0 active:scale-95 shadow-xs cursor-pointer",
                      feed.is_active
                        ? "bg-primary/15 border-primary/35 text-primary hover:bg-primary/25"
                        : "bg-muted/40 border-border/40 text-muted-foreground hover:bg-muted/70"
                    )}
                    title={feed.is_active ? 'Active (Click to pause)' : 'Paused (Click to activate)'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2 flex-wrap text-[11px] sm:text-xs font-bold">
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-xl bg-muted/40 border border-border/40 text-foreground">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span>Every {feed.check_interval_hours}h</span>
                  </div>
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-xl border font-extrabold",
                    feed.is_active
                      ? "bg-primary/10 border-primary/25 text-primary"
                      : "bg-muted/50 border-border/40 text-muted-foreground"
                  )}>
                    <span className={cn("w-2 h-2 rounded-full", feed.is_active ? "bg-primary animate-pulse" : "bg-muted-foreground/50")} />
                    <span>{feed.is_active ? "Active" : "Paused"}</span>
                  </div>
                </div>

                {/* Footer Status Line */}
                <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-muted-foreground border-t border-border/40 pt-2.5">
                  <span className="flex items-center gap-1.5 text-muted-foreground/80">
                    <RefreshCw className="w-3 h-3 opacity-60" />
                    <span>Last checked: {formatLastChecked(feed.last_checked)}</span>
                  </span>
                  {feed.failure_count > 0 && (
                    <span className="flex items-center gap-1 text-destructive font-bold bg-destructive/10 px-2 py-0.5 rounded-lg border border-destructive/20 text-[10px]">
                      <AlertCircle className="w-3 h-3" />
                      {feed.failure_count} failures
                    </span>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={() => handleUpdateFeedNow(feed.id)}
                    disabled={updatingFeedIds.has(feed.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs font-extrabold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-2xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${updatingFeedIds.has(feed.id) ? 'animate-spin text-primary' : ''}`} />
                    <span>Update Now</span>
                  </button>
                  <button
                    onClick={() => handleEditFeed(feed)}
                    className="p-2 sm:p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border/40 rounded-2xl transition-all active:scale-95 cursor-pointer"
                    title="Edit Feed"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteFeed(feed.id)}
                    disabled={deletingFeedId === feed.id}
                    className="p-2 sm:p-2.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/15 border border-border/40 hover:border-rose-500/30 rounded-2xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
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
      {/* Inline delete confirmation — replaces blocked native confirm() */}
      {pendingDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/65 backdrop-blur-xl" onClick={() => setPendingDeleteId(null)} />
          <div className="relative z-10 w-full max-w-sm bg-card border border-border/80 rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-destructive/15 border border-destructive/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-foreground">Delete Feed?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">This will remove the feed and its cached articles.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="flex-1 py-2.5 text-xs font-extrabold text-foreground bg-secondary/60 border border-border/50 rounded-2xl hover:bg-secondary transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFeed}
                className="flex-1 py-2.5 text-xs font-extrabold text-destructive-foreground bg-destructive rounded-2xl hover:bg-destructive/90 transition-all active:scale-95 shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <AddFeedDialog
        isOpen={showAddDialog}
        onClose={handleCloseAddDialog}
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
