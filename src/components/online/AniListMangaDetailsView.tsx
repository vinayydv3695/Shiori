import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Bookmark, ArrowLeft, BookOpen, ChevronDown, X, Star, Calendar, RefreshCw, AlignLeft, Plus, Minus, Loader2, Check } from 'lucide-react';
import { AnilistMediaList, AnilistMediaDetails, getMediaDetails, updateMediaListEntry } from '@/lib/anilist';
import DOMPurify from 'dompurify';
import { toast } from '@/store/toastStore';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { openExternal } from '@/lib/externalLinks';
import { useIsMobile } from '@/hooks/useIsMobile';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { usePreferencesStore } from '@/store/preferencesStore';
import { DatePicker } from '@/components/ui/DatePicker';

// TrackerForm Component
function TrackerForm({
  status, setStatus,
  progress, setProgress,
  score, setScore,
  startedAt, setStartedAt,
  completedAt, setCompletedAt,
  repeat, setRepeat,
  notes, setNotes,
  handleSave, saving,
  totalChapters
}: any) {
  // Safe limiters
  const handleProgressChange = (val: number) => {
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (totalChapters && val > totalChapters) val = totalChapters;
    setProgress(val);
  };

  const handleScoreChange = (val: number) => {
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;
    setScore(val);
  };

  const handleRepeatChange = (val: number) => {
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    setRepeat(val);
  };

  const formVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05, ease: 'easeOut' as const }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } }
  };

  // Gradient for score slider (e.g. red for low, green for high, but we'll use primary color for the filled part)
  const scorePercent = score;

  return (
    <motion.form 
      onSubmit={handleSave} 
      className="space-y-6"
      variants={formVariants}
      initial="hidden"
      animate="show"
    >
      {/* Status */}
      <motion.div variants={itemVariants} className="space-y-2">
        <label className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5 text-primary" /> Status
        </label>
        <Select.Root value={status} onValueChange={setStatus}>
          <Select.Trigger className="w-full bg-secondary/40 border border-border/60 text-foreground rounded-2xl focus:border-primary focus:ring-2 focus:ring-primary/30 py-3 px-4 text-sm font-bold outline-none transition-all shadow-sm flex items-center justify-between hover:bg-secondary/70">
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content 
              className="shiori-select-content w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl shadow-2xl z-[9999] p-1.5"
              position="popper"
              sideOffset={6}
            >
              <Select.Viewport className="p-1 space-y-0.5">
                {[
                  { value: 'CURRENT', label: 'Reading' },
                  { value: 'PLANNING', label: 'Plan to Read' },
                  { value: 'COMPLETED', label: 'Completed' },
                  { value: 'DROPPED', label: 'Dropped' },
                  { value: 'PAUSED', label: 'Paused' },
                ].map((item) => (
                  <Select.Item 
                    key={item.value} 
                    value={item.value}
                    className="relative flex items-center px-9 py-2.5 text-sm font-bold text-popover-foreground rounded-xl select-none outline-none data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground cursor-pointer transition-colors"
                  >
                    <Select.ItemText>{item.label}</Select.ItemText>
                    <Select.ItemIndicator className="absolute left-3 flex items-center justify-center">
                      <Check className="w-4 h-4" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </motion.div>
      
      <div className="grid grid-cols-1 gap-6">
        {/* Progress with stepper */}
        <motion.div variants={itemVariants} className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-primary" /> Progress
            </label>
            {totalChapters && (
              <span className="text-xs font-bold text-muted-foreground">Max: {totalChapters}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => handleProgressChange(progress - 1)} className="p-3 bg-card/80 border border-border/60 rounded-xl hover:bg-card active:scale-95 transition-all text-muted-foreground hover:text-foreground cursor-pointer">
              <Minus className="w-4 h-4" />
            </button>
            <input 
              type="number" 
              value={progress}
              onChange={e => handleProgressChange(parseInt(e.target.value))}
              className="flex-1 min-w-0 bg-card/80 border border-border/60 text-foreground text-center font-bold rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 py-3 px-4 text-sm outline-none transition-all shadow-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
            />
            <button type="button" onClick={() => handleProgressChange(progress + 1)} className="p-3 bg-card/80 border border-border/60 rounded-xl hover:bg-card active:scale-95 transition-all text-muted-foreground hover:text-foreground cursor-pointer">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        {/* Score with slider */}
        <motion.div variants={itemVariants} className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-primary" /> Score
            </label>
            <span className="text-xs font-extrabold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">{score} / 100</span>
          </div>
          <div className="flex items-center gap-4 bg-card/80 border border-border/60 rounded-2xl p-4 shadow-xs">
            <input 
              type="range"
              value={score}
              onChange={e => handleScoreChange(parseInt(e.target.value))}
              min="0" max="100" step="1"
              style={{
                background: `linear-gradient(to right, hsl(var(--primary)) ${scorePercent}%, rgba(255,255,255,0.1) ${scorePercent}%)`
              }}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer outline-none shadow-inner [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-gray-200 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 active:[&::-webkit-slider-thumb]:scale-95"
            />
          </div>
        </motion.div>
      </div>

      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-primary" /> Start Date
          </label>
          <DatePicker
            value={startedAt}
            onChange={setStartedAt}
            placeholder="Select start date"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-primary" /> Finish Date
          </label>
          <DatePicker
            value={completedAt}
            onChange={setCompletedAt}
            placeholder="Select finish date"
          />
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-2">
        <label className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 text-primary" /> Re-reads
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => handleRepeatChange(repeat - 1)} className="p-3 bg-card/80 border border-border/60 rounded-xl hover:bg-card active:scale-95 transition-all text-muted-foreground hover:text-foreground cursor-pointer">
            <Minus className="w-4 h-4" />
          </button>
          <input 
            type="number" 
            value={repeat}
            onChange={e => handleRepeatChange(parseInt(e.target.value))}
            className="flex-1 min-w-0 bg-card/80 border border-border/60 text-foreground text-center font-bold rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 py-3 px-4 text-sm outline-none transition-all shadow-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
          />
          <button type="button" onClick={() => handleRepeatChange(repeat + 1)} className="p-3 bg-card/80 border border-border/60 rounded-xl hover:bg-card active:scale-95 transition-all text-muted-foreground hover:text-foreground cursor-pointer">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-2">
        <label className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-1.5">
          <AlignLeft className="w-3.5 h-3.5 text-primary" /> Private Notes
        </label>
        <textarea 
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Jot down some thoughts..."
          className="w-full bg-card/80 border border-border/60 text-foreground rounded-2xl focus:border-primary focus:ring-2 focus:ring-primary/30 hover:bg-card py-3 px-4 text-sm font-medium outline-none transition-all resize-none shadow-xs" 
        />
      </motion.div>

      <motion.button 
        variants={itemVariants}
        type="submit" 
        disabled={saving}
        className="w-full bg-primary text-primary-foreground font-extrabold rounded-2xl py-3.5 flex items-center justify-center gap-2 mt-6 hover:bg-primary/90 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-50 relative overflow-hidden"
      >
        {saving ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>SAVING...</span>
          </>
        ) : (
          'SAVE TO ANILIST'
        )}
      </motion.button>
    </motion.form>
  );
}

interface AniListMangaDetailsViewProps {
  mediaId: number;
  initialEntry?: AnilistMediaList;
  onClose: () => void;
  onUpdate: () => void;
  onOpenMedia?: (mediaId: number) => void;
  onSearchOnlineManga?: (title: string) => void;
  onSearchTorbox?: (title: string) => void;
}

export function AniListMangaDetailsView({
  mediaId,
  initialEntry,
  onClose,
  onUpdate,
  onOpenMedia,
  onSearchOnlineManga,
  onSearchTorbox
}: AniListMangaDetailsViewProps) {
  const { token: anilistToken } = useAniListAccessToken();
  const isMobile = useIsMobile();
  const preferences = usePreferencesStore(state => state.preferences);
  const theme = preferences?.theme || 'light';
  
  const [details, setDetails] = useState<AnilistMediaDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'characters' | 'relations' | 'recommendations'>('overview');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Form State
  const [status, setStatus] = useState(initialEntry?.status || 'PLANNING');
  const [progress, setProgress] = useState(initialEntry?.progress || 0);
  const [score, setScore] = useState(initialEntry?.score100 ?? initialEntry?.score ?? 0);
  const [notes, setNotes] = useState(initialEntry?.notes || '');
  const [repeat, setRepeat] = useState(initialEntry?.repeat || 0);
  
  // Date helpers
  const parseDate = (d?: { year: number | null, month: number | null, day: number | null }) => {
    if (!d || !d.year || !d.month || !d.day) return '';
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  };
  const [startedAt, setStartedAt] = useState(parseDate(initialEntry?.startedAt));
  const [completedAt, setCompletedAt] = useState(parseDate(initialEntry?.completedAt));

  useEffect(() => {
    setStatus(initialEntry?.status || 'PLANNING');
    setProgress(initialEntry?.progress || 0);
    setScore(initialEntry?.score100 ?? initialEntry?.score ?? 0);
    setNotes(initialEntry?.notes || '');
    setRepeat(initialEntry?.repeat || 0);
    setStartedAt(parseDate(initialEntry?.startedAt));
    setCompletedAt(parseDate(initialEntry?.completedAt));
  }, [initialEntry, mediaId]);
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!anilistToken) return;
      try {
        setLoading(true);
        const data = await getMediaDetails(mediaId, anilistToken);
        if (mounted) {
          setDetails(data);
        }
      } catch (err) {
        console.error('Failed to fetch details:', err);
        toast.error('Failed to load manga details');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [mediaId, anilistToken]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anilistToken) return;
    try {
      setSaving(true);
      
      const toFuzzy = (dateStr: string) => {
        if (!dateStr) return undefined;
        const [y, m, d] = dateStr.split('-');
        return { year: parseInt(y), month: parseInt(m), day: parseInt(d) };
      };

      await updateMediaListEntry(
        mediaId,
        progress,
        status,
        anilistToken,
        score > 0 ? score : undefined,
        notes || undefined,
        toFuzzy(startedAt),
        toFuzzy(completedAt),
        repeat > 0 ? repeat : undefined
      );
      
      toast.success('Saved to AniList');
      setSheetOpen(false);
      onUpdate();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const formProps = {
    status, setStatus, progress, setProgress, score, setScore,
    startedAt, setStartedAt, completedAt, setCompletedAt,
    repeat, setRepeat, notes, setNotes, handleSave, saving,
    totalChapters: details?.chapters
  };

  const content = (
    <div className={cn(
      "fixed inset-0 bg-background text-on-surface overflow-y-auto overflow-x-hidden font-sans overscroll-none pb-[env(safe-area-inset-bottom,0px)] custom-scrollbar",
      isMobile ? "z-40" : "z-[300]"
    )}>
      {loading ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
          {/* Top Nav Skeleton */}
          <div className="h-16 border-b border-border/50 flex items-center px-6">
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Banner Skeleton */}
            <div className="h-48 md:h-64 relative">
              <Skeleton className="w-full h-full rounded-none" />
              <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
            </div>
            {/* Content Skeleton */}
            <div className="flex-1 px-4 md:px-8 max-w-[1400px] mx-auto w-full relative z-10 -mt-16 md:-mt-24 pb-8">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left Col (Cover) */}
                <div className="w-32 md:w-56 shrink-0 space-y-4">
                  <Skeleton className="w-full aspect-[2/3] rounded-xl shadow-lg" />
                  <div className="hidden md:flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                </div>
                {/* Right Col (Details) */}
                <div className="flex-1 mt-16 md:mt-24 space-y-4">
                  <Skeleton className="h-8 md:h-10 w-3/4 max-w-[400px]" />
                  <Skeleton className="h-4 w-1/4 mb-6" />
                  
                  <div className="flex gap-4 my-6">
                    <Skeleton className="h-10 w-24 rounded-full" />
                    <Skeleton className="h-10 w-24 rounded-full" />
                    <Skeleton className="h-10 w-24 rounded-full" />
                  </div>
                  
                  <div className="space-y-2 mt-8">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : !details ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-md">
          <p className="text-on-surface mb-4">Could not load details.</p>
          <button onClick={onClose} className="px-4 py-2 bg-primary text-background rounded">Go Back</button>
        </div>
      ) : (
        <>
          <main className={cn("min-h-screen relative bg-background text-foreground", isMobile ? "pb-32" : "")}>
            {/* Seamless Top Ambient Banner Glow (Adapts to all 5 themes cleanly) */}
            <div className="absolute top-0 left-0 right-0 h-[480px] overflow-hidden pointer-events-none -z-10 select-none">
              <div 
                className="w-full h-full bg-cover bg-center opacity-35 dark:opacity-20 scale-110"
                style={{ 
                  backgroundImage: `url('${details.bannerImage || details.coverImage.extraLarge || details.coverImage.large}')`,
                  filter: 'blur(75px) saturate(1.3)',
                  WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)',
                  maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)'
                }}
              />
            </div>

            {/* Floating Glass Back Button */}
            <button 
              onClick={onClose} 
              style={{ top: 'max(env(safe-area-inset-top, 0px) + 12px, 20px)' }}
              className={cn(
                "absolute z-30 flex items-center gap-2 bg-secondary/80 hover:bg-secondary backdrop-blur-xl border border-border/60 text-foreground font-extrabold rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all text-xs sm:text-sm group cursor-pointer",
                isMobile ? "left-4 px-3.5 py-2" : "left-6 md:left-16 px-4 py-2.5"
              )}
            >
              <ArrowLeft className="w-4 h-4 text-primary group-hover:-translate-x-1 transition-transform" />
              <span>Back to Dashboard</span>
            </button>

            {/* Hero Header Area */}
            <section className={cn(
              "relative flex items-end",
              isMobile ? "min-h-[360px] px-5 pb-6 pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]" : "min-h-[380px] md:min-h-[420px] px-6 md:px-16 pb-8 pt-16"
            )}>
              <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-end">
                {/* Cover Image */}
                <div className={cn("flex-shrink-0 w-40 md:w-56 lg:w-64 relative group", isMobile ? "mx-auto mt-6" : "mx-0")}>
                  <div className="aspect-[3/4] overflow-hidden rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-border/50 relative">
                    <img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" src={details.coverImage.extraLarge || details.coverImage.large} alt={details.title.english || details.title.romaji} />
                    {/* 3D Book Spine Shadow */}
                    <div className="absolute top-0 bottom-0 left-0 w-3 bg-gradient-to-r from-black/45 via-black/15 to-transparent z-20 pointer-events-none rounded-l-[inherit]" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
                  </div>
                </div>
                
                {/* Info Details */}
                <div className={cn("flex-grow flex flex-col justify-end w-full", isMobile ? "items-center text-center mt-2" : "")}>
                  <h1 className={cn("font-extrabold mb-4 text-foreground tracking-tight leading-tight drop-shadow-sm", isMobile ? "text-2xl sm:text-3xl" : "text-4xl md:text-5xl lg:text-6xl")}>
                    {details.title.english || details.title.romaji}
                  </h1>
                  
                  <div className={cn("flex flex-wrap gap-2 mb-4", isMobile ? "justify-center" : "")}>
                    <div className="bg-card/80 backdrop-blur-md border border-border/60 px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-xs">
                      <span className="text-[10px] font-extrabold tracking-wider text-muted-foreground">FORMAT</span>
                      <span className="text-xs font-extrabold text-foreground uppercase">{details.format}</span>
                    </div>
                    {details.averageScore && (
                      <div className="bg-card/80 backdrop-blur-md border border-border/60 px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-xs">
                        <span className="text-[10px] font-extrabold tracking-wider text-muted-foreground">SCORE</span>
                        <span className="text-xs font-extrabold text-amber-500 dark:text-amber-400">{details.averageScore}%</span>
                      </div>
                    )}
                    {details.popularity && (
                      <div className="bg-card/80 backdrop-blur-md border border-border/60 px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-xs">
                        <span className="text-[10px] font-extrabold tracking-wider text-muted-foreground">POPULARITY</span>
                        <span className="text-xs font-extrabold text-primary">#{details.popularity}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className={cn("flex flex-wrap gap-2", isMobile ? "justify-center" : "")}>
                    {details.genres?.slice(0, isMobile ? 4 : 10).map(g => (
                      <span key={g} className="bg-primary/15 text-primary border border-primary/25 text-xs px-3.5 py-1 rounded-full font-bold shadow-sm">
                        {g}
                      </span>
                    ))}
                  </div>

                  {!isMobile && (
                    <div className="flex flex-wrap gap-3.5 mt-6">
                      {onSearchOnlineManga && (
                        <button 
                          onClick={() => onSearchOnlineManga(details.title.english || details.title.romaji)}
                          className="flex items-center gap-2.5 bg-primary text-primary-foreground font-extrabold px-6 py-3 rounded-2xl shadow-lg shadow-primary/25 hover:bg-primary/90 hover:scale-[1.02] active:scale-95 transition-all"
                        >
                          <BookOpen className="w-4 h-4" /> Read Online
                        </button>
                      )}
                      {onSearchTorbox && (
                        <button 
                          onClick={() => onSearchTorbox(details.title.english || details.title.romaji)}
                          className="flex items-center gap-2.5 bg-secondary/80 border border-border/60 hover:bg-secondary text-foreground font-bold px-6 py-3 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-sm"
                        >
                          <Download className="w-4 h-4 text-primary" /> Download via Torbox
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Content & Sidebar */}
            <section className={cn("max-w-7xl mx-auto flex flex-col lg:flex-row gap-12", isMobile ? "px-4 py-6" : "px-6 md:px-16 py-12")}>
              
              {/* Tabbed Navigation & Content */}
              <div className="flex-grow min-w-0">
                {/* Segmented Glass Pill Switcher */}
                <div className={cn(
                  "flex gap-2 overflow-x-auto p-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden mb-8 select-none shrink-0",
                  isMobile ? "mb-6" : ""
                )}>
                  {(['overview', 'characters', 'relations', 'recommendations'] as const).map(tab => {
                    const isActive = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "relative px-5 py-2.5 text-xs sm:text-sm font-extrabold transition-colors whitespace-nowrap flex items-center gap-2 rounded-full select-none cursor-pointer shrink-0 capitalize",
                          isActive ? "text-primary-foreground font-bold" : "bg-card/80 hover:bg-card border border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground shadow-xs"
                        )}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeTabPillDetails"
                            className="absolute inset-0 bg-primary rounded-full shadow-md shadow-primary/25 z-0"
                            transition={{ type: "spring", stiffness: 450, damping: 35 }}
                          />
                        )}
                        <span className="relative z-10">{tab}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="min-h-[400px]">
                  {/* Tab: Overview */}
                  {activeTab === 'overview' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      
                      {/* Mobile Read/Download Buttons */}
                      {isMobile && (
                        <div className="flex flex-col gap-3 pb-2">
                          {onSearchOnlineManga && (
                            <button 
                              onClick={() => onSearchOnlineManga(details.title.english || details.title.romaji)}
                              className="w-full flex items-center justify-center gap-2 bg-card active:bg-secondary border border-border/50 text-foreground px-5 py-3.5 rounded-xl font-medium transition-colors"
                            >
                              <BookOpen className="w-4 h-4 text-blue-400" /> Read Online
                            </button>
                          )}
                          {onSearchTorbox && (
                            <button 
                              onClick={() => onSearchTorbox(details.title.english || details.title.romaji)}
                              className="w-full flex items-center justify-center gap-2 bg-card active:bg-secondary border border-border/50 text-foreground px-5 py-3.5 rounded-xl font-medium transition-colors"
                            >
                              <Download className="w-4 h-4 text-purple-400" /> Download
                            </button>
                          )}
                        </div>
                      )}

                      <div>
                        <h3 className={cn("font-bold text-primary mb-3", isMobile ? "text-lg" : "text-xl")}>Synopsis</h3>
                        <p 
                          className="text-muted-foreground leading-relaxed text-base md:text-lg opacity-90"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(details.description || 'No synopsis available.') }}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        <div className="bg-card p-4 rounded-xl border border-border/50">
                          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground mb-1 uppercase">Romaji</p>
                          <p className="text-sm text-primary font-medium line-clamp-1">{details.title.romaji}</p>
                        </div>
                        <div className="bg-card p-4 rounded-xl border border-border/50">
                          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground mb-1 uppercase">Native</p>
                          <p className="text-sm text-primary font-medium line-clamp-1">{details.title.native}</p>
                        </div>
                        <div className="bg-card p-4 rounded-xl border border-border/50">
                          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground mb-1 uppercase">Chapters</p>
                          <p className="text-sm text-primary font-medium">{details.chapters || '?'}</p>
                        </div>
                        <div className="bg-card p-4 rounded-xl border border-border/50">
                          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground mb-1 uppercase">Volumes</p>
                          <p className="text-sm text-primary font-medium">{details.volumes || '?'}</p>
                        </div>
                      </div>

                      {details.externalLinks?.length > 0 && (
                        <div>
                          <h3 className={cn("font-bold text-primary mb-3", isMobile ? "text-lg" : "text-xl")}>External Links</h3>
                          <div className="flex flex-wrap gap-2">
                            {details.externalLinks.map(link => (
                              <a 
                                key={link.id} 
                                href={link.url} 
                                target="_blank" 
                                rel="noreferrer"
                                onClick={(e) => { e.preventDefault(); void openExternal(link.url); }}
                                className="bg-card hover:bg-secondary border border-border/50 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors flex items-center gap-2"
                              >
                                {link.site} <ExternalLink className="w-3 h-3 text-muted-foreground" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {details.tags?.length > 0 && (
                        <div>
                          <h3 className={cn("font-bold text-primary mb-3", isMobile ? "text-lg" : "text-xl")}>Tags</h3>
                          <div className="flex flex-wrap gap-2">
                            {details.tags.map(tag => (
                              <span 
                                key={tag.id} 
                                className={`bg-surface-variant/30 border border-border/50 text-xs px-3 py-1.5 rounded-full ${tag.isMediaSpoiler ? 'text-error opacity-70 hover:opacity-100 cursor-help' : 'text-muted-foreground'}`}
                                title={tag.description}
                              >
                                {tag.name} <span className="opacity-50 ml-1">{tag.rank}%</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: Characters */}
                  {activeTab === 'characters' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <h3 className="text-lg md:text-xl font-bold text-primary mb-4">Characters</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
                        {details.characters?.edges?.map(edge => (
                          <div key={edge.node.id} className="flex gap-3 md:gap-4 bg-card p-2 md:p-3 rounded-xl border border-border/50">
                            <img className="w-14 h-20 md:w-16 md:h-24 object-cover rounded-lg bg-surface-variant" src={edge.node.image.large} alt={edge.node.name.full} />
                            <div className="flex flex-col justify-center">
                              <p className="text-sm text-primary font-bold line-clamp-2">{edge.node.name.full}</p>
                              <p className="text-[10px] md:text-xs text-muted-foreground uppercase mt-1">{edge.role}</p>
                            </div>
                          </div>
                        ))}
                        {!details.characters?.edges?.length && <p className="text-muted-foreground">No characters found.</p>}
                      </div>
                      
                      <h3 className="text-lg md:text-xl font-bold text-primary mb-4 mt-10">Staff</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
                        {details.staff?.edges?.map(edge => (
                          <div key={edge.node.id} className="flex gap-3 md:gap-4 bg-card p-2 md:p-3 rounded-xl border border-border/50">
                            <img className="w-14 h-20 md:w-16 md:h-24 object-cover rounded-lg bg-surface-variant" src={edge.node.image.large} alt={edge.node.name.full} />
                            <div className="flex flex-col justify-center">
                              <p className="text-sm text-primary font-bold line-clamp-2">{edge.node.name.full}</p>
                              <p className="text-[10px] md:text-xs text-muted-foreground uppercase mt-1">{edge.role}</p>
                            </div>
                          </div>
                        ))}
                        {!details.staff?.edges?.length && <p className="text-muted-foreground">No staff found.</p>}
                      </div>
                    </div>
                  )}

                  {/* Tab: Relations */}
                  {activeTab === 'relations' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                        {details.relations?.edges?.map(edge => (
                          <div 
                            key={edge.node.id} 
                            className="space-y-2 md:space-y-3 group cursor-pointer" 
                            onClick={() => {
                              if (edge.node.type === 'MANGA' && onOpenMedia) {
                                onOpenMedia(edge.node.id);
                              } else {
                                void openExternal(`https://anilist.co/${edge.node.type.toLowerCase()}/${edge.node.id}`);
                              }
                            }}
                          >
                            <div className="aspect-[3/4] overflow-hidden rounded-lg border border-border/50">
                              <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={edge.node.coverImage.large} alt={edge.node.title.romaji} />
                            </div>
                            <div>
                              <p className="text-[13px] md:text-sm text-primary font-medium line-clamp-2 leading-snug">{edge.node.title.romaji}</p>
                              <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase mt-1 tracking-wider">
                                {edge.relationType.replace('_', ' ')}
                              </p>
                            </div>
                          </div>
                        ))}
                        {!details.relations?.edges?.length && <p className="text-muted-foreground col-span-full">No relations found.</p>}
                      </div>
                    </div>
                  )}

                  {/* Tab: Recommendations */}
                  {activeTab === 'recommendations' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                        {details.recommendations?.nodes?.map(node => node.mediaRecommendation && (
                          <div 
                            key={node.mediaRecommendation.id} 
                            className="space-y-2 md:space-y-3 group cursor-pointer" 
                            onClick={() => {
                              if (onOpenMedia) {
                                onOpenMedia(node.mediaRecommendation.id);
                              } else {
                                void openExternal(`https://anilist.co/manga/${node.mediaRecommendation.id}`);
                              }
                            }}
                          >
                            <div className="aspect-[3/4] overflow-hidden rounded-lg border border-border/50">
                              <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={node.mediaRecommendation.coverImage.large} alt={node.mediaRecommendation.title.romaji} />
                            </div>
                            <p className="text-[13px] md:text-sm text-primary font-medium line-clamp-2 leading-snug">{node.mediaRecommendation.title.romaji}</p>
                          </div>
                        ))}
                        {!details.recommendations?.nodes?.length && <p className="text-muted-foreground col-span-full">No recommendations found.</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar: Desktop Only */}
              {!isMobile && (
                <aside className="w-full lg:w-80 flex-shrink-0 animate-in fade-in slide-in-from-right-8 duration-700">
                  <div className="bg-card/80 backdrop-blur-2xl p-6 rounded-3xl border border-border/60 sticky top-24 shadow-xl">
                    <h2 className="text-lg font-bold text-primary mb-6 flex items-center gap-2">
                      <Bookmark className="w-5 h-5" /> My List
                    </h2>
                    <TrackerForm {...formProps} />
                  </div>
                </aside>
              )}
            </section>
          </main>

          {/* Mobile Floating Action Button (FAB) */}
          {isMobile && (
            <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] right-5 pointer-events-none z-50">
              <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
                <Dialog.Trigger asChild>
                  <button className="pointer-events-auto bg-white text-black px-6 py-3.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex items-center gap-2.5 font-extrabold active:scale-90 transition-transform hover:scale-105">
                    <Bookmark className="w-5 h-5 fill-black/20" />
                    <span className="capitalize tracking-tight">
                      {status === 'CURRENT' ? 'Reading' : status === 'PLANNING' ? 'Add to List' : status.replace('_', ' ').toLowerCase()}
                    </span>
                  </button>
                </Dialog.Trigger>
                
                {/* Radix Dialog as Bottom Sheet */}
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[400] animate-in fade-in" />
                    <Dialog.Content 
                      className="fixed bottom-0 left-0 right-0 z-[401] bg-background rounded-t-3xl border-t border-border shadow-2xl focus:outline-none flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-[100%]"
                    >
                      <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto my-4" />
                      
                      <div className="px-6 pb-4 flex items-center justify-between border-b border-border/50">
                        <Dialog.Title className="text-lg font-bold text-primary flex items-center gap-2">
                          <Bookmark className="w-5 h-5" /> Edit Tracker
                        </Dialog.Title>
                        <Dialog.Close asChild>
                          <button className="p-2 bg-white/5 rounded-full hover:bg-secondary/80 transition-colors">
                            <X className="w-5 h-5 text-muted-foreground" />
                          </button>
                        </Dialog.Close>
                      </div>
                      
                      <div className="p-6 overflow-y-auto overscroll-contain">
                        <TrackerForm {...formProps} />
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
            </div>
          )}
        </>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
