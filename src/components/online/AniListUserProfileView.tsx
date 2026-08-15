import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, BookOpen, Activity, Users, Heart, BarChart3, MessageSquare,
  Calendar, Star, Layers, ChevronRight, X
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { AnilistUser, AnilistMediaListShelf } from '@/lib/anilist';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

// Components for each tab
import { AniListMangaStatistics } from './AniListMangaStatistics';
import { AniListUserSocialView } from './AniListUserSocialView';
import { AniListUserActivitiesView } from './AniListUserActivitiesView';
import { AniListUserReviewsView } from './AniListUserReviewsView';
import { AniListUserFavouritesView } from './AniListUserFavouritesView';
import { AniListUserMangaView } from './AniListUserMangaView';

interface AniListUserProfileViewProps {
  onClose: () => void;
  user: AnilistUser;
  shelf: AnilistMediaListShelf | null;
}

export function AniListUserProfileView({ onClose, user, shelf }: AniListUserProfileViewProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'manga' | 'activities' | 'social' | 'favourites' | 'statistics' | 'reviews'>('profile');

  // Calculate accurate statistics from API or fallback to local shelf
  const calculatedStats = React.useMemo(() => {
    if (user.statistics?.manga?.count && user.statistics.manga.count > 0) {
      return user.statistics.manga;
    }
    
    if (!shelf) return null;

    let count = 0;
    let chaptersRead = 0;
    let meanScoreTotal = 0;
    let scoreEntries = 0;
    const scoresMap: Record<number, number> = {};
    const formatsMap: Record<string, number> = {};
    const statusesMap: Record<string, number> = {};
    const countriesMap: Record<string, number> = {};

    shelf.lists.forEach(list => {
      list.entries.forEach(entry => {
        count++;
        chaptersRead += entry.progress || 0;
        
        if (entry.score > 0) {
          meanScoreTotal += entry.score;
          scoreEntries++;
          scoresMap[entry.score] = (scoresMap[entry.score] || 0) + 1;
        }

        const format = entry.media.format || 'UNKNOWN';
        formatsMap[format] = (formatsMap[format] || 0) + 1;

        const status = entry.status || 'UNKNOWN';
        statusesMap[status] = (statusesMap[status] || 0) + 1;

        const country = entry.media.countryOfOrigin || 'UNKNOWN';
        countriesMap[country] = (countriesMap[country] || 0) + 1;
      });
    });

    const meanScore = scoreEntries > 0 ? meanScoreTotal / scoreEntries : 0;
    
    let varianceSum = 0;
    if (scoreEntries > 0) {
      shelf.lists.forEach(list => {
        list.entries.forEach(entry => {
          if (entry.score > 0) {
            varianceSum += Math.pow(entry.score - meanScore, 2);
          }
        });
      });
    }
    const standardDeviation = scoreEntries > 0 ? Math.sqrt(varianceSum / scoreEntries) : 0;

    return {
      count,
      chaptersRead,
      meanScore,
      standardDeviation,
      scores: Object.entries(scoresMap).map(([score, c]) => ({ score: Number(score), count: c })),
      lengths: [],
      formats: Object.entries(formatsMap).map(([format, c]) => ({ format, count: c })),
      statuses: Object.entries(statusesMap).map(([status, c]) => ({ status, count: c })),
      countries: Object.entries(countriesMap).map(([country, c]) => ({ country, count: c })),
    };
  }, [user, shelf]);

  // Render content in a portal for Android full-screen and desktop modal overlays
  const content = (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-6 overflow-hidden overscroll-none overscroll-behavior-y-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl rounded-t-3xl md:rounded-[2rem] md:border md:border-border/70 bg-card text-card-foreground overflow-hidden relative flex flex-col shadow-2xl"
      >
        {!user ? (
          <div className="flex-1 flex flex-col animate-in fade-in duration-300">
            <div className="relative h-40 sm:h-48 md:h-52 shrink-0 bg-muted/40 overflow-hidden">
              <Skeleton className="w-full h-full rounded-none" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-card/50 via-50% to-card" />
              
              <div className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-2 rounded-full bg-card/60 backdrop-blur-md z-10">
                <ChevronLeft className="w-5 h-5 text-muted-foreground/50" />
              </div>
            </div>

            <div className="px-5 sm:px-6 md:px-8 -mt-10 sm:-mt-12 md:-mt-14 flex items-end gap-4 z-10">
              <Skeleton className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-card shadow-lg" />
              <div className="mb-2 space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>

            <div className="flex-1 mt-6 px-5 sm:px-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-24 sm:h-28 w-full rounded-2xl" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Header / Banner & User Identity Bar */}
            <div className="relative shrink-0 flex flex-col">
              {/* Banner Area */}
              <div className="relative h-40 sm:h-48 md:h-52 w-full overflow-hidden bg-muted/40">
                {user.bannerImage ? (
                  <img 
                    src={user.bannerImage} 
                    alt="Banner" 
                    className="w-full h-full object-cover object-center" 
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-primary/30 via-secondary/40 to-primary/20" />
                )}
                {/* Multi-stop smooth downward gradient fade into card background */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 via-40% to-card pointer-events-none" />
                
                {/* Close button positioned at top-right of banner */}
                <button 
                  onClick={onClose}
                  className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-xl border border-white/15 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-20 cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* User Identity Bar (Avatar overlapping banner bottom edge) */}
              <div className="px-5 sm:px-6 md:px-8 -mt-10 sm:-mt-12 md:-mt-14 flex flex-col sm:flex-row sm:items-end justify-between gap-3.5 sm:gap-4 relative z-10 pb-2">
                <div className="flex items-end gap-3.5 sm:gap-4 min-w-0">
                  <img 
                    src={user.avatar.large} 
                    alt={user.name} 
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-card ring-2 ring-primary/20 shadow-2xl object-cover bg-card shrink-0"
                  />
                  <div className="mb-1 min-w-0">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground tracking-tight leading-tight truncate">
                      {user.name}
                    </h1>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium mt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                      <span>Joined {new Date(user.createdAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </p>
                  </div>
                </div>

                {/* Quick Profile Stat Pills */}
                {calculatedStats && (
                  <div className="flex items-center gap-2 mb-1 flex-wrap shrink-0">
                    <div className="px-3 py-1.5 rounded-xl bg-secondary/80 border border-border/60 shadow-xs flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{calculatedStats.count} Manga</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl bg-secondary/80 border border-border/60 shadow-xs flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{calculatedStats.chaptersRead} Chs</span>
                    </div>
                    {calculatedStats.meanScore > 0 && (
                      <div className="px-3 py-1.5 rounded-xl bg-secondary/80 border border-border/60 shadow-xs flex items-center gap-1.5 text-xs font-bold text-foreground">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        <span>{calculatedStats.meanScore.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto min-h-[340px] max-h-[calc(90vh-210px)] px-4 sm:px-6 md:px-8 pt-2 pb-6 overscroll-contain custom-scrollbar">
              <AnimatePresence mode="wait">
                {activeTab === 'profile' && (
                  <motion.div 
                    key="profile"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-col gap-5 py-2"
                  >
                    {/* Navigation 2x3 Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                      <ProfileButton 
                        icon={<BookOpen size={24} />} 
                        label="Manga" 
                        description="Browse entire manga list"
                        count={calculatedStats?.count}
                        onClick={() => setActiveTab('manga')} 
                      />
                      <ProfileButton 
                        icon={<Activity size={24} />} 
                        label="Activities" 
                        description="Recent reading status updates"
                        onClick={() => setActiveTab('activities')} 
                      />
                      <ProfileButton 
                        icon={<Users size={24} />} 
                        label="Social" 
                        description="Followers & following community"
                        onClick={() => setActiveTab('social')} 
                      />
                      <ProfileButton 
                        icon={<Heart size={24} />} 
                        label="Favourites" 
                        description="Favorite manga & titles"
                        onClick={() => setActiveTab('favourites')} 
                      />
                      <ProfileButton 
                        icon={<BarChart3 size={24} />} 
                        label="Statistics" 
                        description="Score breakdown & country charts"
                        onClick={() => setActiveTab('statistics')} 
                      />
                      <ProfileButton 
                        icon={<MessageSquare size={24} />} 
                        label="Reviews & Threads" 
                        description="Community write-ups & forum threads"
                        onClick={() => setActiveTab('reviews')} 
                      />
                    </div>

                    {/* Reading Status Distribution Summary Bar */}
                    {calculatedStats && calculatedStats.statuses.length > 0 && (
                      <div className="bg-secondary/40 rounded-2xl border border-border/60 p-4 shadow-xs mt-1">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                            Reading Status Overview
                          </span>
                          <span className="text-xs font-bold text-foreground">
                            {calculatedStats.count} Total Titles
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {calculatedStats.statuses.map((st) => (
                            <div 
                              key={st.status} 
                              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border/60 text-xs font-medium shadow-2xs"
                            >
                              <span className="text-muted-foreground capitalize">
                                {st.status.toLowerCase().replace(/_/g, ' ')}:
                              </span>
                              <span className="font-bold text-foreground font-mono">
                                {st.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'statistics' && (
                  <motion.div key="statistics" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="flex items-center gap-3 mb-5">
                      <button 
                        onClick={() => setActiveTab('profile')} 
                        className="p-2 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground border border-border/50 shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <h2 className="text-xl font-black text-foreground capitalize tracking-tight">Manga Statistics</h2>
                    </div>
                    {calculatedStats ? (
                      <AniListMangaStatistics stats={calculatedStats} />
                    ) : (
                      <p className="text-muted-foreground text-center py-12">No manga statistics available.</p>
                    )}
                  </motion.div>
                )}

                {activeTab === 'social' && (
                  <motion.div key="social" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                     <div className="flex items-center gap-3 mb-5">
                      <button 
                        onClick={() => setActiveTab('profile')} 
                        className="p-2 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground border border-border/50 shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <h2 className="text-xl font-black text-foreground capitalize tracking-tight">Social</h2>
                    </div>
                    <AniListUserSocialView userId={user.id} />
                  </motion.div>
                )}

                {activeTab === 'activities' && (
                  <motion.div key="activities" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="flex items-center gap-3 mb-5">
                      <button 
                        onClick={() => setActiveTab('profile')} 
                        className="p-2 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground border border-border/50 shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <h2 className="text-xl font-black text-foreground capitalize tracking-tight">Activities</h2>
                    </div>
                    <AniListUserActivitiesView userId={user.id} />
                  </motion.div>
                )}

                {activeTab === 'reviews' && (
                  <motion.div key="reviews" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="flex items-center gap-3 mb-5">
                      <button 
                        onClick={() => setActiveTab('profile')} 
                        className="p-2 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground border border-border/50 shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <h2 className="text-xl font-black text-foreground capitalize tracking-tight">Reviews & Discussions</h2>
                    </div>
                    <AniListUserReviewsView userId={user.id} />
                  </motion.div>
                )}

                {activeTab === 'manga' && (
                  <motion.div key="manga" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                     <div className="flex items-center gap-3 mb-5">
                      <button 
                        onClick={() => setActiveTab('profile')} 
                        className="p-2 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground border border-border/50 shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <h2 className="text-xl font-black text-foreground capitalize tracking-tight">Manga Collection</h2>
                    </div>
                    <AniListUserMangaView userId={user.id} />
                  </motion.div>
                )}

                {activeTab === 'favourites' && (
                  <motion.div key="favourites" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                     <div className="flex items-center gap-3 mb-5">
                      <button 
                        onClick={() => setActiveTab('profile')} 
                        className="p-2 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground border border-border/50 shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <h2 className="text-xl font-black text-foreground capitalize tracking-tight">Favourites</h2>
                    </div>
                    <AniListUserFavouritesView userId={user.id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );

  return createPortal(content, document.body);
}

function ProfileButton({ 
  icon, 
  label, 
  description, 
  count, 
  onClick 
}: { 
  icon: React.ReactNode, 
  label: string, 
  description?: string, 
  count?: number | string, 
  onClick: () => void 
}) {
  return (
    <button 
      onClick={onClick}
      className="group relative flex items-center gap-4 bg-secondary/40 hover:bg-secondary/70 border border-border/60 hover:border-primary/50 rounded-2xl p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-98 cursor-pointer select-none text-left"
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-105 transition-all duration-300 shrink-0 shadow-xs">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-sm sm:text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors truncate">
            {label}
          </span>
          {count !== undefined && count !== null && (
            <span className="text-[10px] sm:text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
              {count}
            </span>
          )}
        </div>
        {description && (
          <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {description}
          </span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
    </button>
  );
}
