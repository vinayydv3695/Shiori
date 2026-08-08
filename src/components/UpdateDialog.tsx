import React, { useState, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useUpdateStore, type UpdateInfo } from '@/store/updateStore';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Zap, 
  CheckCircle2, 
  Terminal, 
  Rocket, 
  Palette, 
  SlidersHorizontal, 
  ShieldCheck, 
  Layers, 
  BookOpen, 
  ExternalLink 
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';

const DEFAULT_LATEST_RELEASE_NOTES = `
### 🎨 UI & Reader Aesthetic Overhaul
* **Manga Reader Dual Themes**: Full support for **Warm Sepia** (\`#FAF6EC\` / \`#2C1E0F\`) and **OLED Midnight** (\`#000000\` / \`#09090b\`) reading modes.
* **Centered Chapter & Volume Dropdown**: Redesigned 100% solid, fully opaque chapter dropdown with instant search and ascending/descending sorting.
* **Minimal Manga Sidebar**: Sleek horizontal segmented mode controls (\`Single\`, \`Strip\`, \`Webtoon\`, \`Manhwa\`, \`Comic\`), page selector, and auto-scroll speed gauge.
* **Advanced Reader Settings Modal**: Upgraded tabbed layout preferences, scan fit modes (\`Fit Screen\`, \`Fit Width\`, \`Fit Height\`, \`Original\`), and keybindings.
* **Radix UI Select Architecture**: Replaced all raw native dropdowns across Settings, Voice Manager, Smart Shelves, and Reader with custom Radix Selects.

### 🔞 Privacy & Content Filters
* **Global NSFW Filter**: Introduced an app-wide NSFW filter toggle in Settings (enabled by default) to filter adult manga and content metadata.

### ⚡ Performance & Engine Upgrades
* **Zero-Ghosting Reader Canvas**: Solid, GPU-accelerated panels eliminating subpixel ghosting and manga page bleed-through.
* **Memory & Cache Management**: Configurable preload cache intensity (\`Light\`, \`Normal\`, \`Aggressive\`) with balanced memory usage.
* **Cross-Platform Fixes**: Polished Android SAF file handling and responsive mobile sheets.
`;

const containerVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 350,
      damping: 28,
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: 0.2 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { type: 'spring' as const, stiffness: 350, damping: 25 }
  },
};

