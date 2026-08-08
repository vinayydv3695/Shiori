import React, { useState, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useUpdateStore } from '@/store/updateStore';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { relaunch } from '@tauri-apps/plugin-process';
import { isAndroid } from '@/lib/tauri';
import { 
  Download, 
  RefreshCw, 
  X, 
  Sparkles, 
  ArrowRight, 
  Check, 
  Palette, 
  ShieldCheck, 
  Sliders, 
  Zap 
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';

interface HighlightItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}

const DEFAULT_HIGHLIGHTS: HighlightItem[] = [
  {
    icon: Palette,
    title: 'Warm Sepia & OLED Midnight Themes',
    desc: 'Dedicated high-contrast paper cream and true black reading modes.',
  },
  {
    icon: Sliders,
    title: 'Minimal Reader Sidebar & Controls',
    desc: 'Clean segmented mode switcher, centered chapter selector, and auto-scroll.',
  },
  {
    icon: ShieldCheck,
    title: 'App-Wide NSFW Content Filter',
    desc: 'Customizable privacy toggle in Settings to filter adult manga and catalogs.',
  },
  {
    icon: Zap,
    title: 'Smoother Reading Engine',
    desc: 'Zero-ghosting solid canvas, configurable cache preloading, and faster page turns.',
  },
];

const DEFAULT_LATEST_RELEASE_NOTES = `
* **Warm Sepia & OLED Midnight Themes**: Dedicated paper cream and true black reading modes.
* **Minimal Reader Sidebar & Controls**: Clean segmented mode switcher, centered chapter selector, and auto-scroll.
* **App-Wide NSFW Content Filter**: Customizable privacy toggle in Settings to filter adult manga and catalogs.
* **Smoother Reading Engine**: Zero-ghosting solid canvas, configurable cache preloading, and faster page turns.
* **Refined Dropdowns**: Custom accessible menus across Settings, Shelves, and Reader.
`;

export function UpdateDialog() {
  const { isUpdateDialogOpen, setIsUpdateDialogOpen, updateInfo, setUpdateInfo } = useUpdateStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number | null } | null>(null);

  // Expose a developer helper on window to test and preview the Update Dialog in local development
  useEffect(() => {
    (window as any).__testUpdateDialog = (customVersion?: string, customNotes?: string) => {
      setUpdateInfo({
        version: customVersion || '2.3.7',
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
    return parts[0].trim();
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

          const fullApkPath = await invoke<string>('download_apk', { url: updateInfo.apkUrl });
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
          <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden border-none bg-transparent shadow-[0_0_60px_rgba(0,0,0,0.5)]">
            <motion.div 
              className="relative bg-[#0e0e12] text-white border border-white/[0.08] rounded-3xl overflow-hidden flex flex-col max-h-[86vh] shadow-2xl"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {/* Subtle Ambient Glow */}
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-40 bg-amber-500/10 rounded-full blur-[70px] pointer-events-none" />

              {/* Close Button */}
              <button 
                onClick={() => setIsUpdateDialogOpen(false)}
                className="absolute top-5 right-5 z-20 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Close (Esc)"
              >
                <X size={16} />
              </button>

              <div className="p-7 sm:p-8 flex flex-col flex-1 min-h-0 relative z-10 space-y-6">
                {/* Minimal Header */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold tracking-tight text-white">
                        Update Available
                      </h2>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-zinc-300">
                        v{updateInfo.version}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      A new version of Shiori is ready to install.
                    </p>
                  </div>
                </div>

                {/* What's New Highlights (Minimal, calm, readable) */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4.5 space-y-3.5 max-h-[46vh] overflow-y-auto custom-scrollbar">
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400 px-1">
                    What's New
                  </div>

                  {isCustomMarkdown && cleanNotes ? (
                    <div className="prose prose-invert prose-xs max-w-none px-1">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({node, ...props}) => <h3 className="text-xs font-bold text-white mt-3 mb-1" {...props} />,
                          h2: ({node, ...props}) => <h3 className="text-xs font-bold text-white mt-3 mb-1" {...props} />,
                          h3: ({node, ...props}) => <h4 className="text-xs font-semibold text-zinc-300 mt-2 mb-1" {...props} />,
                          ul: ({node, ...props}) => <ul className="space-y-2.5 my-1 list-none p-0" {...props} />,
                          li: ({node, children, ...props}) => (
                            <li className="flex items-start gap-2 text-xs text-zinc-300 leading-relaxed" {...props}>
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                              <div className="flex-1 min-w-0">{children}</div>
                            </li>
                          ),
                          strong: ({node, ...props}) => <strong className="font-semibold text-white" {...props} />,
                          code: ({node, ...props}) => (
                            <span className="font-mono text-zinc-300 text-[11px]" {...props} />
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
                          <div key={idx} className="flex items-start gap-3 p-1.5 rounded-xl hover:bg-white/[0.02] transition-colors">
                            <div className="p-1.5 rounded-lg bg-white/5 text-amber-400 mt-0.5 shrink-0">
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0 text-xs">
                              <div className="font-semibold text-white tracking-tight">
                                {item.title}
                              </div>
                              <div className="text-zinc-400 text-[11px] leading-relaxed mt-0.5">
                                {item.desc}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Progress bar (when updating) */}
                {isUpdating && (
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                        Downloading update...
                      </span>
                      <span className="font-mono text-zinc-400 text-[11px]">
                        {progressPercentage ? `${progressPercentage}%` : ''}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div 
                        className="h-full bg-amber-400 rounded-full transition-all duration-300"
                        style={{ width: progressPercentage ? `${progressPercentage}%` : '50%' }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                    <X className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Minimal Footer */}
                <div className="pt-2 flex items-center justify-end gap-3">
                  <button 
                    onClick={() => setIsUpdateDialogOpen(false)}
                    disabled={isUpdating}
                    className="px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    Remind Me Later
                  </button>

                  <button 
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-black transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
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
