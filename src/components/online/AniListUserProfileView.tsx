import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, BookOpen, Activity, Users, Heart, BarChart3, MessageSquare, 
  Loader2
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { getViewer, AnilistUser, AnilistMediaListCollection } from '@/lib/anilist';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

// Components we will create for each tab
import { AniListMangaStatistics } from './AniListMangaStatistics';
import { AniListUserSocialView } from './AniListUserSocialView';
import { AniListUserActivitiesView } from './AniListUserActivitiesView';
import { AniListUserReviewsView } from './AniListUserReviewsView';
import { AniListUserFavouritesView } from './AniListUserFavouritesView';
import { AniListUserMangaView } from './AniListUserMangaView';

interface AniListUserProfileViewProps {
  onClose: () => void;
  user: AnilistUser;
  collection: AnilistMediaListCollection | null;
}

export function AniListUserProfileView({ onClose, user, collection }: AniListUserProfileViewProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'manga' | 'activities' | 'social' | 'favourites' | 'statistics' | 'reviews'>('profile');

  // If AniList returns 0 manga stats (which happens for some users due to API bugs or caching),
  // we calculate accurate statistics directly from their local AniList collection.
  const calculatedStats = React.useMemo(() => {
    console.log("CalculatedStats useMemo running. User:", user);
    if (user.statistics?.manga?.count && user.statistics.manga.count > 0) {
      console.log("Using API stats");
      return user.statistics.manga;
    }
    
    console.log("Falling back to local calculation. Collection:", collection);
    if (!collection) return null;

    let count = 0;
    let chaptersRead = 0;
    let meanScoreTotal = 0;
    let scoreEntries = 0;
    const scoresMap: Record<number, number> = {};
    const formatsMap: Record<string, number> = {};
    const statusesMap: Record<string, number> = {};
    const countriesMap: Record<string, number> = {};

    collection.lists.forEach(list => {
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

    console.log("Calculated count:", count);

    const meanScore = scoreEntries > 0 ? meanScoreTotal / scoreEntries : 0;
    
    // Variance calculation
    let varianceSum = 0;
    if (scoreEntries > 0) {
      collection.lists.forEach(list => {
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
      lengths: [], // We'd need to bin the media chapters, but it's okay to leave empty or roughly calculate
      formats: Object.entries(formatsMap).map(([format, c]) => ({ format, count: c })),
      statuses: Object.entries(statusesMap).map(([status, c]) => ({ status, count: c })),
      countries: Object.entries(countriesMap).map(([country, c]) => ({ country, count: c })),
    };
  }, [user, collection]);

  // Render content in a portal for Android full-screen overlay, escaping z-index stacking context
  const content = (
    <div className="fixed inset-0 z-[300] bg-background/95 backdrop-blur-sm flex items-center justify-center p-0 md:p-6 overflow-hidden overscroll-none overscroll-behavior-y-none pb-[env(safe-area-inset-bottom,0px)]">
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full h-full md:h-[90vh] md:max-w-4xl md:rounded-xl md:border md:border-border/50 bg-background overflow-hidden relative flex flex-col shadow-2xl"
      >
        {!user ? (
          <div className="flex-1 flex flex-col animate-in fade-in duration-300">
            <div className="relative h-48 md:h-64 shrink-0 bg-muted/30">
              <Skeleton className="w-full h-full rounded-none" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
              
              <div className="absolute top-4 left-4 p-2 rounded-full bg-background/50 backdrop-blur-md z-10">
                <ChevronLeft className="w-5 h-5 text-muted-foreground/50" />
              </div>

              <div className="absolute -bottom-10 left-6 flex items-end gap-4 z-10">
                <Skeleton className="w-24 h-24 rounded-full border-4 border-background shadow-lg" />
                <div className="mb-2 space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </div>
            <div className="flex-1 mt-16 px-6 space-y-8">
              <Skeleton className="h-10 w-full max-w-sm rounded-full mx-auto" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Header / Banner */}
            <div className="relative h-48 md:h-64 shrink-0 bg-muted">
              {user.bannerImage ? (
                <img src={user.bannerImage} alt="Banner" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-primary/40 to-secondary/40" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
              
              <button 
                onClick={onClose}
                className="absolute top-4 left-4 p-2 rounded-full bg-background/50 backdrop-blur-md text-foreground hover:bg-background/80 transition-colors z-10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="absolute -bottom-10 left-6 flex items-end gap-4 z-10">
                <img 
                  src={user.avatar.large} 
                  alt={user.name} 
                  className="w-24 h-24 rounded-full border-4 border-background shadow-lg object-cover"
                />
                <div className="mb-2">
                  <h1 className="text-2xl font-bold text-foreground">{user.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    Joined {new Date(user.createdAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <ScrollArea className="flex-1 mt-14 px-6 pb-6">
              <AnimatePresence mode="wait">
                {activeTab === 'profile' && (
                  <motion.div 
                    key="profile"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="grid grid-cols-2 md:grid-cols-3 gap-4"
                  >
                    <ProfileButton icon={<BookOpen size={28} />} label="Manga" onClick={() => setActiveTab('manga')} />
                    <ProfileButton icon={<Activity size={28} />} label="Activities" onClick={() => setActiveTab('activities')} />
                    <ProfileButton icon={<Users size={28} />} label="Social" onClick={() => setActiveTab('social')} />
                    <ProfileButton icon={<Heart size={28} />} label="Favourites" onClick={() => setActiveTab('favourites')} />
                    <ProfileButton icon={<BarChart3 size={28} />} label="Statistics" onClick={() => setActiveTab('statistics')} />
                    <ProfileButton icon={<MessageSquare size={28} />} label="Reviews" onClick={() => setActiveTab('reviews')} />
                  </motion.div>
                )}

                {activeTab === 'statistics' && (
                  <motion.div key="statistics" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => setActiveTab('profile')} className="p-1 -ml-1 rounded-full hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
                      <h2 className="text-xl font-bold">Manga Statistics</h2>
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
                     <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => setActiveTab('profile')} className="p-1 -ml-1 rounded-full hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
                      <h2 className="text-xl font-bold">Social</h2>
                    </div>
                    <AniListUserSocialView userId={user.id} />
                  </motion.div>
                )}

                {activeTab === 'activities' && (
                  <motion.div key="activities" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => setActiveTab('profile')} className="p-1 -ml-1 rounded-full hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
                      <h2 className="text-xl font-bold">Activities</h2>
                    </div>
                    <AniListUserActivitiesView userId={user.id} />
                  </motion.div>
                )}

                {activeTab === 'reviews' && (
                  <motion.div key="reviews" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => setActiveTab('profile')} className="p-1 -ml-1 rounded-full hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
                      <h2 className="text-xl font-bold">Reviews</h2>
                    </div>
                    <AniListUserReviewsView userId={user.id} />
                  </motion.div>
                )}

                {activeTab === 'manga' && (
                  <motion.div key="manga" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                     <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => setActiveTab('profile')} className="p-1 -ml-1 rounded-full hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
                      <h2 className="text-xl font-bold capitalize">Manga</h2>
                    </div>
                    <AniListUserMangaView userId={user.id} />
                  </motion.div>
                )}

                {activeTab === 'favourites' && (
                  <motion.div key="favourites" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                     <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => setActiveTab('profile')} className="p-1 -ml-1 rounded-full hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
                      <h2 className="text-xl font-bold capitalize">Favourites</h2>
                    </div>
                    <AniListUserFavouritesView userId={user.id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </>
        )}
      </motion.div>
    </div>
  );

  return createPortal(content, document.body);
}

function ProfileButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-3 bg-secondary/20 hover:bg-secondary/50 border border-border/10 rounded-2xl p-6 transition-all active:scale-95 shadow-sm"
    >
      <div className="text-foreground/90">
        {icon}
      </div>
      <span className="text-sm font-medium tracking-wide">{label}</span>
    </button>
  );
}
