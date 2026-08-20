import React from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  BookOpen,
  Settings,
  MoreVertical,
  Volume2
} from 'lucide-react';

interface BookSkeletonLoadingProps {
  title?: string;
  subtitle?: string;
  progressText?: string;
  message?: string;
  format?: string;
  coverUrl?: string;
}

export function BookSkeletonLoading({
  title,
  subtitle,
  progressText,
  message = 'Resuming reading',
  format,
  coverUrl,
}: BookSkeletonLoadingProps) {
  // Paragraph line widths matching exact reader layout
  const paragraph1 = [
    'w-[100%]',
    'w-[98%]',
    'w-[100%]',
    'w-[97%]',
    'w-[99%]',
    'w-[95%]',
    'w-[74%]',
  ];

  const paragraph2 = [
    'w-[100%]',
    'w-[99%]',
    'w-[97%]',
    'w-[100%]',
    'w-[98%]',
    'w-[96%]',
    'w-[99%]',
    'w-[68%]',
  ];

  const paragraph3 = [
    'w-[100%]',
    'w-[98%]',
    'w-[99%]',
    'w-[97%]',
    'w-[84%]',
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--bg-primary, #f5efe6)',
        color: 'var(--text-primary, #2d2a26)',
      }}
    >
      {/* Silky shimmer wave animation */}
      <style>{`
        @keyframes shiori-skeleton-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .shiori-shimmer {
          position: relative;
          overflow: hidden;
          background-color: color-mix(in srgb, var(--text-primary, #000) 8%, transparent);
          border-radius: 8px;
        }
        .shiori-shimmer::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent 0%,
            color-mix(in srgb, var(--text-primary, #fff) 35%, transparent) 50%,
            transparent 100%
          );
          animation: shiori-skeleton-shimmer 1.8s infinite ease-in-out;
        }
      `}</style>

      {/* ── 1. Top Floating Pill Bar (Matches exact top bar size in blueprint) ── */}
      <div className="w-full flex justify-center px-4 pt-3 sm:pt-4 z-20 shrink-0">
        <div
          className="flex items-center justify-between w-full max-w-[760px] h-[48px] px-4 rounded-full border shadow-sm backdrop-blur-xl gap-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-elevated, #ffffff) 88%, transparent)',
            borderColor: 'color-mix(in srgb, var(--ui-border, #e2e8f0) 65%, transparent)',
          }}
        >
          {/* Left: Back Arrow & Title/Subtitle */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center opacity-50 shrink-0">
              <ChevronLeft className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 max-w-[340px]">
              {title ? (
                <span className="text-xs sm:text-sm font-bold truncate opacity-90 leading-tight">
                  {title}
                </span>
              ) : (
                <div className="h-4 w-48 shiori-shimmer" />
              )}
              {subtitle ? (
                <span className="text-[10px] sm:text-xs font-medium truncate opacity-55 leading-none">
                  {subtitle}
                </span>
              ) : progressText ? (
                <span className="text-[10px] sm:text-xs font-medium truncate opacity-55 leading-none">
                  {progressText}
                </span>
              ) : (
                <div className="h-3 w-28 shiori-shimmer opacity-60" />
              )}
            </div>
          </div>

          {/* Right: Actions (Search, TOC, Settings, Dots) */}
          <div className="flex items-center gap-3.5 shrink-0 opacity-50">
            <Search className="w-4.5 h-4.5" />
            <BookOpen className="w-4.5 h-4.5" />
            <Settings className="w-4.5 h-4.5" />
            <MoreVertical className="w-4.5 h-4.5" />
          </div>
        </div>
      </div>

      {/* ── 2. Floating Side Navigation Arrows (Matches exact side buttons) ── */}
      <div className="hidden sm:flex fixed left-5 top-1/2 -translate-y-1/2 z-20">
        <div
          className="w-11 h-11 rounded-full border shadow-sm backdrop-blur-xl flex items-center justify-center opacity-40"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-elevated, #ffffff) 85%, transparent)',
            borderColor: 'color-mix(in srgb, var(--ui-border, #e2e8f0) 60%, transparent)',
          }}
        >
          <ChevronLeft className="w-5 h-5" />
        </div>
      </div>

      <div className="hidden sm:flex fixed right-5 top-1/2 -translate-y-1/2 z-20">
        <div
          className="w-11 h-11 rounded-full border shadow-sm backdrop-blur-xl flex items-center justify-center opacity-40"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-elevated, #ffffff) 85%, transparent)',
            borderColor: 'color-mix(in srgb, var(--ui-border, #e2e8f0) 60%, transparent)',
          }}
        >
          <ChevronRight className="w-5 h-5" />
        </div>
      </div>

      {/* ── 3. Main Chapter Reading Area (Matches exact size/scale of reader text) ── */}
      <div className="flex-1 w-full flex justify-center items-start px-8 sm:px-24 pt-8 sm:pt-10 pb-12 overflow-hidden">
        <div className="w-full max-w-[1040px] flex flex-col gap-8">
          {/* Chapter Title Skeleton Header (Matches large title "I. The Arrest of Arsène Lupin") */}
          <div className="h-11 sm:h-12 w-3/5 shiori-shimmer mb-2 rounded-xl" />

          {/* Paragraph 1 */}
          <div className="flex flex-col gap-4 sm:gap-4.5">
            {paragraph1.map((widthClass, idx) => (
              <div
                key={idx}
                className={`h-5 sm:h-5.5 shiori-shimmer ${widthClass}`}
                style={{ animationDelay: `${idx * 0.06}s` }}
              />
            ))}
          </div>

          {/* Paragraph 2 */}
          <div className="flex flex-col gap-4 sm:gap-4.5 pt-3 sm:pt-4">
            {paragraph2.map((widthClass, idx) => (
              <div
                key={idx}
                className={`h-5 sm:h-5.5 shiori-shimmer ${widthClass}`}
                style={{ animationDelay: `${(idx + 7) * 0.06}s` }}
              />
            ))}
          </div>

          {/* Paragraph 3 */}
          <div className="flex flex-col gap-4 sm:gap-4.5 pt-3 sm:pt-4">
            {paragraph3.map((widthClass, idx) => (
              <div
                key={idx}
                className={`h-5 sm:h-5.5 shiori-shimmer ${widthClass}`}
                style={{ animationDelay: `${(idx + 15) * 0.06}s` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. Bottom Floating Controls (Matches exact bottom-left & bottom-right elements) ── */}
      <div className="fixed left-6 bottom-6 z-20 flex items-center gap-2 text-xs font-semibold opacity-45">
        <div className="h-3.5 w-9 shiori-shimmer rounded" />
        <span>•</span>
        <div className="h-3.5 w-11 shiori-shimmer rounded" />
      </div>

      <div className="fixed right-6 bottom-6 z-20">
        <div
          className="w-11 h-11 rounded-full border shadow-sm backdrop-blur-xl flex items-center justify-center opacity-45"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-elevated, #ffffff) 85%, transparent)',
            borderColor: 'color-mix(in srgb, var(--ui-border, #e2e8f0) 60%, transparent)',
          }}
        >
          <Volume2 className="w-4.5 h-4.5" />
        </div>
      </div>
    </motion.div>
  );
}
