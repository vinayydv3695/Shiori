import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTTS } from '@/hooks/useTTS';
import { 
  Volume2, 
  VolumeX, 
  SkipForward, 
  SkipBack, 
  Play, 
  Pause, 
  Square, 
  X 
} from '@/components/icons';

export interface TTSControlBarProps {
  contentRef: React.RefObject<HTMLElement | null>;
  onChapterEnd?: () => void;
}

export function TTSControlBar({ contentRef, onChapterEnd }: TTSControlBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
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
  } = useTTS({ contentRef, onChapterEnd });

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

  return (
    <>
      <AnimatePresence>
        {!isExpanded && (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => isAvailable && setIsExpanded(true)}
            disabled={!isAvailable}
            title={!isAvailable ? "Text-to-Speech is not available on this platform" : "Open Text-to-Speech"}
            className={`fixed bottom-6 right-6 z-50 p-3 rounded-full bg-black/80 backdrop-blur-sm text-white shadow-lg ${
              !isAvailable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black transition-colors'
            }`}
          >
            {isAvailable ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="expanded"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm text-white px-4 py-3 flex items-center gap-3 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
          >
            <button
              onClick={handlePlayPause}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              title={state === 'idle' ? "Play" : state === 'speaking' ? "Pause" : "Resume"}
            >
              {state === 'speaking' ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            <button
              onClick={() => {
                stop();
                setIsExpanded(false);
              }}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              title="Stop"
            >
              <Square className="w-5 h-5" />
            </button>

            <button
              onClick={prevSentence}
              disabled={currentSentenceIndex === 0 || totalSentences === 0}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              title="Previous Sentence"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={nextSentence}
              disabled={currentSentenceIndex >= totalSentences - 1 || totalSentences === 0}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              title="Next Sentence"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <div className="w-px h-6 bg-white/20 mx-1 flex-shrink-0" />

            <button
              onClick={cycleSpeed}
              className="text-sm font-medium min-w-[3rem] text-center cursor-pointer hover:bg-white/20 rounded px-2 py-1 transition-colors flex-shrink-0"
              title="Speech Rate"
            >
              {rate.toFixed(2).replace(/\.00$/, '.0')}x
            </button>

            {voices.length > 0 && (
              <select
                value={selectedVoice?.voiceURI || ''}
                onChange={handleVoiceChange}
                className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white max-w-[200px] outline-none focus:border-white/40 cursor-pointer flex-shrink-0"
                title="Select Voice"
              >
                <option value="" disabled>Select voice</option>
                {voices.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI} className="text-black">
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            )}

            {totalSentences > 0 && (
              <span className="text-sm text-white/70 ml-2 hidden sm:inline-block">
                Sentence {currentSentenceIndex + 1} of {totalSentences}
              </span>
            )}

            <div className="flex-1" />

            <button
              onClick={() => {
                stop();
                setIsExpanded(false);
              }}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0 ml-auto"
              title="Close TTS"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
