import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Bookmark, ArrowLeft, BookOpen, ChevronUp, X, Star, Calendar, RefreshCw, AlignLeft, Plus, Minus } from 'lucide-react';
import { AnilistMediaList, AnilistMediaDetails, getMediaDetails, updateMediaListEntry } from '@/lib/anilist';
import { toast } from 'sonner';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { useIsMobile } from '@/hooks/useIsMobile';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

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

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Status */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5" /> Status
        </label>
        <div className="relative">
          <select 
            value={status} 
            onChange={e => setStatus(e.target.value)}
            className="w-full bg-[#121212] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3.5 px-4 text-sm font-semibold appearance-none outline-none transition-all shadow-inner"
          >
            <option value="CURRENT">Reading</option>
            <option value="PLANNING">Plan to Read</option>
            <option value="COMPLETED">Completed</option>
            <option value="DROPPED">Dropped</option>
            <option value="PAUSED">Paused</option>
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronUp className="w-4 h-4 text-on-surface-variant rotate-180" />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        {/* Progress with stepper */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Progress
            </label>
            {totalChapters && (
              <span className="text-xs text-on-surface-variant">Max: {totalChapters}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => handleProgressChange(progress - 1)} className="p-3 bg-[#121212] border border-white/10 rounded-xl hover:bg-white/5 active:scale-95 transition-all text-on-surface-variant hover:text-white">
              <Minus className="w-4 h-4" />
            </button>
            <input 
              type="number" 
              value={progress}
              onChange={e => handleProgressChange(parseInt(e.target.value))}
              className="flex-1 bg-[#121212] border border-white/10 text-primary text-center font-bold rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-4 text-sm outline-none transition-all shadow-inner" 
            />
            <button type="button" onClick={() => handleProgressChange(progress + 1)} className="p-3 bg-[#121212] border border-white/10 rounded-xl hover:bg-white/5 active:scale-95 transition-all text-on-surface-variant hover:text-white">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Score with slider */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" /> Score
            </label>
            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">{score} / 100</span>
          </div>
          <div className="flex items-center gap-4 bg-[#121212] border border-white/10 rounded-xl p-3 shadow-inner">
            <input 
              type="range"
              value={score}
              onChange={e => handleScoreChange(parseInt(e.target.value))}
              min="0" max="100" step="1"
              className="w-full accent-primary h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Start Date
          </label>
          <input 
            type="date"
            value={startedAt}
            onChange={e => setStartedAt(e.target.value)}
            className="w-full bg-[#121212] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-3 text-[13px] outline-none transition-all shadow-inner" 
            style={{ colorScheme: 'dark' }}
          />
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Finish Date
          </label>
          <input 
            type="date" 
            value={completedAt}
            onChange={e => setCompletedAt(e.target.value)}
            className="w-full bg-[#121212] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-3 text-[13px] outline-none transition-all shadow-inner" 
            style={{ colorScheme: 'dark' }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Re-reads
        </label>
        <input 
          type="number" 
          value={repeat}
          onChange={e => handleRepeatChange(parseInt(e.target.value))}
          className="w-full bg-[#121212] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-4 text-sm outline-none transition-all shadow-inner" 
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase flex items-center gap-1.5">
          <AlignLeft className="w-3.5 h-3.5" /> Private Notes
        </label>
        <textarea 
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Jot down some thoughts..."
          className="w-full bg-[#121212] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-4 text-sm outline-none transition-all resize-none shadow-inner" 
        />
      </div>

      <button 
        type="submit" 
        disabled={saving}
        className="w-full bg-white text-black font-bold rounded-xl py-4 flex items-center justify-center gap-2 mt-4 hover:bg-gray-200 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
      >
        {saving ? 'SAVING...' : 'SAVE TO ANILIST'}
      </button>
    </form>
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
  
  const [details, setDetails] = useState<AnilistMediaDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'characters' | 'relations' | 'recommendations'>('overview');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Form State
  const [status, setStatus] = useState(initialEntry?.status || 'PLANNING');
  const [progress, setProgress] = useState(initialEntry?.progress || 0);
  const [score, setScore] = useState(initialEntry?.score || 0);
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
    setScore(initialEntry?.score || 0);
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
      "fixed inset-0 bg-background text-on-surface overflow-y-auto overflow-x-hidden font-sans overscroll-none pb-[env(safe-area-inset-bottom,0px)]",
      isMobile ? "z-40" : "z-[300]"
    )}>
      {loading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : !details ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-md">
          <p className="text-on-surface mb-4">Could not load details.</p>
          <button onClick={onClose} className="px-4 py-2 bg-primary text-background rounded">Go Back</button>
        </div>
      ) : (
        <>
          {/* Top Nav (Desktop) / Floating Back Button (Mobile) */}
          <header data-tauri-drag-region className={cn(
            "fixed top-0 w-full z-50 transition-colors",
            isMobile ? "bg-transparent p-4" : "bg-background/70 backdrop-blur-xl border-b border-surface-variant sticky"
          )}>
            <nav className={cn("flex items-center", isMobile ? "justify-start" : "justify-between px-6 py-4 max-w-7xl mx-auto")}>
              <button onClick={onClose} className={cn(
                "flex items-center justify-center gap-2 transition-transform active:scale-90",
                isMobile 
                  ? "w-10 h-10 rounded-full bg-black/40 backdrop-blur-md text-white shadow-lg border border-white/10" 
                  : "text-primary hover:text-white group"
              )}>
                <ArrowLeft className={cn("w-5 h-5", !isMobile && "group-hover:-translate-x-1 transition-transform")} />
                {!isMobile && <span className="font-bold tracking-tight">Back to Dashboard</span>}
              </button>
            </nav>
          </header>

          <main className={cn("min-h-screen relative", isMobile ? "pb-32" : "")}>
            {/* Cinematic Hero Section */}
            <section className={cn(
              "relative flex items-end",
              isMobile ? "min-h-[450px] px-5 pb-8 pt-24" : "min-h-[600px] px-6 md:px-16 pb-12 pt-20"
            )}>
              <div 
                className="absolute inset-0 bg-cover bg-center -z-10 scale-110"
                style={{ 
                  backgroundImage: `url('${details.coverImage.extraLarge || details.coverImage.large}')`,
                  filter: isMobile ? 'blur(40px) brightness(0.4)' : 'blur(60px) brightness(0.3)'
                }}
              />
              
              <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-end">
                {/* Cover Image */}
                <div className={cn("flex-shrink-0 w-44 md:w-64 lg:w-72", isMobile ? "mx-auto" : "mx-0")}>
                  <div className="aspect-[3/4] overflow-hidden rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10">
                    <img className="w-full h-full object-cover" src={details.coverImage.extraLarge || details.coverImage.large} alt={details.title.english || details.title.romaji} />
                  </div>
                </div>
                
                {/* Info Details */}
                <div className={cn("flex-grow flex flex-col justify-end w-full", isMobile ? "items-center text-center mt-2" : "")}>
                  <h1 className={cn("font-bold mb-4 text-primary tracking-tight", isMobile ? "text-3xl" : "text-4xl md:text-5xl lg:text-6xl")}>
                    {details.title.english || details.title.romaji}
                  </h1>
                  
                  <div className={cn("flex flex-wrap gap-2 mb-4", isMobile ? "justify-center" : "")}>
                    <div className="bg-[#1A1A1A]/70 backdrop-blur-xl border border-white/5 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant">FORMAT</span>
                      <span className="text-xs font-medium text-primary uppercase">{details.format}</span>
                    </div>
                    {details.averageScore && (
                      <div className="bg-[#1A1A1A]/70 backdrop-blur-xl border border-white/5 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant">SCORE</span>
                        <span className="text-xs font-medium text-primary">{details.averageScore}%</span>
                      </div>
                    )}
                    {details.popularity && (
                      <div className="bg-[#1A1A1A]/70 backdrop-blur-xl border border-white/5 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant">POPULARITY</span>
                        <span className="text-xs font-medium text-primary">#{details.popularity}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className={cn("flex flex-wrap gap-2", isMobile ? "justify-center" : "")}>
                    {details.genres?.slice(0, isMobile ? 4 : 10).map(g => (
                      <span key={g} className="bg-primary/10 text-primary border border-primary/20 text-xs px-3 py-1 rounded-full font-medium">
                        {g}
                      </span>
                    ))}
                  </div>

                  {!isMobile && (
                    <div className="flex flex-wrap gap-3 mt-6">
                      {onSearchOnlineManga && (
                        <button 
                          onClick={() => onSearchOnlineManga(details.title.english || details.title.romaji)}
                          className="flex items-center gap-2 bg-black/40 hover:bg-white/10 border border-white/10 backdrop-blur-xl text-white px-5 py-2.5 rounded-xl font-medium transition-all active:scale-95"
                        >
                          <BookOpen className="w-4 h-4 text-blue-400" /> Read Online
                        </button>
                      )}
                      {onSearchTorbox && (
                        <button 
                          onClick={() => onSearchTorbox(details.title.english || details.title.romaji)}
                          className="flex items-center gap-2 bg-black/40 hover:bg-white/10 border border-white/10 backdrop-blur-xl text-white px-5 py-2.5 rounded-xl font-medium transition-all active:scale-95"
                        >
                          <Download className="w-4 h-4 text-purple-400" /> Download via Torbox
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
                <div className={cn(
                  "flex overflow-x-auto custom-scrollbar no-scrollbar scroll-smooth",
                  isMobile ? "gap-2 mb-6 pb-2" : "border-b border-surface-variant mb-8"
                )}>
                  {(['overview', 'characters', 'relations', 'recommendations'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "whitespace-nowrap transition-colors",
                        isMobile 
                          ? `px-4 py-2 rounded-full text-sm font-semibold border ${activeTab === tab ? 'bg-primary/15 text-primary border-primary/30' : 'bg-surface-variant/20 text-on-surface-variant border-transparent'}`
                          : `px-6 py-4 text-sm font-semibold tracking-wider uppercase ${activeTab === tab ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-primary'}`
                      )}
                    >
                      {tab.replace('&', ' & ')}
                    </button>
                  ))}
                </div>

                <div className="min-h-[400px]">
                  {/* Tab: Overview */}
                  {activeTab === 'overview' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      
                      {/* Mobile Read/Download Buttons */}
                      {isMobile && (
                        <div className="flex flex-col sm:flex-row gap-3">
                          {onSearchOnlineManga && (
                            <button 
                              onClick={() => onSearchOnlineManga(details.title.english || details.title.romaji)}
                              className="flex-1 flex items-center justify-center gap-2 bg-[#1A1A1A] active:bg-[#262626] border border-white/5 text-white px-5 py-3 rounded-xl font-medium transition-colors"
                            >
                              <BookOpen className="w-4 h-4 text-blue-400" /> Read Online
                            </button>
                          )}
                          {onSearchTorbox && (
                            <button 
                              onClick={() => onSearchTorbox(details.title.english || details.title.romaji)}
                              className="flex-1 flex items-center justify-center gap-2 bg-[#1A1A1A] active:bg-[#262626] border border-white/5 text-white px-5 py-3 rounded-xl font-medium transition-colors"
                            >
                              <Download className="w-4 h-4 text-purple-400" /> Download
                            </button>
                          )}
                        </div>
                      )}

                      <div>
                        <h3 className={cn("font-bold text-primary mb-3", isMobile ? "text-lg" : "text-xl")}>Synopsis</h3>
                        <p 
                          className="text-on-surface-variant leading-relaxed text-base md:text-lg opacity-90"
                          dangerouslySetInnerHTML={{ __html: details.description || 'No synopsis available.' }}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5">
                          <p className="text-[10px] font-semibold tracking-wider text-on-surface-variant mb-1 uppercase">Romaji</p>
                          <p className="text-sm text-primary font-medium line-clamp-1">{details.title.romaji}</p>
                        </div>
                        <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5">
                          <p className="text-[10px] font-semibold tracking-wider text-on-surface-variant mb-1 uppercase">Native</p>
                          <p className="text-sm text-primary font-medium line-clamp-1">{details.title.native}</p>
                        </div>
                        <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5">
                          <p className="text-[10px] font-semibold tracking-wider text-on-surface-variant mb-1 uppercase">Chapters</p>
                          <p className="text-sm text-primary font-medium">{details.chapters || '?'}</p>
                        </div>
                        <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5">
                          <p className="text-[10px] font-semibold tracking-wider text-on-surface-variant mb-1 uppercase">Volumes</p>
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
                                className="bg-[#1A1A1A] hover:bg-[#262626] border border-white/5 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors flex items-center gap-2"
                              >
                                {link.site} <ExternalLink className="w-3 h-3 text-on-surface-variant" />
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
                                className={`bg-surface-variant/30 border border-white/5 text-xs px-3 py-1.5 rounded-full ${tag.isMediaSpoiler ? 'text-error opacity-70 hover:opacity-100 cursor-help' : 'text-on-surface-variant'}`}
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
                          <div key={edge.node.id} className="flex gap-3 md:gap-4 bg-[#1A1A1A] p-2 md:p-3 rounded-xl border border-white/5">
                            <img className="w-14 h-20 md:w-16 md:h-24 object-cover rounded-lg bg-surface-variant" src={edge.node.image.large} alt={edge.node.name.full} />
                            <div className="flex flex-col justify-center">
                              <p className="text-sm text-primary font-bold line-clamp-2">{edge.node.name.full}</p>
                              <p className="text-[10px] md:text-xs text-on-surface-variant uppercase mt-1">{edge.role}</p>
                            </div>
                          </div>
                        ))}
                        {!details.characters?.edges?.length && <p className="text-on-surface-variant">No characters found.</p>}
                      </div>
                      
                      <h3 className="text-lg md:text-xl font-bold text-primary mb-4 mt-10">Staff</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
                        {details.staff?.edges?.map(edge => (
                          <div key={edge.node.id} className="flex gap-3 md:gap-4 bg-[#1A1A1A] p-2 md:p-3 rounded-xl border border-white/5">
                            <img className="w-14 h-20 md:w-16 md:h-24 object-cover rounded-lg bg-surface-variant" src={edge.node.image.large} alt={edge.node.name.full} />
                            <div className="flex flex-col justify-center">
                              <p className="text-sm text-primary font-bold line-clamp-2">{edge.node.name.full}</p>
                              <p className="text-[10px] md:text-xs text-on-surface-variant uppercase mt-1">{edge.role}</p>
                            </div>
                          </div>
                        ))}
                        {!details.staff?.edges?.length && <p className="text-on-surface-variant">No staff found.</p>}
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
                                window.open(`https://anilist.co/${edge.node.type.toLowerCase()}/${edge.node.id}`, '_blank');
                              }
                            }}
                          >
                            <div className="aspect-[3/4] overflow-hidden rounded-lg border border-white/5">
                              <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={edge.node.coverImage.large} alt={edge.node.title.romaji} />
                            </div>
                            <div>
                              <p className="text-[13px] md:text-sm text-primary font-medium line-clamp-2 leading-snug">{edge.node.title.romaji}</p>
                              <p className="text-[9px] md:text-[10px] text-on-surface-variant uppercase mt-1 tracking-wider">
                                {edge.relationType.replace('_', ' ')}
                              </p>
                            </div>
                          </div>
                        ))}
                        {!details.relations?.edges?.length && <p className="text-on-surface-variant col-span-full">No relations found.</p>}
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
                                window.open(`https://anilist.co/manga/${node.mediaRecommendation.id}`, '_blank');
                              }
                            }}
                          >
                            <div className="aspect-[3/4] overflow-hidden rounded-lg border border-white/5">
                              <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={node.mediaRecommendation.coverImage.large} alt={node.mediaRecommendation.title.romaji} />
                            </div>
                            <p className="text-[13px] md:text-sm text-primary font-medium line-clamp-2 leading-snug">{node.mediaRecommendation.title.romaji}</p>
                          </div>
                        ))}
                        {!details.recommendations?.nodes?.length && <p className="text-on-surface-variant col-span-full">No recommendations found.</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar: Desktop Only */}
              {!isMobile && (
                <aside className="w-full lg:w-80 flex-shrink-0 animate-in fade-in slide-in-from-right-8 duration-700">
                  <div className="bg-[#1A1A1A]/80 backdrop-blur-2xl p-6 rounded-2xl border border-white/10 sticky top-24 shadow-2xl">
                    <h2 className="text-lg font-bold text-primary mb-6 flex items-center gap-2">
                      <Bookmark className="w-5 h-5" /> My List
                    </h2>
                    <TrackerForm {...formProps} />
                  </div>
                </aside>
              )}
            </section>
          </main>

          {/* Sticky Bottom Action Bar (Mobile Only) */}
          {isMobile && (
            <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] left-0 right-0 p-4 pointer-events-none z-50">
              <div className="pointer-events-auto bg-[#1A1A1A]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">List Status</span>
                  <span className="text-sm font-bold text-primary capitalize">{status === 'CURRENT' ? 'Reading' : status.replace('_', ' ').toLowerCase()}</span>
                </div>
                <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
                  <Dialog.Trigger asChild>
                    <button className="bg-white text-black px-5 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform">
                      Edit Tracker
                    </button>
                  </Dialog.Trigger>
                  
                  {/* Radix Dialog as Bottom Sheet */}
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[400] animate-in fade-in" />
                    <Dialog.Content 
                      className="fixed bottom-0 left-0 right-0 z-[401] bg-[#121212] rounded-t-3xl border-t border-white/10 shadow-2xl focus:outline-none flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-[100%]"
                    >
                      <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto my-4" />
                      
                      <div className="px-6 pb-4 flex items-center justify-between border-b border-white/5">
                        <Dialog.Title className="text-lg font-bold text-primary flex items-center gap-2">
                          <Bookmark className="w-5 h-5" /> Edit Tracker
                        </Dialog.Title>
                        <Dialog.Close asChild>
                          <button className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                            <X className="w-5 h-5 text-on-surface-variant" />
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
            </div>
          )}
        </>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
