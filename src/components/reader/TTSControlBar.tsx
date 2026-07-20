import { useState, useDeferredValue, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTTS } from '@/hooks/useTTS';
import { logger } from '@/lib/logger';
import { 
  Volume2, 
  VolumeX, 
  SkipForward, 
  SkipBack, 
  Play, 
  Pause, 
  Square, 
  X,
  Settings2,
  Search,
  ChevronDown,
  Check
} from '@/components/icons';

export interface TTSControlBarProps {
  contentRef: React.RefObject<HTMLElement | null>;
  onChapterEnd?: () => void;
  contentKey?: string | number;
}

export function TTSControlBar({ contentRef, onChapterEnd, contentKey }: TTSControlBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
  
  const {
    isAvailable,
    state,
    currentSentenceIndex,
    totalSentences,
    voices,
    selectedVoice,
    rate,
    play,
    pause,
    resume,
    stop,
    nextSentence,
    prevSentence,
    setVoice,
    setRate
  } = useTTS({ contentRef, onChapterEnd, contentKey });

  const handlePlayPause = () => {
    if (state === 'idle') {
      play();
    } else if (state === 'speaking') {
      pause();
    } else if (state === 'paused') {
      resume();
    }
  };

  const cycleSpeed = () => {
    const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = rates.indexOf(rate);
    const nextRate = currentIndex === -1 || currentIndex === rates.length - 1 ? rates[0] : rates[currentIndex + 1];
    setRate(nextRate);
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const voiceURI = e.target.value;
    const voice = voices.find(v => v.voiceURI === voiceURI);
    if (voice) {
      setVoice(voice);
    }
  };

  const progressPercent = totalSentences > 0 ? (currentSentenceIndex / (totalSentences - 1)) * 100 : 0;

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const { groupedVoices, sortedLangs } = useMemo(() => {
    // Filter voices based on search query
    const filteredVoices = voices.filter(v => 
      v.name.toLowerCase().includes(deferredSearchQuery.toLowerCase()) || 
      (v.lang && v.lang.toLowerCase().includes(deferredSearchQuery.toLowerCase()))
    );

    // Group filtered voices by language
    const grouped = filteredVoices.reduce((acc, voice) => {
      const lang = voice.lang || 'Unknown';
      if (!acc[lang]) acc[lang] = [];
      acc[lang].push(voice);
      return acc;
    }, {} as Record<string, typeof voices>);
    
    return {
      groupedVoices: grouped,
      sortedLangs: Object.keys(grouped).sort()
    };
  }, [voices, deferredSearchQuery]);

  return (
    <>
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
              } else if (isAvailable && voices.length === 0) {
                logger.warn('TTS: No voices available on this system');
              }
            }}
            disabled={!isAvailable || voices.length === 0}
            title={!isAvailable ? 'Text-to-speech not available' : voices.length === 0 ? 'No TTS voices found on this system' : 'Audiobook Mode'}
            className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4 md:right-8 z-50 p-4 rounded-full backdrop-blur-xl shadow-2xl transition-all duration-300 flex items-center justify-center ${
              !isAvailable || voices.length === 0 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:scale-105'
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
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed z-[100] flex flex-col overflow-hidden backdrop-blur-2xl shadow-2xl rounded-3xl bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 right-4 mx-auto max-w-[380px] md:bottom-8 md:right-8 md:left-auto"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--ui-border)'
            }}
          >
            {/* Top Drag indicator / close button area */}
            <div className="flex justify-between items-center px-6 pt-4 pb-2">
              <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>Audiobook Mode</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-1.5 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Settings Drawer (Animated) */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 py-2 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--ui-border)' }}
                >
                  {voices.length > 0 && (
                    <div className="flex flex-col gap-1 relative">
                      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Voice</label>
                      <button
                        onClick={() => setIsVoiceDropdownOpen(!isVoiceDropdownOpen)}
                        className="flex items-center justify-between w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--ui-border)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <span className="truncate pr-2">
                          {selectedVoice ? `${selectedVoice.name} (${selectedVoice.lang})` : 'Select voice'}
                        </span>
                        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isVoiceDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {isVoiceDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full left-0 right-0 mt-2 rounded-xl shadow-xl z-[110] overflow-hidden flex flex-col"
                            style={{
                              backgroundColor: 'var(--bg-elevated)',
                              border: '1px solid var(--ui-border)'
                            }}
                          >
                            <div className="p-2" style={{ borderBottom: '1px solid var(--ui-border)' }}>
                              <div className="relative">
                                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
                                <input
                                  type="text"
                                  placeholder="Search voices..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="w-full rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-shadow placeholder-[var(--text-secondary)]"
                                  style={{
                                    backgroundColor: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)'
                                  }}
                                />
                              </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto overscroll-contain">
                              {sortedLangs.length === 0 ? (
                                <div className="p-4 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>No voices found</div>
                              ) : (
                                sortedLangs.map(lang => (
                                  <div key={lang} className="py-1">
                                    <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider sticky top-0 backdrop-blur-sm z-10" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-elevated)', opacity: 0.95 }}>
                                      {lang}
                                    </div>
                                    {groupedVoices[lang].map(v => (
                                      <button
                                        key={v.voiceURI}
                                        onClick={() => {
                                          setVoice(v);
                                          setIsVoiceDropdownOpen(false);
                                          setSearchQuery("");
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                                        style={{
                                          backgroundColor: selectedVoice?.voiceURI === v.voiceURI ? 'var(--bg-secondary)' : 'transparent',
                                        }}
                                      >
                                        <span className="truncate" style={{ color: 'var(--text-primary)' }}>{v.name}</span>
                                        {selectedVoice?.voiceURI === v.voiceURI && <Check className="w-4 h-4 shrink-0 ml-2" style={{ color: 'var(--text-primary)' }} />}
                                      </button>
                                    ))}
                                  </div>
                                ))
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Speed</span>
                    <button
                      onClick={cycleSpeed}
                      className="text-sm font-semibold px-3 py-1 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {rate.toFixed(2).replace(/\.00$/, '.0')}x
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress Bar Area */}
            <div className="px-6 pt-4 pb-2">
              <div className="relative w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ui-border)' }}>
                <motion.div 
                  className="absolute top-0 left-0 h-full rounded-full"
                  style={{ backgroundColor: 'var(--text-primary)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ ease: "linear", duration: 0.2 }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Sentence {currentSentenceIndex + 1}</span>
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>{totalSentences}</span>
              </div>
            </div>

            {/* Main Controls */}
            <div className="px-6 pb-6 pt-2 flex items-center justify-center gap-6">
              <button
                onClick={prevSentence}
                disabled={currentSentenceIndex === 0 || totalSentences === 0}
                className="p-3 rounded-full hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                <SkipBack className="w-6 h-6 fill-current" />
              </button>

              <button
                onClick={handlePlayPause}
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-[0_8px_16px_-6px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95 transition-all"
                style={{
                  backgroundColor: 'var(--text-primary)',
                  color: 'var(--bg-primary)'
                }}
              >
                {state === 'speaking' ? (
                  <Pause className="w-8 h-8 fill-current" />
                ) : (
                  <Play className="w-8 h-8 fill-current ml-1" />
                )}
              </button>

              <button
                onClick={nextSentence}
                disabled={currentSentenceIndex >= totalSentences - 1 || totalSentences === 0}
                className="p-3 rounded-full hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                <SkipForward className="w-6 h-6 fill-current" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
