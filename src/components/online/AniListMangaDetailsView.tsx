import React, { useState, useEffect } from 'react';
import { Download, ExternalLink, X, Star, Calendar, Bookmark, Edit3, ArrowLeft, BookOpen } from 'lucide-react';
import { AnilistMediaList, AnilistMediaDetails, getMediaDetails, updateMediaListEntry } from '@/lib/anilist';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from 'sonner';

interface AniListMangaDetailsViewProps {
  mediaId: number;
  initialEntry?: AnilistMediaList;
  onClose: () => void;
  onUpdate: () => void; // Trigger a refresh in the dashboard
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
  const anilistToken = usePreferencesStore(state => state.preferences?.anilistToken);
  
  const [details, setDetails] = useState<AnilistMediaDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'characters' | 'relations' | 'recommendations'>('overview');

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
      onUpdate();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-md">
        <p className="text-on-surface mb-4">Could not load details.</p>
        <button onClick={onClose} className="px-4 py-2 bg-primary text-background rounded">Go Back</button>
      </div>
    );
  }

  const title = details.title.english || details.title.romaji;
  const coverUrl = details.coverImage.extraLarge || details.coverImage.large;
  const bannerUrl = details.coverImage.extraLarge || details.coverImage.large; // AniList sometimes has bannerImage, but we didn't query it. We can use blurred cover.

  return (
    <div className="fixed inset-0 z-[300] bg-background text-on-surface overflow-y-auto overflow-x-hidden font-sans">
      {/* Top Nav */}
      <header data-tauri-drag-region className="sticky top-0 w-full z-50 bg-background/70 backdrop-blur-xl border-b border-surface-variant">
        <nav className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <button onClick={onClose} className="flex items-center gap-2 text-primary hover:text-white transition-colors group">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-bold tracking-tight">Back to Dashboard</span>
          </button>
        </nav>
      </header>

      <main className="min-h-screen">
        {/* Cinematic Hero Section */}
        <section className="relative min-h-[600px] flex items-end px-6 md:px-16 pb-12 pt-20">
          <div 
            className="absolute inset-0 bg-cover bg-center -z-10 scale-110"
            style={{ 
              backgroundImage: `url('${bannerUrl}')`,
              filter: 'blur(60px) brightness(0.3)'
            }}
          />
          
          <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row gap-8 items-end">
            {/* Cover Image */}
            <div className="w-full md:w-64 lg:w-72 flex-shrink-0 mx-auto md:mx-0">
              <div className="aspect-[3/4] overflow-hidden rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10">
                <img className="w-full h-full object-cover" src={coverUrl} alt={title} />
              </div>
            </div>
            
            {/* Info Details */}
            <div className="flex-grow flex flex-col justify-end">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 text-primary tracking-tight">
                {title}
              </h1>
              
              <div className="flex flex-wrap gap-3 mb-6">
                <div className="bg-[#1A1A1A]/70 backdrop-blur-xl border border-white/5 px-4 py-2 rounded-lg flex items-center gap-2">
                  <span className="text-[11px] font-semibold tracking-wider text-on-surface-variant">FORMAT</span>
                  <span className="text-sm font-medium text-primary uppercase">{details.format}</span>
                </div>
                {details.averageScore && (
                  <div className="bg-[#1A1A1A]/70 backdrop-blur-xl border border-white/5 px-4 py-2 rounded-lg flex items-center gap-2">
                    <span className="text-[11px] font-semibold tracking-wider text-on-surface-variant">SCORE</span>
                    <span className="text-sm font-medium text-primary">{details.averageScore}%</span>
                  </div>
                )}
                {details.popularity && (
                  <div className="bg-[#1A1A1A]/70 backdrop-blur-xl border border-white/5 px-4 py-2 rounded-lg flex items-center gap-2">
                    <span className="text-[11px] font-semibold tracking-wider text-on-surface-variant">POPULARITY</span>
                    <span className="text-sm font-medium text-primary">#{details.popularity}</span>
                  </div>
                )}
                <div className="bg-[#1A1A1A]/70 backdrop-blur-xl border border-white/5 px-4 py-2 rounded-lg flex items-center gap-2">
                  <span className="text-[11px] font-semibold tracking-wider text-on-surface-variant">STATUS</span>
                  <span className="text-sm font-medium text-primary capitalize">{details.status.toLowerCase()}</span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {details.genres?.map(g => (
                  <span key={g} className="bg-primary/10 text-primary border border-primary/20 text-xs px-3 py-1 rounded-full font-medium">
                    {g}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 mt-6">
                {onSearchOnlineManga && (
                  <button 
                    onClick={() => onSearchOnlineManga(title)}
                    className="flex items-center gap-2 bg-black/40 hover:bg-white/10 border border-white/10 backdrop-blur-xl text-white px-5 py-2.5 rounded-xl font-medium transition-all active:scale-95"
                  >
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    Read Online
                  </button>
                )}
                {onSearchTorbox && (
                  <button 
                    onClick={() => onSearchTorbox(title)}
                    className="flex items-center gap-2 bg-black/40 hover:bg-white/10 border border-white/10 backdrop-blur-xl text-white px-5 py-2.5 rounded-xl font-medium transition-all active:scale-95"
                  >
                    <Download className="w-4 h-4 text-purple-400" />
                    Download via Torbox
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Content & Sidebar */}
        <section className="max-w-7xl mx-auto px-6 md:px-16 py-12 flex flex-col lg:flex-row gap-12">
          
          {/* Tabbed Navigation & Content */}
          <div className="flex-grow min-w-0">
            <div className="flex border-b border-surface-variant mb-8 overflow-x-auto custom-scrollbar">
              {(['overview', 'characters', 'relations', 'recommendations'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-4 text-sm font-semibold tracking-wider uppercase transition-colors ${
                    activeTab === tab 
                      ? 'border-b-2 border-primary text-primary' 
                      : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  {tab.replace('&', ' & ')}
                </button>
              ))}
            </div>

            <div className="min-h-[400px]">
              {/* Tab: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div>
                    <h3 className="text-xl font-bold text-primary mb-4">Synopsis</h3>
                    <p 
                      className="text-on-surface-variant leading-relaxed text-lg"
                      dangerouslySetInnerHTML={{ __html: details.description || 'No synopsis available.' }}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#1A1A1A] p-5 rounded-xl border border-white/5">
                      <p className="text-xs font-semibold tracking-wider text-on-surface-variant mb-1 uppercase">Romaji</p>
                      <p className="text-sm text-primary font-medium">{details.title.romaji}</p>
                    </div>
                    <div className="bg-[#1A1A1A] p-5 rounded-xl border border-white/5">
                      <p className="text-xs font-semibold tracking-wider text-on-surface-variant mb-1 uppercase">Native</p>
                      <p className="text-sm text-primary font-medium">{details.title.native}</p>
                    </div>
                    <div className="bg-[#1A1A1A] p-5 rounded-xl border border-white/5">
                      <p className="text-xs font-semibold tracking-wider text-on-surface-variant mb-1 uppercase">Chapters</p>
                      <p className="text-sm text-primary font-medium">{details.chapters || '?'}</p>
                    </div>
                    <div className="bg-[#1A1A1A] p-5 rounded-xl border border-white/5">
                      <p className="text-xs font-semibold tracking-wider text-on-surface-variant mb-1 uppercase">Volumes</p>
                      <p className="text-sm text-primary font-medium">{details.volumes || '?'}</p>
                    </div>
                  </div>

                  {details.externalLinks?.length > 0 && (
                    <div>
                      <h3 className="text-xl font-bold text-primary mb-4">External Links</h3>
                      <div className="flex flex-wrap gap-3">
                        {details.externalLinks.map(link => (
                          <a 
                            key={link.id} 
                            href={link.url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="bg-[#1A1A1A] hover:bg-[#262626] border border-white/5 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                          >
                            {link.site} <ExternalLink className="w-3 h-3 text-on-surface-variant" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {details.tags?.length > 0 && (
                    <div>
                      <h3 className="text-xl font-bold text-primary mb-4">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {details.tags.map(tag => (
                          <span 
                            key={tag.id} 
                            className={`bg-surface-variant/50 border border-white/5 text-xs px-3 py-1 rounded-full ${tag.isMediaSpoiler ? 'text-error opacity-70 hover:opacity-100 cursor-help' : 'text-on-surface'}`}
                            title={tag.description}
                          >
                            {tag.name} {tag.rank}%
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
                  <h3 className="text-xl font-bold text-primary mb-6">Characters</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {details.characters?.edges?.map(edge => (
                      <div key={edge.node.id} className="flex gap-4 bg-[#1A1A1A] p-3 rounded-xl border border-white/5 hover:border-white/20 transition-colors">
                        <img className="w-16 h-24 object-cover rounded-lg bg-surface-variant" src={edge.node.image.large} alt={edge.node.name.full} />
                        <div className="flex flex-col justify-center">
                          <p className="text-sm text-primary font-bold line-clamp-2">{edge.node.name.full}</p>
                          <p className="text-xs text-on-surface-variant uppercase mt-1">{edge.role}</p>
                        </div>
                      </div>
                    ))}
                    {!details.characters?.edges?.length && <p className="text-on-surface-variant">No characters found.</p>}
                  </div>
                  
                  <h3 className="text-xl font-bold text-primary mb-6 mt-12">Staff</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {details.staff?.edges?.map(edge => (
                      <div key={edge.node.id} className="flex gap-4 bg-[#1A1A1A] p-3 rounded-xl border border-white/5 hover:border-white/20 transition-colors">
                        <img className="w-16 h-24 object-cover rounded-lg bg-surface-variant" src={edge.node.image.large} alt={edge.node.name.full} />
                        <div className="flex flex-col justify-center">
                          <p className="text-sm text-primary font-bold line-clamp-2">{edge.node.name.full}</p>
                          <p className="text-xs text-on-surface-variant uppercase mt-1">{edge.role}</p>
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6">
                    {details.relations?.edges?.map(edge => (
                      <div 
                        key={edge.node.id} 
                        className="space-y-3 group cursor-pointer" 
                        onClick={() => {
                          if (edge.node.type === 'MANGA' && onOpenMedia) {
                            onOpenMedia(edge.node.id);
                          } else {
                            window.open(`https://anilist.co/${edge.node.type.toLowerCase()}/${edge.node.id}`, '_blank');
                          }
                        }}
                      >
                        <div className="aspect-[3/4] overflow-hidden rounded-lg border border-white/5 group-hover:border-primary/50 transition-colors">
                          <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={edge.node.coverImage.large} alt={edge.node.title.romaji} />
                        </div>
                        <div>
                          <p className="text-sm text-primary font-medium line-clamp-2">{edge.node.title.romaji}</p>
                          <p className="text-[10px] text-on-surface-variant uppercase mt-1 tracking-wider">
                            {edge.relationType.replace('_', ' ')} · {edge.node.type}
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6">
                    {details.recommendations?.nodes?.map(node => node.mediaRecommendation && (
                      <div 
                        key={node.mediaRecommendation.id} 
                        className="space-y-3 group cursor-pointer" 
                        onClick={() => {
                          if (onOpenMedia) {
                            onOpenMedia(node.mediaRecommendation.id);
                          } else {
                            window.open(`https://anilist.co/manga/${node.mediaRecommendation.id}`, '_blank');
                          }
                        }}
                      >
                        <div className="aspect-[3/4] overflow-hidden rounded-lg border border-white/5 group-hover:border-primary/50 transition-colors">
                          <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={node.mediaRecommendation.coverImage.large} alt={node.mediaRecommendation.title.romaji} />
                        </div>
                        <p className="text-sm text-primary font-medium line-clamp-2">{node.mediaRecommendation.title.romaji}</p>
                      </div>
                    ))}
                    {!details.recommendations?.nodes?.length && <p className="text-on-surface-variant col-span-full">No recommendations found.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: My List Management Card */}
          <aside className="w-full lg:w-80 flex-shrink-0 animate-in fade-in slide-in-from-right-8 duration-700">
            <div className="bg-[#1A1A1A]/80 backdrop-blur-2xl p-6 rounded-2xl border border-white/10 sticky top-24 shadow-2xl">
              <h2 className="text-lg font-bold text-primary mb-6 flex items-center gap-2">
                <Bookmark className="w-5 h-5" /> My List
              </h2>
              
              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className="text-xs font-semibold tracking-wider text-on-surface-variant block mb-2 uppercase">Status</label>
                  <select 
                    value={status} 
                    onChange={e => setStatus(e.target.value)}
                    className="w-full bg-[#0E0E0E] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-4 text-sm appearance-none outline-none transition-colors"
                  >
                    <option value="CURRENT">Reading</option>
                    <option value="PLANNING">Plan to Read</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="DROPPED">Dropped</option>
                    <option value="PAUSED">Paused</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold tracking-wider text-on-surface-variant block mb-2 uppercase">Progress</label>
                    <input 
                      type="number" 
                      value={progress}
                      onChange={e => setProgress(parseInt(e.target.value) || 0)}
                      min="0"
                      className="w-full bg-[#0E0E0E] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-4 text-sm outline-none transition-colors" 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold tracking-wider text-on-surface-variant block mb-2 uppercase">Score</label>
                    <input 
                      type="number" 
                      value={score}
                      onChange={e => setScore(parseInt(e.target.value) || 0)}
                      min="0" max="100"
                      placeholder="0-100"
                      className="w-full bg-[#0E0E0E] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-4 text-sm outline-none transition-colors" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold tracking-wider text-on-surface-variant block mb-2 uppercase">Start Date</label>
                    <input 
                      type="date"
                      value={startedAt}
                      onChange={e => setStartedAt(e.target.value)}
                      className="w-full bg-[#0E0E0E] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-3 text-[13px] outline-none transition-colors" 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold tracking-wider text-on-surface-variant block mb-2 uppercase">Finish Date</label>
                    <input 
                      type="date" 
                      value={completedAt}
                      onChange={e => setCompletedAt(e.target.value)}
                      className="w-full bg-[#0E0E0E] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-3 text-[13px] outline-none transition-colors" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold tracking-wider text-on-surface-variant block mb-2 uppercase">Rewatches</label>
                    <input 
                      type="number" 
                      value={repeat}
                      onChange={e => setRepeat(parseInt(e.target.value) || 0)}
                      min="0"
                      className="w-full bg-[#0E0E0E] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-4 text-sm outline-none transition-colors" 
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold tracking-wider text-on-surface-variant block mb-2 uppercase">Notes</label>
                  <textarea 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full bg-[#0E0E0E] border border-white/10 text-primary rounded-xl focus:border-primary focus:ring-1 focus:ring-primary py-3 px-4 text-sm h-28 resize-none outline-none transition-colors" 
                    placeholder="Private notes..."
                  ></textarea>
                </div>
                
                <button 
                  type="submit"
                  disabled={saving}
                  className="w-full bg-white text-black font-semibold text-sm py-4 rounded-xl hover:bg-white/90 transition-colors active:scale-[0.98] mt-2 shadow-lg disabled:opacity-50"
                >
                  {saving ? 'SAVING...' : 'SAVE TO ANILIST'}
                </button>
              </form>
            </div>
          </aside>
          
        </section>
      </main>
    </div>
  );
}
