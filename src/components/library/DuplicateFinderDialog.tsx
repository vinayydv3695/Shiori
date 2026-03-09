/**
 * DuplicateFinderDialog — Shiori v3.0
 *
 * Multi-step wizard dialog for finding and merging duplicate books:
 *   Step 1 — Criteria: Select match criteria (title/author/hash/size) + threshold
 *   Step 2 — Results: View duplicate groups with preview cards
 *   Step 3 — Review: Side-by-side comparison with "Keep" selection
 *
 * Uses the find_duplicate_books Tauri command for backend fuzzy matching.
 */

import { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Search,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Trash2,
  ChevronRight,
  ChevronLeft,
  FileText,
  Hash,
  User,
  HardDrive,
  Copy,
} from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { api } from '@/lib/tauri';
import type { Book } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { useCoverImage } from '../common/hooks/useCoverImage';

type Step = 'criteria' | 'results' | 'review';
type Criteria = 'title' | 'author' | 'hash' | 'size';

interface DuplicateFinderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooksDeleted?: () => void;
}

function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes === 0) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/* Small cover thumbnail for review cards */
function BookCoverThumb({ bookId }: { bookId?: number }) {
  const { coverUrl, loading } = useCoverImage(bookId, null);

  if (loading) return <div className="w-full h-full bg-muted animate-pulse rounded" />;
  if (!coverUrl)
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-xs rounded">
        No Cover
      </div>
    );
  return <img src={coverUrl} alt="Cover" className="w-full h-full object-cover rounded" />;
}

