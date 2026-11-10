/**
 * audiobookConversionStore.ts
 *
 * Dedicated background conversion engine & state for Shiori audiobooks.
 * Decouples synthesis from the modal lifecycle so conversions run
 * uninterrupted while the user reads, turns pages, or navigates the app.
 */

import { create } from 'zustand';
import { api, isTauri } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { useToastStore } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useElevenLabsStore } from '@/store/elevenLabsStore';
import { cleanChapterContent, isPlaceholderChapter } from '@/lib/audiobookTextCleaner';
import { synthesizeElevenLabsAudio, isQuotaExceededError } from '@/lib/elevenLabs';
import { synthesizeEdgeSpeech } from '@/lib/edgeTTS';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

export type AudioEngine = 'elevenlabs' | 'edge';
export type OutputFormat = 'chapters' | 'merged';

export interface ConvertChapterItem {
  index: number;
  title: string;
  characterCount: number;
  content: string;
  isPlaceholder: boolean;
  selected: boolean;
}

export interface StartConversionParams {
  bookId: number;
  bookTitle: string;
  bookAuthor?: string;
  coverUrl?: string | null;
  chaptersToConvert: ConvertChapterItem[];
  totalCharacters: number;
  engine: AudioEngine;
  outputFormat: OutputFormat;
  rate: number;
  selectedEdgeVoice: string;
  selectedElevenVoice: string;
  autoImportToLibrary: boolean;
}

interface AudiobookConversionState {
  // Dialog visibility & minimization
  isDialogOpen: boolean;
  isMinimized: boolean;
  activeBookId: number | null;
  activeBookTitle: string;
  activeBookAuthor: string;
  activeCoverUrl: string | null;

  // Live conversion progress
  isConverting: boolean;
  progressPercent: number;
  currentChapterTitle: string;
  currentChapterIndex: number;
  totalChapters: number;
  processedChars: number;
  totalCharacters: number;
  statusDetail: string;
  estimatedRemainingSecs: number | null;
  autoImportToLibrary: boolean;
  engine: AudioEngine;
  outputFormat: OutputFormat;

  // Quota fallback prompt
  showQuotaPrompt: boolean;
  quotaResolveCallback: ((fallbackToEdge: boolean) => void) | null;

  // Actions
  openDialog: (props: {
    bookId: number;
    bookTitle: string;
    bookAuthor?: string;
    coverUrl?: string | null;
  }) => void;
  closeDialog: () => void;
  minimize: () => void;
  restore: () => void;
  cancelConversion: () => void;
  resolveQuotaPrompt: (fallbackToEdge: boolean) => void;
  startConversion: (params: StartConversionParams) => Promise<void>;
}

// Internal abort controller ref
let globalAbort = false;

