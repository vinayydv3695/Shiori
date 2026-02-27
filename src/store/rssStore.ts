import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface RssFeed {
  id: number;
  url: string;
  title: string | null;
  description: string | null;
  last_checked: string | null;
  next_check: string | null;
  check_interval_hours: number;
  failure_count: number;
  is_active: boolean;
  created_at: string;
}

export interface RssArticle {
  id: number;
  feed_id: number;
  title: string;
  author: string | null;
  url: string | null;
  content: string;
  summary: string | null;
  published: string | null;
  guid: string;
  is_read: boolean;
  epub_book_id: number | null;
  created_at: string;
}

interface RssState {
  feeds: RssFeed[];
  articles: RssArticle[];
  selectedFeedId: number | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadFeeds: (activeOnly?: boolean) => Promise<void>;
  loadArticles: (feedId?: number, limit?: number) => Promise<void>;
  addFeed: (url: string, checkIntervalHours?: number) => Promise<number>;
  updateFeed: (feedId: number, title?: string, checkIntervalHours?: number) => Promise<void>;
  deleteFeed: (feedId: number) => Promise<void>;
  toggleFeed: (feedId: number) => Promise<void>;
  updateFeedArticles: (feedId: number) => Promise<number>;
  updateAllFeeds: () => Promise<void>;
  markArticleRead: (articleId: number) => Promise<void>;
  generateDailyEpub: (options?: {
    title?: string;
    author?: string;
    maxArticles?: number;
    feeds?: number[];
  }) => Promise<string>;
  setSelectedFeed: (feedId: number | null) => void;
}

export const useRssStore = create<RssState>((set, get) => ({
  feeds: [],
  articles: [],
  selectedFeedId: null,
  isLoading: false,
  error: null,

  loadFeeds: async (activeOnly = false) => {
    try {
      set({ isLoading: true, error: null });
      const feeds = await invoke<RssFeed[]>('list_rss_feeds', { activeOnly });
      set({ feeds, isLoading: false });
    } catch (error) {
      console.error('Failed to load RSS feeds:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  loadArticles: async (feedId?: number, limit?: number) => {
    try {
      set({ isLoading: true, error: null });
      const articles = await invoke<RssArticle[]>('get_unread_articles', { 
        feedId: feedId || null, 
        limit: limit || null 
      });
      set({ articles, isLoading: false });
    } catch (error) {
      console.error('Failed to load articles:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  addFeed: async (url: string, checkIntervalHours = 24) => {
    try {
      set({ isLoading: true, error: null });
      const feedId = await invoke<number>('add_rss_feed', { 
        url, 
        checkIntervalHours 
      });
      
      // Reload feeds
      await get().loadFeeds();
      set({ isLoading: false });
      
      return feedId;
    } catch (error) {
      console.error('Failed to add feed:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  updateFeed: async (feedId: number, title?: string, checkIntervalHours?: number) => {
    try {
      await invoke('update_rss_feed', { 
        feedId, 
        title: title ?? null, 
        checkIntervalHours: checkIntervalHours ?? null 
      });
      
      // Reload feeds
      await get().loadFeeds();
    } catch (error) {
      console.error('Failed to update feed:', error);
      set({ error: String(error) });
      throw error;
    }
  },

  deleteFeed: async (feedId: number) => {
    try {
      await invoke('delete_rss_feed', { feedId });
      
      // Remove from local state
      set(state => ({
        feeds: state.feeds.filter(f => f.id !== feedId),
        selectedFeedId: state.selectedFeedId === feedId ? null : state.selectedFeedId
      }));
    } catch (error) {
      console.error('Failed to delete feed:', error);
      set({ error: String(error) });
      throw error;
    }
  },

  toggleFeed: async (feedId: number) => {
    try {
      const newStatus = await invoke<boolean>('toggle_rss_feed', { feedId });
      
      // Update local state
      set(state => ({
        feeds: state.feeds.map(f => 
          f.id === feedId ? { ...f, is_active: newStatus } : f
        )
      }));
    } catch (error) {
      console.error('Failed to toggle feed:', error);
      set({ error: String(error) });
      throw error;
    }
  },

  updateFeedArticles: async (feedId: number) => {
    try {
      set({ isLoading: true, error: null });
      const newCount = await invoke<number>('update_rss_feed_articles', { feedId });
      
      // Reload articles if this feed is selected
      if (get().selectedFeedId === feedId) {
        await get().loadArticles(feedId, undefined);
      }
      
      set({ isLoading: false });
      return newCount;
    } catch (error) {
      console.error('Failed to update feed articles:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  updateAllFeeds: async () => {
    try {
      set({ isLoading: true, error: null });
      await invoke('update_all_rss_feeds');
      
      // Reload feeds and articles
      await get().loadFeeds();
      const selectedId = get().selectedFeedId;
      if (selectedId !== null) {
        await get().loadArticles(selectedId, undefined);
      }
      
      set({ isLoading: false });
    } catch (error) {
      console.error('Failed to update all feeds:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  markArticleRead: async (articleId: number) => {
    try {
      await invoke('mark_article_read', { articleId });
      
      // Update local state
      set(state => ({
        articles: state.articles.map(a => 
          a.id === articleId ? { ...a, is_read: true } : a
        )
      }));
    } catch (error) {
      console.error('Failed to mark article as read:', error);
      set({ error: String(error) });
    }
  },

  generateDailyEpub: async (options = {}) => {
    try {
      set({ isLoading: true, error: null });
      const path = await invoke<string>('generate_daily_epub', {
        title: options.title || null,
        author: options.author || null,
        maxArticles: options.maxArticles || null,
        feeds: options.feeds || null,
      });
      
      set({ isLoading: false });
      return path;
    } catch (error) {
      console.error('Failed to generate daily EPUB:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  setSelectedFeed: (feedId: number | null) => {
    set({ selectedFeedId: feedId });
    if (feedId !== null) {
      get().loadArticles(feedId, undefined);
    }
  },
}));
