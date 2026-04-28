import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SourceFailureReason = 'error' | 'timeout';
export type SourceHealthLevel = 'unknown' | 'good' | 'degraded' | 'poor';

export interface SourceHealthStats {
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  consecutiveFailures: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastLatencyMs?: number;
}

interface SourceHealthStore {
  bySource: Record<string, SourceHealthStats>;
  recordSuccess: (sourceId: string, latencyMs?: number) => void;
  recordFailure: (sourceId: string, reason: SourceFailureReason, latencyMs?: number) => void;
  getSourceScore: (sourceId: string) => number;
  getSourceHealthLevel: (sourceId: string) => SourceHealthLevel;
}

const EMPTY_STATS: SourceHealthStats = {
  successCount: 0,
  failureCount: 0,
  timeoutCount: 0,
  consecutiveFailures: 0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function calculateSourceScore(stats?: SourceHealthStats): number {
  if (!stats) {
    return 50;
  }

  const totalAttempts = stats.successCount + stats.failureCount;
  if (totalAttempts <= 0) {
    return 50;
  }

  const successRate = (stats.successCount / totalAttempts) * 100;
  const timeoutPenalty = stats.timeoutCount * 6;
  const failurePenalty = (stats.failureCount - stats.timeoutCount) * 2;
  const consecutivePenalty = stats.consecutiveFailures * 8;
  const latencyPenalty = stats.lastLatencyMs ? clamp(stats.lastLatencyMs / 250, 0, 20) : 0;
  const score = successRate - timeoutPenalty - failurePenalty - consecutivePenalty - latencyPenalty;

  return Math.round(clamp(score, 0, 100));
}

function deriveHealthLevel(score: number, stats?: SourceHealthStats): SourceHealthLevel {
  const attempts = (stats?.successCount ?? 0) + (stats?.failureCount ?? 0);
  if (attempts === 0) return 'unknown';
  if (score >= 75) return 'good';
  if (score >= 45) return 'degraded';
  return 'poor';
}

export const useSourceHealthStore = create<SourceHealthStore>()(
  persist(
    (set, get) => ({
      bySource: {},
      recordSuccess: (sourceId, latencyMs) =>
        set((state) => {
          const current = state.bySource[sourceId] ?? EMPTY_STATS;
          return {
            bySource: {
              ...state.bySource,
              [sourceId]: {
                ...current,
                successCount: current.successCount + 1,
                consecutiveFailures: 0,
                lastSuccessAt: Date.now(),
                lastLatencyMs: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs ?? 0)) : current.lastLatencyMs,
              },
            },
          };
        }),
      recordFailure: (sourceId, reason, latencyMs) =>
        set((state) => {
          const current = state.bySource[sourceId] ?? EMPTY_STATS;
          return {
            bySource: {
              ...state.bySource,
              [sourceId]: {
                ...current,
                failureCount: current.failureCount + 1,
                timeoutCount: reason === 'timeout' ? current.timeoutCount + 1 : current.timeoutCount,
                consecutiveFailures: current.consecutiveFailures + 1,
                lastFailureAt: Date.now(),
                lastLatencyMs: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs ?? 0)) : current.lastLatencyMs,
              },
            },
          };
        }),
      getSourceScore: (sourceId) => calculateSourceScore(get().bySource[sourceId]),
      getSourceHealthLevel: (sourceId) => {
        const stats = get().bySource[sourceId];
        return deriveHealthLevel(calculateSourceScore(stats), stats);
      },
    }),
    {
      name: 'shiori-source-health-store',
      version: 1,
    }
  )
);
