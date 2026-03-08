import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Highlighter, StickyNote, Bookmark, X, Volume2 } from '@/components/icons';
import { api } from '@/lib/tauri';
import type { AnnotationCategory, DictionaryResponse, TranslationResponse } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { ttsEngine, TTSEngine } from '@/lib/ttsEngine';
import { TranslationPopup } from './TranslationPopup';

interface TextSelectionToolbarProps {
  bookId: number;
  /** Current reading location string (e.g. "chapter_3:scroll_0.5") for annotation storage */
  currentLocation: string;
}

interface ToolbarPosition {
  x: number;
  y: number;
}

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fbbf24' },
  { name: 'Green', value: '#34d399' },
  { name: 'Blue', value: '#60a5fa' },
  { name: 'Pink', value: '#f472b6' },
  { name: 'Purple', value: '#a78bfa' },
  { name: 'Orange', value: '#fb923c' },
  { name: 'Red', value: '#f87171' },
  { name: 'Teal', value: '#2dd4bf' },
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
  const [categories, setCategories] = useState<AnnotationCategory[]>([]);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationMode, setTranslationMode] = useState<'translate' | 'define'>('translate');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [dictionaryResult, setDictionaryResult] = useState<DictionaryResponse | null>(null);
  const [translationResult, setTranslationResult] = useState<TranslationResponse | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const hideToolbar = useCallback(() => {
    setIsVisible(false);
    setShowColorPicker(false);
    setShowNoteInput(false);
    setNoteText('');
    setSelectedCategoryId(undefined);
    setShowTranslation(false);
    setDictionaryResult(null);
    setTranslationResult(null);
    setTranslationError(null);
  }, []);

  // Listen for text selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        // Delay hiding to allow clicking toolbar buttons
        setTimeout(() => {
          const active = document.activeElement;
          if (toolbarRef.current && toolbarRef.current.contains(active)) return;
          if (!window.getSelection()?.toString().trim()) {
            hideToolbar();
          }
        }, 200);
        return;
      }

      const text = selection.toString().trim();
      if (!text) return;

      setSelectedText(text);

      // Calculate position above the selection
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Position the toolbar centered above the selection
      const toolbarWidth = 240;
      let x = rect.left + rect.width / 2 - toolbarWidth / 2;
      const y = rect.top - 50;

      // Keep within viewport
      x = Math.max(8, Math.min(x, window.innerWidth - toolbarWidth - 8));

      setPosition({ x, y: Math.max(8, y) });
      setIsVisible(true);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [hideToolbar]);

  // Focus note input when shown
  useEffect(() => {
    if (showNoteInput && noteInputRef.current) {
      noteInputRef.current.focus();
    }
    if (showNoteInput && categories.length === 0) {
      api.getAnnotationCategories().then(setCategories).catch(console.error);
    }
  }, [showNoteInput, categories.length]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
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
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [selectedText, hideToolbar]);

  const handleHighlight = useCallback(async (color: string) => {
    try {
      await api.createAnnotation(
        bookId,
        'highlight',
        currentLocation,
        undefined,
        selectedText,
        undefined,
        color
      );
      useToastStore.getState().addToast({
        title: 'Highlight saved',
        variant: 'success',
        duration: 2000,
      });
      // Notify readers to re-render highlights
      window.dispatchEvent(new CustomEvent('annotation-changed'));
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to save highlight',
        description: String(err),
        variant: 'error',
      });
    }
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [bookId, currentLocation, selectedText, hideToolbar]);

  const handleAddNote = useCallback(async () => {
    if (!noteText.trim()) return;
    try {
      await api.createAnnotation(
        bookId,
        'note',
        currentLocation,
        undefined,
        selectedText,
        noteText.trim(),
        '#fbbf24',
        selectedCategoryId
      );
      useToastStore.getState().addToast({
        title: 'Note saved',
        variant: 'success',
        duration: 2000,
      });
      window.dispatchEvent(new CustomEvent('annotation-changed'));
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to save note',
        description: String(err),
        variant: 'error',
      });
    }
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [bookId, currentLocation, selectedText, noteText, selectedCategoryId, hideToolbar]);

  const handleBookmark = useCallback(async () => {
    try {
      await api.createAnnotation(
        bookId,
        'bookmark',
        currentLocation,
        undefined,
        selectedText.slice(0, 100), // Truncate for bookmark preview
        undefined,
        '#3b82f6'
      );
      useToastStore.getState().addToast({
        title: 'Bookmark added',
        variant: 'success',
        duration: 2000,
      });
      // Notify readers to re-render highlights
      window.dispatchEvent(new CustomEvent('annotation-changed'));
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to add bookmark',
        description: String(err),
        variant: 'error',
      });
    }
    hideToolbar();
    window.getSelection()?.removeAllRanges();
  }, [bookId, currentLocation, selectedText, hideToolbar]);

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

  const handleTranslate = useCallback(async () => {
    setShowTranslation(true);
    setTranslationMode('translate');
    setTranslationLoading(true);
    setTranslationError(null);
    setDictionaryResult(null);
    setTranslationResult(null);
    try {
      const targetLang = usePreferencesStore.getState().preferences?.translationTargetLanguage ?? 'en';
      const result = await api.translateText(selectedText, targetLang);
      setTranslationResult(result);
    } catch (err) {
      setTranslationError(String(err));
    } finally {
      setTranslationLoading(false);
    }
  }, [selectedText]);

  const handleDefine = useCallback(async () => {
    setShowTranslation(true);
    setTranslationMode('define');
    setTranslationLoading(true);
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
      const result = await api.dictionaryLookup(word);
      setDictionaryResult(result);
    } catch (err) {
      setTranslationError(String(err));
    } finally {
      setTranslationLoading(false);
    }
  }, [selectedText]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={toolbarRef}
          className="text-selection-toolbar"
          style={{ left: position.x, top: position.y }}
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.15 }}
        >
          {/* Main action buttons */}
          {!showNoteInput && !showTranslation && (
            <div className="text-selection-toolbar-actions">
              {/* Copy */}
              <button
                className="text-selection-toolbar-btn"
                onClick={handleCopy}
                title="Copy text"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy</span>
              </button>

              {/* Highlight */}
              <button
                className="text-selection-toolbar-btn"
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="Highlight text"
              >
                <Highlighter size={14} />
                <span>Highlight</span>
              </button>

              {/* Note */}
              <button
                className="text-selection-toolbar-btn"
                onClick={() => setShowNoteInput(true)}
                title="Add a note"
              >
                <StickyNote size={14} />
                <span>Note</span>
              </button>

              {/* Bookmark */}
              <button
                className="text-selection-toolbar-btn"
                onClick={handleBookmark}
                title="Bookmark this passage"
              >
                <Bookmark size={14} />
                <span>Bookmark</span>
              </button>

              {TTSEngine.isAvailable() && (
                <button
                  className="text-selection-toolbar-btn"
                  onClick={handleSpeak}
                  title="Speak selected text"
                >
                  <Volume2 size={14} />
                  <span>Speak</span>
                </button>
              )}

              <button
                className="text-selection-toolbar-btn"
                onClick={handleTranslate}
                title="Translate selected text"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
                </svg>
                <span>Translate</span>
              </button>

              <button
                className="text-selection-toolbar-btn"
                onClick={handleDefine}
                title="Look up definition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
                <span>Define</span>
              </button>
            </div>
          )}

          {/* Color picker for highlight */}
          {showColorPicker && !showNoteInput && !showTranslation && (
            <motion.div
              className="text-selection-toolbar-colors"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  className="text-selection-color-swatch"
                  style={{ backgroundColor: c.value }}
                  onClick={() => handleHighlight(c.value)}
                  title={c.name}
                />
              ))}
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
                <select
                  className="text-selection-category-select"
                  value={selectedCategoryId ?? ''}
                  onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : undefined)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <div className="text-selection-note-actions">
                <button
                  className="text-selection-toolbar-btn text-selection-toolbar-btn--cancel"
                  onClick={() => { setShowNoteInput(false); setNoteText(''); }}
                >
                  <X size={12} />
                  <span>Cancel</span>
                </button>
                <button
                  className="text-selection-toolbar-btn text-selection-toolbar-btn--save"
                  onClick={handleAddNote}
                  disabled={!noteText.trim()}
                >
                  <span>Save</span>
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
              onClose={() => setShowTranslation(false)}
              onSwitchMode={(mode) => {
                if (mode === 'define') handleDefine();
                else handleTranslate();
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
