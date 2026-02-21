/**
 * conversionStore.ts
 *
 * Uses Tauri event listeners instead of polling.
 * Call `initEventListeners()` once at app startup (App.tsx).
 */
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface ConversionJob {
  id: string;
  book_id: number | null;
  source_path: string;
  target_path: string;
  source_format: string;
  target_format: string;
  status: 'Queued' | 'Processing' | 'Completed' | 'Failed' | 'Cancelled';
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface SupportedConversion {
  from: string;
  to: string[];
}

interface ConversionState {
  jobs: ConversionJob[];
  supportedFormats: SupportedConversion[];
  isLoading: boolean;
  error: string | null;

  // Actions
  initEventListeners: () => Promise<UnlistenFn>;
  loadJobs: () => Promise<void>;
  loadSupportedFormats: () => Promise<void>;
  submitConversion: (
    inputPath: string,
    outputFormat: string,
    outputDir?: string,
    bookId?: number
  ) => Promise<string>;
  cancelJob: (jobId: string) => Promise<void>;
  clearCompletedJobs: () => void;
}

export const useConversionStore = create<ConversionState>((set, get) => ({
  jobs: [],
  supportedFormats: [],
  isLoading: false,
  error: null,

  /**
   * Subscribe to Tauri conversion events.
   * Returns an unlisten function — call it on app unmount.
   */
  initEventListeners: async () => {
    const unlistenProgress = await listen<ConversionJob>('conversion:progress', ({ payload }) => {
      set(state => {
        const exists = state.jobs.some(j => j.id === payload.id);
        return {
          jobs: exists
            ? state.jobs.map(j => (j.id === payload.id ? payload : j))
            : [...state.jobs, payload],
        };
      });
    });

    const unlistenComplete = await listen<{ job_id: string; output_path: string }>(
      'conversion:complete',
      ({ payload }) => {
        set(state => ({
          jobs: state.jobs.map(j =>
            j.id === payload.job_id
              ? { ...j, status: 'Completed' as const, progress: 100, target_path: payload.output_path }
              : j
          ),
        }));
      }
    );

    const unlistenError = await listen<{ job_id: string; error: string }>(
      'conversion:error',
      ({ payload }) => {
        set(state => ({
          jobs: state.jobs.map(j =>
            j.id === payload.job_id
              ? { ...j, status: 'Failed' as const, error: payload.error }
              : j
          ),
        }));
      }
    );

    return () => {
      unlistenProgress();
      unlistenComplete();
      unlistenError();
    };
  },

  loadJobs: async () => {
    try {
      set({ isLoading: true, error: null });
      const jobs = await invoke<ConversionJob[]>('list_conversion_jobs');
      set({ jobs, isLoading: false });
    } catch (error) {
      console.error('Failed to load conversion jobs:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  loadSupportedFormats: async () => {
    try {
      const raw = await invoke<{ from: string; to: string[] }[]>('get_supported_conversions');
      set({ supportedFormats: raw });
    } catch (error) {
      console.error('Failed to load supported formats:', error);
      set({ error: String(error) });
    }
  },

  submitConversion: async (inputPath, outputFormat, outputDir, bookId) => {
    try {
      set({ isLoading: true, error: null });
      const jobId = await invoke<string>('convert_book', {
        inputPath,
        outputFormat,
        outputDir,
        bookId,
      });
      set({ isLoading: false });
      return jobId;
    } catch (error) {
      console.error('Failed to submit conversion:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  cancelJob: async (jobId: string) => {
    try {
      await invoke('cancel_conversion', { jobId });
      set(state => ({
        jobs: state.jobs.map(j =>
          j.id === jobId ? { ...j, status: 'Cancelled' as const } : j
        ),
      }));
    } catch (error) {
      console.error('Failed to cancel job:', error);
      set({ error: String(error) });
      throw error;
    }
  },

  clearCompletedJobs: () => {
    set(state => ({
      jobs: state.jobs.filter(
        j => j.status !== 'Completed' && j.status !== 'Failed' && j.status !== 'Cancelled'
      ),
    }));
  },
}));