export function DuplicateFinderDialog({
  open,
  onOpenChange,
  onBooksDeleted,
}: DuplicateFinderDialogProps) {
  const toast = useToast();
  const refreshLibrary = useLibraryStore((state) => state.loadInitialBooks);

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('criteria');

  // Criteria step
  const [selectedCriteria, setSelectedCriteria] = useState<Criteria>('title');
  const [threshold, setThreshold] = useState(0.8);

  // Results step
  const [scanning, setScanning] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<Book[][]>([]);

  // Review step
  const [reviewGroupIndex, setReviewGroupIndex] = useState(0);
  // groupIndex -> bookId to keep
  const [keepSelections, setKeepSelections] = useState<Record<number, number>>({});
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [merging, setMerging] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setCurrentStep('criteria');
      setDuplicateGroups([]);
      setKeepSelections({});
      setReviewGroupIndex(0);
      setScanning(false);
      setMerging(false);
      setConfirmDeleteOpen(false);
    }
  }, [open]);

  // ── Find Duplicates ────────────────────────────
  const handleFindDuplicates = async () => {
    setScanning(true);
    try {
      const groups = await api.findDuplicateBooks(selectedCriteria, threshold);
      setDuplicateGroups(groups);

      if (groups.length === 0) {
        toast.info('No duplicates found', 'Your library looks clean!');
      } else {
        toast.success(
          'Scan complete',
          `Found ${groups.length} group${groups.length > 1 ? 's' : ''} of potential duplicates`
        );
        // Auto-select first book in each group as "keep" by default
        const defaults: Record<number, number> = {};
        groups.forEach((group, idx) => {
          if (group.length > 0 && group[0].id != null) {
            defaults[idx] = group[0].id!;
          }
        });
        setKeepSelections(defaults);
        setCurrentStep('results');
      }
    } catch (error) {
      logger.error('Failed to find duplicates:', error);
      toast.error('Scan failed', String(error));
    } finally {
      setScanning(false);
    }
  };

  // ── Merge (delete non-kept books) ──────────────
  const handleMerge = async () => {
    setMerging(true);
    try {
      const idsToDelete: number[] = [];

      duplicateGroups.forEach((group, groupIdx) => {
        const keepId = keepSelections[groupIdx];
        group.forEach((book) => {
          if (book.id != null && book.id !== keepId) {
            idsToDelete.push(book.id);
          }
        });
      });

      if (idsToDelete.length === 0) {
        toast.warning('Nothing to delete', 'No books selected for removal');
        setMerging(false);
        setConfirmDeleteOpen(false);
        return;
      }

      await api.deleteBooks(idsToDelete);

      toast.success(
        'Duplicates merged',
        `Removed ${idsToDelete.length} duplicate book${idsToDelete.length > 1 ? 's' : ''}`
      );

      refreshLibrary();
      onBooksDeleted?.();
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to merge duplicates:', error);
      toast.error('Merge failed', String(error));
    } finally {
      setMerging(false);
      setConfirmDeleteOpen(false);
    }
  };

  const totalToDelete = duplicateGroups.reduce((count, group, groupIdx) => {
    const keepId = keepSelections[groupIdx];
    return count + group.filter((b) => b.id != null && b.id !== keepId).length;
  }, 0);

  // ── Criteria Options ───────────────────────────
  const criteriaOptions: {
    value: Criteria;
    label: string;
    description: string;
    icon: typeof FileText;
  }[] = [
    {
      value: 'title',
      label: 'Title (Fuzzy Match)',
      description: 'Find books with similar titles using fuzzy string matching',
      icon: FileText,
    },
    {
      value: 'author',
      label: 'Author Match',
      description: 'Find books by the same or similar author names',
      icon: User,
    },
    {
      value: 'hash',
      label: 'File Hash (Exact)',
      description: 'Find identical files by content hash (exact duplicates)',
      icon: Hash,
    },
    {
      value: 'size',
      label: 'File Size',
      description: 'Find books with the exact same file size',
      icon: HardDrive,
    },
  ];

  const showThresholdSlider = selectedCriteria === 'title' || selectedCriteria === 'author';

  // ── Step Indicators ────────────────────────────
  const stepsConfig: { key: Step; label: string }[] = [
    { key: 'criteria', label: 'Criteria' },
    { key: 'results', label: 'Results' },
    { key: 'review', label: 'Review' },
  ];

  const stepIndex = stepsConfig.findIndex((s) => s.key === currentStep);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
              <div className="flex flex-col">
                <Dialog.Title className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Copy className="h-5 w-5 text-primary" />
                  Find Duplicates
                </Dialog.Title>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Scan your library for duplicate books and merge them
                </p>
              </div>
              <Dialog.Close asChild>
                <button className="text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-card">
              {stepsConfig.map((step, idx) => (
                <div key={step.key} className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (idx < stepIndex) setCurrentStep(step.key);
                    }}
                    disabled={idx > stepIndex}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      idx === stepIndex && 'bg-primary text-primary-foreground',
                      idx < stepIndex && 'text-primary cursor-pointer hover:bg-primary/10',
                      idx > stepIndex && 'text-muted-foreground cursor-not-allowed'
                    )}
                  >
                    <span
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                        idx === stepIndex && 'bg-primary-foreground text-primary',
                        idx < stepIndex && 'bg-primary/20 text-primary',
                        idx > stepIndex && 'bg-muted text-muted-foreground'
                      )}
                    >
                      {idx < stepIndex ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : (
                        idx + 1
                      )}
                    </span>
                    {step.label}
                  </button>
                  {idx < stepsConfig.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* ── CRITERIA STEP ── */}
              {currentStep === 'criteria' && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Select matching criteria
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {criteriaOptions.map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = selectedCriteria === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setSelectedCriteria(opt.value)}
                            className={cn(
                              'flex items-start gap-3 p-4 rounded-lg border text-left transition-all',
                              isSelected
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-border hover:border-primary/40 hover:bg-muted/30'
                            )}
                          >
                            <div
                              className={cn(
                                'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{opt.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {opt.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {showThresholdSlider && (
                    <div className="space-y-2 bg-card border border-border rounded-lg p-5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-foreground">
                          Similarity threshold
                        </label>
                        <span className="text-sm font-bold text-primary">
                          {Math.round(threshold * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.0"
                        step="0.05"
                        value={threshold}
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Loose (50%)</span>
                        <span>Strict (100%)</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── RESULTS STEP ── */}
              {currentStep === 'results' && (
                <div className="space-y-4">
                  {duplicateGroups.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                      <p className="text-foreground font-medium">No duplicates found</p>
                      <p className="text-sm text-muted-foreground">Your library is clean</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Found{' '}
                        <span className="font-semibold text-foreground">
                          {duplicateGroups.length}
                        </span>{' '}
                        group{duplicateGroups.length > 1 ? 's' : ''} of potential duplicates.
                        Click a group to review and select which book to keep.
                      </p>
                      <div className="space-y-3">
                        {duplicateGroups.map((group, groupIdx) => (
                          <button
                            key={groupIdx}
                            onClick={() => {
                              setReviewGroupIndex(groupIdx);
                              setCurrentStep('review');
                            }}
                            className="w-full flex items-center gap-4 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/20 transition-all text-left"
                          >
                            <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                              {group.length}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {group[0]?.title || 'Unknown Title'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {group
                                  .map(
                                    (b) =>
                                      b.authors?.map((a) => a.name).join(', ') || 'Unknown'
                                  )
                                  .filter((v, i, arr) => arr.indexOf(v) === i)
                                  .join(' / ')}{' '}
                                &middot;{' '}
                                {group
                                  .map((b) => b.file_format?.toUpperCase())
                                  .filter(Boolean)
                                  .filter((v, i, arr) => arr.indexOf(v) === i)
                                  .join(', ')}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {keepSelections[groupIdx] != null ? (
                                <span className="text-xs text-green-500 flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Reviewed
                                </span>
                              ) : (
                                <span className="text-xs text-yellow-500 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Needs review
                                </span>
                              )}
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── REVIEW STEP ── */}
              {currentStep === 'review' && duplicateGroups[reviewGroupIndex] && (
                <div className="space-y-4">
                  {/* Group navigation */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Group {reviewGroupIndex + 1} of {duplicateGroups.length}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReviewGroupIndex((i) => Math.max(0, i - 1))}
                        disabled={reviewGroupIndex === 0}
                        className="gap-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setReviewGroupIndex((i) =>
                            Math.min(duplicateGroups.length - 1, i + 1)
                          )
                        }
                        disabled={reviewGroupIndex === duplicateGroups.length - 1}
                        className="gap-1"
                      >
                        Next <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Select which book to <strong>keep</strong>. All others will be deleted
                    when you merge.
                  </p>

                  {/* Book comparison cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {duplicateGroups[reviewGroupIndex].map((book) => {
                      const isKept = keepSelections[reviewGroupIndex] === book.id;
                      return (
                        <button
                          key={book.id}
                          onClick={() => {
                            if (book.id != null) {
                              setKeepSelections((prev) => ({
                                ...prev,
                                [reviewGroupIndex]: book.id!,
                              }));
                            }
                          }}
                          className={cn(
                            'relative flex gap-4 p-4 rounded-lg border text-left transition-all',
                            isKept
                              ? 'border-green-500 bg-green-500/5 ring-1 ring-green-500'
                              : 'border-border hover:border-primary/40'
                          )}
                        >
                          {/* Keep / Remove badge */}
                          {isKept ? (
                            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-bold uppercase">
                              <CheckCircle className="w-3 h-3" /> Keep
                            </div>
                          ) : (
                            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold uppercase">
                              <Trash2 className="w-3 h-3" /> Remove
                            </div>
                          )}

                          {/* Cover thumbnail */}
                          <div className="w-16 shrink-0">
                            <div className="aspect-[2/3] bg-muted rounded overflow-hidden shadow-sm">
                              <BookCoverThumb bookId={book.id} />
                            </div>
                          </div>

                          {/* Book info */}
                          <div className="flex-1 min-w-0 pr-16">
                            <h4 className="text-sm font-semibold text-foreground line-clamp-2 mb-2">
                              {book.title}
                            </h4>

                            <div className="space-y-1.5 text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <User className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">
                                  {book.authors?.map((a) => a.name).join(', ') ||
                                    'Unknown Author'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">
                                  {book.file_format?.toUpperCase() || 'Unknown'} &middot;{' '}
                                  {formatBytes(book.file_size)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                                <span
                                  className="truncate text-[11px]"
                                  title={book.file_path}
                                >
                                  {book.file_path}
                                </span>
                              </div>
                              {book.file_hash && (
                                <div className="flex items-center gap-2">
                                  <Hash className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate font-mono text-[11px]">
                                    {book.file_hash.substring(0, 16)}...
                                  </span>
                                </div>
                              )}
                              {book.publisher && (
                                <div className="text-[11px]">
                                  Publisher: {book.publisher}
                                </div>
                              )}
                              {book.added_date && (
                                <div className="text-[11px]">
                                  Added:{' '}
                                  {new Date(book.added_date).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border bg-muted/30 flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {currentStep === 'criteria' && (
                  <span>Select criteria and scan your library</span>
                )}
                {currentStep === 'results' && (
                  <span>
                    {duplicateGroups.length} group
                    {duplicateGroups.length !== 1 ? 's' : ''} &middot; {totalToDelete}{' '}
                    book{totalToDelete !== 1 ? 's' : ''} to remove
                  </span>
                )}
                {currentStep === 'review' && (
                  <span>
                    Reviewing group {reviewGroupIndex + 1} of {duplicateGroups.length}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {currentStep !== 'criteria' && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (currentStep === 'review') setCurrentStep('results');
                      else if (currentStep === 'results') setCurrentStep('criteria');
                    }}
                    className="gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </Button>
                )}

                {currentStep === 'criteria' && (
                  <Button
                    onClick={handleFindDuplicates}
                    disabled={scanning}
                    className="gap-2"
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Scanning...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" /> Find Duplicates
                      </>
                    )}
                  </Button>
                )}

                {currentStep === 'results' && duplicateGroups.length > 0 && (
                  <Button
                    variant="destructive"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={totalToDelete === 0}
                    className="gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Merge Selected ({totalToDelete})
                  </Button>
                )}

                {currentStep === 'review' && (
                  <Button onClick={() => setCurrentStep('results')} className="gap-1">
                    Done Reviewing <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Confirmation Dialog */}
      <Dialog.Root open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-md z-[60] p-6 space-y-4">
            <Dialog.Title className="text-lg font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Merge
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              This will permanently delete{' '}
              <span className="font-semibold text-foreground">{totalToDelete}</span>{' '}
              duplicate book{totalToDelete !== 1 ? 's' : ''} from your library. The
              selected "Keep" books will remain. This action cannot be undone.
            </Dialog.Description>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleMerge}
                disabled={merging}
                className="gap-2"
              >
                {merging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Merging...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> Delete {totalToDelete} Duplicates
                  </>
                )}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
