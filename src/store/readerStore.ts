import { create } from 'zustand';

export interface ReadingProgress {
  id?: number;
  bookId: number;
  currentLocation: string;
  progressPercent: number;
  currentPage?: number;
  totalPages?: number;
  lastRead: string;
}

export interface Annotation {
  id?: number;
  bookId: number;
  annotationType: 'highlight' | 'note' | 'bookmark';
  location: string;
  cfiRange?: string;
  selectedText?: string;
  noteContent?: string;
  color: string;
  createdAt: string;
  updatedAt: string;
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

interface ReaderState {
  // Current book
  currentBookId: number | null;
  currentBookPath: string | null;
  currentBookFormat: string | null;
  
  // Reading progress
  progress: ReadingProgress | null;
  
  // Annotations
  annotations: Annotation[];
  selectedAnnotation: Annotation | null;
  
  // Reader settings
  settings: ReaderSettings;
  
  // UI state
  isReaderOpen: boolean;
  showAnnotationSidebar: boolean;
  showControls: boolean;
  
  // Actions
  openBook: (bookId: number, bookPath: string, format: string) => void;
  closeBook: () => void;
  setProgress: (progress: ReadingProgress) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: number, annotation: Partial<Annotation>) => void;
  removeAnnotation: (id: number) => void;
  selectAnnotation: (annotation: Annotation | null) => void;
  setSettings: (settings: ReaderSettings) => void;
  updateSettings: (settings: Partial<ReaderSettings>) => void;
  toggleAnnotationSidebar: () => void;
  toggleControls: () => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  // Initial state
  currentBookId: null,
  currentBookPath: null,
  currentBookFormat: null,
  progress: null,
  annotations: [],
  selectedAnnotation: null,
  settings: {
    userId: 'default',
    fontFamily: 'serif',
    fontSize: 16,
    lineHeight: 1.6,
    theme: 'light',
    pageMode: 'paginated',
    marginSize: 2,
    updatedAt: new Date().toISOString(),
  },
  isReaderOpen: false,
  showAnnotationSidebar: false,
  showControls: true,

  // Actions
  openBook: (bookId, bookPath, format) =>
    set({
      currentBookId: bookId,
      currentBookPath: bookPath,
      currentBookFormat: format,
      isReaderOpen: true,
    }),

  closeBook: () =>
    set({
      currentBookId: null,
      currentBookPath: null,
      currentBookFormat: null,
      isReaderOpen: false,
      progress: null,
      annotations: [],
      selectedAnnotation: null,
    }),

  setProgress: (progress) => set({ progress }),

  setAnnotations: (annotations) => set({ annotations }),

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
}));