export function UpdateDialog() {
  const { isUpdateDialogOpen, setIsUpdateDialogOpen, updateInfo, setUpdateInfo } = useUpdateStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number | null } | null>(null);
  const [activeTab, setActiveTab] = useState<'highlights' | 'raw'>('highlights');

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
    if (!updateInfo?.notes || updateInfo.notes.trim().length < 30 || updateInfo.notes.trim() === `Shiori v${updateInfo.version}`) {
      return DEFAULT_LATEST_RELEASE_NOTES;
    }
    const parts = updateInfo.notes.split(/Download the appropriate installer for your platform:/i);
    const cleaned = parts[0].trim();
    return cleaned.length > 20 ? cleaned : DEFAULT_LATEST_RELEASE_NOTES;
  }, [updateInfo?.notes, updateInfo?.version]);

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
          // In dev mode or simulated updates
          setDownloadProgress({ downloaded: 12400000, total: 24800000 });
          setTimeout(() => {
            setDownloadProgress({ downloaded: 24800000, total: 24800000 });
            setTimeout(() => {
              setIsUpdating(false);
              setIsUpdateDialogOpen(false);
            }, 1000);
          }, 1500);
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
          <DialogContent className="sm:max-w-[680px] p-0 overflow-hidden border-none bg-transparent shadow-[0_0_80px_rgba(0,0,0,0.6)]">
            <motion.div 
              className="relative bg-[#121217] text-white border border-white/15 rounded-3xl overflow-hidden flex flex-col max-h-[88vh] shadow-2xl ring-1 ring-white/10"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* Top Gradient Glow Accent */}
              <div className="absolute top-0 left-0 right-0 h-44 bg-gradient-to-b from-amber-500/15 via-orange-500/5 to-transparent pointer-events-none" />
              <div className="absolute -top-20 -right-20 w-56 h-56 bg-amber-500/20 rounded-full blur-[70px] pointer-events-none" />

              {/* Close Button */}
              <button 
                onClick={() => setIsUpdateDialogOpen(false)}
                className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white backdrop-blur-md transition-all border border-white/10"
                title="Close (Esc)"
              >
                <X size={16} />
              </button>

              <div className="p-7 sm:p-8 flex flex-col flex-1 min-h-0 relative z-10">
                {/* Header Section */}
                <motion.div variants={itemVariants} className="flex items-start gap-4 sm:gap-5 mb-5">
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 bg-amber-400/25 blur-lg rounded-2xl animate-pulse" />
                    <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1e1e26] to-[#121217] flex items-center justify-center border border-amber-400/30 shadow-inner">
                      <Rocket className="w-7 h-7 text-amber-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                        Update Available
                      </h2>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400/15 border border-amber-400/30 text-amber-300 shadow-xs">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        v{updateInfo.version}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/60 mt-1">
                      A new version of Shiori is ready with improved reader aesthetics and features.
                    </p>
                  </div>
                </motion.div>

                {/* Release Notes / What's New Box */}
                <motion.div variants={itemVariants} className="flex-1 min-h-0 flex flex-col relative rounded-2xl border border-white/10 bg-[#0d0d12]/90 overflow-hidden shadow-inner">
                  {/* Notes Header */}
                  <div className="px-5 py-3 border-b border-white/10 bg-white/[0.03] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold tracking-wider uppercase text-white/90">
                        What's New in v{updateInfo.version}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-white/40">Release Highlights</span>
                  </div>

                  {/* Scrollable Markdown Changelog */}
                  <ScrollArea className="flex-1 w-full max-h-[42vh] sm:max-h-[300px]">
                    <div className="p-5 space-y-4">
                      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({node, ...props}) => <h1 className="text-lg font-bold text-white mt-3 mb-2 flex items-center gap-2" {...props} />,
                            h2: ({node, ...props}) => (
                              <h2 className="text-sm font-bold text-amber-300 mt-4 mb-2 pb-1 border-b border-white/10 uppercase tracking-wide flex items-center gap-2" {...props} />
                            ),
                            h3: ({node, ...props}) => (
                              <h3 className="text-xs font-bold text-amber-200/90 mt-3 mb-1.5 uppercase tracking-wider flex items-center gap-1.5" {...props} />
                            ),
                            ul: ({node, ...props}) => <ul className="space-y-2 my-2 list-none p-0" {...props} />,
                            li: ({node, children, ...props}) => (
                              <li className="flex items-start gap-2.5 text-xs text-white/85 leading-relaxed" {...props}>
                                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">{children}</div>
                              </li>
                            ),
                            strong: ({node, ...props}) => <strong className="font-semibold text-white" {...props} />,
                            code: ({node, ...props}) => (
                              <code className="bg-white/10 text-amber-200 px-1.5 py-0.5 rounded text-[11px] font-mono border border-white/10" {...props} />
                            ),
                            blockquote: ({node, ...props}) => (
                              <blockquote className="border-l-2 border-amber-400/50 pl-3 my-2 text-xs italic text-white/60 bg-amber-400/5 py-1.5 rounded-r-lg" {...props} />
                            ),
                          }}
                        >
                          {cleanNotes}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </ScrollArea>
                </motion.div>

                {/* Live Download Progress Bar (When Updating) */}
                {isUpdating && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="flex items-center gap-2 text-amber-300">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Downloading Update Package...
                      </span>
                      <span className="font-mono text-white/80 font-semibold">
                        {progressPercentage ? `${progressPercentage}%` : 'Processing...'}
                      </span>
                    </div>

                    <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden relative">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 rounded-full transition-all duration-300"
                        style={{ width: progressPercentage ? `${progressPercentage}%` : '60%' }}
                      />
                    </div>

                    {downloadProgress && (
                      <div className="text-[11px] font-mono text-white/50 text-right">
                        {(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} MB {downloadProgress.total ? `/ ${(downloadProgress.total / 1024 / 1024).toFixed(1)} MB` : ''}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Error Banner */}
                <AnimatePresence>
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0, y: -8 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -8 }}
                      className="mt-4 p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs font-medium flex items-center gap-2.5"
                    >
                      <X className="w-4 h-4 text-red-400 shrink-0" />
                      <div className="flex-1 min-w-0">{error}</div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Footer Buttons */}
                <motion.div variants={itemVariants} className="mt-6 pt-4 border-t border-white/10 flex flex-col-reverse sm:flex-row gap-3 items-center justify-end">
                  <button 
                    onClick={() => setIsUpdateDialogOpen(false)}
                    disabled={isUpdating}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors border border-transparent hover:border-white/10 disabled:opacity-50"
                  >
                    Remind Me Later
                  </button>

                  <button 
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className="w-full sm:w-auto relative group overflow-hidden bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-bold text-xs rounded-xl px-7 py-3 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {/* Animated Shine Effect */}
                    <span className="absolute top-0 -left-[100%] w-[120%] h-full bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg] group-hover:left-[100%] transition-all duration-700 pointer-events-none" />

                    {isUpdating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-black" />
                        <span>Installing Update...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 stroke-[2.5]" />
                        <span>{isAndroid ? 'Install Now' : 'Install & Restart'}</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform stroke-[2.5]" />
                      </>
                    )}
                  </button>
                </motion.div>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
