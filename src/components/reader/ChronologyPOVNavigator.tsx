import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Compass,
  GitBranch,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Play,
  RotateCcw,
  BookOpen,
  Tag,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  Layers,
  X,
  Check,
} from 'lucide-react';
import type { TocEntry } from '@/lib/tauri';
import {
  extractPovArcs,
  savePovOverride,
  removePovOverride,
  getSavedPovOverrides,
  type PovCharacterArc,
  type EraGroup,
  getPovArcProgress,
} from '@/lib/povChronology';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';

interface ChronologyPOVNavigatorProps {
  toc: TocEntry[];
  bookId: number;
  currentIndex: number;
  activePovCharacter: string | null;
  onNavigate: (chapterIndex: number) => void;
  onStartSinglePovArc: (character: string, chapterIndices: number[]) => void;
  onExitSinglePovArc: () => void;
}

export function ChronologyPOVNavigator({
  toc,
  bookId,
  currentIndex,
  activePovCharacter,
  onNavigate,
  onStartSinglePovArc,
  onExitSinglePovArc,
}: ChronologyPOVNavigatorProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [tagRevision, setTagRevision] = useState(0);

  // Extract storylines and metadata (re-computed when tagRevision changes)
  const { characters, eras, metadata } = useMemo(() => {
    return extractPovArcs(toc, bookId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toc, bookId, tagRevision]);

  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(
    activePovCharacter || (characters.length > 0 ? characters[0].character : null)
  );

  // Auto-sync selectedCharacter if activePovCharacter changes or character list updates
  const effectiveSelected = useMemo(() => {
    if (activePovCharacter && characters.some((c) => c.character === activePovCharacter)) {
      return activePovCharacter;
    }
    if (selectedCharacter && characters.some((c) => c.character === selectedCharacter)) {
      return selectedCharacter;
    }
    return characters.length > 0 ? characters[0].character : null;
  }, [activePovCharacter, selectedCharacter, characters]);

  const activeArc = characters.find((c) => c.character === effectiveSelected);

  // Tagging modal / inline editor state
  const [isTaggingOpen, setIsTaggingOpen] = useState(false);
  const currentChapterMeta = metadata.find((m) => m.index === currentIndex);
  const currentOverride = useMemo(() => {
    const overrides = getSavedPovOverrides(bookId);
    return overrides[currentIndex];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, currentIndex, tagRevision]);

  // Distinct characters that have been saved in overrides or detected
  const knownCharacters = useMemo(() => {
    const set = new Set<string>();
    characters.forEach((c) => set.add(c.character));
    const overrides = getSavedPovOverrides(bookId);
    Object.values(overrides).forEach((o) => {
      if (o.character) set.add(o.character);
    });
    return Array.from(set);
  }, [characters, bookId, tagRevision]);

  const [tagInput, setTagInput] = useState(currentOverride?.character || currentChapterMeta?.character || '');

  const handleSaveTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    savePovOverride(bookId, currentIndex, { character: trimmed });
    setTagRevision((r) => r + 1);
    setSelectedCharacter(trimmed);
    setIsTaggingOpen(false);
    addToast({
      title: 'POV Tag Saved',
      description: `Tagged Chapter ${currentIndex + 1} as "${trimmed}"`,
      variant: 'success',
    });
  };

  const handleRemoveTag = () => {
    removePovOverride(bookId, currentIndex);
    setTagRevision((r) => r + 1);
    setIsTaggingOpen(false);
    addToast({
      title: 'POV Tag Removed',
      description: `Removed POV tag from Chapter ${currentIndex + 1}`,
      variant: 'info',
    });
  };

  return (
    <div className="flex flex-col h-full space-y-4 pb-6 select-none font-sans">
      {/* Active POV Arc Banner (Sticky at Top) */}
      {activePovCharacter && (
        <div className="p-3.5 rounded-2xl bg-[var(--ui-focus)]/12 border border-[var(--ui-focus)]/35 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--ui-focus)] animate-pulse shrink-0 ring-3 ring-[var(--ui-focus)]/30" />
            <div className="min-w-0">
              <span className="text-xs font-bold text-[var(--ui-focus)] block truncate">
                Focused Arc: {activePovCharacter}
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)] block truncate">
                Chapter jumps stay inside this character's storyline
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onExitSinglePovArc}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 transition-all cursor-pointer shrink-0 shadow-xs border-t border-white/20 active:scale-95"
          >
            <RotateCcw size={12} />
            <span>Exit Focus</span>
          </button>
        </div>
      )}

      {/* Overview Header & Quick Tag Trigger */}
      <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] px-1 font-medium">
        <div className="flex items-center gap-2">
          <span>
            {characters.length === 0
              ? 'Single Timeline'
              : `${characters.length} ${characters.length === 1 ? 'Storyline' : 'Storylines'}`}
          </span>
          {eras.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] text-[10px] font-mono">
              {eras.length} Eras
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setTagInput(currentOverride?.character || currentChapterMeta?.character || '');
            setIsTaggingOpen(!isTaggingOpen);
          }}
          className={cn(
            'flex items-center gap-1 px-2 py-0.8 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border',
            isTaggingOpen
              ? 'bg-[var(--ui-focus)] text-white border-[var(--ui-focus)]'
              : 'bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)]'
          )}
        >
          <Tag size={11} />
          <span>{currentOverride?.character ? `POV: ${currentOverride.character}` : '+ Tag POV'}</span>
        </button>
      </div>

      {/* Inline Chapter POV Tagging Bar */}
      <AnimatePresence>
        {isTaggingOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3.5 rounded-2xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  Tag Chapter {currentIndex + 1} POV
                </span>
                <button
                  type="button"
                  onClick={() => setIsTaggingOpen(false)}
                  className="p-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="e.g. Subaru, Emilia, Kaladin..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--ui-focus)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTag(tagInput);
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSaveTag(tagInput)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 cursor-pointer shadow-2xs border-t border-white/20 active:scale-95"
                >
                  Save
                </button>
                {currentOverride?.character && (
                  <button
                    type="button"
                    onClick={handleRemoveTag}
                    title="Remove tag"
                    className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 cursor-pointer transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Suggestion Chips from Known Storylines & Overrides */}
              {knownCharacters.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] text-[var(--text-tertiary)] mr-0.5">Quick assign:</span>
                  {knownCharacters.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleSaveTag(name)}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] cursor-pointer"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {characters.length === 0 ? (
        /* Uniform Narrative Timeline (Polished Empty State) */
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-primary))] text-[var(--ui-focus)] flex items-center justify-center border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] shadow-2xs">
            <GitBranch size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h4 className="text-sm font-bold mb-1 text-[var(--text-primary)]">
              Uniform Narrative Timeline
            </h4>
            <p className="text-xs text-[var(--text-tertiary)] max-w-xs leading-relaxed">
              This book's Table of Contents follows a continuous single-perspective chronology. Multi-POV storylines activate automatically for books with character-titled chapters, or you can tag chapters above.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTagInput(currentOverride?.character || currentChapterMeta?.character || '');
              setIsTaggingOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-primary))] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,var(--bg-primary))] text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] transition-all cursor-pointer shadow-2xs active:scale-95"
          >
            <Plus size={13} className="text-[var(--ui-focus)]" />
            <span>Tag Chapter {currentIndex + 1} POV</span>
          </button>
        </div>
      ) : (
        <>
          {/* Character Arc Pills Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
            {characters.map((arc) => {
              const isSelected = effectiveSelected === arc.character;
              const isArcActive = activePovCharacter === arc.character;
              const readCount = arc.chapterIndices.filter((idx) => idx <= currentIndex).length;

              return (
                <button
                  key={arc.character}
                  type="button"
                  onClick={() => setSelectedCharacter(arc.character)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border shrink-0',
                    isSelected
                      ? 'bg-[var(--bg-elevated)] border-[var(--ui-focus)] text-[var(--text-primary)] shadow-2xs ring-1 ring-[var(--ui-focus)]/30'
                      : 'bg-[var(--bg-secondary)] border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--ui-focus)]/40'
                  )}
                >
                  <span
                    style={{ backgroundColor: arc.color }}
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                  />
                  <span>{arc.character}</span>
                  <span className="text-[10px] opacity-75 font-mono">
                    {readCount}/{arc.chapterIndices.length}
                  </span>
                  {isArcActive && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[var(--ui-focus)] text-white font-extrabold uppercase shadow-2xs">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Hero Character Storyline Dossier */}
          {activeArc && (
            <div className="relative rounded-2xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] overflow-hidden shadow-xs">
              {/* Colored top accent line matching character palette */}
              <div
                style={{
                  background: `linear-gradient(90deg, ${activeArc.color}, color-mix(in srgb, ${activeArc.color} 40%, transparent))`,
                }}
                className="h-1 w-full"
              />

              <div className="p-4 space-y-4">
                {/* Character Header & Actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      style={{
                        backgroundColor: `color-mix(in srgb, ${activeArc.color} 18%, var(--bg-secondary))`,
                        color: activeArc.color,
                        borderColor: `color-mix(in srgb, ${activeArc.color} 35%, transparent)`,
                      }}
                      className="w-11 h-11 rounded-2xl border flex items-center justify-center font-serif text-lg font-bold shrink-0 shadow-2xs"
                    >
                      {activeArc.character.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm sm:text-base text-[var(--text-primary)] leading-tight truncate">
                          {activeArc.character}'s Storyline
                        </h4>
                        {activePovCharacter === activeArc.character && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--ui-focus)] text-white font-extrabold uppercase shadow-2xs shrink-0">
                            Focus Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
                        {activeArc.chapterIndices.length} {activeArc.chapterIndices.length === 1 ? 'Chapter' : 'Chapters'} across narrative
                      </p>
                    </div>
                  </div>

                  {activePovCharacter === activeArc.character ? (
                    <button
                      type="button"
                      onClick={onExitSinglePovArc}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/12 text-rose-500 hover:bg-rose-500/22 border border-rose-500/30 transition-all cursor-pointer shrink-0 shadow-2xs active:scale-95"
                    >
                      <RotateCcw size={12} />
                      <span>Exit Focus</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartSinglePovArc(activeArc.character, activeArc.chapterIndices)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 transition-all cursor-pointer shrink-0 shadow-xs border-t border-white/20 active:scale-95"
                    >
                      <Play size={11} className="fill-current" />
                      <span>Follow Arc</span>
                    </button>
                  )}
                </div>

                {/* Progress Metric & Bar */}
                {(() => {
                  const readInArc = activeArc.chapterIndices.filter((i) => i <= currentIndex).length;
                  const progressPct = Math.round((readInArc / activeArc.chapterIndices.length) * 100);
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-[var(--text-tertiary)] font-medium">
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-[var(--text-tertiary)]" />
                          <span>Storyline Completion</span>
                        </span>
                        <span className="font-mono font-semibold text-[var(--text-secondary)]">
                          {progressPct}% ({readInArc}/{activeArc.chapterIndices.length})
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-primary))] overflow-hidden p-0.5 border border-[color-mix(in_srgb,var(--ui-border)_40%,transparent)]">
                        <div
                          style={{
                            width: `${progressPct}%`,
                            background: `linear-gradient(90deg, ${activeArc.color}, color-mix(in srgb, ${activeArc.color} 80%, white))`,
                          }}
                          className="h-full rounded-full transition-all duration-300 shadow-2xs"
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Vertical Transit Route / Branching Storyline Timeline */}
                <div className="pt-2">
                  <div className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-3 px-1">
                    Storyline Route
                  </div>

                  <div className="relative pl-7 space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {/* Continuous vertical route line connecting chapters */}
                    <div
                      style={{
                        backgroundColor: `color-mix(in srgb, ${activeArc.color} 35%, var(--ui-border))`,
                      }}
                      className="absolute left-3.5 -translate-x-1/2 top-4 bottom-4 w-0.5 rounded-full pointer-events-none"
                    />

                    {activeArc.chapters.map((chap) => {
                      const isCurrent = chap.index === currentIndex;
                      const isPast = chap.index < currentIndex;

                      return (
                        <div key={chap.index} className="relative flex items-center group">
                          {/* Transit Station Node centered right on the line */}
                          <div className="absolute -left-7 w-7 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center pointer-events-none">
                            {isCurrent ? (
                              <div
                                style={{ backgroundColor: activeArc.color }}
                                className="w-3.5 h-3.5 rounded-full ring-4 ring-[var(--ui-focus)]/35 shadow-sm animate-pulse"
                              />
                            ) : isPast ? (
                              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-2xs ring-2 ring-[var(--bg-secondary)]">
                                <Check size={9} strokeWidth={3} />
                              </div>
                            ) : (
                              <div
                                style={{
                                  borderColor: `color-mix(in srgb, ${activeArc.color} 60%, var(--ui-border))`,
                                }}
                                className="w-3 h-3 rounded-full border-2 bg-[var(--bg-secondary)] ring-2 ring-[var(--bg-secondary)]"
                              />
                            )}
                          </div>

                          {/* Chapter Button Card */}
                          <button
                            type="button"
                            onClick={() => onNavigate(chap.index)}
                            className={cn(
                              'w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer border shadow-2xs',
                              isCurrent
                                ? 'bg-[var(--bg-elevated)] border-[var(--ui-focus)] text-[var(--text-primary)] font-bold shadow-xs ring-1 ring-[var(--ui-focus)]/30'
                                : 'bg-[var(--bg-primary)] border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--ui-focus)]/40 hover:bg-[var(--bg-elevated)]'
                            )}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] text-[var(--text-tertiary)] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
                                  Ch. {chap.index + 1}
                                </span>
                                {isCurrent && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-[var(--ui-focus)]/15 text-[var(--ui-focus)]">
                                    Current
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium truncate text-[var(--text-primary)]">
                                {chap.label}
                              </p>
                            </div>

                            <ChevronRight
                              size={14}
                              className={cn(
                                'shrink-0 transition-transform group-hover:translate-x-0.5',
                                isCurrent ? 'text-[var(--ui-focus)]' : 'text-[var(--text-tertiary)] opacity-60'
                              )}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Chronological Eras & Timeline Epochs */}
          {eras.length > 0 && (
            <div className="pt-2">
              <h5 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                <Calendar size={13} className="text-[var(--ui-focus)]" />
                <span>Chronological Eras</span>
              </h5>
              <div className="grid grid-cols-2 gap-2">
                {eras.map((era) => (
                  <div
                    key={era.era}
                    className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] space-y-0.5 shadow-2xs"
                  >
                    <span className="text-xs font-bold text-[var(--ui-focus)] block truncate">
                      {era.era}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {era.chapterIndices.length} {era.chapterIndices.length === 1 ? 'chapter' : 'chapters'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
