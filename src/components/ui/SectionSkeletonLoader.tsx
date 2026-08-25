import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface SectionSkeletonLoaderProps {
  variant?: 'grid' | 'list' | 'dashboard' | 'history';
}

export function SectionSkeletonLoader({ variant = 'grid' }: SectionSkeletonLoaderProps) {
  if (variant === 'list' || variant === 'history') {
    return (
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 md:p-8 space-y-6 animate-in fade-in-0 duration-300">
        {/* Header bar skeleton */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 rounded-lg" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>

        {/* List items skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-2xl border border-border/40 bg-card/40 gap-4">
              <div className="flex items-center gap-4 flex-1">
                <Skeleton className="w-12 h-16 rounded-lg shrink-0" />
                <div className="space-y-2 flex-1 min-w-0">
                  <Skeleton className="h-4 w-1/3 rounded-md" />
                  <Skeleton className="h-3 w-2/3 rounded-md" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8 space-y-8 animate-in fade-in-0 duration-300">
        {/* Hero banner skeleton */}
        <div className="w-full h-48 sm:h-56 rounded-3xl overflow-hidden relative border border-border/40 bg-card/40 p-6 flex flex-col justify-end">
          <div className="space-y-3">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-4 w-96 rounded-md" />
          </div>
        </div>

        {/* Stats grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-2xl border border-border/40 bg-card/40 space-y-2">
              <Skeleton className="h-3 w-1/2 rounded-md" />
              <Skeleton className="h-7 w-3/4 rounded-lg" />
            </div>
          ))}
        </div>

        {/* Grid content skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="w-full aspect-[2/3] rounded-2xl" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <Skeleton className="h-3 w-1/2 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default Grid Skeleton
  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8 space-y-8 animate-in fade-in-0 duration-300">
      {/* Header title skeleton */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 rounded-xl" />
          <Skeleton className="h-4 w-80 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <Skeleton className="w-full aspect-[2/3] rounded-2xl" />
            <Skeleton className="h-4 w-4/5 rounded-md" />
            <Skeleton className="h-3 w-3/5 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
