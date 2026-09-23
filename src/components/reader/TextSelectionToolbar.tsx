import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Highlighter, StickyNote, X, Volume2, ChevronDown, Copy, MoreVertical, Search, Share2, ArrowLeft, BookOpen } from '@/components/icons';
import { api, isAndroid } from '@/lib/tauri';
import type { AnnotationCategory, DictionaryResponse, TranslationResponse } from '@/lib/tauri';
import { notifyAnnotationsChanged } from '@/lib/annotationEvents';
import { logger } from '@/lib/logger';
import { useToastStore } from '@/store/toastStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { ttsEngine, TTSEngine } from '@/lib/ttsEngine';
import { TranslationPopup } from './TranslationPopup';
import { AICopilotPopup } from './AICopilotPopup';
import { Brain } from 'lucide-react';
import { useTTS } from '@/hooks/useTTS';
import { useReadingSettings, READER_THEME_COLORS, applyReaderThemeToElement, removeReaderThemeFromElement } from '@/store/premiumReaderStore';
import { hapticTick } from '@/lib/haptics';
import { useAIStore } from '@/store/aiStore';

interface TextSelectionToolbarProps {
  bookId: number;
  /** Current reading location string (e.g. "chapter_3:scroll_0.5") for annotation storage */
  currentLocation: string;
}

interface ToolbarPosition {
  x: number;
  y: number;
}

