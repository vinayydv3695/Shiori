import React, { useState, useEffect } from 'react';
import { useUpdateStore } from '@/store/updateStore';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { relaunch } from '@tauri-apps/plugin-process';
import { isAndroid } from '@/lib/tauri';
import { Download, RefreshCw, X, Sparkles, ArrowRight, Zap, CheckCircle2, Terminal } from 'lucide-react';
import { logger } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  },
};

// A simple floating particle component
const FloatingParticles = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-primary/30"
          initial={{
            x: Math.random() * 500,
            y: Math.random() * 300 + 100,
            opacity: 0
          }}
          animate={{
            y: [null, Math.random() * -100 - 50],
            opacity: [0, 0.8, 0],
            scale: [0.5, 1.5, 0.5]
          }}
          transition={{
            duration: Math.random() * 3 + 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: Math.random() * 2
          }}
        />
      ))}
    </div>
  );
};

export function UpdateDialog() {
  const { isUpdateDialogOpen, setIsUpdateDialogOpen, updateInfo } = useUpdateStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Confetti trigger effect (simulated via Framer Motion)
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isUpdateDialogOpen) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isUpdateDialogOpen]);

  if (!updateInfo) return null;

  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      setError(null);

      if (isAndroid) {
        if (updateInfo.apkUrl) {
          const { checkPermissions, requestPermissions, install } = await import('@kingsword/tauri-plugin-android-package-install');
          const { fetch } = await import('@tauri-apps/plugin-http');
          const { BaseDirectory, writeFile, remove } = await import('@tauri-apps/plugin-fs');
          const { appLocalDataDir } = await import('@tauri-apps/api/path');

          const perm = await checkPermissions();
          if (perm !== 'granted') {
            await requestPermissions();
          }

          const response = await fetch(updateInfo.apkUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/vnd.android.package-archive'
            }
          });

          if (!response.ok) {
            throw new Error(`Failed to download APK: ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const apkName = 'update.apk';
          
          try {
            await remove(apkName, { baseDir: BaseDirectory.AppLocalData });
          } catch (e) {
            // Ignore if file doesn't exist
          }

          await writeFile(apkName, new Uint8Array(arrayBuffer), { baseDir: BaseDirectory.AppLocalData });
          
          const localDataDir = await appLocalDataDir();
          const fullApkPath = `${localDataDir}/${apkName}`;
          
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
          setError('Invalid update object.');
        }
      }
    } catch (err) {
      logger.error('[UpdateDialog] Failed to update:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <AnimatePresence>
      {isUpdateDialogOpen && (
        <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
          <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden border-none bg-transparent shadow-[0_0_100px_rgba(var(--primary),0.15)]">
            <motion.div 
              className="relative bg-surface-1/95 backdrop-blur-2xl border border-border/40 rounded-[1.5rem] overflow-hidden flex flex-col max-h-[85vh] shadow-2xl"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* Background Accents */}
              <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-br from-primary/20 via-purple-500/10 to-transparent pointer-events-none opacity-60" />
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/20 rounded-full blur-[80px] pointer-events-none" />
              
              <FloatingParticles />
              
              <button 
                onClick={() => setIsUpdateDialogOpen(false)}
                className="absolute top-5 right-5 z-20 p-2 rounded-full bg-background/40 hover:bg-background/80 text-muted-foreground hover:text-foreground backdrop-blur-md transition-all border border-transparent hover:border-border/50"
              >
                <X size={16} />
              </button>

              <div className="px-8 pt-12 pb-8 relative z-10">
                {/* Header Section */}
                <motion.div variants={itemVariants} className="flex items-start gap-5 mb-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full" />
                    <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-background to-secondary flex items-center justify-center border border-primary/20 shadow-inner">
                      <Sparkles className="w-7 h-7 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1 pt-1">
                    <h2 className="text-3xl font-bold text-foreground tracking-tight mb-1 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Update Available</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground font-medium">Shiori Version</span>
                      <span className="bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-md text-sm font-bold shadow-sm">
                        {updateInfo.version}
                      </span>
                    </div>
                  </div>
                </motion.div>
                
                {/* Release Notes Box */}
                <motion.div variants={itemVariants} className="mt-8 flex-1 min-h-0 relative">
                  <div className="absolute -inset-1 bg-gradient-to-b from-primary/10 to-transparent rounded-2xl pointer-events-none blur-sm" />
                  <div className="relative bg-background/60 border border-border/40 rounded-xl overflow-hidden backdrop-blur-md h-[320px] shadow-inner flex flex-col">
                    <div className="px-5 py-3.5 border-b border-border/40 bg-secondary/20 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-bold tracking-wide text-foreground/90 uppercase">What's New</span>
                    </div>
                    <ScrollArea className="flex-1 w-full">
                      <div className="px-6 py-5">
                        <div className="prose prose-sm dark:prose-invert prose-p:leading-relaxed max-w-none">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-2 mb-4 text-foreground" {...props} />,
                              h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-6 mb-3 text-foreground border-b border-border/30 pb-2" {...props} />,
                              h3: ({node, ...props}) => <h3 className="text-base font-semibold mt-4 mb-2 text-foreground" {...props} />,
                              ul: ({node, ...props}) => <ul className="space-y-2 mb-4" {...props} />,
                              li: ({node, children, ...props}) => (
                                <li className="flex items-start gap-2.5 m-0" {...props}>
                                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                  <span className="text-muted-foreground/90">{children}</span>
                                </li>
                              ),
                              a: ({node, ...props}) => <a className="text-primary hover:text-primary/80 font-medium underline underline-offset-2" {...props} />,
                              strong: ({node, ...props}) => <strong className="font-semibold text-foreground" {...props} />,
                              code: ({node, inline, ...props}) => 
                                inline ? (
                                  <code className="bg-secondary/60 text-secondary-foreground px-1.5 py-0.5 rounded-md text-xs font-mono border border-border/40" {...props} />
                                ) : (
                                  <div className="relative group rounded-xl overflow-hidden my-4 border border-border/40">
                                    <div className="absolute top-0 left-0 right-0 h-8 bg-secondary/80 flex items-center px-3 border-b border-border/40">
                                      <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                    <pre className="bg-background/80 p-4 pt-12 overflow-x-auto text-xs font-mono" {...props} />
                                  </div>
                                ),
                              table: ({node, ...props}) => (
                                <div className="w-full overflow-x-auto my-6 rounded-xl border border-border/40 bg-secondary/10 shadow-sm">
                                  <table className="w-full text-left border-collapse text-sm" {...props} />
                                </div>
                              ),
                              th: ({node, ...props}) => <th className="bg-secondary/40 font-semibold p-3 border-b border-border/40 text-foreground" {...props} />,
                              td: ({node, ...props}) => <td className="p-3 border-b border-border/20 text-muted-foreground last:border-b-0" {...props} />,
                            }}
                          >
                            {updateInfo.notes}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </ScrollArea>
                  </div>
                </motion.div>

                {/* Error Banner */}
                <AnimatePresence>
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0, y: -10 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -10 }}
                      className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Footer Buttons */}
                <motion.div variants={itemVariants} className="mt-8 flex flex-col-reverse sm:flex-row gap-3 items-center justify-end">
                  <Button 
                    variant="ghost" 
                    onClick={() => setIsUpdateDialogOpen(false)}
                    disabled={isUpdating}
                    className="w-full sm:w-auto hover:bg-secondary/60 text-muted-foreground font-medium rounded-xl h-11 px-6"
                  >
                    Remind Me Later
                  </Button>
                  <Button 
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className="w-full sm:w-auto relative group overflow-hidden bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_4px_14px_0_rgba(var(--primary),0.39)] hover:shadow-[0_6px_20px_rgba(var(--primary),0.23)] hover:-translate-y-0.5 transition-all duration-200 rounded-xl h-11 px-8 font-semibold"
                  >
                    {/* Animated Shine Effect */}
                    <span className="absolute top-0 -left-[100%] w-[120%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg] animate-[shine_3s_infinite_ease-in-out]" />
                    
                    <span className="relative flex items-center justify-center gap-2">
                      {isUpdating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Downloading Update...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>{isAndroid ? 'Install Now' : 'Install & Restart'}</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </span>
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
