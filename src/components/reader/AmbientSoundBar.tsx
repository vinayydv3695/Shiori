import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  soundscapeEngine, 
  type AmbientSoundType, 
  type AmbientSoundTrack 
} from '@/lib/audio/soundscapes';
import { 
  CloudRain, 
  CloudLightning,
  Flame, 
  Wind,
  Droplets,
  Waves, 
  Moon,
  Coffee,
  Disc,
  Headphones, 
  Volume2, 
  VolumeX, 
  X, 
  Timer,
  Plus,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import { 
  useReadingSettings, 
  applyReaderThemeToElement, 
  removeReaderThemeFromElement 
} from '@/store/premiumReaderStore';

interface AmbientSoundBarProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_TRACKS: AmbientSoundTrack[] = [
  { id: 'rain', name: 'Gentle Rain', category: 'nature', icon: 'rain', enabled: false, volume: 0.6 },
  { id: 'thunder', name: 'Thunderstorm', category: 'nature', icon: 'thunder', enabled: false, volume: 0.65 },
  { id: 'fire', name: 'Fireplace', category: 'cozy', icon: 'fire', enabled: false, volume: 0.55 },
  { id: 'wind', name: 'Soft Wind', category: 'nature', icon: 'wind', enabled: false, volume: 0.5 },
  { id: 'stream', name: 'Forest Stream', category: 'nature', icon: 'stream', enabled: false, volume: 0.55 },
  { id: 'waves', name: 'Ocean Waves', category: 'nature', icon: 'waves', enabled: false, volume: 0.55 },
  { id: 'forest', name: 'Night Crickets', category: 'nature', icon: 'forest', enabled: false, volume: 0.5 },
  { id: 'cafe', name: 'Cozy Cafe', category: 'cozy', icon: 'cafe', enabled: false, volume: 0.55 },
  { id: 'vinyl', name: 'Vinyl Crackle', category: 'cozy', icon: 'vinyl', enabled: false, volume: 0.45 },
  { id: 'brown', name: 'Brown Noise', category: 'focus', icon: 'brown', enabled: false, volume: 0.5 },
];

type PresetId = 'rainy-cafe' | 'cozy-cabin' | 'stormy' | 'forest-creek' | 'night-porch' | 'deep-focus';

interface PresetOption {
  id: PresetId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tracks: Partial<Record<AmbientSoundType, number>>;
}

const PRESETS: PresetOption[] = [
  {
    id: 'rainy-cafe',
    label: 'Rainy Cafe',
    icon: Coffee,
    tracks: { rain: 0.55, cafe: 0.5, vinyl: 0.3 },
  },
  {
    id: 'cozy-cabin',
    label: 'Cabin Fire',
    icon: Flame,
    tracks: { fire: 0.65, wind: 0.4 },
  },
  {
    id: 'stormy',
    label: 'Stormy',
    icon: CloudLightning,
    tracks: { thunder: 0.7, rain: 0.45, wind: 0.35 },
  },
  {
    id: 'forest-creek',
    label: 'Forest Creek',
    icon: Droplets,
    tracks: { stream: 0.65, forest: 0.4 },
  },
  {
    id: 'night-porch',
    label: 'Night Porch',
    icon: Moon,
    tracks: { forest: 0.6, wind: 0.3 },
  },
  {
    id: 'deep-focus',
    label: 'Deep Focus',
    icon: Headphones,
    tracks: { brown: 0.65, rain: 0.3 },
  },
];

type CategoryFilter = 'active' | 'all' | 'nature' | 'cozy' | 'focus';

export function AmbientSoundBar({ open, onClose }: AmbientSoundBarProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme: readerTheme } = useReadingSettings();
  const [mounted, setMounted] = useState(false);
  const [tracks, setTracks] = useState<AmbientSoundTrack[]>(DEFAULT_TRACKS);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [masterVolume, setMasterVolume] = useState<number>(0.7);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      // Clean up audio playback when reader component unmounts
      soundscapeEngine.stopAll();
    };
  }, []);

  // Dynamically apply current reader theme (paper, sepia, black, dark, light) directly to the panel
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    applyReaderThemeToElement(el, readerTheme || 'light');
    // No cleanup: the panel unmounts when `open` goes false, so removal is
    // handled by the unmount-only effect below and re-applies just overwrite.
  }, [readerTheme, open]);

  useEffect(() => () => {
    const el = panelRef.current;
    if (el) removeReaderThemeFromElement(el);
  }, []);

  // Sleep timer interval
  useEffect(() => {
    if (timerRemainingSeconds === null || timerRemainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setTimerRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          handleStopAll();
          useToastStore.getState().addToast({
            title: 'Sleep Timer Ended',
            description: 'Ambient soundscapes stopped.',
            variant: 'info',
          });
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timerRemainingSeconds]);

  // Active preset match check
  const activePreset = useMemo<PresetId | null>(() => {
    for (const preset of PRESETS) {
      const presetKeys = Object.keys(preset.tracks) as AmbientSoundType[];
      const activeTracks = tracks.filter((t) => t.enabled);
      if (activeTracks.length === presetKeys.length) {
        const matches = presetKeys.every((key) => activeTracks.some((t) => t.id === key));
        if (matches) return preset.id;
      }
    }
    return null;
  }, [tracks]);

  const activeCount = useMemo(() => tracks.filter((t) => t.enabled).length, [tracks]);

  const handleToggleTrack = (type: AmbientSoundType) => {
    setTracks((prev) => {
      const next = prev.map((t) => {
        if (t.id === type) {
          const nextEnabled = !t.enabled;
          if (nextEnabled) {
            soundscapeEngine.startTrack(type, t.volume);
          } else {
            soundscapeEngine.stopTrack(type);
          }
          return { ...t, enabled: nextEnabled };
        }
        return t;
      });

      // If viewing active list and user disables all tracks, fallback to 'all'
      const stillActive = next.some((t) => t.enabled);
      if (!stillActive && selectedCategory === 'active') {
        setSelectedCategory('all');
      }

      return next;
    });
    setIsPlaying(soundscapeEngine.getIsRunning());
  };

  const handleTrackVolume = (type: AmbientSoundType, vol: number) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === type) {
          soundscapeEngine.setTrackVolume(type, vol);
          return { ...t, volume: vol };
        }
        return t;
      })
    );
  };

  const handleMasterVolume = (vol: number) => {
    setMasterVolume(vol);
    soundscapeEngine.setMasterVolume(vol);
  };

  const handleStopAll = () => {
    soundscapeEngine.stopAll();
    setTracks((prev) => prev.map((t) => ({ ...t, enabled: false })));
    setIsPlaying(false);
    setTimerRemainingSeconds(null);
    setSleepTimerMinutes(null);
    setSelectedCategory('all');
  };

  const handleSelectPreset = (preset: PresetOption) => {
    if (activePreset === preset.id) {
      handleStopAll();
      return;
    }

    handleStopAll();
    setTimeout(() => {
      Object.entries(preset.tracks).forEach(([trackId, vol]) => {
        soundscapeEngine.startTrack(trackId as AmbientSoundType, vol);
      });

      setTracks((prev) =>
        prev.map((t) => {
          const targetVol = preset.tracks[t.id];
          if (targetVol !== undefined) {
            return { ...t, enabled: true, volume: targetVol };
          }
          return { ...t, enabled: false };
        })
      );
      setIsPlaying(true);
      // Automatically show ONLY the enabled tracks for this preset
      setSelectedCategory('active');
    }, 50);
  };

  const handleSetTimer = (minutes: number) => {
    setSleepTimerMinutes(minutes);
    setTimerRemainingSeconds(minutes * 60);
    useToastStore.getState().addToast({
      title: 'Sleep Timer Set',
      description: `Ambient sounds will turn off in ${minutes} minutes.`,
      variant: 'info',
    });
  };

  const handleCancelTimer = () => {
    setSleepTimerMinutes(null);
    setTimerRemainingSeconds(null);
  };

  const renderIcon = (id: AmbientSoundType) => {
    const size = 16;
    switch (id) {
      case 'rain': return <CloudRain size={size} />;
      case 'thunder': return <CloudLightning size={size} />;
      case 'fire': return <Flame size={size} />;
      case 'wind': return <Wind size={size} />;
      case 'stream': return <Droplets size={size} />;
      case 'waves': return <Waves size={size} />;
      case 'forest': return <Moon size={size} />;
      case 'cafe': return <Coffee size={size} />;
      case 'vinyl': return <Disc size={size} />;
      case 'brown': return <Headphones size={size} />;
      default: return <Volume2 size={size} />;
    }
  };

  const filteredTracks = useMemo(() => {
    if (selectedCategory === 'active') {
      return tracks.filter((t) => t.enabled);
    }
    if (selectedCategory === 'all') return tracks;
    return tracks.filter((t) => t.category === selectedCategory);
  }, [tracks, selectedCategory]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Subtle backdrop to dismiss on outside click */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[299] bg-black/20 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Floating Soundscape Popover Panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              top: 'calc(var(--spacing-sm, 12px) + 48px + env(safe-area-inset-top, 0px))',
              right: 'max(1.25rem, calc(50vw - 460px))',
            }}
            className="premium-ambient-panel fixed select-none flex flex-col gap-4 z-[300]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[color-mix(in_srgb,var(--ui-focus)_15%,transparent)] text-[var(--ui-focus)] flex items-center justify-center shrink-0 shadow-sm shadow-[color-mix(in_srgb,var(--ui-focus)_20%,transparent)]">
                  <Headphones size={18} strokeWidth={2.2} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[var(--text-primary)] leading-none tracking-tight">Ambient Audio</span>
                    {isPlaying && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--ui-focus)] text-white shadow-xs leading-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        {activeCount} active
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)] mt-1 font-medium">Procedural soundscapes for reading</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isPlaying && (
                  <button
                    type="button"
                    onClick={handleStopAll}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-red-500 bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:bg-red-500/10 transition-all flex items-center gap-1.5 cursor-pointer outline-none focus:outline-none"
                    aria-label="Stop all sounds"
                  >
                    <VolumeX size={14} />
                    <span>Stop all</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-all cursor-pointer outline-none focus:outline-none"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Presets Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)] tracking-tight">Presets</span>
                <span className="text-[11px] text-[var(--text-secondary)] font-medium">Instant atmospheres</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isActive = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-[11px] transition-all cursor-pointer truncate outline-none focus:outline-none",
                        isActive
                          ? "bg-[var(--ui-focus)] text-white border-transparent shadow-md shadow-[color-mix(in_srgb,var(--ui-focus)_35%,transparent)] font-bold scale-[1.01]"
                          : "border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--bg-secondary))] text-[var(--text-primary)] hover:border-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-secondary))] font-medium shadow-2xs"
                      )}
                    >
                      <Icon size={14} className={isActive ? "text-white shrink-0" : "text-[var(--text-secondary)] shrink-0"} />
                      <span className="truncate">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Segmented Category Control with Deep Sunken Track & Floating Pill */}
            <div className="flex items-center p-1 rounded-2xl bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] shadow-inner">
              {([
                ...(activeCount > 0 ? [{ id: 'active', label: `Active (${activeCount})` }] : []),
                { id: 'all', label: 'All' },
                { id: 'nature', label: 'Nature' },
                { id: 'cozy', label: 'Cozy' },
                { id: 'focus', label: 'Focus' },
              ] as { id: CategoryFilter; label: string }[]).map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-xl text-xs capitalize transition-all cursor-pointer text-center select-none outline-none focus:outline-none",
                      isSelected
                        ? "bg-[var(--ui-focus)] text-white font-bold shadow-md shadow-[color-mix(in_srgb,var(--ui-focus)_35%,transparent)] scale-[1.01]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
                    )}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Soundscape Tracks */}
            <div 
              className="space-y-2 max-h-[260px] overflow-y-auto pr-1 pb-1" 
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {filteredTracks.map((track) => (
                <div
                  key={track.id}
                  className={cn(
                    'p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-3',
                    track.enabled
                      ? 'border-[color-mix(in_srgb,var(--ui-focus)_50%,transparent)] bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] shadow-sm shadow-[color-mix(in_srgb,var(--ui-focus)_15%,transparent)]'
                      : 'border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--bg-secondary))] hover:border-[color-mix(in_srgb,var(--ui-border)_90%,transparent)]'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleTrack(track.id)}
                    className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer outline-none focus:outline-none"
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all",
                        track.enabled
                          ? "bg-[var(--ui-focus)] text-white shadow-md shadow-[color-mix(in_srgb,var(--ui-focus)_35%,transparent)]"
                          : "bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)] text-[var(--text-secondary)] shadow-2xs"
                      )}
                    >
                      {renderIcon(track.id)}
                    </div>
                    <div className="min-w-0 flex-1 truncate">
                      <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{track.name}</div>
                      <div
                        className={cn(
                          "text-[11px] font-medium mt-0.5",
                          track.enabled ? "text-[var(--ui-focus)] font-semibold" : "text-[var(--text-tertiary)]"
                        )}
                      >
                        {track.enabled ? `${Math.round(track.volume * 100)}%` : 'Off'}
                      </div>
                    </div>
                  </button>

                  {track.enabled ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={track.volume}
                        onChange={(e) => handleTrackVolume(track.id, parseFloat(e.target.value))}
                        className="premium-settings-slider w-24 sm:w-28 cursor-pointer"
                        aria-label={`${track.name} volume`}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleTrack(track.id)}
                      className="px-3.5 py-1.5 rounded-xl border border-[color-mix(in_srgb,var(--ui-border)_75%,transparent)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-elevated))] shadow-2xs transition-all cursor-pointer outline-none focus:outline-none"
                    >
                      Enable
                    </button>
                  )}
                </div>
              ))}

              {/* In Active/Preset view, allow expanding back to full track list */}
              {selectedCategory === 'active' && activeCount < tracks.length && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className="w-full p-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_75%,transparent)] bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--bg-secondary))] hover:border-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-secondary))] transition-all flex items-center justify-between gap-3 cursor-pointer outline-none focus:outline-none group shadow-2xs hover:shadow-xs mt-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-secondary)] group-hover:bg-[var(--ui-focus)] group-hover:text-white group-hover:shadow-md group-hover:shadow-[color-mix(in_srgb,var(--ui-focus)_35%,transparent)] flex items-center justify-center shrink-0 transition-all">
                      <Plus size={15} strokeWidth={2.4} />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="font-semibold text-xs text-[var(--text-primary)] group-hover:text-[var(--ui-focus)] transition-colors">
                        Add more sounds to mix
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)] font-medium">
                        {tracks.length - activeCount} more sounds available
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[var(--text-secondary)] group-hover:text-[var(--ui-focus)] transition-colors pr-1 shrink-0">
                    <span className="text-xs font-semibold">Browse</span>
                    <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              )}
            </div>

            {/* Master Volume (Clean single row) */}
            <div className="pt-3 border-t border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Master Volume
                </span>
                <span className="text-xs font-bold text-[var(--text-secondary)]">
                  {Math.round(masterVolume * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleMasterVolume(masterVolume > 0 ? 0 : 0.7)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] transition-colors cursor-pointer shrink-0 outline-none focus:outline-none"
                  aria-label={masterVolume > 0 ? "Mute" : "Unmute"}
                >
                  {masterVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={masterVolume}
                  onChange={(e) => handleMasterVolume(parseFloat(e.target.value))}
                  className="premium-settings-slider flex-1 cursor-pointer"
                  aria-label="Master volume"
                />
              </div>
            </div>

            {/* Sleep Timer with Deep Sunken Track & Floating Active Pill */}
            <div className="pt-3 border-t border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Timer size={14} className="text-[var(--text-secondary)]" />
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Sleep Timer</span>
                </div>
                {timerRemainingSeconds ? (
                  <span className="text-xs font-bold text-[var(--ui-focus)] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--ui-focus)] animate-pulse" />
                    {Math.floor(timerRemainingSeconds / 60)}m {timerRemainingSeconds % 60}s left
                  </span>
                ) : (
                  <span className="text-xs font-medium text-[var(--text-tertiary)]">Off</span>
                )}
              </div>
              <div className="flex items-center p-1 rounded-2xl bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] shadow-inner">
                {[
                  { label: 'Off', minutes: null },
                  { label: '15m', minutes: 15 },
                  { label: '30m', minutes: 30 },
                  { label: '1h', minutes: 60 },
                ].map((opt) => {
                  const isSelected = opt.minutes === null
                    ? timerRemainingSeconds === null
                    : sleepTimerMinutes === opt.minutes && timerRemainingSeconds !== null;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        if (opt.minutes === null) {
                          handleCancelTimer();
                        } else {
                          handleSetTimer(opt.minutes);
                        }
                      }}
                      className={cn(
                        "flex-1 py-1.5 px-3 rounded-xl text-xs transition-all cursor-pointer text-center font-medium select-none outline-none focus:outline-none",
                        isSelected
                          ? "bg-[var(--ui-focus)] text-white font-bold shadow-md shadow-[color-mix(in_srgb,var(--ui-focus)_35%,transparent)] scale-[1.01]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