function buildTextRangeAnchor(selection: Selection): string | undefined {
  if (selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement;
  const chapterEl = startElement?.closest('[data-chapter-index]');
  if (!chapterEl || !chapterEl.contains(range.endContainer)) return undefined;

  try {
    const beforeStart = document.createRange();
    beforeStart.selectNodeContents(chapterEl);
    beforeStart.setEnd(range.startContainer, range.startOffset);
    const beforeEnd = document.createRange();
    beforeEnd.selectNodeContents(chapterEl);
    beforeEnd.setEnd(range.endContainer, range.endOffset);
    return JSON.stringify({
      version: 1,
      chapterIndex: chapterEl.getAttribute('data-chapter-index'),
      start: beforeStart.toString().length,
      end: beforeEnd.toString().length,
    });
  } catch {
    return undefined;
  }
}

export interface HighlightPreset {
  name: string;
  value: string;
  defaultLabel: string;
}

export const DEFAULT_HIGHLIGHT_PRESETS: HighlightPreset[] = [
  { name: 'Yellow', value: '#fbbf24', defaultLabel: 'Important' },
  { name: 'Green', value: '#34d399', defaultLabel: 'Quote' },
  { name: 'Blue', value: '#60a5fa', defaultLabel: 'Research' },
  { name: 'Purple', value: '#a78bfa', defaultLabel: 'Vocabulary' },
  { name: 'Pink', value: '#f472b6', defaultLabel: 'Idea' },
  { name: 'Orange', value: '#fb923c', defaultLabel: 'Review' },
  { name: 'Red', value: '#f87171', defaultLabel: 'Critical' },
  { name: 'Teal', value: '#2dd4bf', defaultLabel: 'Reference' },
];

/**
 * Floating toolbar that appears when the user selects text inside the reader.
 * Provides: Copy, Highlight, Add Note, Bookmark actions.
 */
export function TextSelectionToolbar({ bookId, currentLocation }: TextSelectionToolbarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<ToolbarPosition>({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categories, setCategories] = useState<AnnotationCategory[]>([]);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showAICopilot, setShowAICopilot] = useState(false);
  const [translationMode, setTranslationMode] = useState<'translate' | 'define'>('translate');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [dictionaryResult, setDictionaryResult] = useState<DictionaryResponse | null>(null);
  const [translationResult, setTranslationResult] = useState<TranslationResponse | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [highlightLabels, setHighlightLabels] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('shiori-highlight-labels');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [isEditingLabels, setIsEditingLabels] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const selectionAnchorRef = useRef<string | undefined>(undefined);

  // Apply the READER theme to the portaled toolbar (and its child translate /
  // define / note / category popups) so they match the reading palette. Portals
  // mount at document.body — outside the reader container — so without this they
  // inherit the app theme's vars from <body> instead of the reader's.
  const readerTheme = useReadingSettings((s) => s.theme);
  const aiEnabled = useAIStore((s) => s.enabled);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!isVisible || !el) return;
    applyReaderThemeToElement(el, readerTheme || 'paper');
    // No cleanup: the toolbar unmounts with `isVisible`, so removal is handled
    // by the unmount-only effect below and re-applies just overwrite.
  }, [isVisible, readerTheme]);

  useEffect(() => () => {
    const el = toolbarRef.current;
    if (el) removeReaderThemeFromElement(el);
  }, []);
  
  // useTTS hook for "Aloud": contentRef points at the element containing the
  // selected text (snapshotted in handleSelectionChange) so sentence
  // highlighting / stop-cleanup target real reader content, not a dummy node.
  const selectionContainerRef = useRef<HTMLElement | null>(null);
  const { speakText, stop: stopSpeaking, state: ttsState } = useTTS({ contentRef: selectionContainerRef });

  const [isExpanded, setIsExpanded] = useState(true);
  const [toolbarBaseActions, setToolbarBaseActions] = useState<string[]>(['highlight', 'note', 'translate']);

  useEffect(() => {
    const saved = localStorage.getItem('shiori-toolbar-actions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setToolbarBaseActions(parsed);
        }
      } catch (e) {
        logger.error('Failed to parse toolbar actions from localStorage', e);
      }
    }
  }, []);

  const [showAndroidMore, setShowAndroidMore] = useState(false);

  // Sync state refs to prevent race conditions during selection blur
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;
  const showNoteInputRef = useRef(showNoteInput);
  showNoteInputRef.current = showNoteInput;
  const showTranslationRef = useRef(showTranslation);
  showTranslationRef.current = showTranslation;
  const showColorPickerRef = useRef(showColorPicker);
  showColorPickerRef.current = showColorPicker;
  const showAndroidMoreRef = useRef(showAndroidMore);
  showAndroidMoreRef.current = showAndroidMore;

  const hideToolbar = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    selectionAnchorRef.current = undefined;
    selectionContainerRef.current = null;
    setIsVisible(false);
    setShowColorPicker(false);
    setShowNoteInput(false);
    setShowAndroidMore(false);
    setNoteText('');
    setSelectedCategoryId(undefined);
    setShowTranslation(false);
    setShowAICopilot(false);
    setDictionaryResult(null);
    setTranslationResult(null);
    setTranslationError(null);
    setIsExpanded(false);
  }, []);

  // Prevent native context menu from overriding custom toolbar, especially on Android WebViews
  useEffect(() => {
    const preventNativeContextMenu = (e: MouseEvent) => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('contextmenu', preventNativeContextMenu, { capture: true });
    return () => document.removeEventListener('contextmenu', preventNativeContextMenu, { capture: true });
  }, []);

  // Listen for text selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();

      // If selection is happening inside the toolbar itself, don't hide it
      if (selection && selection.anchorNode && toolbarRef.current?.contains(selection.anchorNode)) {
        return;
      }

      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        // If the user has opened a popup (Note, Translation, Color picker, or Android More),
        // do NOT hide the toolbar just because the native selection collapsed on tap/focus!
        if (
          showNoteInputRef.current ||
          showTranslationRef.current ||
          showColorPickerRef.current ||
          showAndroidMoreRef.current
        ) {
          return;
        }

        // Delay hiding to allow clicking toolbar buttons
        if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => {
          if (
            showNoteInputRef.current ||
            showTranslationRef.current ||
            showColorPickerRef.current ||
            showAndroidMoreRef.current
          ) {
            return;
          }

          const active = document.activeElement;
          if (toolbarRef.current && toolbarRef.current.contains(active)) return;
          
          // Re-check if we have an active selection inside the toolbar before hiding
          const currentSelection = window.getSelection();
          if (currentSelection && currentSelection.anchorNode && toolbarRef.current?.contains(currentSelection.anchorNode)) {
            return;
          }

          if (!currentSelection?.toString().trim()) {
            hideToolbar();
          }
          hideTimerRef.current = null;
        }, 350);
        return;
      }

      const text = selection.toString().trim();
      if (!text) return;

      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // Snapshot before Android selection handles disappear when toolbar is tapped.
      selectionAnchorRef.current = buildTextRangeAnchor(selection);
      setSelectedText(text);

      // Snapshot selection rect for intelligent dynamic positioning
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      selectionRectRef.current = rect;
      // Snapshot the element containing the selection for the TTS contentRef, so
      // "Aloud" highlighting/cleanup operate on the real reader content.
      const anchor = range.commonAncestorContainer;
      selectionContainerRef.current = anchor.nodeType === Node.ELEMENT_NODE
        ? (anchor as HTMLElement)
        : (anchor.parentElement as HTMLElement | null);

      // Position toolbar relative to selection with safe bounds
      const isCard = showNoteInput || showTranslation || showColorPicker;
      const toolbarWidth = toolbarRef.current?.offsetWidth || (isCard ? 380 : 320);
      const toolbarHeight = toolbarRef.current?.offsetHeight || (isCard ? 300 : 45);

      const vpWidth = window.innerWidth;
      const vpHeight = window.innerHeight;
      const safeMargin = 12;

      let x = rect.left + rect.width / 2 - toolbarWidth / 2;
      let y = 0;

      if (isCard) {
        if (rect.top - toolbarHeight - safeMargin >= safeMargin) {
          y = rect.top - toolbarHeight - 8;
        } else if (rect.bottom + toolbarHeight + safeMargin <= vpHeight - safeMargin) {
          y = rect.bottom + 8;
        } else {
          y = Math.max(safeMargin, vpHeight - toolbarHeight - safeMargin);
        }
      } else {
        if (rect.top - toolbarHeight - safeMargin >= safeMargin) {
          y = rect.top - toolbarHeight - 8;
        } else {
          y = rect.bottom + 8;
        }
      }

      x = Math.max(safeMargin, Math.min(x, vpWidth - toolbarWidth - safeMargin));
      y = Math.max(safeMargin, Math.min(y, vpHeight - toolbarHeight - safeMargin));

      setPosition({ x, y });
      setIsVisible(true);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [hideToolbar, showNoteInput, showTranslation, showColorPicker, showAICopilot]);

  const selectionRectRef = useRef<DOMRect | null>(null);

  // Dynamic repositioning whenever toolbar size or content changes
  const repositionToolbar = useCallback(() => {
    if (!toolbarRef.current) return;
    const isCard = showNoteInput || showTranslation || showColorPicker || showAICopilot;
    const actualWidth = toolbarRef.current.offsetWidth || (isCard ? 380 : 320);
    const actualHeight = toolbarRef.current.offsetHeight || (isCard ? 300 : 45);
    const rect = selectionRectRef.current;

    const vpWidth = window.innerWidth;
    const vpHeight = window.innerHeight;
    const safeMargin = 12;

    let x = 0;
    let y = 0;

    if (rect) {
      x = rect.left + rect.width / 2 - actualWidth / 2;

      if (isCard) {
        const fitsAbove = rect.top - actualHeight - safeMargin >= safeMargin;
        const fitsBelow = rect.bottom + actualHeight + safeMargin <= vpHeight - safeMargin;

        if (fitsAbove) {
          y = rect.top - actualHeight - 8;
        } else if (fitsBelow) {
          y = rect.bottom + 8;
        } else {
          y = Math.max(safeMargin, vpHeight - actualHeight - safeMargin);
        }
      } else {
        if (rect.top - actualHeight - safeMargin >= safeMargin) {
          y = rect.top - actualHeight - 8;
        } else {
          y = rect.bottom + 8;
        }
      }
    } else {
      x = vpWidth / 2 - actualWidth / 2;
      y = vpHeight / 2 - actualHeight / 2;
    }

    const clampedX = Math.max(safeMargin, Math.min(x, vpWidth - actualWidth - safeMargin));
    const clampedY = Math.max(safeMargin, Math.min(y, vpHeight - actualHeight - safeMargin));

    setPosition(prev => {
      if (Math.abs(prev.x - clampedX) < 1 && Math.abs(prev.y - clampedY) < 1) {
        return prev;
      }
      return { x: clampedX, y: clampedY };
    });
  }, [showNoteInput, showTranslation, showColorPicker, showAICopilot]);

  // Click outside to dismiss toolbar
  useEffect(() => {
    if (!isVisible) return;
    const handleOutsidePointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (toolbarRef.current && toolbarRef.current.contains(target)) {
        return;
      }
      if (target.closest('.text-selection-toolbar, [role="dialog"], .text-selection-category-menu')) {
        return;
      }
      hideToolbar();
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [isVisible, hideToolbar]);

  // Ensure toolbar stays within bounds on resize, tab switch, or when definition/translation content arrives
  useLayoutEffect(() => {
    if (!isVisible || !toolbarRef.current) return;
    repositionToolbar();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        repositionToolbar();
      });
      ro.observe(toolbarRef.current);
      return () => ro.disconnect();
    }
  }, [
    isVisible,
    showNoteInput,
    showTranslation,
    showColorPicker,
    dictionaryResult,
    translationResult,
    translationLoading,
    translationError,
    repositionToolbar,
  ]);

  useEffect(() => {
    window.addEventListener('resize', repositionToolbar);
    return () => window.removeEventListener('resize', repositionToolbar);
  }, [repositionToolbar]);

  // Focus note input when shown
  useEffect(() => {
    if (showNoteInput && noteInputRef.current) {
      noteInputRef.current.focus();
    }
    if (showNoteInput && categories.length === 0) {
      api.getAnnotationCategories().then(setCategories).catch(logger.error);
    }
  }, [showNoteInput, categories.length]);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(selectedText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = selectedText;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      useToastStore.getState().addToast({
        title: 'Copied to clipboard',
        variant: 'success',
        duration: 2000,
      });
    } catch {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = selectedText;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        useToastStore.getState().addToast({
          title: 'Copied to clipboard',
          variant: 'success',
          duration: 2000,
        });
      } catch {
        useToastStore.getState().addToast({
          title: 'Failed to copy',
          variant: 'error',
          duration: 2000,
        });
      }
    }
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [selectedText, hideToolbar]);

  const handleWebSearch = useCallback(() => {
    const query = encodeURIComponent(selectedText.trim());
    window.open(`https://www.google.com/search?q=${query}`, '_blank');
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [selectedText, hideToolbar]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          text: `"${selectedText}"`,
        });
      } catch {
        // User cancelled or share not supported
      }
    } else {
      handleCopy();
    }
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [selectedText, handleCopy, hideToolbar]);

  const getResolvedLocation = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      try {
        const anchor = selectionAnchorRef.current ? JSON.parse(selectionAnchorRef.current) as { chapterIndex?: string } : null;
        if (anchor?.chapterIndex !== undefined && anchor.chapterIndex !== null) {
          return `chapter_${anchor.chapterIndex}`;
        }
      } catch {
        // Fall through to current reader location.
      }
      return currentLocation;
    }
    
    const node = selection.anchorNode;
    if (!node) return currentLocation;
    
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!element) return currentLocation;
    
    const chapterEl = element.closest('[data-chapter-index]');
    if (chapterEl) {
      const idx = chapterEl.getAttribute('data-chapter-index');
      if (idx !== null) {
        return `chapter_${idx}`;
      }
    }
    return currentLocation;
  }, [currentLocation]);

  const getResolvedRangeAnchor = useCallback((): string | undefined => {
    const selection = window.getSelection();
    if (!selection) return selectionAnchorRef.current;
    return selectionAnchorRef.current ?? buildTextRangeAnchor(selection);
  }, []);

  const handleHighlight = useCallback(async (color: string, label?: string) => {
    try {
      const location = getResolvedLocation();
      const cfiRange = getResolvedRangeAnchor();

      // Look up matching category ID if available
      let catId = selectedCategoryId;
      if (!catId && label) {
        const found = categories.find((c) => c.name.toLowerCase() === label.toLowerCase());
        if (found) {
          catId = found.id;
        }
      }

      await api.createAnnotation(
        bookId,
        'highlight',
        location,
        cfiRange,
        selectedText,
        undefined,
        color,
        catId
      );
      useToastStore.getState().addToast({
        title: label ? `${label} highlight saved` : 'Highlight saved',
        variant: 'success',
        duration: 2000,
      });
      // Notify readers to re-render highlights
      notifyAnnotationsChanged();
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to save highlight',
        description: String(err),
        variant: 'error',
        duration: 3000,
      });
    }
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [bookId, getResolvedLocation, getResolvedRangeAnchor, selectedText, hideToolbar, selectedCategoryId, categories]);

  const handleAddNote = useCallback(async () => {
    try {
      const location = getResolvedLocation();
      const cfiRange = getResolvedRangeAnchor();
      await api.createAnnotation(
        bookId,
        'note',
        location,
        cfiRange,
        selectedText,
        noteText.trim() || undefined,
        '#fbbf24',
        selectedCategoryId
      );
      useToastStore.getState().addToast({
        title: 'Note saved',
        variant: 'success',
        duration: 2000,
      });
      notifyAnnotationsChanged();
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to save note',
        description: String(err),
        variant: 'error',
      });
    }
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [bookId, getResolvedLocation, getResolvedRangeAnchor, selectedText, noteText, selectedCategoryId, hideToolbar]);



  const handleSpeak = useCallback(() => {
    if (!TTSEngine.isAvailable()) {
      useToastStore.getState().addToast({
        title: 'Text-to-Speech not available',
        description: 'Your platform does not support speech synthesis',
        variant: 'error',
        duration: 3000,
      });
      return;
    }
    ttsEngine.speak(selectedText, { rate: 1.0 });
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [selectedText, hideToolbar]);

// Client-side in-memory caches for instant 0ms response on repeated lookups
const translationClientCache = new Map<string, TranslationResponse>();
const dictionaryClientCache = new Map<string, DictionaryResponse>();

  const handleTranslate = useCallback(async () => {
    setShowTranslation(true);
    setTranslationMode('translate');
    setTranslationError(null);
    setDictionaryResult(null);

    const targetLang = usePreferencesStore.getState().preferences?.translationTargetLanguage ?? 'en';
    const cacheKey = `${targetLang}:${selectedText.trim()}`;

    if (translationClientCache.has(cacheKey)) {
      setTranslationResult(translationClientCache.get(cacheKey)!);
      setTranslationLoading(false);
      return;
    }

    setTranslationLoading(true);
    setTranslationResult(null);
    try {
      const result = await api.translateText(selectedText, targetLang);
      translationClientCache.set(cacheKey, result);
      setTranslationResult(result);
    } catch (err: any) {
      setTranslationError(
        typeof err === 'object' && err !== null && 'userMessage' in err
          ? String(err.userMessage)
          : String(err)
      );
    } finally {
      setTranslationLoading(false);
    }
  }, [selectedText]);

  const handleDefine = useCallback(async () => {
    setShowTranslation(true);
    setTranslationMode('define');
    setTranslationError(null);
    setDictionaryResult(null);
    setTranslationResult(null);

    try {
      const cleanText = selectedText.replace(/[[\](){}0-9]/g, '').trim();
      const word = cleanText.split(/\s+/).find(w => /^[a-zA-Z\u00C0-\u024F]+$/.test(w)) || cleanText.split(/\s+/)[0] || '';
      if (!word || word.length < 2) {
          setTranslationError('Please select a valid word to define');
          setTranslationLoading(false);
          return;
      }

      const wordKey = word.toLowerCase();
      if (dictionaryClientCache.has(wordKey)) {
        setDictionaryResult(dictionaryClientCache.get(wordKey)!);
        setTranslationLoading(false);
        return;
      }

      setTranslationLoading(true);
      const result = await api.dictionaryLookup(word);
      dictionaryClientCache.set(wordKey, result);
      setDictionaryResult(result);
    } catch (err: any) {
      setTranslationError(
        typeof err === 'object' && err !== null && 'userMessage' in err
          ? String(err.userMessage)
          : String(err)
      );
    } finally {
      setTranslationLoading(false);
    }
  }, [selectedText]);

  const handleAddVocabulary = useCallback(async () => {
    try {
      let currentCategories = categories;
      
      // If categories haven't been loaded yet, fetch them now
      if (currentCategories.length === 0) {
        currentCategories = await api.getAnnotationCategories();
        setCategories(currentCategories);
      }

      // Find or create Vocabulary category
      let vocabCategory = currentCategories.find(c => c.name.toLowerCase() === 'vocabulary');
      if (!vocabCategory) {
        try {
          vocabCategory = await api.createAnnotationCategory('Vocabulary', '#8b5cf6', 'BookmarkPlus');
          setCategories(prev => [...prev, vocabCategory!]);
        } catch (catErr: any) {
          // If creation fails due to unique constraint, try fetching again
          if (String(catErr?.userMessage || catErr).includes('UNIQUE constraint')) {
            currentCategories = await api.getAnnotationCategories();
            setCategories(currentCategories);
            vocabCategory = currentCategories.find(c => c.name.toLowerCase() === 'vocabulary');
          }
          
          if (!vocabCategory) throw catErr;
        }
      }

      const vocabData = translationMode === 'define' && dictionaryResult
        ? JSON.stringify({ type: 'define', data: dictionaryResult })
        : JSON.stringify({ type: 'translate', data: translationResult });

      const currentReaderTheme = useReadingSettings.getState().theme || 'paper';
      const themeColors = READER_THEME_COLORS[currentReaderTheme] || READER_THEME_COLORS.paper;
      const vocabColor = themeColors['--text-link'] || themeColors['--ui-focus'] || '#8B6914';

      await api.createAnnotation(
        bookId,
        'note', // Use note type to comply with DB constraints
        getResolvedLocation(),
        getResolvedRangeAnchor(),
        selectedText,
        vocabData,
        vocabColor,
        vocabCategory.id
      );
      useToastStore.getState().addToast({
        title: 'Added to vocabulary',
        variant: 'success',
        duration: 2000,
      });
      notifyAnnotationsChanged();
      setShowTranslation(false);
      hideToolbar();
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      console.error('Failed to add vocabulary annotation:', err);
      useToastStore.getState().addToast({
        title: 'Failed to add vocabulary',
        description: err && typeof err === 'object' ? JSON.stringify(err) : String(err),
        variant: 'error',
      });
    }
  }, [bookId, selectedText, translationMode, dictionaryResult, translationResult, categories, getResolvedLocation, getResolvedRangeAnchor, hideToolbar]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={toolbarRef}
          className={`text-selection-toolbar ${isAndroid ? 'text-selection-toolbar--android' : ''} ${showAndroidMore ? 'text-selection-toolbar--more-active' : ''} ${(!showNoteInput && !showTranslation && !showColorPicker && !showAICopilot) ? 'text-selection-toolbar--pill' : 'text-selection-toolbar--card'} ${showNoteInput ? 'text-selection-toolbar--note-active' : ''}`}
          style={isAndroid ? undefined : { left: position.x, top: position.y }}
          initial={isAndroid ? { opacity: 0, y: 20 } : { opacity: 0, y: 8, scale: 0.96 }}
          animate={isAndroid ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={isAndroid ? { opacity: 0, y: 20 } : { opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (hideTimerRef.current !== null) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (hideTimerRef.current !== null) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
          }}
        >
          {/* Main action buttons: Fig 3 Icon-Top + Fig 2 Sub-view on Android, Single-row on Desktop */}
          {!showNoteInput && !showTranslation && !showAICopilot && (
            isAndroid ? (
              !showAndroidMore ? (
                /* Primary Fig 3 Bar: Copy | Highlight | Translate | Dictionary | More ⋮ */
                <div className="flex items-center justify-around gap-1 p-1 min-w-[280px] sm:min-w-[320px]">
                  <button
                    type="button"
                    className="text-selection-toolbar-android-btn flex flex-col items-center justify-center py-1.5 px-3 rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
                    onClick={() => {
                      hapticTick();
                      handleCopy();
                    }}
                  >
                    <Copy size={18} className="mb-1" style={{ color: 'var(--text-primary)' }} />
                    <span className="text-[10px] sm:text-[11px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>Copy</span>
                  </button>

                  <button
                    type="button"
                    className="text-selection-toolbar-android-btn flex flex-col items-center justify-center py-1.5 px-3 rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
                    onClick={() => {
                      hapticTick();
                      setShowColorPicker(!showColorPicker);
                    }}
                  >
                    <Highlighter size={18} className="mb-1" style={{ color: 'var(--text-primary)' }} />
                    <span className="text-[10px] sm:text-[11px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>Highlight</span>
                  </button>

                  <button
                    type="button"
                    className="text-selection-toolbar-android-btn flex flex-col items-center justify-center py-1.5 px-3 rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
                    onClick={() => {
                      hapticTick();
                      handleTranslate();
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1" style={{ color: 'var(--text-primary)' }}>
                      <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
                    </svg>
                    <span className="text-[10px] sm:text-[11px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>Translate</span>
                  </button>

                  <button
                    type="button"
                    className="text-selection-toolbar-android-btn flex flex-col items-center justify-center py-1.5 px-3 rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
                    onClick={() => {
                      hapticTick();
                      handleDefine();
                    }}
                  >
                    <BookOpen size={18} className="mb-1" style={{ color: 'var(--text-primary)' }} />
                    <span className="text-[10px] sm:text-[11px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>Dictionary</span>
                  </button>

                  <button
                    type="button"
                    className="text-selection-toolbar-android-btn flex flex-col items-center justify-center py-1.5 px-3 rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
                    onClick={() => {
                      hapticTick();
                      setShowAndroidMore(true);
                    }}
                  >
                    <MoreVertical size={18} className="mb-1" style={{ color: 'var(--text-primary)' }} />
                    <span className="text-[10px] sm:text-[11px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>More</span>
                  </button>
                </div>
              ) : (
                /* Compact Vertical Sub-view for Android More Menu: Back | Note | Aloud */
                <div className="flex flex-col gap-1 p-1 w-full min-w-[170px]">
                  <button
                    type="button"
                    className="text-selection-toolbar-android-btn flex items-center gap-3.5 w-full px-3.5 py-2.5 rounded-xl hover:bg-white/10 active:scale-98 transition-all cursor-pointer text-left"
                    onClick={() => {
                      hapticTick();
                      setShowAndroidMore(false);
                    }}
                  >
                    <ArrowLeft size={18} className="shrink-0" style={{ color: 'var(--text-primary)' }} />
                    <span className="text-[13.5px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>Back</span>
                  </button>

                  <button
                    type="button"
                    className="text-selection-toolbar-android-btn flex items-center gap-3.5 w-full px-3.5 py-2.5 rounded-xl hover:bg-white/10 active:scale-98 transition-all cursor-pointer text-left"
                    onClick={() => {
                      hapticTick();
                      setShowNoteInput(true);
                    }}
                  >
                    <StickyNote size={18} className="shrink-0" style={{ color: 'var(--text-primary)' }} />
                    <span className="text-[13.5px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>Note</span>
                  </button>

                  {aiEnabled && (
                  <button
                    type="button"
                    className="text-selection-toolbar-android-btn flex items-center gap-3.5 w-full px-3.5 py-2.5 rounded-xl hover:bg-white/10 active:scale-98 transition-all cursor-pointer text-left"
                    onClick={() => {
                      hapticTick();
                      setShowAndroidMore(false);
                      setShowAICopilot(true);
                    }}
                  >
                    <Brain size={18} className="shrink-0" style={{ color: 'var(--text-primary)' }} />
                    <span className="text-[13.5px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>Ask AI</span>
                  </button>
                  )}

                  <button
                    type="button"
                    className="text-selection-toolbar-android-btn flex items-center gap-3.5 w-full px-3.5 py-2.5 rounded-xl hover:bg-white/10 active:scale-98 transition-all cursor-pointer text-left"
                    onClick={() => {
                      hapticTick();
                      ttsState === 'speaking' ? stopSpeaking() : speakText(selectedText);
                    }}
                  >
                    <Volume2 size={18} className={`shrink-0 ${ttsState === 'speaking' ? "text-primary animate-pulse" : ""}`} style={ttsState !== 'speaking' ? { color: 'var(--text-primary)' } : undefined} />
                    <span className="text-[13.5px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>{ttsState === 'speaking' ? "Stop" : "Aloud"}</span>
                  </button>
                </div>
              )
            ) : (
              /* Single Horizontal Row for Desktop */
              <div className="flex items-center gap-1 p-1">
                <button
                  type="button"
                  className="text-selection-toolbar-btn"
                  onClick={() => {
                    hapticTick();
                    handleTranslate();
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
                  </svg>
                  <span>Translate</span>
                </button>

                <span className="text-selection-toolbar-divider" />

                <button
                  type="button"
                  className="text-selection-toolbar-btn"
                  onClick={() => {
                    hapticTick();
                    setShowNoteInput(true);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
                    <path d="M14 3v4a2 2 0 0 0 2 2h4" />
                  </svg>
                  <span>Note</span>
                </button>

                <span className="text-selection-toolbar-divider" />

                <button
                  type="button"
                  className="text-selection-toolbar-btn"
                  onClick={() => {
                    hapticTick();
                    setShowColorPicker(!showColorPicker);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 11-6 6v3h3l6-6" />
                    <path d="m22 12-4.6 4.6a2.78 2.78 0 0 1-3.9 0l-2.1-2.1a2.78 2.78 0 0 1 0-3.9L16 6" />
                  </svg>
                  <span>Highlight</span>
                </button>

                <span className="text-selection-toolbar-divider" />

                <button
                  type="button"
                  className="text-selection-toolbar-btn"
                  onClick={() => {
                    hapticTick();
                    ttsState === 'speaking' ? stopSpeaking() : speakText(selectedText);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ttsState === 'speaking' ? "text-primary animate-pulse" : ""}>
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  <span>{ttsState === 'speaking' ? "Stop" : "Aloud"}</span>
                </button>

                <span className="text-selection-toolbar-divider" />

                <button
                  type="button"
                  className="text-selection-toolbar-btn"
                  onClick={() => {
                    hapticTick();
                    handleDefine();
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                  </svg>
                  <span>Define</span>
                </button>

                <span className="text-selection-toolbar-divider" />

                {!isAndroid && aiEnabled && (
                  <>
                    <button
                      type="button"
                      className="text-selection-toolbar-btn"
                      onClick={() => {
                        hapticTick();
                        setShowAICopilot(!showAICopilot);
                        setShowTranslation(false);
                        setShowNoteInput(false);
                        setShowColorPicker(false);
                      }}
                    >
                      <Brain size={14} style={{ color: 'var(--text-primary)' }} />
                      <span>Ask AI</span>
                    </button>

                    <span className="text-selection-toolbar-divider" />
                  </>
                )}

                <button
                  type="button"
                  className="text-selection-toolbar-btn"
                  onClick={() => {
                    hapticTick();
                    handleCopy();
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </button>
              </div>
            )
          )}

          {/* Color picker with custom labels for highlight */}
          {showColorPicker && !showNoteInput && !showTranslation && (
            <motion.div
              className="p-2 space-y-2 max-w-sm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                <span>Select highlight label</span>
                <button
                  type="button"
                  className="hover:text-[var(--text-primary)] transition-colors cursor-pointer text-[10px] underline underline-offset-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingLabels(!isEditingLabels);
                  }}
                >
                  {isEditingLabels ? 'Done' : 'Edit labels'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5 no-scrollbar">
                {DEFAULT_HIGHLIGHT_PRESETS.map((c) => {
                  const currentLabel = highlightLabels[c.value] || c.defaultLabel;
                  if (isEditingLabels) {
                    return (
                      <div
                        key={c.value}
                        className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--ui-border)]"
                      >
                        <span className="w-3 h-3 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: c.value }} />
                        <input
                          type="text"
                          value={currentLabel}
                          onChange={(e) => {
                            const newLabels = { ...highlightLabels, [c.value]: e.target.value };
                            setHighlightLabels(newLabels);
                            localStorage.setItem('shiori-highlight-labels', JSON.stringify(newLabels));
                          }}
                          className="w-full text-[11px] bg-transparent outline-none text-[var(--text-primary)]"
                          placeholder={c.defaultLabel}
                        />
                      </div>
                    );
                  }

                  return (
                    <button
                      key={c.value}
                      type="button"
                      className="group flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] bg-[var(--bg-secondary)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] hover:border-[var(--ui-focus)] transition-all cursor-pointer text-left active:scale-95"
                      onClick={() => handleHighlight(c.value, currentLabel)}
                      aria-label={`${c.name} • ${currentLabel}`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow-xs ring-1 ring-black/10 group-hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.value }}
                      />
                      <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                        {currentLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Note input */}
          {showNoteInput && (
            <motion.div
              className="text-selection-toolbar-note"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <textarea
                ref={noteInputRef}
                className="text-selection-note-input"
                placeholder="Add a note..."
                value={noteText}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddNote();
                  }
                  if (e.key === 'Escape') {
                    setShowNoteInput(false);
                    setNoteText('');
                  }
                }}
                rows={3}
              />
              {categories.length > 0 && (
                <div className="relative w-full">
                  <button
                    type="button"
                    className="text-selection-category-trigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                    }}
                  >
                    <span className="truncate">
                      {selectedCategoryId
                        ? categories.find(c => c.id === selectedCategoryId)?.name || 'Select category'
                        : 'No category'}
                    </span>
                    <ChevronDown size={14} className={`opacity-70 shrink-0 transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isCategoryDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-[190]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsCategoryDropdownOpen(false);
                          }}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.97 }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                          className="text-selection-category-menu"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={`text-selection-category-option ${!selectedCategoryId ? 'text-selection-category-option--active' : ''}`}
                            onClick={() => {
                              setSelectedCategoryId(undefined);
                              setIsCategoryDropdownOpen(false);
                            }}
                          >
                            No category
                          </button>
                          {categories.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={`text-selection-category-option ${selectedCategoryId === c.id ? 'text-selection-category-option--active' : ''}`}
                              onClick={() => {
                                setSelectedCategoryId(c.id);
                                setIsCategoryDropdownOpen(false);
                              }}
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                              <span>{c.name}</span>
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => { setShowNoteInput(false); setNoteText(''); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md active:scale-95 transition-all cursor-pointer"
                  style={{ backgroundColor: 'var(--ui-focus, #3b82f6)', color: '#ffffff' }}
                  onClick={handleAddNote}
                >
                  Save
                </button>
              </div>
            </motion.div>
          )}

          {showTranslation && (
            <TranslationPopup
              mode={translationMode}
              loading={translationLoading}
              dictionaryResult={dictionaryResult}
              translationResult={translationResult}
              error={translationError}
              onClose={() => {
                hideToolbar();
                window.getSelection()?.removeAllRanges();
              }}
              onAddVocabulary={handleAddVocabulary}
              onSwitchMode={(mode) => {
                if (mode === 'define') handleDefine();
                else handleTranslate();
              }}
            />
          )}

          {showAICopilot && (
            <AICopilotPopup
              selectedText={selectedText}
              context={{
                bookId,
                selectedText,
              }}
              onClose={() => {
                setShowAICopilot(false);
              }}
              onSaveAsNote={(aiNote) => {
                setNoteText(aiNote);
                setShowAICopilot(false);
                setShowNoteInput(true);
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
