import { create } from 'zustand';
import type { ReaderContent } from '@/components/reader/readerContent';
import { isAndroid } from '@/lib/tauri';

export interface ReadingProgress {
  id?: number;
  bookId: number;
  currentLocation: string;
  progressPercent: number;
  currentPage?: number;
  totalPages?: number;
  cfiLocation?: string;
  lastRead: string;
}

export interface Annotation {
  id?: number;
  bookId: number;
  annotationType: 'highlight' | 'note' | 'bookmark' | 'vocabulary';
  location: string;
  cfiRange?: string;
  selectedText?: string;
  noteContent?: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  categoryId?: number;
  chapterTitle?: string;
}

export interface AnnotationCategory {
  id?: number;
  name: string;
  color: string;
  icon?: string;
  sortOrder: number;
  createdAt: string;
}

export interface ReaderSettings {
  id?: number;
  userId: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  theme: string;
  pageMode: 'paginated' | 'scrolled';
  marginSize: number;
  updatedAt: string;
}

export interface ResumeTarget {
  bookId: number;
  chapterIndex: number;
  scrollRatio: number;
}

interface ReaderState {
  // Current book
  currentBookId: number | null;
  currentBookPath: string | null;
  currentBookFormat: string | null;
  currentContent: ReaderContent | null;
  
  // Reading progress
  progress: ReadingProgress | null;
  
  // Reading session (Phase 3)
  currentSessionId: string | null;
  sessionStartTime: number | null;
  
  // Annotations
  annotations: Annotation[];
  selectedAnnotation: Annotation | null;
  categories: AnnotationCategory[];
  
  // Reader settings
  settings: ReaderSettings;
  
  // UI state
  isReaderOpen: boolean;
  showAnnotationSidebar: boolean;
  showControls: boolean;
  /** When true the reader should open at chapter 0, ignoring any saved progress. */
  startFromBeginning: boolean;
  /** Explicit one-shot resume target set from open-book prompt flow. */
  explicitResumeTarget: ResumeTarget | null;
  
  // Actions
  openBook: (bookId: number, bookPath: string, format: string, content?: ReaderContent) => void;
  closeBook: () => void;
  setProgress: (progress: ReadingProgress) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  setCategories: (categories: AnnotationCategory[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: number, annotation: Partial<Annotation>) => void;
  removeAnnotation: (id: number) => void;
  selectAnnotation: (annotation: Annotation | null) => void;
  setSettings: (settings: ReaderSettings) => void;
  updateSettings: (settings: Partial<ReaderSettings>) => void;
  toggleAnnotationSidebar: () => void;
  toggleControls: () => void;
  startSession: (sessionId: string) => void;
  endSession: () => void;
  /** Explicitly set whether to skip progress restore on next open. */
  setStartFromBeginning: (value: boolean) => void;
  /** Set/clear explicit one-shot resume target. */
  setExplicitResumeTarget: (target: ResumeTarget | null) => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  // Initial state
  currentBookId: null,
  currentBookPath: null,
  currentBookFormat: null,
  currentContent: null,
  progress: null,
  currentSessionId: null,
  sessionStartTime: null,
  annotations: [],
  categories: [],
  selectedAnnotation: null,
  settings: {
    userId: 'default',
    fontFamily: 'EB Garamond',
    fontSize: isAndroid ? 14 : 24,
    lineHeight: 1.6,
    theme: 'black',
    pageMode: 'paginated',
    marginSize: 2,
    updatedAt: new Date().toISOString(),
  },
  isReaderOpen: false,
  showAnnotationSidebar: false,
  showControls: true,
  startFromBeginning: false,
  explicitResumeTarget: null,

  // Actions
  openBook: (bookId, bookPath, format, content) =>
    set({
      currentBookId: bookId,
      currentBookPath: bookPath,
      currentBookFormat: format,
      currentContent: content ?? null,
      isReaderOpen: true,
      // Carry over startFromBeginning from content if supplied, otherwise keep existing value
      ...(content?.startFromBeginning !== undefined ? { startFromBeginning: content.startFromBeginning } : {}),
    }),

  closeBook: () =>
    set({
      currentBookId: null,
      currentBookPath: null,
      currentBookFormat: null,
      currentContent: null,
      isReaderOpen: false,
      progress: null,
      annotations: [],
      selectedAnnotation: null,
      currentSessionId: null,
      sessionStartTime: null,
      startFromBeginning: false,
      explicitResumeTarget: null,
    }),

  setProgress: (progress) => set({ progress }),

  setAnnotations: (annotations) => set({ annotations }),
  setCategories: (categories) => set({ categories }),

  addAnnotation: (annotation) =>
    set((state) => ({
      annotations: [...state.annotations, annotation],
    })),

  updateAnnotation: (id, updatedAnnotation) =>
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, ...updatedAnnotation } : a
      ),
    })),

  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
    })),

  selectAnnotation: (annotation) => set({ selectedAnnotation: annotation }),

  setSettings: (settings) => set({ settings }),

  updateSettings: (updatedSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...updatedSettings },
    })),

  toggleAnnotationSidebar: () =>
    set((state) => ({
      showAnnotationSidebar: !state.showAnnotationSidebar,
    })),

  toggleControls: () =>
    set((state) => ({
      showControls: !state.showControls,
    })),

  startSession: (sessionId: string) =>
    set({
      currentSessionId: sessionId,
      sessionStartTime: Date.now(),
    }),

  endSession: () =>
    set({
      currentSessionId: null,
      sessionStartTime: null,
    }),

  setStartFromBeginning: (value) => set({ startFromBeginning: value }),
  setExplicitResumeTarget: (target) => set({ explicitResumeTarget: target }),
}));