export const useAudiobookConversionStore = create<AudiobookConversionState>((set, get) => ({
  isDialogOpen: false,
  isMinimized: false,
  activeBookId: null,
  activeBookTitle: '',
  activeBookAuthor: '',
  activeCoverUrl: null,

  isConverting: false,
  progressPercent: 0,
  currentChapterTitle: '',
  currentChapterIndex: 0,
  totalChapters: 0,
  processedChars: 0,
  totalCharacters: 0,
  statusDetail: '',
  estimatedRemainingSecs: null,
  autoImportToLibrary: true,
  engine: 'edge',
  outputFormat: 'chapters',

  showQuotaPrompt: false,
  quotaResolveCallback: null,

  openDialog: ({ bookId, bookTitle, bookAuthor, coverUrl }) => {
    const current = get();
    // If opening for a different book while not converting, reset target
    if (!current.isConverting) {
      set({
        activeBookId: bookId,
        activeBookTitle: bookTitle,
        activeBookAuthor: bookAuthor || '',
        activeCoverUrl: coverUrl || null,
        isDialogOpen: true,
        isMinimized: false,
      });
    } else {
      // Already converting (either same or different book), bring up active dialog
      set({
        isDialogOpen: true,
        isMinimized: false,
      });
    }
  },

  closeDialog: () => {
    const current = get();
    if (current.isConverting) {
      // If converting, closing the dialog automatically minimizes to background
      set({ isDialogOpen: false, isMinimized: true });
    } else {
      set({ isDialogOpen: false, isMinimized: false });
    }
  },

  minimize: () => {
    set({ isDialogOpen: false, isMinimized: true });
  },

  restore: () => {
    set({ isDialogOpen: true, isMinimized: false });
  },

  cancelConversion: () => {
    globalAbort = true;
    set({
      isConverting: false,
      isMinimized: false,
      statusDetail: 'Conversion cancelled.',
      progressPercent: 0,
    });
    useToastStore.getState().addToast({
      title: 'Audiobook Conversion Cancelled',
      description: 'Background narration was stopped.',
      variant: 'info',
    });
  },

  resolveQuotaPrompt: (fallbackToEdge: boolean) => {
    const cb = get().quotaResolveCallback;
    set({ showQuotaPrompt: false, quotaResolveCallback: null });
    if (cb) cb(fallbackToEdge);
  },

  startConversion: async (params) => {
    const {
      bookId,
      bookTitle,
      bookAuthor,
      coverUrl,
      chaptersToConvert,
      totalCharacters,
      engine,
      outputFormat,
      rate,
      selectedEdgeVoice,
      selectedElevenVoice,
      autoImportToLibrary,
    } = params;

    globalAbort = false;
    const startTime = Date.now();

    set({
      isConverting: true,
      activeBookId: bookId,
      activeBookTitle: bookTitle,
      activeBookAuthor: bookAuthor || '',
      activeCoverUrl: coverUrl || null,
      progressPercent: 0,
      processedChars: 0,
      totalCharacters,
      totalChapters: chaptersToConvert.length,
      currentChapterIndex: 0,
      currentChapterTitle: chaptersToConvert[0]?.title || '',
      statusDetail: 'Preparing story chapters...',
      estimatedRemainingSecs: null,
      engine,
      outputFormat,
      autoImportToLibrary,
    });

    const safeTitle = bookTitle.replace(/[^\w\s-]/gi, '_');
    let activeEngine = engine;
    const generatedAudioFiles: { filename: string; buffer: ArrayBuffer }[] = [];
    const successfullyNarratedChapters: ConvertChapterItem[] = [];
    let currentCharCount = 0;
    let targetDestPath: string | null = null;

    if (autoImportToLibrary && isTauri) {
      try {
        targetDestPath = await api.prepareAudiobookFile(`${safeTitle}.mp3`);
      } catch (err) {
        logger.warn('[Audiobook] Could not prepare destination file on disk:', err);
      }
    }

    try {
      for (let i = 0; i < chaptersToConvert.length; i++) {
        if (globalAbort) break;

        const ch = chaptersToConvert[i];
        set({
          currentChapterIndex: i + 1,
          currentChapterTitle: ch.title,
          statusDetail: `Narrating: ${ch.title}`,
        });

        const chapterNum = String(i + 1).padStart(2, '0');
        const filename = `${chapterNum} - ${ch.title.replace(/[^\w\s-]/gi, '_')}.mp3`;

        // Clean chapter content (strips HTML and repetitive title boilerplate)
        const cleanStoryText = cleanChapterContent(ch.content, bookTitle, ch.title);
        if (cleanStoryText.length < 60) {
          logger.info(`[Audiobook] Skipping empty chapter ${ch.title} (${cleanStoryText.length} chars)`);
          continue;
        }

        // Chunk chapter into optimized ~3,000 char sections split at natural sentence breaks
        const textChunks = chunkText(cleanStoryText, 3000);
        const chunkBuffers: (ArrayBuffer | null)[] = new Array(textChunks.length).fill(null);

        // High-Speed Concurrency: 3 parallel streams for Edge TTS, 1 for ElevenLabs
        const concurrency = activeEngine === 'edge' ? 3 : 1;
        let nextChunkIdx = 0;

        const elevenLabs = useElevenLabsStore.getState();

        const synthesizeSingleChunk = async (chunk: string): Promise<ArrayBuffer> => {
          if (activeEngine === 'elevenlabs') {
            return await synthesizeElevenLabsAudio({
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
            return await blob.arrayBuffer();
          }
        };

        const runWorker = async () => {
          while (nextChunkIdx < textChunks.length && !globalAbort) {
            const idx = nextChunkIdx++;
            const chunk = textChunks[idx];

            let audioBuffer: ArrayBuffer | null = null;
            let retryCount = 0;
            const maxRetries = 3;

            while (!audioBuffer && !globalAbort) {
              try {
                audioBuffer = await synthesizeSingleChunk(chunk);
              } catch (err) {
                logger.warn(
                  `[Audiobook] Synthesis error for chapter ${ch.index} chunk ${idx} (attempt ${retryCount + 1}/${maxRetries}):`,
                  err
                );

                if (activeEngine === 'elevenlabs' && isQuotaExceededError(err)) {
                  // If minimized in background, auto-switch to Free Edge TTS seamlessly with toast
                  if (get().isMinimized) {
                    activeEngine = 'edge';
                    useToastStore.getState().addToast({
                      title: 'ElevenLabs Quota Reached',
                      description: 'Seamlessly switched to Free Edge Neural TTS to keep background conversion running.',
                      variant: 'info',
                    });
                    continue;
                  }

                  const proceedWithEdge = await new Promise<boolean>((resolve) => {
                    set({ showQuotaPrompt: true, quotaResolveCallback: resolve });
                  });

                  if (proceedWithEdge) {
                    activeEngine = 'edge';
                    useToastStore.getState().addToast({
                      title: 'Switched to Free Edge Neural TTS',
                      description: `Continuing conversion of ${ch.title} with high-speed parallel streams.`,
                      variant: 'info',
                    });
                    continue;
                  } else {
                    globalAbort = true;
                    break;
                  }
                }

                retryCount++;
                if (retryCount >= maxRetries) {
                  throw err;
                }
                // Exponential backoff before retry (1s, 2s, 3s)
                await new Promise((r) => setTimeout(r, 1000 * retryCount));
              }
            }

            if (audioBuffer && !globalAbort) {
              chunkBuffers[idx] = audioBuffer;
              currentCharCount += chunk.length;
              const chunkDonePct = totalCharacters > 0
                ? Math.min(99, Math.round((currentCharCount / totalCharacters) * 100))
                : 0;

              const elapsedSecs = (Date.now() - startTime) / 1000;
              const charsPerSec = currentCharCount / Math.max(1, elapsedSecs);
              const remainingChars = Math.max(0, totalCharacters - currentCharCount);
              const remainingSecs = charsPerSec > 0 ? Math.round(remainingChars / charsPerSec) : null;

              set({
                processedChars: currentCharCount,
                progressPercent: chunkDonePct,
                estimatedRemainingSecs: remainingSecs,
              });

              // Disk Streaming: Flush 1MB slices incrementally to disk
              if (targetDestPath && isTauri) {
                const CHUNK_FLUSH_SIZE = 1024 * 1024;
                const totalBytes = audioBuffer.byteLength;
                for (let offset = 0; offset < totalBytes; offset += CHUNK_FLUSH_SIZE) {
                  const end = Math.min(offset + CHUNK_FLUSH_SIZE, totalBytes);
                  const slice = new Uint8Array(audioBuffer.slice(offset, end));
                  await api.appendAudiobookChunk(targetDestPath, Array.from(slice));
                }
              }
            }
          }
        };

        const workers = Array.from({ length: concurrency }, () => runWorker());
        await Promise.all(workers);

        if (globalAbort) break;

        const validBuffers = chunkBuffers.filter((b): b is ArrayBuffer => b !== null);
        if (validBuffers.length > 0) {
          const chapterAudio = concatenateAudioBuffers(validBuffers);
          generatedAudioFiles.push({ filename, buffer: chapterAudio });
          successfullyNarratedChapters.push(ch);
        }

        const chapterPct = Math.round(((i + 1) / chaptersToConvert.length) * 100);
        set({ progressPercent: chapterPct });
      }

      if (globalAbort) {
        set({ isConverting: false, isMinimized: false });
        return;
      }

      // Finalization
      if (generatedAudioFiles.length > 0) {
        set({ statusDetail: 'Finalizing audiobook in library...', progressPercent: 100 });

        if (autoImportToLibrary) {
          const transcriptData = {
            version: 1,
            sourceBookId: bookId,
            selectedIndices: successfullyNarratedChapters.map((c) => c.index),
            chapters: successfullyNarratedChapters.map((c) => ({
              index: c.index,
              title: c.title,
              characterCount: c.characterCount,
              sentences: cleanChapterContent(c.content, bookTitle, c.title)
                .split(/(?<=[.!?])\s+/)
                .filter((s) => s.trim().length > 0),
            })),
          };

          if (isTauri) {
            await api.saveAudiobookToLibrary({
              sourceBookId: bookId,
              title: `${bookTitle} (Audiobook)`,
              author: bookAuthor || null,
              filename: `${safeTitle}.mp3`,
              filePath: targetDestPath || null,
              durationSeconds: Math.round(totalCharacters / 750 / rate) * 60,
              notes: JSON.stringify(transcriptData),
            });
          }

          useToastStore.getState().addToast({
            title: '🎧 Audiobook Ready!',
            description: `"${bookTitle}" converted and added to your library.`,
            variant: 'success',
          });

          // Refresh library store
          void useLibraryStore.getState().refreshLibrary();
        } else {
          // Manual file export
          set({ statusDetail: 'Exporting audio file to disk...' });
          const fullAudio = concatenateAudioBuffers(generatedAudioFiles.map((f) => f.buffer));
          if (outputFormat === 'merged') {
            await saveSingleFile(`${safeTitle}.mp3`, fullAudio);
          } else {
            for (const item of generatedAudioFiles) {
              await saveSingleFile(item.filename, item.buffer);
            }
          }

          useToastStore.getState().addToast({
            title: 'Audiobook Export Complete',
            description: `Saved ${successfullyNarratedChapters.length} chapters to disk.`,
            variant: 'success',
          });
        }
      }
    } catch (err) {
      logger.error('[Audiobook] Conversion failed:', err);
      useToastStore.getState().addToast({
        title: 'Conversion Failed',
        description: err instanceof Error ? err.message : 'Unknown error during synthesis.',
        variant: 'error',
      });
    } finally {
      set({
        isConverting: false,
        isMinimized: false,
        isDialogOpen: false,
        progressPercent: 0,
      });

      // Refresh ElevenLabs quota if used
      const el = useElevenLabsStore.getState();
      if (el.apiKey) {
        void el.refreshSubscription();
      }
    }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────

export function chunkText(text: string, maxChunkLength = 3000): string[] {
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

export function concatenateAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
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
