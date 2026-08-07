import { useState, useDeferredValue, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTTS } from '@/hooks/useTTS';
import { logger } from '@/lib/logger';
import { isLinux, isTauri, isAndroid, api, type VoiceInfo } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { getErrorMessage } from '@/lib/errors';
import { listen } from '@tauri-apps/api/event';
import { Mic, ChevronRight } from 'lucide-react';
import { 
  Volume2, 
  VolumeX, 
  SkipForward, 
  SkipBack, 
  Play, 
  Pause, 
  X,
  Search,
  Check,
  Download,
  Loader2
} from '@/components/icons';

interface PiperDownloadProgressPayload {
  voiceId: string;
  fileName: string;
  downloadedBytes: number;
  totalBytes: number;
}

export interface TTSControlBarProps {
  contentRef: React.RefObject<HTMLElement | null>;
  onChapterEnd?: () => void;
  contentKey?: string | number;
}

function formatLanguageName(code?: string): string {
  if (!code) return 'General';
  try {
    const clean = code.replace('_', '-');
    const parts = clean.split('-');
    const lang = parts[0];
    const region = parts[1];
    const langName = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) || lang;
    if (region) {
      const regionName = new Intl.DisplayNames(['en'], { type: 'region' }).of(region);
      if (regionName) return `${langName} (${regionName})`;
    }
    return langName;
  } catch {
    return code.replace('_', ' ');
  }
}

