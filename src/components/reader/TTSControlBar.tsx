import { useState } from 'react';
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

  // Filter voices based on search query
  const filteredVoices = voices.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (v.lang && v.lang.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Group filtered voices by language
  const groupedVoices = filteredVoices.reduce((acc, voice) => {
    const lang = voice.lang || 'Unknown';
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(voice);
    return acc;
  }, {} as Record<string, typeof voices>);
  
  const sortedLangs = Object.keys(groupedVoices).sort();

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
            className={`fixed bottom-6 right-6 z-50 p-4 rounded-full backdrop-blur-xl shadow-2xl transition-all duration-300 flex items-center justify-center ${
              !isAvailable || voices.length === 0 
                ? 'bg-black/40 text-white/50 cursor-not-allowed' 
                : 'bg-white/70 dark:bg-black/60 text-black dark:text-white hover:scale-105 hover:bg-white dark:hover:bg-black/80 border border-black/5 dark:border-white/10'
            }`}
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
            className="fixed z-[100] flex flex-col overflow-hidden bg-white/85 dark:bg-gray-900/85 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl rounded-3xl bottom-4 left-4 right-4 mx-auto max-w-[380px] md:bottom-8 md:right-8 md:left-auto"
          >
            {/* Top Drag indicator / close button area */}
            <div className="flex justify-between items-center px-6 pt-4 pb-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-black/40 dark:text-white/40">Audiobook Mode</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-black/60 dark:text-white/60 transition-colors"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-black/60 dark:text-white/60 transition-colors"
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
                  className="px-6 py-2 border-b border-black/5 dark:border-white/10 flex flex-col gap-3"
                >
                  {voices.length > 0 && (
                    <div className="flex flex-col gap-1 relative">
                      <label className="text-xs font-medium text-black/60 dark:text-white/60">Voice</label>
                      <button
                        onClick={() => setIsVoiceDropdownOpen(!isVoiceDropdownOpen)}
                        className="flex items-center justify-between w-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-black dark:text-white outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 transition-colors"
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
                            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-black/10 dark:border-white/10 rounded-xl shadow-xl z-[110] overflow-hidden flex flex-col"
                          >
                            <div className="p-2 border-b border-black/10 dark:border-white/10">
                              <div className="relative">
                                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" />
                                <input
                                  type="text"
                                  placeholder="Search voices..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="w-full bg-black/5 dark:bg-black/30 rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none text-black dark:text-white placeholder-black/40 dark:placeholder-white/40 focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20"
                                />
                              </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto overscroll-contain">
                              {sortedLangs.length === 0 ? (
                                <div className="p-4 text-center text-sm text-black/50 dark:text-white/50">No voices found</div>
                              ) : (
                                sortedLangs.map(lang => (
                                  <div key={lang} className="py-1">
                                    <div className="px-3 py-1 text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wider sticky top-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm z-10">
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
                                        className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${selectedVoice?.voiceURI === v.voiceURI ? 'bg-black/5 dark:bg-white/10' : ''}`}
                                      >
                                        <span className="text-black dark:text-white truncate">{v.name}</span>
                                        {selectedVoice?.voiceURI === v.voiceURI && <Check className="w-4 h-4 text-black dark:text-white shrink-0 ml-2" />}
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
                    <span className="text-xs font-medium text-black/60 dark:text-white/60">Speed</span>
                    <button
                      onClick={cycleSpeed}
                      className="text-sm font-semibold bg-black/5 dark:bg-white/10 px-3 py-1 rounded-full text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                    >
                      {rate.toFixed(2).replace(/\.00$/, '.0')}x
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress Bar Area */}
            <div className="px-6 pt-4 pb-2">
              <div className="relative w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  className="absolute top-0 left-0 h-full bg-black dark:bg-white rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ ease: "linear", duration: 0.2 }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-[10px] text-black/40 dark:text-white/40 font-medium">Sentence {currentSentenceIndex + 1}</span>
                <span className="text-[10px] text-black/40 dark:text-white/40 font-medium">{totalSentences}</span>
              </div>
            </div>

            {/* Main Controls */}
            <div className="px-6 pb-6 pt-2 flex items-center justify-center gap-6">
              <button
                onClick={prevSentence}
                disabled={currentSentenceIndex === 0 || totalSentences === 0}
                className="p-3 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-black dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <SkipBack className="w-6 h-6 fill-current" />
              </button>

              <button
                onClick={handlePlayPause}
                className="w-16 h-16 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"
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
                className="p-3 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-black dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
