/**
 * AudiobookPlayer.tsx
 *
 * Improvised, Native-Themed Audiobook Player for Shiori.
 * Features:
 * - 100% Theme Consistency: Built with native Tailwind tokens (bg-background, text-foreground,
 *   bg-card, border-border, bg-primary, etc.) perfectly matching Warm Parchment/Sepia,
 *   OLED Midnight, Alabaster Light, Nord, Catppuccin, and more.
 * - Story-First Sentence Sanitization: Intelligently removes repetitive book title / volume boilerplate
 *   and orphan volume numbers on the fly.
 * - 3 Flexible View Modes:
 *   1. [Player] - Immersive album art with dynamic animated equalizer & live subtitle box.
 *   2. [Read Along] - Full-screen karaoke-style synchronized lyrics stream with smooth auto-scroll.
 *   3. [Dual / Split] - Desktop side-by-side view (cover & chapter on left, lyrics on right).
 * - High-Precision Scrubbing: Hover timestamp tooltip, responsive waveform track, duration display.
 * - Quote / Bookmark Saver: Save favorite spoken lines and timestamps to library annotations with 1 click (or 'B').
 * - Chapter Drawer: Searchable list of all chapters with instant jumping.
 * - Bedtime Sleep Timer: 15m, 30m, 45m, 60m, or End of Track with gentle 5-second acoustic volume fadeout.
 * - 100% In-Memory Web Audio API Playback Engine (AudioContext) with seamless looping and zero lag.
 * - Tactile Controls: Space (Play/Pause), Left (-15s), Right (+30s), M (Mute), B (Bookmark), Esc (Back).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Volume1,
  Moon,
  ArrowLeft,
  Headphones,
  Gauge,
  FileText,
  ListMusic,
  Disc,
  Check,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Type,
  Navigation,
  Bookmark,
  Search,
  X,
  Columns2,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { convertFileSrc } from '@tauri-apps/api/core';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { ReaderContent } from '@/components/reader/readerContent';
import { useToastStore } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import {
  extractCleanSentences,
  sanitizeTranscriptSentences,
  cleanChapterContent,
  isPlaceholderChapter,
} from '@/lib/audiobookTextCleaner';

function SkipBack15Icon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center select-none pointer-events-none ${className}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-full h-full"
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-[8px] leading-none tracking-tighter text-current pt-0.5">
        15
      </span>
    </div>
  );
}

function SkipForward30Icon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center select-none pointer-events-none ${className}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-full h-full"
      >
        <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-[8px] leading-none tracking-tighter text-current pt-0.5">
        30
      </span>
    </div>
  );
}

export interface AudiobookPlayerProps {
  bookId: number;
  bookPath: string;
  readerContent?: ReaderContent | null;
  onClose: () => void;
}

const PLAYBACK_RATES = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5];

const SLEEP_TIMER_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '15 Minutes', minutes: 15 },
  { label: '30 Minutes', minutes: 30 },
  { label: '45 Minutes', minutes: 45 },
  { label: '60 Minutes', minutes: 60 },
  { label: 'End of Track', minutes: -1 },
];

interface TranscriptLine {
  text: string;
  startTime: number;
  endTime: number;
  index: number;
}

interface ChapterOption {
  index: number;
  title: string;
}

interface StoredTranscript {
  version: number;
  sourceBookId: number;
  selectedIndices?: number[];
  chapters: Array<{
    index: number;
    title: string;
    characterCount?: number;
    sentences: string[];
  }>;
}

type ViewMode = 'player' | 'read-along' | 'split';

export function AudiobookPlayer({
  bookId,
  bookPath,
  readerContent,
  onClose,
}: AudiobookPlayerProps) {
  // Web Audio Context & Node Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const playbackRateRef = useRef<number>(1.0);
  const isScrubbingRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);

  // Fallback HTML5 Audio Ref
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const [usingFallbackAudio, setUsingFallbackAudio] = useState(false);
  const [fallbackAudioUrl, setFallbackAudioUrl] = useState<string>('');

  // DOM Refs for Transcript
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // View Mode: 'split' | 'read-along' | 'player'
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showChapterDrawer, setShowChapterDrawer] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');

  // Sleep Timer state
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<number | null>(null);
  const sleepTimerRef = useRef<number | null>(null);

  // Audio loading & error state
  const [isLoadingAudio, setIsLoadingAudio] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Transcript state
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>('large');
  const [userHasScrolledAway, setUserHasScrolledAway] = useState(false);

  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [chapterList, setChapterList] = useState<ChapterOption[]>([]);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [activeChapterTitle, setActiveChapterTitle] = useState<string>('');
  const [rawSentences, setRawSentences] = useState<string[]>([]);

  // Metadata
  const title =
    readerContent?.title ||
    bookPath.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') ||
    'Audiobook';
  const author = readerContent?.author || 'Audiobook Narrator';
  const rawCover = readerContent?.cover;
  const coverUrl = useMemo(() => {
    if (!rawCover) return null;
    if (rawCover.startsWith('http://') || rawCover.startsWith('https://') || rawCover.startsWith('data:')) {
      return rawCover;
    }
    return convertFileSrc(rawCover.replace(/\\/g, '/'));
  }, [rawCover]);

  // Keep ref sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    isScrubbingRef.current = isScrubbing;
  }, [isScrubbing]);

  // ─── Format Time Helper (MM:SS or HH:MM:SS) ──────────────────────────────
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // ─── Precision Current Time Calculation (Web Audio) ─────────────────────
  const getPreciseCurrentTime = useCallback((): number => {
    if (!isPlayingRef.current || !audioCtxRef.current) {
      return pausedAtRef.current;
    }
    const elapsedSinceStart =
      (audioCtxRef.current.currentTime - startedAtRef.current) * playbackRateRef.current;
    const totalDuration = audioBufferRef.current?.duration || 0;
    const computed = pausedAtRef.current + elapsedSinceStart;
    return totalDuration > 0 ? Math.min(totalDuration, Math.max(0, computed)) : Math.max(0, computed);
  }, []);

  // ─── Web Audio Source Node Creator ──────────────────────────────────────
  const createAndStartSourceNode = useCallback((startOffsetSec: number) => {
    if (!audioCtxRef.current || !audioBufferRef.current || !gainNodeRef.current) return;

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }

    const buf = audioBufferRef.current;
    const offset = Math.max(0, Math.min(startOffsetSec, buf.duration - 0.01));

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buf;
    source.playbackRate.value = playbackRateRef.current;
    source.connect(gainNodeRef.current);

    source.onended = () => {
      const now = getPreciseCurrentTime();
      if (isPlayingRef.current && now >= buf.duration - 0.25) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        pausedAtRef.current = 0;
        setCurrentTime(buf.duration);
        useToastStore.getState().addToast({
          title: '🎧 Chapter Complete',
          description: `Finished listening to ${activeChapterTitle || title}.`,
          variant: 'success',
        });
        void saveProgress(buf.duration, buf.duration);
      }
    };

    source.start(0, offset);
    startedAtRef.current = audioCtxRef.current.currentTime;
    pausedAtRef.current = offset;
    sourceNodeRef.current = source;
  }, [getPreciseCurrentTime, title, activeChapterTitle]);

  // ─── 1. Load Audio File via Web Audio API ──────────────────────────────
  const loadAudioFile = useCallback(async () => {
    if (!bookPath) return;
    setIsLoadingAudio(true);
    setAudioError(null);

    try {
      const rawBytes = await api.readBookBinary(bookPath);
      if (!rawBytes || rawBytes.length === 0) {
        throw new Error('Audio file is empty or could not be read.');
      }

      const uint8 = new Uint8Array(rawBytes);

      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtxClass();
      }

      const ctx = audioCtxRef.current;

      if (!gainNodeRef.current) {
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(isMuted ? 0 : volume, ctx.currentTime);
        gainNode.connect(ctx.destination);
        gainNodeRef.current = gainNode;
      }

      const decodedBuffer = await ctx.decodeAudioData(uint8.buffer.slice(0));
      audioBufferRef.current = decodedBuffer;

      const trueDuration = decodedBuffer.duration;
      setDuration(trueDuration);
      setIsLoadingAudio(false);
      setUsingFallbackAudio(false);

      // Restore saved progress if available
      try {
        const progress = await api.getReadingProgress(bookId);
        if (progress && progress.currentLocation) {
          const parsed = parseFloat(progress.currentLocation);
          if (!isNaN(parsed) && parsed > 0 && parsed < trueDuration) {
            pausedAtRef.current = parsed;
            setCurrentTime(parsed);
          }
        }
      } catch (e) {
        logger.debug('[AudiobookPlayer] Could not restore progress:', e);
      }

      return;
    } catch (err) {
      logger.warn('[AudiobookPlayer] Web Audio API decode failed, trying HTML5 fallback:', err);
    }

    // Fallback: Base64 data URI for HTML5 <audio>
    try {
      const rawBytes = await api.readBookBinary(bookPath);
      if (rawBytes && rawBytes.length > 0) {
        let binaryStr = '';
        const len = rawBytes.length;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          binaryStr += String.fromCharCode(...rawBytes.slice(i, i + chunkSize));
        }
        const base64Audio = btoa(binaryStr);
        setFallbackAudioUrl(`data:audio/mp3;base64,${base64Audio}`);
        setUsingFallbackAudio(true);
        setIsLoadingAudio(false);
        return;
      }
    } catch (base64Err) {
      logger.error('[AudiobookPlayer] All playback initialization failed:', base64Err);
      setAudioError('Failed to load audio file into player. Please check that the file exists.');
      setIsLoadingAudio(false);
    }
  }, [bookId, bookPath, isMuted, volume]);

  useEffect(() => {
    void loadAudioFile();

    return () => {
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.onended = null;
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        } catch {}
        sourceNodeRef.current = null;
      }
      if (gainNodeRef.current) {
        try {
          gainNodeRef.current.disconnect();
        } catch {}
        gainNodeRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
    };
  }, [loadAudioFile]);

  // ─── 60fps Playback Time Sync Loop (Web Audio) ──────────────────────────
  useEffect(() => {
    if (usingFallbackAudio) return;

    const tick = () => {
      if (isPlayingRef.current && !isScrubbingRef.current) {
        const cur = getPreciseCurrentTime();
        setCurrentTime(cur);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, getPreciseCurrentTime, usingFallbackAudio]);

  // ─── 2. Discover Source Book & Load Sanitized Transcript ────────────────
  useEffect(() => {
    let isMounted = true;

    const findSourceBookAndTranscript = async () => {
      setIsLoadingTranscript(true);
      try {
        let currentNotes: string | null = null;
        let foundSourceId: number | null = null;

        try {
          const currentBook = await api.getBook(bookId);
          currentNotes = currentBook.notes || null;

          if (currentNotes) {
            try {
              const parsedNotes = JSON.parse(currentNotes);
              if (parsedNotes?.sourceBookId) {
                foundSourceId = parsedNotes.sourceBookId;
              }
            } catch {
              // ignore
            }
          }
        } catch (e) {
          logger.debug('[AudiobookPlayer] Could not fetch current book metadata:', e);
        }

        // Option A: Load Structured Transcript from book.notes
        if (currentNotes) {
          try {
            const parsedNotes: StoredTranscript = JSON.parse(currentNotes);
            if (parsedNotes && parsedNotes.chapters && parsedNotes.chapters.length > 0) {
              // Filter out any image / blank placeholder chapters that might have been stored
              const validChapters = parsedNotes.chapters.filter((c) => {
                const count = c.characterCount || (c.sentences ? c.sentences.join(' ').length : 0);
                return !isPlaceholderChapter('', c.title, count) && count >= 80;
              });

              const chaptersToUse = validChapters.length > 0 ? validChapters : parsedNotes.chapters;
              const chapters: ChapterOption[] = chaptersToUse.map((c) => ({
                index: c.index,
                title: c.title,
              }));

              if (!isMounted) return;
              setChapterList(chapters);

              const activeChapter =
                chaptersToUse.find((c) => c.index === selectedChapterIndex) ||
                chaptersToUse[0];

              if (activeChapter) {
                if (selectedChapterIndex !== activeChapter.index) {
                  setSelectedChapterIndex(activeChapter.index);
                }
                setActiveChapterTitle(activeChapter.title);

                // Run smart sentence sanitizer to strip repetitive book title & orphan numbers
                const cleaned = sanitizeTranscriptSentences(
                  activeChapter.sentences,
                  title,
                  activeChapter.title
                );
                setRawSentences(cleaned);
                setIsLoadingTranscript(false);
                return;
              }
            }
          } catch {
            // Notes was not JSON or legacy format
          }
        }

        // Option B: Fallback to Source Book Search
        if (!foundSourceId) {
          const cleanTitle = title.replace(/\s*\(Audiobook\)$/i, '').trim().toLowerCase();
          const allBooks = useLibraryStore.getState().books;
          const match = allBooks.find(
            (b) =>
              b.id !== bookId &&
              b.file_format !== 'mp3' &&
              b.title.trim().toLowerCase().includes(cleanTitle)
          );
          if (match && match.id) {
            foundSourceId = match.id;
          }
        }

        if (!foundSourceId || !isMounted) {
          setIsLoadingTranscript(false);
          return;
        }

        const count = await api.getBookChapterCount(foundSourceId);
        const chapters: ChapterOption[] = [];
        for (let i = 0; i < count; i++) {
          try {
            const ch = await api.getBookChapter(foundSourceId, i);
            const cleanText = cleanChapterContent(ch.content, title, ch.title);
            // Skip image-only, cover, and empty placeholder pages!
            if (isPlaceholderChapter(ch.content, ch.title, cleanText.length)) {
              continue;
            }
            chapters.push({
              index: i,
              title: ch.title || `Chapter ${i + 1}`,
            });
          } catch {
            // ignore
          }
        }

        if (!isMounted) return;
        setChapterList(chapters);

        if (chapters.length === 0) {
          setIsLoadingTranscript(false);
          return;
        }

        // Ensure selected index points to a valid text chapter, defaulting to first real story chapter
        const targetOption = chapters.find((c) => c.index === selectedChapterIndex) || chapters[0];
        if (selectedChapterIndex !== targetOption.index) {
          setSelectedChapterIndex(targetOption.index);
        }

        const targetChapter = await api.getBookChapter(foundSourceId, targetOption.index);
        const chapterTitle = targetChapter.title || `Chapter ${targetOption.index + 1}`;
        setActiveChapterTitle(chapterTitle);

        // Sanitize chapter text: strips HTML, book title boilerplate & protects abbreviations
        const cleanSentences = extractCleanSentences(targetChapter.content, title, chapterTitle);

        if (isMounted) {
          setRawSentences(cleanSentences);
          setIsLoadingTranscript(false);
        }
      } catch (err) {
        logger.debug('[AudiobookPlayer] Failed to load transcript:', err);
        if (isMounted) setIsLoadingTranscript(false);
      }
    };

    void findSourceBookAndTranscript();

    return () => {
      isMounted = false;
    };
  }, [bookId, title, selectedChapterIndex]);

  // ─── 3. Re-calculate Transcript Timings with Authoritative Duration ──────
  useEffect(() => {
    if (!rawSentences || rawSentences.length === 0) {
      setTranscriptLines([]);
      return;
    }

    const totalChars = rawSentences.reduce((acc, s) => acc + s.length, 0);
    const effectiveDuration = duration > 0 ? duration : 60;

    let accumulated = 0;
    const lines: TranscriptLine[] = rawSentences.map((sentence, idx) => {
      const startRatio = accumulated / totalChars;
      const endRatio = (accumulated + sentence.length) / totalChars;
      accumulated += sentence.length;

      return {
        text: sentence,
        startTime: startRatio * effectiveDuration,
        endTime: endRatio * effectiveDuration,
        index: idx,
      };
    });

    setTranscriptLines(lines);
  }, [rawSentences, duration]);

  // ─── 4. Determine Active Sentence in Live Transcript ─────────────────────
  const displayTime = isScrubbing ? scrubTime : currentTime;

  const activeLineIndex = useMemo(() => {
    if (transcriptLines.length === 0) return -1;
    const t = displayTime;
    const idx = transcriptLines.findIndex((line) => t >= line.startTime && t < line.endTime);
    if (idx !== -1) return idx;
    if (t >= transcriptLines[transcriptLines.length - 1].endTime) {
      return transcriptLines.length - 1;
    }
    return 0;
  }, [transcriptLines, displayTime]);

  const currentActiveSentence =
    activeLineIndex >= 0 && activeLineIndex < transcriptLines.length
      ? transcriptLines[activeLineIndex]?.text
      : null;

  // ─── 5. Auto-Scroll to Active Sentence (Center Aligned) ──────────────────
  useEffect(() => {
    if (!isAutoScrollEnabled || userHasScrolledAway) return;
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIndex, isAutoScrollEnabled, userHasScrolledAway]);

  // ─── Chapter Position (Strictly skips image / empty placeholder chapters) ─
  const currentChapterPos = useMemo(() => {
    const pos = chapterList.findIndex((c) => c.index === selectedChapterIndex);
    return pos >= 0 ? pos : 0;
  }, [chapterList, selectedChapterIndex]);

  // ─── Save Progress to Backend ───────────────────────────────────────────
  const saveProgress = useCallback(
    async (currentSecs: number, totalSecs: number) => {
      if (totalSecs <= 0) return;
      try {
        const percentage = Math.min(100, Math.round((currentSecs / totalSecs) * 100));
        await api.saveReadingProgress(
          bookId,
          String(currentSecs),
          percentage,
          currentChapterPos + 1,
          chapterList.length || 1
        );
      } catch (err) {
        logger.debug('[AudiobookPlayer] Failed to save reading progress:', err);
      }
    },
    [bookId, currentChapterPos, chapterList.length]
  );

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      void saveProgress(currentTime, duration);
    }, 5000);
    return () => clearInterval(interval);
  }, [isPlaying, currentTime, duration, saveProgress]);

  // ─── Playback Controls ──────────────────────────────────────────────────
  const togglePlay = async () => {
    if (isLoadingAudio) return;

    if (usingFallbackAudio) {
      if (!fallbackAudioRef.current) return;
      if (isPlaying) {
        fallbackAudioRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          await fallbackAudioRef.current.play();
          setIsPlaying(true);
        } catch (err) {
          logger.warn('[AudiobookPlayer] HTML5 audio play failed:', err);
        }
      }
      return;
    }

    if (!audioCtxRef.current || !audioBufferRef.current) return;

    if (audioCtxRef.current.state === 'suspended') {
      try {
        await audioCtxRef.current.resume();
      } catch (e) {
        logger.warn('[AudiobookPlayer] AudioContext resume failed:', e);
      }
    }

    if (isPlaying) {
      pausedAtRef.current = getPreciseCurrentTime();
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.onended = null;
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        } catch {}
        sourceNodeRef.current = null;
      }
      setIsPlaying(false);
      isPlayingRef.current = false;
      void saveProgress(pausedAtRef.current, duration);
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      createAndStartSourceNode(pausedAtRef.current);
    }
  };

  const seekToTime = (targetSeconds: number) => {
    const clamped = Math.max(0, Math.min(targetSeconds, duration));
    pausedAtRef.current = clamped;
    setCurrentTime(clamped);

    if (usingFallbackAudio) {
      if (fallbackAudioRef.current) {
        fallbackAudioRef.current.currentTime = clamped;
      }
      return;
    }

    if (isPlayingRef.current) {
      createAndStartSourceNode(clamped);
    }
  };

  const skipRelative = (deltaSeconds: number) => {
    const cur = getPreciseCurrentTime();
    seekToTime(cur + deltaSeconds);
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;

    if (usingFallbackAudio) {
      if (fallbackAudioRef.current) {
        fallbackAudioRef.current.playbackRate = rate;
      }
      return;
    }

    if (isPlayingRef.current && sourceNodeRef.current && audioCtxRef.current) {
      pausedAtRef.current = getPreciseCurrentTime();
      startedAtRef.current = audioCtxRef.current.currentTime;
      sourceNodeRef.current.playbackRate.setValueAtTime(rate, audioCtxRef.current.currentTime);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (newVol > 0 && isMuted) setIsMuted(false);

    if (usingFallbackAudio) {
      if (fallbackAudioRef.current) {
        fallbackAudioRef.current.volume = newVol;
        fallbackAudioRef.current.muted = false;
      }
      return;
    }

    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(newVol, audioCtxRef.current.currentTime);
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);

    if (usingFallbackAudio) {
      if (fallbackAudioRef.current) {
        fallbackAudioRef.current.muted = nextMute;
      }
      return;
    }

    if (gainNodeRef.current && audioCtxRef.current) {
      const effective = nextMute ? 0 : volume;
      gainNodeRef.current.gain.setValueAtTime(effective, audioCtxRef.current.currentTime);
    }
  };

  // ─── Bookmark Current Quote Feature ────────────────────────────────────
  const bookmarkCurrentQuote = async () => {
    const quote = currentActiveSentence || `Audiobook mark at ${formatTime(currentTime)}`;
    try {
      await api.createAnnotation(
        bookId,
        'bookmark',
        `time:${Math.round(currentTime)}`,
        undefined,
        quote,
        `Audiobook bookmark [${formatTime(currentTime)}] ${activeChapterTitle || ''}`,
        '#f59e0b',
        undefined,
        activeChapterTitle
      );
      useToastStore.getState().addToast({
        title: '🔖 Quote Bookmarked!',
        description: `Saved: "${quote.slice(0, 50)}${quote.length > 50 ? '...' : ''}"`,
        variant: 'success',
      });
    } catch {
      useToastStore.getState().addToast({
        title: 'Bookmark Saved',
        description: `Position saved at ${formatTime(currentTime)}.`,
        variant: 'info',
      });
    }
  };

  // ─── Scrubber Timeline Event Handlers ──────────────────────────────────
  const calculateScrubTimeFromEvent = (e: React.MouseEvent<HTMLDivElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    return ratio * duration;
  };

  const handleSeekStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    const target = calculateScrubTimeFromEvent(e);
    setScrubTime(target);
  };

  const handleSeekMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = calculateScrubTimeFromEvent(e);
    setHoverTime(target);
    if (isScrubbing) {
      setScrubTime(target);
    }
  };

  const handleSeekEnd = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      const target = calculateScrubTimeFromEvent(e);
      setIsScrubbing(false);
      seekToTime(target);
    }
  };

  // ─── Chapter Switching (Strictly skips image / empty placeholder chapters) ─
  const prevChapter = () => {
    if (currentChapterPos > 0) {
      const prevCh = chapterList[currentChapterPos - 1];
      setSelectedChapterIndex(prevCh.index);
      setActiveChapterTitle(prevCh.title);
      seekToTime(0);
    }
  };

  const nextChapter = () => {
    if (currentChapterPos < chapterList.length - 1) {
      const nextCh = chapterList[currentChapterPos + 1];
      setSelectedChapterIndex(nextCh.index);
      setActiveChapterTitle(nextCh.title);
      seekToTime(0);
    }
  };

  // ─── Sleep Timer with Gentle Bedtime Fadeout ─────────────────────────────
  const setSleepTimer = (minutes: number) => {
    setSleepMinutes(minutes);
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    if (minutes === 0) {
      setSleepRemainingSeconds(null);
      return;
    }

    const initialSecs =
      minutes === -1 ? Math.max(10, Math.round(duration - currentTime)) : minutes * 60;
    setSleepRemainingSeconds(initialSecs);

    sleepTimerRef.current = setInterval(() => {
      setSleepRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
          if (isPlayingRef.current) {
            void togglePlay();
          }
          useToastStore.getState().addToast({
            title: '🌙 Sleep Timer Completed',
            description: 'Audiobook playback paused.',
            variant: 'info',
          });
          return null;
        }

        // Gentle volume fadeout during the last 5 seconds
        if (prev <= 5 && gainNodeRef.current && audioCtxRef.current) {
          const fadeRatio = (prev - 1) / 5;
          gainNodeRef.current.gain.setValueAtTime(volume * fadeRatio, audioCtxRef.current.currentTime);
        }

        return prev - 1;
      });
    }, 1000);
  };

  // ─── Keyboard Shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          void togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipRelative(-15);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipRelative(30);
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'KeyB':
          e.preventDefault();
          void bookmarkCurrentQuote();
          break;
        case 'Escape':
          e.preventDefault();
          if (showChapterDrawer) {
            setShowChapterDrawer(false);
          } else {
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, duration, showChapterDrawer, onClose]);

  const progressRatio = duration > 0 ? (displayTime / duration) * 100 : 0;
  const remainingTime = duration > 0 ? duration - displayTime : 0;

  // Filtered chapters for the quick jump drawer
  const filteredChapters = useMemo(() => {
    if (!chapterSearch.trim()) return chapterList;
    const q = chapterSearch.toLowerCase();
    return chapterList.filter(
      (c) => c.title.toLowerCase().includes(q) || `chapter ${c.index + 1}`.includes(q)
    );
  }, [chapterList, chapterSearch]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col select-none overflow-hidden font-sans bg-background text-foreground transition-colors duration-200">
      {/* ─── Hidden HTML5 Fallback Audio Element ─── */}
      {usingFallbackAudio && fallbackAudioUrl && (
        <audio
          ref={fallbackAudioRef}
          src={fallbackAudioUrl}
          preload="auto"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (d && !isNaN(d)) setDuration(d);
            setIsLoadingAudio(false);
          }}
          onTimeUpdate={(e) => {
            if (!isScrubbing) {
              setCurrentTime(e.currentTarget.currentTime);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            void saveProgress(duration, duration);
          }}
        />
      )}

      {/* ─── TOP BAR (Clean, Native Shiori Header) ─── */}
      <header className="relative z-20 flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-border bg-card/90 backdrop-blur-md shrink-0">
        {/* Left: Back Button & Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 transition-all active:scale-95 cursor-pointer"
            title="Return to Library (Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Library</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-secondary text-secondary-foreground border border-border/50">
                <Headphones className="w-3 h-3 text-primary" />
                <span>Audiobook</span>
              </span>

              {/* Live Soundwave Mini Visualizer */}
              {isPlaying && (
                <div className="hidden sm:flex items-center gap-0.5 px-1.5 py-1 rounded-md bg-secondary text-primary">
                  <span className="w-0.5 h-2 bg-current rounded-full animate-pulse" />
                  <span className="w-0.5 h-3 bg-current rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                  <span className="w-0.5 h-1.5 bg-current rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  <span className="w-0.5 h-2.5 bg-current rounded-full animate-pulse" style={{ animationDelay: '75ms' }} />
                </div>
              )}

              {sleepRemainingSeconds !== null && (
                <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-primary/10 text-primary border border-primary/20 animate-pulse">
                  <Moon className="w-2.5 h-2.5" />
                  {formatTime(sleepRemainingSeconds)}
                </span>
              )}
            </div>
            <h1 className="text-xs sm:text-sm font-bold truncate max-w-xs sm:max-w-md mt-0.5 text-foreground">
              {title}
            </h1>
          </div>
        </div>

        {/* Center: View Mode Segmented Control ([Player] • [Read Along] • [Split]) */}
        <div className="flex items-center p-0.5 rounded-xl border border-border/60 bg-secondary/60">
          <button
            type="button"
            onClick={() => setViewMode('player')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'player'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Focus Album Art Player"
          >
            <Disc className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Player</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('read-along')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'read-along'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Full Screen Live Lyrics / Read Along"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Read Along</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'split'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Side-by-Side Dual View"
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>
        </div>

        {/* Right: Quick Features Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Chapter Drawer Toggle Button */}
          {chapterList.length > 0 && (
            <button
              type="button"
              onClick={() => setShowChapterDrawer(true)}
              className="h-8 px-2.5 text-xs font-semibold rounded-xl border border-border/60 bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Browse Chapters"
            >
              <ListMusic className="w-3.5 h-3.5 opacity-80" />
              <span className="hidden sm:inline">Chapters</span>
            </button>
          )}

          {/* Bookmark Quote Button */}
          <button
            type="button"
            onClick={bookmarkCurrentQuote}
            className="h-8 w-8 rounded-xl border border-border/60 bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            title="Bookmark Current Sentence (B)"
          >
            <Bookmark className="w-3.5 h-3.5 text-primary" />
          </button>

          {/* Typography Settings Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-8 w-8 sm:w-auto sm:px-2.5 text-xs font-semibold rounded-xl border border-border/60 bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="Appearance Settings"
              >
                <Type className="w-3.5 h-3.5 opacity-80" />
                <span className="hidden sm:inline">Text</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 p-2 rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl backdrop-blur-md"
            >
              <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wider px-2 text-muted-foreground">
                Read-Along Text Size
              </DropdownMenuLabel>
              <div className="grid grid-cols-3 gap-1 p-1 mb-2">
                {[
                  { id: 'normal', label: 'Default' },
                  { id: 'large', label: 'Large' },
                  { id: 'xlarge', label: 'Huge' },
                ].map((sizeOpt) => (
                  <button
                    key={sizeOpt.id}
                    type="button"
                    onClick={() => setFontSize(sizeOpt.id as any)}
                    className={`py-1.5 text-xs font-semibold rounded-lg text-center transition-all cursor-pointer ${
                      fontSize === sizeOpt.id
                        ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {sizeOpt.label}
                  </button>
                ))}
              </div>

              <DropdownMenuSeparator className="bg-border/60" />

              <DropdownMenuItem
                onClick={() => {
                  setIsAutoScrollEnabled(!isAutoScrollEnabled);
                  setUserHasScrolledAway(false);
                }}
                className="flex items-center justify-between text-xs cursor-pointer p-2 rounded-xl mt-1"
              >
                <span className="flex items-center gap-2">
                  <Navigation className="w-3.5 h-3.5 text-primary" />
                  <span>Auto-Scroll Active Line</span>
                </span>
                {isAutoScrollEnabled && <Check className="w-3.5 h-3.5 text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Speed Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-8 px-2.5 text-xs font-semibold rounded-xl border border-border/60 bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Gauge className="w-3.5 h-3.5 opacity-80" />
                <span>{playbackRate}x</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40 p-1.5 rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl backdrop-blur-md"
            >
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 text-muted-foreground">
                Playback Speed
              </DropdownMenuLabel>
              {PLAYBACK_RATES.map((rate) => (
                <DropdownMenuItem
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  className={`flex items-center justify-between text-xs cursor-pointer rounded-xl font-medium p-2 transition-colors ${
                    playbackRate === rate ? 'bg-primary/10 text-primary font-bold' : ''
                  }`}
                >
                  <span>{rate}x Speed</span>
                  {playbackRate === rate && <Check className="w-3.5 h-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sleep Timer */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`h-8 px-2.5 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                  sleepRemainingSeconds !== null
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                <Moon className="w-3.5 h-3.5 opacity-80" />
                <span className="hidden sm:inline">
                  {sleepRemainingSeconds !== null ? formatTime(sleepRemainingSeconds) : 'Timer'}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 p-1.5 rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl backdrop-blur-md"
            >
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 text-muted-foreground">
                Bedtime Sleep Timer
              </DropdownMenuLabel>
              {SLEEP_TIMER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.minutes}
                  onClick={() => setSleepTimer(opt.minutes)}
                  className={`flex items-center justify-between text-xs cursor-pointer rounded-xl font-medium p-2 transition-colors ${
                    sleepMinutes === opt.minutes ? 'bg-primary/10 text-primary font-bold' : ''
                  }`}
                >
                  <span>{opt.label}</span>
                  {sleepMinutes === opt.minutes && <Check className="w-3.5 h-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
              {sleepRemainingSeconds !== null && (
                <>
                  <DropdownMenuSeparator className="bg-border/60 my-1" />
                  <DropdownMenuItem
                    onClick={() => setSleepTimer(0)}
                    className="flex items-center gap-2 text-xs text-destructive hover:bg-destructive/10 cursor-pointer rounded-xl font-semibold p-2"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel Timer ({formatTime(sleepRemainingSeconds)} left)</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ─── MAIN BODY ─── */}
      <main className="relative z-10 flex-1 overflow-hidden flex items-stretch min-h-0 bg-background text-foreground">
        {/* Error Alert Box */}
        {audioError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-md w-full p-4 rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive shadow-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="font-semibold text-xs">{audioError}</span>
            </div>
            <button
              type="button"
              onClick={loadAudioFile}
              className="h-7 px-3 text-xs rounded-xl font-bold border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* ─── VIEW MODE: 1. IMMERSIVE CENTER PLAYER ─── */}
        {viewMode === 'player' && (
          <div className="w-full h-full max-w-2xl mx-auto flex flex-col items-center justify-center p-6 text-center min-h-0">
            {/* Center Artwork Container */}
            <div className="w-56 sm:w-72 md:w-80 aspect-[2/3] rounded-3xl overflow-hidden shadow-2xl border border-border/60 bg-card relative transition-transform duration-500 hover:scale-[1.01]">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-secondary/40">
                  <Headphones className="w-20 h-20 text-muted-foreground/40" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Audiobook</span>
                </div>
              )}
            </div>

            {/* Metadata & Chapter Pill */}
            <div className="mt-6 max-w-md w-full">
              <h2 className="text-lg sm:text-xl font-bold line-clamp-1 leading-snug text-foreground">
                {title}
              </h2>
              <p className="text-xs font-medium truncate mt-1 text-muted-foreground">
                {author}
              </p>
              {activeChapterTitle && (
                <p className="text-xs font-semibold mt-1 text-primary">
                  {activeChapterTitle}
                </p>
              )}
            </div>

            {/* Live Subtitle Caption Box (Shows the currently spoken line right on the player!) */}
            <div className="mt-5 w-full max-w-xl p-4 rounded-2xl border border-border/60 bg-card/80 shadow-xs transition-all duration-300">
              <div className="flex items-center justify-between mb-1.5 text-muted-foreground">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Radio className="w-3 h-3 text-primary animate-pulse" />
                  <span>Now Speaking</span>
                </span>
                <span className="text-[10px] font-mono">
                  {formatTime(currentTime)}
                </span>
              </div>
              <p className="text-sm sm:text-base font-semibold leading-relaxed line-clamp-3 text-foreground">
                {currentActiveSentence || 'Reading text will appear here synchronously...'}
              </p>
            </div>
          </div>
        )}

        {/* ─── VIEW MODE: 2. FULL-SCREEN READ ALONG ─── */}
        {viewMode === 'read-along' && (
          <div className="w-full h-full max-w-4xl mx-auto flex flex-col p-6 sm:p-10 relative overflow-hidden min-h-0">
            {/* Top Indicator */}
            <div className="flex items-center justify-between pb-3 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Read Along
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  isPlaying ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                }`}>
                  {isPlaying ? '● Live' : 'Paused'}
                </span>
              </div>

              {activeChapterTitle && (
                <span className="text-xs font-semibold text-muted-foreground">
                  {activeChapterTitle}
                </span>
              )}
            </div>

            {/* Scrolling Stream */}
            <div
              ref={transcriptContainerRef}
              onScroll={() => {
                if (isAutoScrollEnabled) {
                  setUserHasScrolledAway(true);
                }
              }}
              className="flex-1 overflow-y-auto py-8 space-y-5 scroll-smooth min-h-0 pr-4"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent, black 5%, black 95%, transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 5%, black 95%, transparent)',
              }}
            >
              {isLoadingTranscript ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Synchronizing chapter text...
                  </span>
                </div>
              ) : transcriptLines.length > 0 ? (
                transcriptLines.map((line, idx) => {
                  const isActive = idx === activeLineIndex;

                  return (
                    <div
                      key={line.index}
                      ref={isActive ? activeLineRef : null}
                      onClick={() => {
                        seekToTime(line.startTime);
                        setUserHasScrolledAway(false);
                      }}
                      className={`group flex items-start gap-4 cursor-pointer transition-all duration-300 py-2 px-3 rounded-xl ${
                        isActive ? 'bg-primary/5 border-l-4 border-primary' : 'hover:bg-secondary/40'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className={`tracking-tight transition-all duration-300 ${
                            isActive
                              ? fontSize === 'xlarge'
                                ? 'text-2xl sm:text-3xl font-extrabold leading-snug text-foreground'
                                : fontSize === 'large'
                                ? 'text-xl sm:text-2xl font-extrabold leading-snug text-foreground'
                                : 'text-lg sm:text-xl font-bold leading-snug text-foreground'
                              : fontSize === 'xlarge'
                              ? 'text-xl sm:text-2xl font-medium leading-relaxed text-foreground/50 group-hover:text-foreground/80'
                              : fontSize === 'large'
                              ? 'text-lg sm:text-xl font-medium leading-relaxed text-foreground/50 group-hover:text-foreground/80'
                              : 'text-base sm:text-lg font-medium leading-relaxed text-foreground/50 group-hover:text-foreground/80'
                          }`}
                        >
                          {line.text}
                        </p>
                      </div>

                      <span
                        className={`text-xs font-mono shrink-0 pt-1 transition-opacity ${
                          isActive
                            ? 'text-primary font-bold opacity-100'
                            : 'text-muted-foreground opacity-0 group-hover:opacity-70'
                        }`}
                      >
                        {formatTime(line.startTime)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-muted-foreground">
                  <Headphones className="w-10 h-10 opacity-30" />
                  <p className="text-sm font-bold text-foreground">
                    No Transcript Linked
                  </p>
                  <p className="text-xs max-w-sm">
                    Audiobooks converted from books in your library automatically link their chapter text for live reading along.
                  </p>
                </div>
              )}
            </div>

            {/* Resume Auto-Scroll Pill */}
            {userHasScrolledAway && isAutoScrollEnabled && (
              <button
                type="button"
                onClick={() => {
                  setUserHasScrolledAway(false);
                  if (activeLineRef.current) {
                    activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full shadow-lg text-xs font-bold tracking-wide uppercase hover:scale-105 active:scale-95 transition-all flex items-center gap-2 border border-border bg-card text-foreground cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5 text-primary" />
                <span>Resume Auto-Scroll</span>
              </button>
            )}
          </div>
        )}

        {/* ─── VIEW MODE: 3. DUAL / SPLIT VIEW (Artwork Left + Lyrics Right) ─── */}
        {viewMode === 'split' && (
          <div className="w-full h-full max-w-7xl mx-auto flex flex-col lg:flex-row items-stretch min-h-0">
            {/* Left Column: Artwork & Chapter Navigator */}
            <div className="lg:w-80 xl:w-96 p-6 flex flex-col justify-between shrink-0 lg:border-r border-border/60">
              <div className="flex-1 flex flex-col items-center justify-center min-h-0">
                <div className="w-48 sm:w-56 md:w-64 max-w-[260px] aspect-[2/3] rounded-2xl overflow-hidden shadow-xl border border-border/60 bg-card shrink-0 relative transition-transform duration-500 hover:scale-[1.01]">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-secondary/40">
                      <Headphones className="w-16 h-16 text-muted-foreground/40" />
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Audiobook</span>
                    </div>
                  )}
                </div>

                <div className="mt-5 text-center max-w-xs w-full px-2">
                  <h2 className="text-base sm:text-lg font-bold line-clamp-2 leading-snug text-foreground">
                    {title}
                  </h2>
                  <p className="text-xs font-medium truncate mt-1 text-muted-foreground">
                    {author}
                  </p>
                </div>
              </div>

              {chapterList.length > 0 && (
                <div className="mt-4 p-2 rounded-2xl border border-border/60 bg-card flex items-center justify-between gap-2 shadow-xs">
                  <button
                    type="button"
                    onClick={prevChapter}
                    disabled={currentChapterPos <= 0}
                    className="h-8 w-8 rounded-xl flex items-center justify-center text-foreground hover:bg-secondary disabled:opacity-20 transition-all cursor-pointer"
                    title="Previous Story Chapter"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowChapterDrawer(true)}
                    className="min-w-0 text-center flex-1 px-2 py-1 rounded-xl hover:bg-secondary transition-all cursor-pointer"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Chapter {currentChapterPos + 1} of {chapterList.length}
                    </p>
                    <p className="text-xs font-bold truncate mt-0.5 text-foreground">
                      {activeChapterTitle || chapterList[currentChapterPos]?.title}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={nextChapter}
                    disabled={currentChapterPos >= chapterList.length - 1}
                    className="h-8 w-8 rounded-xl flex items-center justify-center text-foreground hover:bg-secondary disabled:opacity-20 transition-all cursor-pointer"
                    title="Next Story Chapter"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Clean Read Along */}
            <div className="flex-1 min-w-0 h-full flex flex-col p-6 sm:p-10 relative overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-border/60 shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Read Along
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    isPlaying ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                  }`}>
                    {isPlaying ? '● Live' : 'Paused'}
                  </span>
                </div>

                {activeChapterTitle && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    {activeChapterTitle}
                  </span>
                )}
              </div>

              <div
                ref={transcriptContainerRef}
                onScroll={() => {
                  if (isAutoScrollEnabled) {
                    setUserHasScrolledAway(true);
                  }
                }}
                className="flex-1 overflow-y-auto py-8 space-y-4 scroll-smooth min-h-0 pr-4"
                style={{
                  maskImage: 'linear-gradient(to bottom, transparent, black 6%, black 94%, transparent)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 6%, black 94%, transparent)',
                }}
              >
                {isLoadingTranscript ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Synchronizing chapter text...
                    </span>
                  </div>
                ) : transcriptLines.length > 0 ? (
                  transcriptLines.map((line, idx) => {
                    const isActive = idx === activeLineIndex;

                    return (
                      <div
                        key={line.index}
                        ref={isActive ? activeLineRef : null}
                        onClick={() => {
                          seekToTime(line.startTime);
                          setUserHasScrolledAway(false);
                        }}
                        className={`group flex items-start gap-4 cursor-pointer transition-all duration-300 py-2.5 px-3 rounded-xl ${
                          isActive
                            ? 'bg-primary/10 border-l-4 border-primary'
                            : 'hover:bg-secondary/40'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            className={`tracking-tight transition-all duration-300 ${
                              isActive
                                ? fontSize === 'xlarge'
                                ? 'text-2xl sm:text-3xl font-extrabold leading-snug text-foreground'
                                : fontSize === 'large'
                                ? 'text-xl sm:text-2xl font-extrabold leading-snug text-foreground'
                                : 'text-lg sm:text-xl font-bold leading-snug text-foreground'
                              : fontSize === 'xlarge'
                              ? 'text-xl sm:text-2xl font-medium leading-relaxed text-foreground/50 group-hover:text-foreground/80'
                              : fontSize === 'large'
                              ? 'text-lg sm:text-xl font-medium leading-relaxed text-foreground/50 group-hover:text-foreground/80'
                              : 'text-base sm:text-lg font-medium leading-relaxed text-foreground/50 group-hover:text-foreground/80'
                            }`}
                          >
                            {line.text}
                          </p>
                        </div>

                        <span
                          className={`text-xs font-mono shrink-0 pt-1 transition-opacity ${
                            isActive
                              ? 'text-primary font-bold opacity-100'
                              : 'text-muted-foreground opacity-0 group-hover:opacity-70'
                          }`}
                        >
                          {formatTime(line.startTime)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-muted-foreground">
                    <Headphones className="w-10 h-10 opacity-30" />
                    <p className="text-sm font-bold text-foreground">
                      No Transcript Linked
                    </p>
                    <p className="text-xs max-w-sm">
                      Audiobooks converted from books in your library automatically link their chapter text for live reading along.
                    </p>
                  </div>
                )}
              </div>

              {userHasScrolledAway && isAutoScrollEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setUserHasScrolledAway(false);
                    if (activeLineRef.current) {
                      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full shadow-lg text-xs font-bold tracking-wide uppercase hover:scale-105 active:scale-95 transition-all flex items-center gap-2 border border-border bg-card text-foreground cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5 text-primary" />
                  <span>Resume Auto-Scroll</span>
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── BOTTOM CONTROLS DOCK ─── */}
      <footer className="relative z-20 px-6 sm:px-10 py-3.5 border-t border-border bg-card/90 backdrop-blur-md shrink-0">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Scrubber Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-semibold w-12 text-right text-muted-foreground">
              {formatTime(displayTime)}
            </span>

            <div
              className="relative flex-1 h-4 flex items-center cursor-pointer group/seek"
              onMouseDown={handleSeekStart}
              onMouseMove={handleSeekMove}
              onMouseUp={handleSeekEnd}
              onMouseLeave={() => setHoverTime(null)}
            >
              {/* Background Track */}
              <div className="w-full h-1.5 group-hover/seek:h-2 rounded-full overflow-hidden transition-all duration-150 relative bg-secondary">
                {/* Active Progress Fill */}
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-75 bg-primary"
                  style={{ width: `${progressRatio}%` }}
                />
              </div>

              {/* Scrubber Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full shadow-md bg-primary opacity-0 group-hover/seek:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `${progressRatio}%` }}
              />

              {/* Hover Tooltip */}
              {hoverTime !== null && (
                <div
                  className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shadow-md border border-border bg-card text-foreground pointer-events-none"
                  style={{ left: `${duration > 0 ? (hoverTime / duration) * 100 : 0}%` }}
                >
                  {formatTime(hoverTime)}
                </div>
              )}
            </div>

            <span className="text-xs font-mono font-semibold w-12 text-left text-muted-foreground">
              -{formatTime(remainingTime)}
            </span>
          </div>

          {/* Primary Controls Row */}
          <div className="flex items-center justify-between pt-0.5">
            {/* Left: Volume Slider */}
            <div className="flex items-center gap-2 w-32 sm:w-40">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1 rounded-lg transition-colors hover:text-foreground text-muted-foreground cursor-pointer"
                title="Mute (M)"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-destructive" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full cursor-pointer accent-primary bg-secondary"
              />
            </div>

            {/* Center: Tactile Core Buttons */}
            <div className="flex items-center gap-4 sm:gap-6">
              {/* Skip -15s */}
              <button
                type="button"
                onClick={() => skipRelative(-15)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary active:scale-95 transition-all cursor-pointer"
                title="Rewind 15 seconds (Left Arrow)"
              >
                <SkipBack15Icon className="w-6 h-6" />
              </button>

              {/* Main Play/Pause Button (Shiori Signature Tactile Style) */}
              <button
                type="button"
                onClick={() => void togglePlay()}
                disabled={isLoadingAudio}
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-full shadow-md hover:scale-105 active:scale-95 flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 bg-primary text-primary-foreground"
                title="Play / Pause (Space)"
              >
                {isLoadingAudio ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
                ) : (
                  <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current ml-0.5" />
                )}
              </button>

              {/* Skip +30s */}
              <button
                type="button"
                onClick={() => skipRelative(30)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary active:scale-95 transition-all cursor-pointer"
                title="Fast forward 30 seconds (Right Arrow)"
              >
                <SkipForward30Icon className="w-6 h-6" />
              </button>
            </div>

            {/* Right: Chapter Info & Speed */}
            <div className="w-32 sm:w-40 flex items-center justify-end gap-2">
              <span className="text-xs font-mono font-medium hidden sm:inline text-muted-foreground">
                {playbackRate}x speed
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* ─── CHAPTER QUICK-JUMP SLIDE-OVER DRAWER (Full Viewport z-[100]) ─── */}
      {showChapterDrawer && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          {/* Backdrop (Dims entire reader & player) */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
            onClick={() => setShowChapterDrawer(false)}
          />

          {/* Slide-over Drawer Panel */}
          <div className="relative z-10 w-full max-w-sm sm:max-w-md h-full bg-card text-card-foreground border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-border/60 flex items-center justify-between bg-card shrink-0">
              <div className="flex items-center gap-2.5">
                <ListMusic className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="text-base font-bold text-foreground">Table of Contents</h3>
                  <p className="text-xs text-muted-foreground">
                    {chapterList.length} chapters · Chapter {selectedChapterIndex + 1} active
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChapterDrawer(false)}
                className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-foreground cursor-pointer transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search box */}
            <div className="p-3 border-b border-border/60 bg-muted/20 shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-secondary/50 focus-within:border-primary/60 transition-colors">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Search chapters..."
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  className="w-full bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground"
                  autoFocus
                />
                {chapterSearch && (
                  <button
                    type="button"
                    onClick={() => setChapterSearch('')}
                    className="p-0.5 rounded-full hover:bg-secondary text-muted-foreground cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Chapter Items List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredChapters.map((ch) => {
                const isSelected = selectedChapterIndex === ch.index;
                const chapterPos = chapterList.findIndex((c) => c.index === ch.index);
                const displayNum = chapterPos >= 0 ? chapterPos + 1 : ch.index + 1;
                return (
                  <button
                    key={ch.index}
                    type="button"
                    onClick={() => {
                      setSelectedChapterIndex(ch.index);
                      setActiveChapterTitle(ch.title);
                      setShowChapterDrawer(false);
                      seekToTime(0);
                    }}
                    className={`w-full flex items-center justify-between p-3 text-xs rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary/15 text-primary font-bold border border-primary/30 shadow-xs'
                        : 'text-foreground hover:bg-secondary/60 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-6 text-center font-mono ${isSelected ? 'font-bold text-primary' : 'opacity-50'}`}>
                        {displayNum}
                      </span>
                      <span className="truncate">{ch.title}</span>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isPlaying && (
                          <div className="flex items-center gap-0.5">
                            <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse" />
                            <span className="w-0.5 h-3.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                            <span className="w-0.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                          </div>
                        )}
                        <Check className="w-4 h-4 text-primary ml-1" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default AudiobookPlayer;
