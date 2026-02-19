import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ConversionJob {
  id: string;
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
  loadJobs: () => Promise<void>;
  loadSupportedFormats: () => Promise<void>;
  submitConversion: (inputPath: string, outputFormat: string, outputDir?: string) => Promise<string>;
  getJobStatus: (jobId: string) => Promise<ConversionJob | null>;
  cancelJob: (jobId: string) => Promise<void>;
  refreshJob: (jobId: string) => Promise<void>;
  clearCompletedJobs: () => void;
}

export const useConversionStore = create<ConversionState>((set, get) => ({
  jobs: [],
  supportedFormats: [],
  isLoading: false,
  error: null,

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
      const formats = await invoke<[string, string[]][]>('get_supported_conversions');
      const supportedFormats = formats.map(([from, to]) => ({ from, to }));
      set({ supportedFormats });
    } catch (error) {
      console.error('Failed to load supported formats:', error);
      set({ error: String(error) });
    }
  },

  submitConversion: async (inputPath: string, outputFormat: string, outputDir?: string) => {
    try {
      set({ isLoading: true, error: null });
      const jobId = await invoke<string>('convert_book', {
        inputPath,
        outputFormat,
        outputDir,
      });
      
      // Refresh jobs list
      await get().loadJobs();
      set({ isLoading: false });
      
      return jobId;
    } catch (error) {
      console.error('Failed to submit conversion:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  getJobStatus: async (jobId: string) => {
    try {
      const job = await invoke<ConversionJob>('get_conversion_status', { jobId });
      
      // Update job in list
      set(state => ({
        jobs: state.jobs.map(j => j.id === jobId ? job : j)
      }));
      
      return job;
    } catch (error) {
      console.error('Failed to get job status:', error);
      return null;
    }
  },

  cancelJob: async (jobId: string) => {
    try {
      await invoke('cancel_conversion', { jobId });
      
      // Update job status locally
      set(state => ({
        jobs: state.jobs.map(j => 
          j.id === jobId ? { ...j, status: 'Cancelled' as const } : j
        )
      }));
    } catch (error) {
      console.error('Failed to cancel job:', error);
      set({ error: String(error) });
      throw error;
    }
  },

  refreshJob: async (jobId: string) => {
    await get().getJobStatus(jobId);
  },

  clearCompletedJobs: () => {
    set(state => ({
      jobs: state.jobs.filter(j => 
        j.status !== 'Completed' && j.status !== 'Failed' && j.status !== 'Cancelled'
      )
    }));
  },
}));
