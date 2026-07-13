import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, BookOpen, Activity, Users, Heart, BarChart3, MessageSquare, 
  Loader2
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { 
  getViewer, AnilistUser 
} from '@/lib/anilist';
import { ScrollArea } from '@/components/ui/scroll-area';

// Components we will create for each tab
import { AniListMangaStatistics } from './AniListMangaStatistics';
import { AniListUserSocialView } from './AniListUserSocialView';
import { AniListUserActivitiesView } from './AniListUserActivitiesView';
import { AniListUserReviewsView } from './AniListUserReviewsView';

interface AniListUserProfileViewProps {
  onClose: () => void;
}

export function AniListUserProfileView({ onClose }: AniListUserProfileViewProps) {
  const { token: anilistToken } = useAniListAccessToken();
  const [user, setUser] = useState<AnilistUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'manga' | 'activities' | 'social' | 'favourites' | 'statistics' | 'reviews'>('profile');

  useEffect(() => {
    async function loadData() {
      if (!anilistToken) return;
      try {
        setLoading(true);
        const data = await getViewer(anilistToken);
        setUser(data);
      } catch (err) {
        console.error("Failed to load user profile:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [anilistToken]);

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
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !user ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-4">
            <p className="text-muted-foreground">Failed to load profile.</p>
            <button onClick={onClose} className="px-4 py-2 bg-secondary rounded-md text-sm">Close</button>
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
                    {user.statistics?.manga && (
                      <AniListMangaStatistics stats={user.statistics.manga} />
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

                {['manga', 'favourites'].includes(activeTab) && (
                  <motion.div key="other" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                     <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => setActiveTab('profile')} className="p-1 -ml-1 rounded-full hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
                      <h2 className="text-xl font-bold capitalize">{activeTab}</h2>
                    </div>
                    <div className="py-12 text-center text-muted-foreground">
                      This view is not yet implemented.
                    </div>
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
