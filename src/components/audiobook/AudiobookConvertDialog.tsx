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
  Sparkles,
  Layers,
  FileAudio,
  FolderDown,
  AlertTriangle,
  Play,
  Square,
  ArrowRight,
  Info,
} from 'lucide-react';
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
import { useToastStore } from '@/store/toastStore';
import { useElevenLabsStore } from '@/store/elevenLabsStore';
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

  // Conversion state
  const [isConverting, setIsConverting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentChapterTitle, setCurrentChapterTitle] = useState('');
  const [convertedCount, setConvertedCount] = useState(0);
  const abortRef = useRef<boolean>(false);

  // Fallback prompt dialog state
  const [showQuotaPrompt, setShowQuotaPrompt] = useState(false);
  const quotaResolveRef = useRef<((fallbackToEdge: boolean) => void) | null>(null);

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

        // Fetch chapters and estimate character count
        for (let i = 0; i < count; i++) {
          try {
            const ch = await api.getBookChapter(bookId, i);
            // Strip HTML tags for clean text estimation
            const cleanText = ch.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            loaded.push({
              index: i,
              title: ch.title || `Chapter ${i + 1}`,
              characterCount: cleanText.length,
              content: cleanText,
              // Select first 3 chapters by default to protect free quota
              selected: i < 3,
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

  const toggleChapter = (index: number) => {
    setChapters((prev) =>
      prev.map((c) => (c.index === index ? { ...c, selected: !c.selected } : c))
    );
  };

  const selectAll = (select: boolean) => {
    setChapters((prev) => prev.map((c) => ({ ...c, selected: select })));
  };

  // ─── Batch Conversion Pipeline ──────────────────────────────────────────
  const handleStartConversion = async () => {
    if (selectedChapters.length === 0) {
      useToastStore.getState().addToast({
        title: 'No Chapters Selected',
        description: 'Please select at least one chapter to convert.',
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

    setIsConverting(true);
    setProgressPercent(0);
    setConvertedCount(0);
    abortRef.current = false;

    let activeEngine = engine;
    const generatedAudioFiles: { filename: string; buffer: ArrayBuffer }[] = [];

    try {
      for (let i = 0; i < selectedChapters.length; i++) {
        if (abortRef.current) break;

        const ch = selectedChapters[i];
        setCurrentChapterTitle(ch.title);
        const chapterNum = String(i + 1).padStart(2, '0');
        const filename = `${chapterNum} - ${ch.title.replace(/[^\w\s-]/gi, '_')}.mp3`;

        // Chunk chapter into safe ~3,000 character chunks to respect API limits
        const textChunks = chunkText(ch.content, 3000);
        const chunkBuffers: ArrayBuffer[] = [];

        for (let j = 0; j < textChunks.length; j++) {
          if (abortRef.current) break;

          const chunk = textChunks[j];
          let audioBuffer: ArrayBuffer | null = null;

          while (!audioBuffer && !abortRef.current) {
            try {
              if (activeEngine === 'elevenlabs') {
                audioBuffer = await synthesizeElevenLabsAudio({
                  text: chunk,
                  voiceId: selectedElevenVoice,
                  modelId: elevenLabs.selectedModel,
                  apiKey: elevenLabs.apiKey,
                  rate,
                });
              } else {
                const blob = await synthesizeEdgeSpeech(chunk, {
                  voice: selectedEdgeVoice,
                  rate,
                });
                audioBuffer = await blob.arrayBuffer();
              }
            } catch (err) {
              logger.warn(`[Audiobook] Synthesis error for chapter ${ch.index}:`, err);

              // Quota exhaustion handling (User decision A4: Seamless fallback prompt)
              if (activeEngine === 'elevenlabs' && isQuotaExceededError(err)) {
                const proceedWithEdge = await new Promise<boolean>((resolve) => {
                  quotaResolveRef.current = resolve;
                  setShowQuotaPrompt(true);
                });

                if (proceedWithEdge) {
                  activeEngine = 'edge';
                  useToastStore.getState().addToast({
                    title: 'Switched to Free Edge Neural TTS',
                    description: `Continuing conversion of ${ch.title} without interruption.`,
                    variant: 'info',
                  });
                  // Retry current chunk with Edge TTS
                  continue;
                } else {
                  abortRef.current = true;
                  break;
                }
              } else {
                throw err;
              }
            }
          }

          if (audioBuffer) {
            chunkBuffers.push(audioBuffer);
          }
        }

        // Merge chunk buffers for this chapter
        if (chunkBuffers.length > 0) {
          const mergedChapter = concatenateAudioBuffers(chunkBuffers);
          generatedAudioFiles.push({ filename, buffer: mergedChapter });
        }

        setConvertedCount(i + 1);
        setProgressPercent(Math.round(((i + 1) / selectedChapters.length) * 100));
      }

      if (abortRef.current) {
        useToastStore.getState().addToast({
          title: 'Conversion Cancelled',
          description: `Saved ${generatedAudioFiles.length} chapters before stopping.`,
          variant: 'info',
        });
      }

      // Save output files
      if (generatedAudioFiles.length > 0) {
        if (outputFormat === 'merged') {
          const fullAudio = concatenateAudioBuffers(generatedAudioFiles.map((f) => f.buffer));
          const safeTitle = bookTitle.replace(/[^\w\s-]/gi, '_');
          await saveSingleFile(`${safeTitle}.mp3`, fullAudio);
        } else {
          // Chapter-by-chapter export
          for (const item of generatedAudioFiles) {
            await saveSingleFile(item.filename, item.buffer);
          }
        }

        useToastStore.getState().addToast({
          title: 'Audiobook Export Complete',
          description: `Successfully converted ${generatedAudioFiles.length} ${
            generatedAudioFiles.length === 1 ? 'chapter' : 'chapters'
          }.`,
          variant: 'success',
        });
        onClose();
      }
    } catch (err) {
      logger.error('[Audiobook] Conversion failed:', err);
      useToastStore.getState().addToast({
        title: 'Conversion Failed',
        description: err instanceof Error ? err.message : 'Unknown error during synthesis.',
        variant: 'error',
      });
    } finally {
      setIsConverting(false);
      // Refresh subscription after conversion
      if (elevenLabs.apiKey) {
        void elevenLabs.refreshSubscription();
      }
    }
  };

  const cancelConversion = () => {
    abortRef.current = true;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !isConverting && !open && onClose()}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card text-card-foreground">
          {/* Header */}
          <DialogHeader className="p-4 sm:p-5 border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-3">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={bookTitle}
                  className="w-12 h-16 object-cover rounded-md shadow-sm border border-border/60 shrink-0"
                />
              ) : (
                <div className="w-12 h-16 bg-primary/10 rounded-md border border-border/60 flex items-center justify-center shrink-0">
                  <Headphones className="w-6 h-6 text-primary" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base sm:text-lg font-bold truncate">
                    {bookTitle}
                  </DialogTitle>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {bookAuthor || 'Unknown Author'} · Convert to Audiobook
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            {isLoadingChapters ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs font-medium">Extracting book chapters...</span>
              </div>
            ) : loadError ? (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {loadError}
              </div>
            ) : (
              <>
                {/* ─── Engine Selection ─── */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Narration Engine</span>
                    {engine === 'elevenlabs' && quotaInfo && (
                      <span className="text-[11px] font-medium lowercase text-primary">
                        {quotaInfo.remaining.toLocaleString()} free chars left
                      </span>
                    )}
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Edge TTS Card */}
                    <button
                      type="button"
                      onClick={() => setEngine('edge')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        engine === 'edge'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-xs'
                          : 'border-border/60 hover:bg-muted/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            <Volume2 className="w-3.5 h-3.5 text-primary" />
                            Free Edge Neural
                          </span>
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                            100% Free
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                          Unlimited characters, zero API keys needed. Studio narrators.
                        </p>
                      </div>
                    </button>

                    {/* ElevenLabs Card */}
                    <button
                      type="button"
                      onClick={() => setEngine('elevenlabs')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        engine === 'elevenlabs'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-xs'
                          : 'border-border/60 hover:bg-muted/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            ElevenLabs AI
                          </span>
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                            10k Free / Mo
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                          Hyper-realistic emotional delivery with custom and cloned voices.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Quota warning banner if exceeding free quota */}
                  {exceedsQuota && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        Selected chapters ({totalCharacters.toLocaleString()} chars) exceed your remaining ElevenLabs quota ({quotaInfo?.remaining.toLocaleString()} chars). We will prompt you to seamlessly switch to Free Edge TTS if quota is reached.
                      </span>
                    </div>
                  )}
                </div>

                {/* ─── Voice & Speed Controls ─── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Narrator Voice</label>
                    {engine === 'elevenlabs' ? (
                      <Select
                        value={selectedElevenVoice}
                        onValueChange={setSelectedElevenVoice}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Choose voice" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          {elevenLabs.cachedVoices.map((v) => (
                            <SelectItem key={v.voice_id} value={v.voice_id} className="text-xs">
                              {v.name} {v.category === 'cloned' && '• Cloned'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={selectedEdgeVoice}
                        onValueChange={setSelectedEdgeVoice}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Choose narrator" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          {POPULAR_EDGE_VOICES.map((v) => (
                            <SelectItem key={v.id} value={v.id} className="text-xs">
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Output Format Toggle (User decision A3) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Output Format</label>
                    <div className="grid grid-cols-2 gap-1.5 p-0.5 bg-muted/50 rounded-lg border border-border/40 h-9">
                      <button
                        type="button"
                        onClick={() => setOutputFormat('chapters')}
                        className={`text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 ${
                          outputFormat === 'chapters'
                            ? 'bg-background text-foreground shadow-xs font-bold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Layers className="w-3 h-3" />
                        By Chapter
                      </button>
                      <button
                        type="button"
                        onClick={() => setOutputFormat('merged')}
                        className={`text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 ${
                          outputFormat === 'merged'
                            ? 'bg-background text-foreground shadow-xs font-bold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <FileAudio className="w-3 h-3" />
                        Single File
                      </button>
                    </div>
                  </div>
                </div>

                {/* ─── Chapter Selector ─── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Select Chapters to Convert ({selectedChapters.length}/{chapters.length})</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => selectAll(true)}
                        className="hover:text-primary transition-colors cursor-pointer"
                      >
                        All
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => selectAll(false)}
                        className="hover:text-primary transition-colors cursor-pointer"
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40 bg-card">
                    {chapters.map((ch) => (
                      <div
                        key={ch.index}
                        onClick={() => !isConverting && toggleChapter(ch.index)}
                        className={`flex items-center justify-between p-2.5 text-xs transition-colors cursor-pointer ${
                          ch.selected ? 'bg-primary/5' : 'hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={ch.selected}
                            disabled={isConverting}
                            onChange={() => {}} // handled by parent onClick
                            className="rounded accent-primary w-3.5 h-3.5"
                          />
                          <span className="font-medium truncate">{ch.title}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
                          {ch.characterCount.toLocaleString()} chars
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Conversion Summary Pill */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-foreground">
                      {selectedChapters.length} {selectedChapters.length === 1 ? 'chapter' : 'chapters'}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      {totalCharacters.toLocaleString()} characters
                    </span>
                  </div>
                  <span className="font-semibold text-primary">
                    ~{estimatedDurationMinutes} mins audio
                  </span>
                </div>

                {/* In-Flight Conversion Progress */}
                {isConverting && (
                  <div className="space-y-2 p-3.5 rounded-xl border border-primary/30 bg-primary/5 animate-pulse">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="truncate max-w-[300px]">
                          Converting {currentChapterTitle}...
                        </span>
                      </div>
                      <span>{progressPercent}%</span>
                    </div>

                    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 rounded-full"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Chapter {convertedCount} of {selectedChapters.length} completed
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelConversion}
                        className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="p-4 sm:p-5 border-t border-border/50 bg-muted/10 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={isConverting}
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isConverting || isLoadingChapters || selectedChapters.length === 0}
              onClick={handleStartConversion}
              className="text-xs font-bold gap-1.5"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <FolderDown className="w-3.5 h-3.5" />
                  Export Audiobook
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Quota Exhaustion Fallback Modal ─── */}
      <Dialog open={showQuotaPrompt} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              ElevenLabs Quota Reached
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs text-muted-foreground space-y-2">
            <p>
              Your ElevenLabs monthly character limit has been reached while converting this chapter.
            </p>
            <p className="font-medium text-foreground">
              Would you like to seamlessly continue converting the remaining chapters using 100% Free Edge Neural TTS?
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                setShowQuotaPrompt(false);
                quotaResolveRef.current?.(false);
              }}
            >
              Stop Conversion
            </Button>
            <Button
              size="sm"
              className="text-xs font-bold gap-1.5"
              onClick={() => {
                setShowQuotaPrompt(false);
                quotaResolveRef.current?.(true);
              }}
            >
              Continue with Free Edge TTS
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function chunkText(text: string, maxChunkLength = 3000): string[] {
  if (text.length <= maxChunkLength) return [text];

  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+|\s+/g) || [text];
  let currentChunk = '';

  for (const s of sentences) {
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

  return chunks;
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
