import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  Loader2,
  Check,
  Globe,
  Sparkles,
  BookOpen,
  Edit3,
  Image as ImageIcon,
  RotateCcw,
} from 'lucide-react';
import {
  searchCharacterOnline,
  saveCharacterOverride,
  removeCharacterOverride,
  type CharacterSearchResult,
  type CharacterOverride,
} from '@/lib/characterOverrideService';
import { useToastStore } from '@/store/toastStore';
import {
  useReadingSettings,
  READER_THEME_COLORS,
  applyReaderThemeToElement,
  removeReaderThemeFromElement,
} from '@/store/premiumReaderStore';

interface CharacterRemapModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalName: string;
  currentDisplayName: string;
  bookId: number;
  bookTitle?: string;
  activeOverride?: CharacterOverride | null;
  onRemapComplete: (override: CharacterOverride) => void;
  onRevertComplete?: () => void;
}

export const CharacterRemapModal: React.FC<CharacterRemapModalProps> = ({
  isOpen,
  onClose,
  originalName,
  currentDisplayName,
  bookId,
  bookTitle,
  activeOverride,
  onRemapComplete,
  onRevertComplete,
}) => {
  const [searchQuery, setSearchQuery] = useState(currentDisplayName);
  const [activeTab, setActiveTab] = useState<'all' | 'fandom' | 'anilist' | 'wikipedia' | 'manual'>('all');
  const [results, setResults] = useState<CharacterSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<CharacterSearchResult | null>(null);

  // Manual Form States
  const [manualName, setManualName] = useState(currentDisplayName);
  const [manualNativeName, setManualNativeName] = useState(activeOverride?.nativeName || '');
  const [manualImageUrl, setManualImageUrl] = useState(activeOverride?.imageUrl || '');
  const [manualDescription, setManualDescription] = useState(activeOverride?.description || '');

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const readerTheme = useReadingSettings((s) => s.theme) || 'paper';
  const themeVars = (READER_THEME_COLORS[readerTheme] || READER_THEME_COLORS.paper) as React.CSSProperties;

  // Sync reader theme on portal container
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    applyReaderThemeToElement(el, readerTheme);
    return () => {
      removeReaderThemeFromElement(el);
    };
  }, [readerTheme]);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery(currentDisplayName);
      setManualName(currentDisplayName);
      setSelectedResult(null);
      // Auto-trigger initial search
      handleSearch(currentDisplayName);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, currentDisplayName]);

  const handleSearch = (term: string) => {
    const q = term.trim();
    if (!q) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      try {
        const found = await searchCharacterOnline(q, bookTitle);
        setResults(found || []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);
  };

  const filteredResults = (results || []).filter((r) => {
    if (activeTab === 'all') return true;
    return r.source === activeTab;
  });

  const handleApplySearchResult = (res: CharacterSearchResult) => {
    const override: CharacterOverride = {
      originalName,
      resolvedName: res.name,
      nativeName: res.nativeName,
      imageUrl: res.imageUrl,
      description: res.description,
      source: res.source,
      updatedAt: Date.now(),
    };

    saveCharacterOverride(bookId, override, bookTitle);
    useToastStore.getState().addToast({
      title: 'Character Updated',
      description: `Mapped "${originalName}" to ${res.name}`,
      variant: 'success',
    });
    onRemapComplete(override);
    onClose();
  };

  const handleApplyManual = () => {
    if (!manualName.trim()) {
      useToastStore.getState().addToast({
        title: 'Name Required',
        description: 'Please enter a character name.',
        variant: 'error',
      });
      return;
    }

    const override: CharacterOverride = {
      originalName,
      resolvedName: manualName.trim(),
      nativeName: manualNativeName.trim() || undefined,
      imageUrl: manualImageUrl.trim() || null,
      description: manualDescription.trim() || undefined,
      source: 'custom',
      updatedAt: Date.now(),
    };

    saveCharacterOverride(bookId, override, bookTitle);
    useToastStore.getState().addToast({
      title: 'Custom Character Saved',
      description: `Updated "${originalName}" to ${override.resolvedName}`,
      variant: 'success',
    });
    onRemapComplete(override);
    onClose();
  };

  const handleRevert = () => {
    removeCharacterOverride(bookId, originalName);
    useToastStore.getState().addToast({
      title: 'Character Reverted',
      description: `Restored original name "${originalName}"`,
      variant: 'info',
    });
    onRevertComplete?.();
    onClose();
  };

  if (!isOpen) return null;

  const content = (
    <div
      ref={modalRef}
      data-reader-theme={readerTheme}
      style={themeVars}
      className="fixed inset-0 z-[2100000] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 14 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-3xl bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] shadow-2xl overflow-hidden font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--ui-focus)] flex items-center gap-1.5">
                <Edit3 size={14} />
                Remap Character
              </span>
              {activeOverride && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  Custom Mapped
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              Extracted from text as: <strong className="text-[var(--text-primary)]">"{originalName}"</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="p-4 border-b border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_40%,var(--bg-elevated))] space-y-3">
          <div className="relative flex items-center">
            <Search size={16} className="absolute left-3.5 text-[var(--text-tertiary)] pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              placeholder="Search correct character (e.g. Puck, Emilia, Rem)..."
              className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ui-focus)_20%,transparent)] text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] transition-all outline-none"
            />
            {isSearching ? (
              <Loader2 size={15} className="absolute right-3.5 text-[var(--ui-focus)] animate-spin" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  handleSearch('');
                }}
                className="absolute right-3 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
            {[
              { id: 'all' as const, label: 'All Sources' },
              { id: 'fandom' as const, label: 'Fandom Wiki' },
              { id: 'anilist' as const, label: 'AniList (Anime / LN)' },
              { id: 'wikipedia' as const, label: 'Wikipedia' },
              { id: 'manual' as const, label: '✏️ Manual Entry' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[var(--ui-focus)] text-white shadow-xs'
                    : 'bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'manual' ? (
            /* Manual Entry Form */
            <div className="space-y-3.5 p-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Correct Name *</label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Puck"
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--ui-focus)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Native Name / Alias (Optional)</label>
                <input
                  type="text"
                  value={manualNativeName}
                  onChange={(e) => setManualNativeName(e.target.value)}
                  placeholder="e.g. パック or Great Spirit of Fire"
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--ui-focus)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Portrait Image URL (Optional)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={manualImageUrl}
                    onChange={(e) => setManualImageUrl(e.target.value)}
                    placeholder="https://... (direct link to image)"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--ui-focus)]"
                  />
                  {manualImageUrl && (
                    <div className="w-10 h-10 rounded-xl overflow-hidden border border-[var(--ui-border)] shrink-0 bg-[var(--bg-secondary)] flex items-center justify-center">
                      <img
                        src={manualImageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Character Overview / Biography</label>
                <textarea
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  rows={3}
                  placeholder="Key traits, allegiance, or description points..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--ui-focus)] resize-none"
                />
              </div>

              <button
                type="button"
                onClick={handleApplyManual}
                className="w-full py-2.5 rounded-xl bg-[var(--ui-focus)] text-white text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-1.5 shadow-sm mt-2"
              >
                <Check size={14} />
                Save Custom Character
              </button>
            </div>
          ) : isSearching ? (
            <div className="py-16 text-center text-[var(--text-tertiary)] flex flex-col items-center justify-center gap-2.5">
              <Loader2 size={24} className="text-[var(--ui-focus)] animate-spin" />
              <span className="text-xs font-medium">Searching AniList & Wikipedia database...</span>
            </div>
          ) : filteredResults.length > 0 ? (
            /* Results Cards */
            <div className="space-y-2.5">
              {filteredResults.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleApplySearchResult(item)}
                  className="group p-3 rounded-2xl bg-[color-mix(in_srgb,var(--bg-secondary)_60%,var(--bg-elevated))] hover:bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] hover:border-[var(--ui-focus)] transition-all flex items-start gap-3.5 cursor-pointer shadow-2xs"
                >
                  {/* Avatar */}
                  <div className="w-14 h-16 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] bg-[var(--bg-secondary)] flex items-center justify-center">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <span className="text-sm font-bold text-[var(--text-tertiary)]">
                        {item.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--ui-focus)] transition-colors">
                        {item.name}
                      </span>
                      {item.nativeName && (
                        <span
                          lang="ja"
                          style={{ fontFamily: 'var(--font-cjk, sans-serif)' }}
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-tertiary)]"
                        >
                          {item.nativeName}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] text-[var(--ui-focus)] uppercase tracking-wider ml-auto">
                        {item.source}
                      </span>
                    </div>

                    {item.mediaTitle && (
                      <div className="text-[11px] font-medium text-[var(--ui-focus)] truncate mt-0.5">
                        {item.mediaTitle}
                      </div>
                    )}

                    {item.description && (
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-1 my-0 leading-relaxed">
                        {item.description.replace(/<[^>]*>/g, '').slice(0, 140)}...
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApplySearchResult(item);
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-[var(--ui-focus)] text-white text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1 shadow-xs self-center"
                  >
                    <Check size={12} />
                    Apply
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-14 text-center text-[var(--text-tertiary)] space-y-2">
              <Search size={24} className="mx-auto opacity-40" />
              <p className="text-xs">No online characters found matching "{searchQuery}"</p>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className="text-xs font-semibold text-[var(--ui-focus)] hover:underline cursor-pointer"
              >
                Enter custom character details manually →
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_40%,var(--bg-elevated))] flex items-center justify-between gap-3">
          {activeOverride ? (
            <button
              type="button"
              onClick={handleRevert}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={12} />
              Revert to "{originalName}"
            </button>
          ) : (
            <span className="text-[11px] text-[var(--text-tertiary)]">
              Select a matching identity to update name, portrait, and bio.
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_14%,transparent)] transition-colors cursor-pointer ml-auto"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};
