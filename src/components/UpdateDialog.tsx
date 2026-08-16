import React, { useState, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useUpdateStore } from '@/store/updateStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { relaunch } from '@tauri-apps/plugin-process';
import { isAndroid } from '@/lib/tauri';
import { 
  Download, 
  RefreshCw, 
  FolderKanban,
  Sparkles,
  Smartphone,
  Zap,
  X
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

function stripEmojis(text: string): string {
  if (!text) return ''
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface HighlightItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}

const DEFAULT_HIGHLIGHTS: HighlightItem[] = [
  {
    icon: FolderKanban,
    title: '3D Shelves & Collection Overhaul',
    desc: 'Dynamic 3D cover presentations, 3-dot touch menus, live search & filter chips (All, Favorites, Smart, Empty), and sort dropdowns.',
  },
  {
    icon: Sparkles,
    title: 'Smart Shelf Templates & Inside View',
    desc: '1-click shelf creation templates, Grid vs. List view switcher, reading progress badges, and batch multi-select book removal.',
  },
  {
    icon: Smartphone,
    title: 'Dedicated Android Touch Experience',
    desc: 'Platform-isolated touch flows for History, Annotations, safe-area inset fallbacks, and bottom navigation clearance across all views.',
  },
  {
    icon: Zap,
    title: 'Performance & Progress Optimization',
    desc: 'Instant Home dashboard rendering using batch reading progress queries, collapsing 20 IPC roundtrips into a single query.',
  },
];

const DEFAULT_LATEST_RELEASE_NOTES = `
* **Shelves Overhaul (Desktop & Android)**: 3D book spine mockups, dynamic cover fan stacks, rich empty cards with "+ Add Books" actions, 3-dot action menus, search & filter chips bar (All, Favorites, Smart, With Books, Empty), and sort dropdowns.
* **Smart Shelf Presets**: 1-click templates for Currently Reading, Top Favorites, Manga & Comics, Novels & Fiction, and Plan to Read in shelf creation.
* **Inside-Shelf View & Batch Actions**: Added Grid vs. List view switcher, in-shelf search/sort, reading progress % badges, and batch multi-select book removal.
* **Platform Separation & Touch Polish**: Android touch isolation for History, Annotations, and Shelf cards with touch targets (≥36px).
* **Safe-Area Inset & Navigation Clearance**: Unified safe-area insets (\`env(safe-area-inset-*)\`) and bottom clearance (\`pb-28\`) across Library, Shelves, Online Manga, Online Books, and fullscreen dialogs.
* **Performance Optimization**: Collapsed sequential progress checks in Home tab to \`getReadingProgressBatch()\`, eliminating 20 IPC roundtrips per load.
`;

export function UpdateDialog() {
  const { isUpdateDialogOpen, setIsUpdateDialogOpen, updateInfo, setUpdateInfo } = useUpdateStore();
  const theme = usePreferencesStore(s => s.preferences?.theme ?? 'dark');
  const isLight = (theme as string) === 'light' || (theme as string) === 'sepia' || (theme as string) === 'white' || (theme as string) === 'paper';

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number | null } | null>(null);

  // Expose a developer helper on window to test and preview the Update Dialog in local development
  useEffect(() => {
    (window as any).__testUpdateDialog = (customVersion?: string, customNotes?: string) => {
      setUpdateInfo({
        version: customVersion || '2.3.28',
        notes: customNotes || DEFAULT_LATEST_RELEASE_NOTES,
      });
      setIsUpdateDialogOpen(true);
    };

    return () => {
      delete (window as any).__testUpdateDialog;
    };
  }, [setUpdateInfo, setIsUpdateDialogOpen]);

  const cleanNotes = useMemo(() => {
    if (!updateInfo?.notes) return '';
    const parts = updateInfo.notes.split(/Download the appropriate installer for your platform:/i);
    return stripEmojis(parts[0].trim());
  }, [updateInfo?.notes]);

  const isCustomMarkdown = useMemo(() => {
    if (!cleanNotes || cleanNotes.length < 20) return false;
    if (cleanNotes === `Shiori v${updateInfo?.version}` || cleanNotes === `v${updateInfo?.version}`) return false;
    return true;
  }, [cleanNotes, updateInfo?.version]);

  if (!updateInfo) return null;

  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      setError(null);

      if (isAndroid) {
        if (updateInfo.apkUrl) {
          const { invoke } = await import('@tauri-apps/api/core');
          const { checkPermissions, requestPermissions, install } = await import('@kingsword/tauri-plugin-android-package-install');
          
          const perm = await checkPermissions();
          if (perm !== 'granted') {
            await requestPermissions();
          }

          const unlisten = await listen<{ downloaded: number; total: number | null }>('download_progress', (event) => {
            setDownloadProgress(event.payload);
          });

          const fullApkPath = await invoke<string>('download_apk', { url: updateInfo.apkUrl, expectedSha256: updateInfo.apkSha256 });
          unlisten();
          
          await install(fullApkPath);
          setIsUpdateDialogOpen(false);
        } else {
          setError('No APK download URL available.');
        }
      } else {
        if (updateInfo.desktopUpdate) {
          await updateInfo.desktopUpdate.downloadAndInstall();
          await relaunch();
        } else {
          // Simulated progress for preview / dev
          setDownloadProgress({ downloaded: 14200000, total: 24800000 });
          setTimeout(() => {
            setDownloadProgress({ downloaded: 24800000, total: 24800000 });
            setTimeout(() => {
              setIsUpdating(false);
              setIsUpdateDialogOpen(false);
            }, 800);
          }, 1200);
        }
      }
    } catch (err) {
      logger.error('[UpdateDialog] Failed to update:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (updateInfo.desktopUpdate) {
        setIsUpdating(false);
      }
    }
  };

  const progressPercentage = downloadProgress && downloadProgress.total
    ? Math.min(100, Math.round((downloadProgress.downloaded / downloadProgress.total) * 100))
    : null;

  return (
    <AnimatePresence>
      {isUpdateDialogOpen && (
        <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
          <DialogContent className="sm:max-w-[580px] w-[94vw] !p-0 overflow-hidden !border-none !bg-transparent shadow-none [&>button]:hidden">
            <motion.div 
              className={cn(
                "relative rounded-3xl overflow-hidden flex flex-col max-h-[88vh] shadow-2xl transition-colors border",
                isLight
                  ? "bg-[#FAF6EC] text-[#2C1E0F] border-[#E2D5B8] shadow-2xl shadow-[#5C4430]/20"
                  : "bg-[#0e0e12] text-white border-white/10 shadow-2xl shadow-black/80"
              )}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {/* Top Accent Light */}
              <div className={cn(
                "absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-36 rounded-full blur-[60px] pointer-events-none",
                isLight ? "bg-[#A0522D]/8" : "bg-amber-500/10"
              )} />

              {/* Theme-Adaptive Close Button */}
              <button 
                onClick={() => setIsUpdateDialogOpen(false)}
                className={cn(
                  "absolute top-5 right-5 z-20 p-2 rounded-full transition-colors",
                  isLight 
                    ? "text-[#7D634B] hover:text-[#2C1E0F] hover:bg-[#EAE0CB]" 
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                )}
                title="Close (Esc)"
              >
                <X size={16} />
              </button>

              <div className="p-6 sm:p-7 flex flex-col flex-1 min-h-0 relative z-10 space-y-5">
                {/* Minimal Header */}
                <div className="flex items-center gap-3.5 pr-8">
                  <div className={cn(
                    "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border",
                    isLight 
                      ? "bg-[#F0E6CE] border-[#E2D5B8] text-[#A0522D]" 
                      : "bg-amber-400/10 border-amber-400/20 text-amber-400"
                  )}>
                    <Download className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className={cn(
                        "text-lg font-semibold tracking-tight",
                        isLight ? "text-[#2C1E0F]" : "text-white"
                      )}>
                        Update Available
                      </h2>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[11px] font-medium border",
                        isLight 
                          ? "bg-[#F0E6CE] text-[#5C4430] border-[#E2D5B8]" 
                          : "bg-white/10 text-zinc-300 border-white/10"
                      )}>
                        v{updateInfo.version}
                      </span>
                    </div>
                    <p className={cn(
                      "text-xs mt-0.5",
                      isLight ? "text-[#7D634B]" : "text-zinc-400"
                    )}>
                      A new version of Shiori is ready to install.
                    </p>
                  </div>
                </div>

                {/* What's New Highlights (Dedicated Header Strip & Clean Borders) */}
                <div className={cn(
                  "rounded-2xl border overflow-hidden flex flex-col max-h-[46vh]",
                  isLight 
                    ? "border-[#E2D5B8] bg-[#F7F2E6] text-[#2C1E0F]" 
                    : "border-white/10 bg-white/[0.02] text-white"
                )}>
                  {/* Clean Fixed Header Strip */}
                  <div className={cn(
                    "px-5 py-3 border-b shrink-0 flex items-center justify-between text-[11px] font-semibold tracking-wider uppercase",
                    isLight 
                      ? "bg-[#F0E6CE]/80 border-[#E2D5B8] text-[#7D634B]" 
                      : "bg-white/[0.04] border-white/10 text-zinc-400"
                  )}>
                    <span>What's New</span>
                    <span className={cn("text-[10px] font-normal lowercase tracking-normal", isLight ? "text-[#8A6A50]" : "text-zinc-500")}>
                      release highlights
                    </span>
                  </div>

                  {/* Padded Scrollable Content */}
                  <div className="p-5 overflow-y-auto custom-scrollbar space-y-3.5 flex-1 min-h-0">
                    {isCustomMarkdown && cleanNotes ? (
                      <div className="prose prose-xs max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({node, children, ...props}) => <h3 className={cn("text-xs font-semibold mt-3 mb-1", isLight ? "text-[#2C1E0F]" : "text-white")} {...props}>{stripEmojis(String(children))}</h3>,
                            h2: ({node, children, ...props}) => <h3 className={cn("text-xs font-semibold mt-3 mb-1", isLight ? "text-[#2C1E0F]" : "text-white")} {...props}>{stripEmojis(String(children))}</h3>,
                            h3: ({node, children, ...props}) => <h4 className={cn("text-xs font-medium mt-2 mb-1", isLight ? "text-[#5C4430]" : "text-zinc-300")} {...props}>{stripEmojis(String(children))}</h4>,
                            ul: ({node, ...props}) => <ul className="space-y-2.5 my-1 list-none p-0" {...props} />,
                            li: ({node, children, ...props}) => (
                              <li className={cn("flex items-start gap-2.5 text-xs leading-relaxed", isLight ? "text-[#5C4430]" : "text-zinc-300")} {...props}>
                                <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", isLight ? "bg-[#A0522D]" : "bg-amber-400/80")} />
                                <div className="flex-1 min-w-0">{children}</div>
                              </li>
                            ),
                            strong: ({node, children, ...props}) => <strong className={cn("font-medium", isLight ? "text-[#2C1E0F]" : "text-white")} {...props}>{children}</strong>,
                            code: ({node, children, ...props}) => (
                              <span className={cn("font-mono text-[11px] px-1.5 py-0.5 rounded", isLight ? "bg-[#EAE0CB] text-[#2C1E0F]" : "bg-white/10 text-zinc-300")} {...props}>{children}</span>
                            ),
                          }}
                        >
                          {cleanNotes}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {DEFAULT_HIGHLIGHTS.map((item, idx) => {
                          const Icon = item.icon;
                          return (
                            <div key={idx} className="flex items-start gap-3 p-1 rounded-xl">
                              <div className={cn(
                                "p-1.5 rounded-lg mt-0.5 shrink-0",
                                isLight ? "bg-[#F0E6CE] text-[#A0522D]" : "bg-white/5 text-amber-400"
                              )}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0 text-xs">
                                <div className={cn(
                                  "font-medium tracking-tight",
                                  isLight ? "text-[#2C1E0F]" : "text-white"
                                )}>
                                  {item.title}
                                </div>
                                <div className={cn(
                                  "text-[11px] leading-relaxed mt-0.5",
                                  isLight ? "text-[#7D634B]" : "text-zinc-400"
                                )}>
                                  {item.desc}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar (when updating) */}
                {isUpdating && (
                  <div className={cn(
                    "p-3.5 rounded-2xl border space-y-2",
                    isLight ? "bg-[#F0E6CE] border-[#E2D5B8]" : "bg-white/[0.03] border-white/10"
                  )}>
                    <div className="flex items-center justify-between text-xs">
                      <span className={cn(
                        "flex items-center gap-2",
                        isLight ? "text-[#2C1E0F]" : "text-zinc-300"
                      )}>
                        <RefreshCw className={cn("w-3 h-3 animate-spin", isLight ? "text-[#A0522D]" : "text-amber-400")} />
                        Downloading update...
                      </span>
                      <span className={cn("font-mono text-[11px]", isLight ? "text-[#7D634B]" : "text-zinc-400")}>
                        {progressPercentage ? `${progressPercentage}%` : ''}
                      </span>
                    </div>
                    <div className={cn("w-full h-1.5 rounded-full overflow-hidden", isLight ? "bg-[#E2D5B8]" : "bg-white/10")}>
                      <div 
                        className={cn("h-full rounded-full transition-all duration-300", isLight ? "bg-[#A0522D]" : "bg-amber-400")}
                        style={{ width: progressPercentage ? `${progressPercentage}%` : '50%' }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                    <X className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Clean, single-divider footer */}
                <div className={cn(
                  "pt-3 border-t flex items-center justify-between sm:justify-end gap-3",
                  isLight ? "border-[#E2D5B8]/60" : "border-white/10"
                )}>
                  <button 
                    onClick={() => setIsUpdateDialogOpen(false)}
                    disabled={isUpdating}
                    className={cn(
                      "h-10 px-4 rounded-xl text-xs font-medium transition-colors disabled:opacity-50",
                      isLight 
                        ? "text-[#7D634B] hover:text-[#2C1E0F] hover:bg-[#EAE0CB]" 
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    Remind Me Later
                  </button>

                  <button 
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className={cn(
                      "h-10 px-5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer shrink-0 whitespace-nowrap",
                      isLight
                        ? "bg-[#A0522D] hover:bg-[#8B4513] text-white"
                        : "bg-amber-400 hover:bg-amber-300 text-black"
                    )}
                  >
                    {isUpdating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>{isAndroid ? 'Install Now' : 'Install & Restart'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