export function TTSControlBar({ contentRef, onChapterEnd, contentKey }: TTSControlBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceModalTab, setVoiceModalTab] = useState<'installed' | 'discover'>('installed');
  const [searchQuery, setSearchQuery] = useState('');
  const [availablePiperVoices, setAvailablePiperVoices] = useState<VoiceInfo[]>([]);
  const [downloadingVoiceId, setDownloadingVoiceId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { downloadedBytes: number; totalBytes: number }>>({});
  
  const {
    state,
    selectedVoice,
    rate,
    voices,
    totalSentences,
    currentSentenceIndex,
    isAvailable,
    setVoice,
    setRate,
    play,
    pause,
    resume,
    stop,
    nextSentence,
    prevSentence,
  } = useTTS({ contentRef, onChapterEnd, contentKey });

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const { groupedVoices, sortedLangs } = useMemo(() => {
    const q = deferredSearchQuery.toLowerCase().trim();
    const filteredVoices = voices.filter(v => 
      !q || 
      v.name.toLowerCase().includes(q) || 
      (v.lang && (v.lang.toLowerCase().includes(q) || formatLanguageName(v.lang).toLowerCase().includes(q)))
    );

    const grouped = filteredVoices.reduce((acc, voice) => {
      const langKey = formatLanguageName(voice.lang);
      if (!acc[langKey]) acc[langKey] = [];
      acc[langKey].push(voice);
      return acc;
    }, {} as Record<string, typeof voices>);
    
    return {
      groupedVoices: grouped,
      sortedLangs: Object.keys(grouped).sort()
    };
  }, [voices, deferredSearchQuery]);

  const loadAvailableVoices = useCallback(async () => {
    if (!isTauri || isAndroid) return;
    try {
      const list = await api.getAvailableVoices();
      setAvailablePiperVoices(list);
    } catch (e) {
      logger.error('Failed to load Piper voices in reader:', e);
    }
  }, []);

  useEffect(() => {
    if (showVoiceModal) {
      void loadAvailableVoices();
    }
  }, [showVoiceModal, loadAvailableVoices]);

  useEffect(() => {
    if (!isTauri || isAndroid) return;
    let unlisten: (() => void) | undefined;
    listen<PiperDownloadProgressPayload>('piper:download-progress', (event) => {
      const { voiceId, downloadedBytes, totalBytes } = event.payload;
      setDownloadProgress((prev) => ({
        ...prev,
        [voiceId]: { downloadedBytes, totalBytes },
      }));
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleDownloadVoice = async (voice: VoiceInfo) => {
    if (downloadingVoiceId) return;
    setDownloadingVoiceId(voice.id);
    setDownloadProgress((prev) => ({ ...prev, [voice.id]: { downloadedBytes: 0, totalBytes: 0 } }));
    try {
      await api.downloadVoice(voice);
      useToastStore.getState().addToast({
        title: 'Voice installed',
        description: `${voice.name} is ready for reading.`,
        variant: 'success',
      });
      await loadAvailableVoices();
    } catch (e) {
      logger.error('Failed to download voice:', e);
      useToastStore.getState().addToast({
        title: 'Download failed',
        description: getErrorMessage(e),
        variant: 'error',
      });
    } finally {
      setDownloadingVoiceId(null);
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[voice.id];
        return next;
      });
    }
  };

  const filteredPiperList = useMemo(() => {
    const q = deferredSearchQuery.toLowerCase().trim();
    if (!q) return availablePiperVoices;
    return availablePiperVoices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.lang.toLowerCase().includes(q) ||
        formatLanguageName(v.lang).toLowerCase().includes(q) ||
        v.quality.toLowerCase().includes(q)
    );
  }, [availablePiperVoices, deferredSearchQuery]);

  const handlePlayPause = () => {
    if (state === 'speaking') {
      pause();
    } else if (state === 'paused') {
      resume();
    } else {
      play();
    }
  };

  const progressPercent = totalSentences > 0 ? (currentSentenceIndex / Math.max(1, totalSentences - 1)) * 100 : 0;

  return (
    <>
      {/* Unified Voice Manager Modal */}
      <AnimatePresence>
        {showVoiceModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--ui-border)',
                color: 'var(--text-primary)',
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-6 pt-6 pb-4"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Mic className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                      Audiobook Voices
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Natural offline reading voices for your books
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowVoiceModal(false);
                    setSearchQuery('');
                  }}
                  className="p-2 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Segmented Tabs */}
              <div className="px-6 pb-3">
                <div
                  className="grid grid-cols-2 p-1 rounded-2xl border gap-1"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--ui-border)' }}
                >
                  <button
                    type="button"
                    onClick={() => setVoiceModalTab('installed')}
                    className="py-2 px-3 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: voiceModalTab === 'installed' ? 'var(--bg-elevated)' : 'transparent',
                      color: voiceModalTab === 'installed' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      boxShadow: voiceModalTab === 'installed' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    <span>Installed Voices</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: voiceModalTab === 'installed' ? 'var(--bg-secondary)' : 'var(--ui-border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {voices.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVoiceModalTab('discover')}
                    className="py-2 px-3 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: voiceModalTab === 'discover' ? 'var(--bg-elevated)' : 'transparent',
                      color: voiceModalTab === 'discover' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      boxShadow: voiceModalTab === 'discover' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download More</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: voiceModalTab === 'discover' ? 'var(--bg-secondary)' : 'var(--ui-border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {availablePiperVoices.length > 0 ? availablePiperVoices.length : '120+'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="px-6 pb-3">
                <div className="relative">
                  <Search
                    className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-secondary)' }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      voiceModalTab === 'installed'
                        ? 'Search voices or languages (e.g. English, Spanish)…'
                        : 'Search 120+ neural voices across all languages…'
                    }
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-2xl outline-none transition-all placeholder:opacity-60"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--ui-border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-2 space-y-4">
                {voiceModalTab === 'installed' ? (
                  sortedLangs.length === 0 ? (
                    <div className="py-14 px-4 text-center flex flex-col items-center gap-3">
                      <div
                        className="w-14 h-14 rounded-3xl flex items-center justify-center"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      >
                        <VolumeX className="w-7 h-7" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {searchQuery ? `No voices match "${searchQuery}"` : 'No offline voices installed yet'}
                        </p>
                        <p className="text-xs mt-1 max-w-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Browse and install neural voices to listen to any chapter completely offline.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceModalTab('discover');
                          setSearchQuery('');
                        }}
                        className="mt-2 px-5 py-2.5 text-xs font-semibold rounded-2xl transition-all shadow-md hover:scale-105 active:scale-95 flex items-center gap-2"
                        style={{
                          backgroundColor: 'var(--text-primary)',
                          color: 'var(--bg-primary)',
                        }}
                      >
                        <Download className="w-4 h-4" />
                        Browse 120+ Offline Voices
                      </button>
                    </div>
                  ) : (
                    sortedLangs.map((lang) => (
                      <div key={lang} className="space-y-1.5">
                        <div
                          className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5"
                          style={{
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {lang}
                        </div>
                        <div className="space-y-1">
                          {groupedVoices[lang].map((v) => {
                            const isSelected = selectedVoice?.voiceURI === v.voiceURI;
                            const displayName = v.name.replace(/^Piper\s*—\s*/i, '');
                            return (
                              <button
                                key={v.voiceURI}
                                type="button"
                                onClick={() => {
                                  setVoice(v);
                                  setShowVoiceModal(false);
                                  setSearchQuery('');
                                }}
                                className="w-full text-left px-4 py-3 rounded-2xl transition-all flex items-center justify-between gap-3 hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.995]"
                                style={{
                                  backgroundColor: isSelected ? 'var(--bg-secondary)' : 'transparent',
                                }}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                      {displayName}
                                    </span>
                                    {isSelected && (
                                      <span
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
                                        style={{
                                          backgroundColor: 'var(--text-primary)',
                                          color: 'var(--bg-primary)',
                                        }}
                                      >
                                        <Check className="w-2.5 h-2.5 stroke-[3]" /> Active
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    <span>{formatLanguageName(v.lang)}</span>
                                    <span>•</span>
                                    <span>Offline Neural</span>
                                  </div>
                                </div>

                                <div className="shrink-0">
                                  {isSelected ? (
                                    <div
                                      className="w-7 h-7 rounded-full flex items-center justify-center shadow-xs"
                                      style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)' }}
                                    >
                                      <Check className="w-4 h-4 stroke-[2.5]" />
                                    </div>
                                  ) : (
                                    <div
                                      className="w-7 h-7 rounded-full border flex items-center justify-center opacity-40 hover:opacity-100"
                                      style={{ borderColor: 'var(--ui-border)' }}
                                    >
                                      <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  filteredPiperList.length === 0 ? (
                    <div className="py-14 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                      No voices found matching "{searchQuery}"
                    </div>
                  ) : (
                    filteredPiperList.map((voice) => {
                      const isDownloading = downloadingVoiceId === voice.id;
                      const progress = downloadProgress[voice.id];
                      const downloadedMB = progress ? (progress.downloadedBytes / (1024 * 1024)).toFixed(1) : '0.0';
                      const hasTotal = progress && progress.totalBytes > 0;
                      const pct = hasTotal ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100)) : null;

                      return (
                        <div
                          key={voice.id}
                          className="flex items-center justify-between p-3.5 rounded-2xl border transition-all gap-3"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--ui-border)',
                          }}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                                {voice.name}
                              </span>
                              {voice.is_downloaded && (
                                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                  <Check className="w-3 h-3" /> Installed
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              <span>{voice.lang}</span>
                              <span>•</span>
                              <span className="capitalize">{voice.quality.replace('_', ' ')} quality</span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {voice.is_downloaded ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const uri = `piper:${voice.id}`;
                                  const match = voices.find((v) => v.voiceURI === uri);
                                  if (match) setVoice(match);
                                  setShowVoiceModal(false);
                                  setSearchQuery('');
                                }}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all shadow-xs hover:opacity-90 active:scale-95"
                                style={{
                                  backgroundColor: 'var(--text-primary)',
                                  color: 'var(--bg-primary)',
                                }}
                              >
                                Use Voice
                              </button>
                            ) : isDownloading ? (
                              <div className="flex flex-col items-end gap-1.5 min-w-[130px]">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>{pct !== null ? `${pct}% (${downloadedMB} MB)` : `${downloadedMB} MB`}</span>
                                </div>
                                <div
                                  className="w-full h-1.5 rounded-full overflow-hidden"
                                  style={{ backgroundColor: 'var(--ui-border)' }}
                                >
                                  <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                      width: pct !== null && pct > 0 ? `${pct}%` : '100%',
                                      backgroundColor: 'var(--text-primary)',
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={downloadingVoiceId !== null}
                                onClick={() => handleDownloadVoice(voice)}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 disabled:opacity-50"
                                style={{
                                  borderColor: 'var(--ui-border)',
                                  color: 'var(--text-primary)',
                                  backgroundColor: 'transparent',
                                }}
                              >
                                <Download className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                                Download (~15MB)
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isExpanded && (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            onClick={() => {
              if (isAvailable && voices.length > 0) {
                setIsExpanded(true);
              } else {
                setShowVoiceModal(true);
                setVoiceModalTab('discover');
              }
            }}
            disabled={!isAvailable}
            title={!isAvailable ? 'Text-to-speech not available' : 'Audiobook Mode'}
            className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4 md:right-8 z-50 p-4 rounded-full backdrop-blur-xl shadow-2xl transition-all duration-300 flex items-center justify-center ${
              !isAvailable
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:scale-105 active:scale-95'
            }`}
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--ui-border)'
            }}
          >
            {isAvailable && voices.length > 0 ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="expanded"
            initial={{ y: 150, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 150, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed z-[100] flex flex-col backdrop-blur-2xl shadow-2xl rounded-3xl bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 right-4 mx-auto max-w-[380px] md:bottom-8 md:right-8 md:left-auto p-5 border"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--ui-border)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex justify-between items-center pb-3.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-primary)' }}>
                  Audiobook Mode
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(true)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                  style={{ borderColor: 'var(--ui-border)', color: 'var(--text-secondary)' }}
                  title="Manage Voices"
                >
                  <Mic className="w-3 h-3" />
                  <span>Voices</span>
                </button>
                <button 
                  onClick={() => {
                    stop();
                    setIsExpanded(false);
                  }}
                  className="p-1.5 rounded-lg transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Close Player"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="pb-3">
              <button
                type="button"
                onClick={() => setShowVoiceModal(true)}
                className="w-full flex items-center justify-between p-3 rounded-2xl border transition-all hover:opacity-90 active:scale-[0.99]"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--ui-border)',
                  color: 'var(--text-primary)',
                }}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div
                    className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--ui-border)' }}
                  >
                    <Mic className="w-3.5 h-3.5 opacity-80" />
                  </div>
                  <div className="text-left truncate">
                    <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {selectedVoice ? selectedVoice.name : voices.length > 0 ? 'Select reading voice' : 'No voices installed'}
                    </div>
                    <div className="text-[10px] truncate opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      {selectedVoice ? `${selectedVoice.lang} • Tap to switch` : 'Tap to download offline voices'}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
              </button>
            </div>

            <div className="flex items-center justify-between pb-3.5">
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                Speed
              </span>
              <div
                className="flex items-center gap-1 p-0.5 rounded-xl border"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--ui-border)' }}
              >
                {[0.75, 1.0, 1.25, 1.5, 2.0].map((s) => {
                  const isActive = rate === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRate(s)}
                      className="px-2 py-0.5 text-[11px] font-semibold rounded-lg transition-all"
                      style={{
                        backgroundColor: isActive ? 'var(--text-primary)' : 'transparent',
                        color: isActive ? 'var(--bg-primary)' : 'var(--text-secondary)',
                        boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      {s}x
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pb-3">
              <div className="relative w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ui-border)' }}>
                <motion.div 
                  className="absolute top-0 left-0 h-full rounded-full"
                  style={{ backgroundColor: 'var(--text-primary)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ ease: 'linear', duration: 0.2 }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Sentence {totalSentences > 0 ? currentSentenceIndex + 1 : 0} of {totalSentences}
                </span>
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {Math.round(progressPercent)}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-6 pt-1 pb-1">
              <button
                type="button"
                onClick={prevSentence}
                disabled={currentSentenceIndex === 0 || totalSentences === 0}
                className="p-3 rounded-full hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-90"
                style={{ color: 'var(--text-primary)' }}
                title="Previous Sentence"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>

              <button
                type="button"
                onClick={handlePlayPause}
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all"
                style={{
                  backgroundColor: 'var(--text-primary)',
                  color: 'var(--bg-primary)',
                }}
                title={state === 'speaking' ? 'Pause' : 'Play'}
              >
                {state === 'speaking' ? (
                  <Pause className="w-6 h-6 fill-current" />
                ) : (
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={nextSentence}
                disabled={currentSentenceIndex >= totalSentences - 1 || totalSentences === 0}
                className="p-3 rounded-full hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-90"
                style={{ color: 'var(--text-primary)' }}
                title="Next Sentence"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
