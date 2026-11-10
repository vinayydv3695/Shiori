/**
 * AudiobookConvertDialog.tsx
 *
 * Full batch audiobook conversion dialog for books in Shiori.
 * Supports:
 * - ElevenLabs AI (with live 10k free tier quota tracking & Flash v2.5 efficiency)
 * - Microsoft Edge Neural TTS (100% Free, unlimited, studio-grade voices)
 * - Chapter-by-chapter MP3s OR single merged MP3 file export
 * - Seamless automatic quota fallback from ElevenLabs to Free Edge TTS
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Headphones,
  Check,
  Loader2,
  X,
  Volume2,
  Mic,
  Layers,
  FileAudio,
  FolderDown,
  AlertTriangle,
  Play,
  Square,
  ArrowRight,
  ArrowDownLeft,
  Minus,
  Info,
  Search,
  Sparkles,
  Clock,
  Eye,
  EyeOff,
  Library,
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, isTauri } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { cleanChapterContent, extractCleanSentences, isPlaceholderChapter } from '@/lib/audiobookTextCleaner';
import { useToastStore } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useElevenLabsStore } from '@/store/elevenLabsStore';
import { useAudiobookConversionStore, type ConvertChapterItem } from '@/store/audiobookConversionStore';
import {
  useReadingSettings,
  applyReaderThemeToElement,
  removeReaderThemeFromElement,
} from '@/store/premiumReaderStore';
import {
  synthesizeElevenLabsAudio,
  isQuotaExceededError,
  formatQuotaProgress,
  ELEVENLABS_MODELS,
} from '@/lib/elevenLabs';
import { synthesizeEdgeSpeech, POPULAR_EDGE_VOICES } from '@/lib/edgeTTS';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

export interface AudiobookConvertDialogProps {
  bookId: number;
  bookTitle: string;
  bookAuthor?: string;
  coverUrl?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface ChapterItem {
  index: number;
  title: string;
  characterCount: number;
  content: string;
  isPlaceholder: boolean;
  selected: boolean;
}

type AudioEngine = 'elevenlabs' | 'edge';
type OutputFormat = 'chapters' | 'merged';

export function AudiobookConvertDialog({
  bookId,
  bookTitle,
  bookAuthor,
  coverUrl,
  isOpen,
  onClose,
}: AudiobookConvertDialogProps) {
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Engine & Settings
  const [engine, setEngine] = useState<AudioEngine>('edge');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('chapters');
  const [rate, setRate] = useState<number>(1.0);

  // Voices
  const elevenLabs = useElevenLabsStore();
  const [selectedElevenVoice, setSelectedElevenVoice] = useState<string>(
    elevenLabs.selectedVoiceId || elevenLabs.cachedVoices[0]?.voice_id || '21m00Tcm4TlvDq8ikWAM' // Rachel
  );
  const [selectedEdgeVoice, setSelectedEdgeVoice] = useState<string>('en-US-GuyNeural');

  // Resolved metadata (cover art & author name auto-fetched if not passed)
  const [resolvedCoverUrl, setResolvedCoverUrl] = useState<string | null>(coverUrl || null);
  const [resolvedAuthor, setResolvedAuthor] = useState<string>(bookAuthor || '');

  // Voice Preview
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Conversion state from global background store
  const isConverting = useAudiobookConversionStore((s) => s.isConverting);
  const progressPercent = useAudiobookConversionStore((s) => s.progressPercent);
  const currentChapterTitle = useAudiobookConversionStore((s) => s.currentChapterTitle);
  const statusDetail = useAudiobookConversionStore((s) => s.statusDetail);
  const processedChars = useAudiobookConversionStore((s) => s.processedChars);
  const estimatedRemainingSecs = useAudiobookConversionStore((s) => s.estimatedRemainingSecs);
  const startConversion = useAudiobookConversionStore((s) => s.startConversion);
  const cancelConversion = useAudiobookConversionStore((s) => s.cancelConversion);
  const minimize = useAudiobookConversionStore((s) => s.minimize);
  const showQuotaPrompt = useAudiobookConversionStore((s) => s.showQuotaPrompt);
  const resolveQuotaPrompt = useAudiobookConversionStore((s) => s.resolveQuotaPrompt);

  const [autoImportToLibrary, setAutoImportToLibrary] = useState(true);
  const [chapterSearch, setChapterSearch] = useState('');
  const [hidePlaceholders, setHidePlaceholders] = useState(true);

  // Sync reader theme to portalled modal container
  const readerTheme = useReadingSettings((s) => s.theme) || 'sepia';
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = modalRef.current;
    if (!el || !isOpen) return;
    applyReaderThemeToElement(el, readerTheme);
    return () => {
      removeReaderThemeFromElement(el);
    };
  }, [readerTheme, isOpen]);

  // Auto-resolve book metadata (cover & author) if caller omitted them
  useEffect(() => {
    if (coverUrl) setResolvedCoverUrl(coverUrl);
    if (bookAuthor) setResolvedAuthor(bookAuthor);

    if (isOpen && bookId && (!coverUrl || !bookAuthor)) {
      api.getBook(bookId).then((b) => {
        if (!b) return;
        const authorStr = b.authors && b.authors.length > 0
          ? b.authors.map((a: { name: string }) => a.name).join(', ')
          : '';
        if (!bookAuthor && authorStr) setResolvedAuthor(authorStr);
        if (!coverUrl && b.cover_path) {
          setResolvedCoverUrl(convertFileSrc(b.cover_path.replace(/\\/g, '/')));
        }
      }).catch(() => {});
    }
  }, [isOpen, bookId, coverUrl, bookAuthor]);

  // Clean up voice preview on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPlayingPreview(false);
  };

  const handleTogglePreview = async () => {
    if (isPlayingPreview) {
      stopPreview();
      return;
    }

    try {
      setIsPlayingPreview(true);
      const sampleText = "The journey of a thousand pages begins with a single chapter.";
      let blob: Blob;

      if (engine === 'elevenlabs') {
        const buf = await synthesizeElevenLabsAudio({
          text: sampleText,
          voiceId: selectedElevenVoice,
          modelId: elevenLabs.selectedModel,
          apiKey: elevenLabs.apiKey,
          rate: 1.0,
        });
        blob = new Blob([buf], { type: 'audio/mp3' });
      } else {
        blob = await synthesizeEdgeSpeech(sampleText, {
          voice: selectedEdgeVoice,
          rate: 1.0,
        });
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setIsPlayingPreview(false);
        previewAudioRef.current = null;
      };
      audio.onerror = () => {
        setIsPlayingPreview(false);
        previewAudioRef.current = null;
      };
      await audio.play();
    } catch (err) {
      logger.warn('[Audiobook] Voice preview error:', err);
      setIsPlayingPreview(false);
    }
  };

  // Load chapters when dialog opens
  useEffect(() => {
    if (!isOpen || !bookId) return;

    let isMounted = true;
    setIsLoadingChapters(true);
    setLoadError(null);

    const loadBookChapters = async () => {
      try {
        const count = await api.getBookChapterCount(bookId);
        const loaded: ChapterItem[] = [];
        let selectedStoryCount = 0;

        // Fetch chapters, estimate character count & detect image placeholders
        for (let i = 0; i < count; i++) {
          try {
            const ch = await api.getBookChapter(bookId, i);
            // Strip HTML tags and redundant book title headers for clean story-first audio
            const cleanText = cleanChapterContent(ch.content, bookTitle, ch.title);
            const isPlaceholder = isPlaceholderChapter(ch.content, ch.title, cleanText.length);
            // Select first 3 REAL STORY chapters by default (skipping covers/inserts) to protect free quota
            const shouldSelect = !isPlaceholder && selectedStoryCount < 3;
            if (shouldSelect) {
              selectedStoryCount++;
            }
            loaded.push({
              index: i,
              title: ch.title || `Chapter ${i + 1}`,
              characterCount: cleanText.length,
              content: cleanText,
              isPlaceholder,
              selected: shouldSelect,
            });
          } catch (e) {
            logger.warn(`[Audiobook] Failed to load chapter ${i}:`, e);
          }
        }

        if (isMounted) {
          setChapters(loaded);
          setIsLoadingChapters(false);
        }
      } catch (err) {
        if (isMounted) {
          logger.error('[Audiobook] Failed to load chapters:', err);
          setLoadError('Failed to load book chapters. Please check that the book is accessible.');
          setIsLoadingChapters(false);
        }
      }
    };

    loadBookChapters();

    // Auto-refresh ElevenLabs subscription quota if key is present
    if (elevenLabs.apiKey) {
      void elevenLabs.refreshSubscription();
      if (elevenLabs.cachedVoices.length === 0) {
        void elevenLabs.refreshVoices();
      }
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, bookId, elevenLabs.apiKey]);

  // Aggregate selected chapters calculation
  const selectedChapters = useMemo(() => chapters.filter((c) => c.selected), [chapters]);
  const totalCharacters = useMemo(
    () => selectedChapters.reduce((acc, c) => acc + c.characterCount, 0),
    [selectedChapters]
  );
  const estimatedDurationMinutes = useMemo(() => {
    // Average reading speed ~ 150 words/min ≈ 750 characters/min
    return Math.max(1, Math.round(totalCharacters / 750 / rate));
  }, [totalCharacters, rate]);

  // Quota assessment for ElevenLabs
  const quotaInfo = useMemo(() => {
    if (!elevenLabs.subscription) return null;
    return formatQuotaProgress(
      elevenLabs.subscription.character_count,
      elevenLabs.subscription.character_limit
    );
  }, [elevenLabs.subscription]);

  const exceedsQuota = useMemo(() => {
    if (engine !== 'elevenlabs' || !quotaInfo) return false;
    return totalCharacters > quotaInfo.remaining;
  }, [engine, quotaInfo, totalCharacters]);

  const placeholderCount = useMemo(() => chapters.filter((c) => c.isPlaceholder).length, [chapters]);
  const storyChaptersCount = useMemo(() => chapters.length - placeholderCount, [chapters, placeholderCount]);

  const toggleChapter = (index: number) => {
    setChapters((prev) =>
      prev.map((c) => (c.index === index ? { ...c, selected: !c.selected } : c))
    );
  };

  const selectAll = (select: boolean) => {
    setChapters((prev) =>
      prev.map((c) => ({
        ...c,
        selected: select ? !c.isPlaceholder : false,
      }))
    );
  };

  const selectStoryOnly = () => {
    setChapters((prev) =>
      prev.map((c) => ({
        ...c,
        selected: !c.isPlaceholder && c.characterCount >= 80,
      }))
    );
  };

  const toggleSelectAll = () => {
    const targetCount = storyChaptersCount > 0 ? storyChaptersCount : chapters.length;
    const shouldSelectAll = selectedChapters.length < targetCount;
    selectAll(shouldSelectAll);
  };

  const filteredChapters = useMemo(() => {
    let list = chapters;
    if (hidePlaceholders) {
      list = list.filter((c) => !c.isPlaceholder);
    }
    if (chapterSearch.trim()) {
      const q = chapterSearch.toLowerCase();
      list = list.filter(
        (c) => c.title.toLowerCase().includes(q) || `chapter ${c.index + 1}`.includes(q)
      );
    }
    return list;
  }, [chapters, hidePlaceholders, chapterSearch]);

  // ─── Batch Conversion Pipeline ──────────────────────────────────────────
  const handleStartConversion = async () => {
    const validChaptersToConvert = selectedChapters.filter(
      (c) => !c.isPlaceholder && c.characterCount >= 60 && c.content.trim().length > 0
    );

    if (validChaptersToConvert.length === 0) {
      useToastStore.getState().addToast({
        title: 'No Text Chapters Selected',
        description: 'Selected chapters only contain images or empty placeholders. Please select story chapters to convert.',
        variant: 'error',
      });
      return;
    }

    if (engine === 'elevenlabs' && !elevenLabs.apiKey) {
      useToastStore.getState().addToast({
        title: 'ElevenLabs Key Required',
        description: 'Please enter your API key or switch to 100% Free Edge Neural TTS.',
        variant: 'error',
      });
      return;
    }

    stopPreview();

    await startConversion({
      bookId,
      bookTitle,
      bookAuthor: resolvedAuthor,
      coverUrl: resolvedCoverUrl,
      chaptersToConvert: validChaptersToConvert,
      totalCharacters,
      engine,
      outputFormat,
      rate,
      selectedEdgeVoice,
      selectedElevenVoice,
      autoImportToLibrary,
    });
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (isConverting) {
              minimize();
            }
            onClose();
          }
        }}
      >
        <DialogContent
          ref={modalRef}
          className="sm:max-w-[580px] w-[95vw] max-h-[86vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl border border-border/80 shadow-2xl z-[210] focus:outline-none"
          style={{
            backgroundColor: 'var(--bg-elevated, hsl(var(--card)))',
            color: 'var(--text-primary, hsl(var(--card-foreground)))',
            opacity: 1,
          }}
        >
          {/* Header */}
          <DialogHeader className="p-4 sm:p-5 border-b border-border/50 bg-muted/20 shrink-0">
            <div className="flex items-center gap-3.5 pr-8">
              <div className="relative w-11 h-15 sm:w-12 sm:h-16 rounded-lg overflow-hidden border border-border/80 shadow-xs shrink-0 bg-muted/40 flex items-center justify-center">
                {resolvedCoverUrl ? (
                  <img src={resolvedCoverUrl} alt={bookTitle} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-1 bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                    <Headphones className="w-5 h-5 mb-0.5 opacity-80" />
                    <span className="text-[8px] font-black uppercase tracking-wider text-center line-clamp-1">Audio</span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                    Audiobook Studio
                  </span>
                  {chapters.length > 0 && (
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {storyChaptersCount} story chapters
                    </span>
                  )}
                </div>
                <DialogTitle className="text-base font-bold tracking-tight text-foreground truncate leading-snug">
                  {bookTitle}
                </DialogTitle>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {resolvedAuthor ? `by ${resolvedAuthor}` : 'AI Audiobook Narration'}
                </p>
              </div>
              {isConverting && (
                <button
                  type="button"
                  onClick={() => {
                    minimize();
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer border border-primary/20 shrink-0 flex items-center gap-1 mr-2"
                  title="Hide to background and continue reading"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Hide</span>
                </button>
              )}
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
            {isLoadingChapters ? (
              <div className="py-14 flex flex-col items-center justify-center gap-2.5 text-muted-foreground">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <span className="text-xs font-semibold">Extracting book chapters & content...</span>
              </div>
            ) : loadError ? (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
                {loadError}
              </div>
            ) : (
              <>
                {/* ─── Minimal Segmented Narration Engine ─── */}
                <div className="p-1 bg-muted/40 rounded-xl border border-border/50 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEngine('edge')}
                    disabled={isConverting}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      engine === 'edge'
                        ? 'bg-background text-foreground shadow-2xs border border-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5 text-primary" />
                    <span>Free Edge Neural</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                      100% Free
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEngine('elevenlabs')}
                    disabled={isConverting}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      engine === 'elevenlabs'
                        ? 'bg-background text-foreground shadow-2xs border border-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5 text-amber-500" />
                    <span>ElevenLabs AI</span>
                    {quotaInfo ? (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                        {Math.round(quotaInfo.remaining / 1000)}k left
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                        10k Free
                      </span>
                    )}
                  </button>
                </div>

                {/* Quota warning banner if exceeding free quota */}
                {exceedsQuota && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Selected chapters ({totalCharacters.toLocaleString()} chars) exceed your remaining ElevenLabs quota ({quotaInfo?.remaining.toLocaleString()} chars). Conversion will seamlessly prompt to switch to Free Edge TTS.
                    </span>
                  </div>
                )}

                {/* ─── Narrator Voice & Output Format ─── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Voice Selector with Inline Preview Button */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Narrator Voice</label>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">
                        {engine === 'elevenlabs' ? (
                          <Select
                            value={selectedElevenVoice}
                            onValueChange={(v) => {
                              setSelectedElevenVoice(v);
                              stopPreview();
                            }}
                            disabled={isConverting}
                          >
                            <SelectTrigger className="h-9 text-xs rounded-xl border-border/60 bg-muted/20">
                              <SelectValue placeholder="Choose voice" />
                            </SelectTrigger>
                            <SelectContent className="max-h-56 z-[220]">
                              {elevenLabs.cachedVoices.map((v) => (
                                <SelectItem key={v.voice_id} value={v.voice_id} className="text-xs py-1.5 cursor-pointer">
                                  {v.name} {v.category === 'cloned' && '• Cloned'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select
                            value={selectedEdgeVoice}
                            onValueChange={(v) => {
                              setSelectedEdgeVoice(v);
                              stopPreview();
                            }}
                            disabled={isConverting}
                          >
                            <SelectTrigger className="h-9 text-xs rounded-xl border-border/60 bg-muted/20">
                              <SelectValue placeholder="Choose narrator" />
                            </SelectTrigger>
                            <SelectContent className="max-h-56 z-[220]">
                              {POPULAR_EDGE_VOICES.map((v) => (
                                <SelectItem key={v.id} value={v.id} className="text-xs py-1.5 cursor-pointer">
                                  <span className="font-medium">{formatVoiceName(v.name)}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleTogglePreview}
                        disabled={isConverting}
                        className={`h-9 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                          isPlayingPreview
                            ? 'bg-destructive/10 text-destructive border-destructive/30 shadow-xs'
                            : 'bg-muted/30 hover:bg-muted/60 text-foreground border-border/60'
                        }`}
                        title={isPlayingPreview ? "Stop preview" : "Hear voice sample"}
                      >
                        {isPlayingPreview ? (
                          <>
                            <Square className="w-3 h-3 fill-current animate-pulse" />
                            <span className="text-[11px]">Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current text-primary" />
                            <span className="text-[11px]">Sample</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Output Format Toggle */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Output Format</label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-muted/40 rounded-xl border border-border/50 h-9">
                      <button
                        type="button"
                        onClick={() => setOutputFormat('chapters')}
                        disabled={isConverting}
                        className={`text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          outputFormat === 'chapters'
                            ? 'bg-background text-foreground shadow-2xs border border-border/50'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5 text-primary" />
                        <span>By Chapter</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setOutputFormat('merged')}
                        disabled={isConverting}
                        className={`text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          outputFormat === 'merged'
                            ? 'bg-background text-foreground shadow-2xs border border-border/50'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <FileAudio className="w-3.5 h-3.5 text-primary" />
                        <span>Single File</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ─── Chapter Selector ─── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <label className="flex items-center gap-2 font-bold cursor-pointer select-none text-foreground hover:text-primary transition-colors">
                        <input
                          type="checkbox"
                          checked={
                            selectedChapters.length > 0 &&
                            selectedChapters.length === (storyChaptersCount > 0 ? storyChaptersCount : chapters.length)
                          }
                          ref={(input) => {
                            if (input) {
                              const targetCount = storyChaptersCount > 0 ? storyChaptersCount : chapters.length;
                              input.indeterminate =
                                selectedChapters.length > 0 && selectedChapters.length < targetCount;
                            }
                          }}
                          onChange={toggleSelectAll}
                          disabled={isConverting}
                          className="rounded accent-primary w-4 h-4 cursor-pointer"
                        />
                        <span>
                          Chapters ({selectedChapters.length}/{storyChaptersCount > 0 ? storyChaptersCount : chapters.length})
                        </span>
                      </label>

                      {placeholderCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setHidePlaceholders((prev) => !prev)}
                          disabled={isConverting}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Toggle visibility of image/cover pages"
                        >
                          <span className="text-border">·</span>
                          {hidePlaceholders ? (
                            <span>{placeholderCount} visual pages hidden</span>
                          ) : (
                            <span className="text-primary font-medium">showing all</span>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Quick Selection Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => selectAll(true)}
                        disabled={isConverting}
                        className="px-2 py-0.5 text-[11px] font-semibold rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer disabled:opacity-40"
                      >
                        All
                      </button>
                      <span className="text-border text-[10px]">·</span>
                      <button
                        type="button"
                        onClick={() => selectAll(false)}
                        disabled={isConverting}
                        className="px-2 py-0.5 text-[11px] font-semibold rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer disabled:opacity-40"
                      >
                        None
                      </button>
                      <span className="text-border text-[10px]">·</span>
                      <button
                        type="button"
                        onClick={selectStoryOnly}
                        disabled={isConverting}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md text-primary hover:bg-primary/10 transition-all cursor-pointer disabled:opacity-40"
                        title="Automatically selects story chapters, skipping image placeholders"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Story Only</span>
                      </button>
                    </div>
                  </div>

                  {/* Search Filter for books with many chapters */}
                  {chapters.length > 6 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/60 bg-muted/20 focus-within:border-primary/60 transition-colors">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        placeholder="Search chapters..."
                        value={chapterSearch}
                        onChange={(e) => setChapterSearch(e.target.value)}
                        className="w-full bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground"
                      />
                      {chapterSearch && (
                        <button
                          type="button"
                          onClick={() => setChapterSearch('')}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Chapter List */}
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/30 bg-muted/15 custom-scrollbar shadow-2xs">
                    {filteredChapters.map((ch) => {
                      return (
                        <div
                          key={ch.index}
                          onClick={() => !isConverting && toggleChapter(ch.index)}
                          className={`flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer select-none ${
                            ch.selected
                              ? 'bg-primary/8 text-foreground'
                              : 'hover:bg-muted/40 text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                            <input
                              type="checkbox"
                              checked={ch.selected}
                              disabled={isConverting}
                              onChange={() => {}}
                              className="rounded accent-primary w-3.5 h-3.5 cursor-pointer shrink-0"
                            />
                            <span className="w-5 text-[10px] font-mono font-bold text-muted-foreground/70 shrink-0">
                              {(ch.index + 1).toString().padStart(2, '0')}
                            </span>
                            <span className={`truncate text-xs ${ch.selected ? 'text-foreground font-medium' : 'text-foreground/75'}`}>
                              {ch.title}
                            </span>
                            {ch.isPlaceholder && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-muted text-muted-foreground uppercase font-bold shrink-0">
                                Visual
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {ch.characterCount.toLocaleString()}
                            </span>
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-muted/60 text-foreground border border-border/30">
                              {formatChapterTime(ch.characterCount)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ─── Minimal Summary & Auto-Import ─── */}
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-foreground">
                      {selectedChapters.length} {selectedChapters.length === 1 ? 'chapter' : 'chapters'}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-primary font-bold">
                      {formatEstimatedDuration(totalCharacters, rate)} audio
                    </span>
                    <span className="text-muted-foreground hidden sm:inline">
                      ({totalCharacters.toLocaleString()} chars)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground font-medium">Auto-Import</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoImportToLibrary}
                        onChange={(e) => setAutoImportToLibrary(e.target.checked)}
                        disabled={isConverting}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4.5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-primary shadow-2xs"></div>
                    </label>
                  </div>
                </div>

                {/* ─── Studio In-Flight Conversion Progress HUD ─── */}
                {isConverting && (
                  <div className="space-y-3 p-3.5 rounded-xl border border-primary/30 bg-primary/5 shadow-xs animate-in fade-in duration-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                            Converting Audio
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground truncate mt-1">
                          {currentChapterTitle ? currentChapterTitle : 'Preparing streams...'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xl font-black font-mono tracking-tight text-primary">
                          {progressPercent}%
                        </span>
                      </div>
                    </div>

                    {/* Glowing progress bar */}
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-primary via-amber-500 to-primary transition-all duration-300 rounded-full shadow-xs"
                        style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                      />
                    </div>

                    {/* Fine stats row */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium pt-0.5">
                      <span>
                        {processedChars.toLocaleString()} / {totalCharacters.toLocaleString()} chars
                      </span>
                      <span className="text-foreground/90 font-semibold">
                        {formatRemainingTime(estimatedRemainingSecs)}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-mono font-semibold">
                        3x Parallel
                      </span>
                    </div>
                  </div>
                )}

                {/* Inline Quota Exhaustion Fallback Banner */}
                {showQuotaPrompt && (
                  <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-card-foreground space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>ElevenLabs Monthly Quota Reached</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Your ElevenLabs character quota was reached while converting this chapter. Would you like to seamlessly continue converting the remaining chapters using 100% Free Edge Neural TTS?
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resolveQuotaPrompt(false)}
                        className="text-xs cursor-pointer rounded-xl"
                      >
                        Stop Conversion
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => resolveQuotaPrompt(true)}
                        className="text-xs font-bold gap-1.5 cursor-pointer bg-primary text-primary-foreground rounded-xl"
                      >
                        Continue with Free Edge TTS
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="p-4 sm:p-5 border-t border-border/50 bg-muted/15 flex items-center justify-between gap-3">
            {isConverting ? (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>Converting in background</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      minimize();
                      onClose();
                    }}
                    className="text-xs font-semibold gap-1.5 cursor-pointer rounded-xl border-border/60 hover:bg-muted"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>Run in Background</span>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={cancelConversion}
                    className="text-xs font-bold gap-1.5 cursor-pointer rounded-xl shadow-xs"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Conversion</span>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground font-medium">
                  {selectedChapters.length > 0 && (
                    <span>~{Math.max(1, Math.round(totalCharacters / 3500))} MB estimated MP3</span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                    className="text-xs cursor-pointer rounded-xl border-border/60 hover:bg-muted"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={isLoadingChapters || selectedChapters.length === 0}
                    onClick={handleStartConversion}
                    className="text-xs font-bold gap-2 cursor-pointer bg-primary text-primary-foreground rounded-xl shadow-md px-4"
                  >
                    {autoImportToLibrary ? (
                      <>
                        <Headphones className="w-4 h-4" />
                        Create & Add to Library
                      </>
                    ) : (
                      <>
                        <FolderDown className="w-4 h-4" />
                        Export Audiobook
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatVoiceName(name: string): string {
  // Matches "BaseName (Description)", e.g. "Katja (German)" or "Guy (US Audiobook Narrator)"
  const match = name.match(/^([^(]+?)\s*\(([^)]+)\)$/);
  if (!match) return name;

  const baseName = match[1].trim();
  const desc = match[2].trim();

  // Clean description: simplify lengthy phrasing while preserving full names and country/language
  const cleanDesc = desc
    .replace('Audiobook Narrator', 'Narrator')
    .replace('Natural Conversational', 'Natural')
    .replace('British Storyteller', 'Storyteller')
    .replace('Deep Baritone', 'Deep Baritone')
    .replace('Portuguese Brazil', 'Portuguese (Brazil)')
    .replace('Chinese Mandarin Story', 'Chinese (Story)')
    .replace('Chinese Mandarin', 'Chinese')
    .replace('Spanish Castilian', 'Spanish')
    .replace('Indian English', 'Indian English');

  return `${baseName} · ${cleanDesc}`;
}

function formatEstimatedDuration(chars: number, rate = 1.0): string {
  const totalMins = Math.max(1, Math.round(chars / 750 / rate));
  if (totalMins < 60) return `~${totalMins} mins`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `~${hours}h ${mins}m` : `~${hours} hrs`;
}

function formatChapterTime(chars: number, rate = 1.0): string {
  const totalMins = Math.max(1, Math.round(chars / 750 / rate));
  if (totalMins < 60) return `${totalMins}m`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatRemainingTime(secs: number | null): string {
  if (secs === null || secs <= 0) return 'Estimating time remaining...';
  if (secs < 60) return `~${secs}s remaining`;
  const mins = Math.ceil(secs / 60);
  if (mins < 60) return `~${mins}m remaining`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `~${h}h ${m}m remaining`;
}

function chunkText(text: string, maxChunkLength = 3000): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxChunkLength) return [clean];

  const chunks: string[] = [];
  const sentences = clean.match(/[^.!?\n]+[.!?\n]+|\s+/g) || [clean];
  let currentChunk = '';

  for (const s of sentences) {
    if (s.length > maxChunkLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      const words = s.split(/\s+/);
      let wordChunk = '';
      for (const w of words) {
        if ((wordChunk + ' ' + w).length > maxChunkLength) {
          if (wordChunk.trim()) chunks.push(wordChunk.trim());
          wordChunk = w;
        } else {
          wordChunk = wordChunk ? `${wordChunk} ${w}` : w;
        }
      }
      if (wordChunk.trim()) {
        currentChunk = wordChunk;
      }
      continue;
    }

    if (currentChunk.length + s.length > maxChunkLength) {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = s;
    } else {
      currentChunk += s;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.length > 0);
}

function concatenateAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((acc, b) => acc + b.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const b of buffers) {
    result.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return result.buffer;
}

async function saveSingleFile(defaultFilename: string, buffer: ArrayBuffer): Promise<void> {
  if (isTauri) {
    try {
      const filePath = await save({
        defaultPath: defaultFilename,
        filters: [{ name: 'Audiobook MP3', extensions: ['mp3'] }],
      });

      if (filePath) {
        await writeFile(filePath, new Uint8Array(buffer));
      }
      return;
    } catch (e) {
      logger.warn('[Audiobook] Tauri save failed, falling back to browser download:', e);
    }
  }

  // Browser download fallback
  const blob = new Blob([buffer], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
