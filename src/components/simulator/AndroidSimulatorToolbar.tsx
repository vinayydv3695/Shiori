import React, { useState } from 'react';
import {
  Smartphone,
  Tablet,
  Maximize2,
  RotateCw,
  ArrowLeft,
  Plus,
  BookOpen,
  Sparkles,
  RotateCcw,
  Minimize2,
  Layers,
  ChevronDown,
  Monitor,
  Zap,
} from 'lucide-react';
import {
  isSimulatedAndroid,
  toggleSimulatedAndroid,
  getDevicePreset,
  setDevicePreset,
  getDeviceOrientation,
  setDeviceOrientation,
  type DevicePreset,
  type DeviceOrientation,
} from '@/lib/browserMock/initBrowserMock';
import { mockBackend } from '@/lib/browserMock/mockBackend';

interface AndroidSimulatorToolbarProps {
  onBackPress?: () => void;
  onLowMemoryPress?: () => void;
  isIframeParent?: boolean;
}

export function AndroidSimulatorToolbar({
  onBackPress,
  onLowMemoryPress,
  isIframeParent = false,
}: AndroidSimulatorToolbarProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [preset, setPresetState] = useState<DevicePreset>(getDevicePreset());
  const [orientation, setOrientationState] = useState<DeviceOrientation>(getDeviceOrientation());
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const isAndroid = isSimulatedAndroid();

  const showNotification = (msg: string) => {
    setBannerMsg(msg);
    setTimeout(() => setBannerMsg(null), 2500);
  };

  const handlePresetChange = (newPreset: DevicePreset) => {
    setPresetState(newPreset);
    setDevicePreset(newPreset);
    showNotification(`Switched to ${newPreset.toUpperCase()} view`);
  };

  const handleOrientationToggle = () => {
    const next: DeviceOrientation = orientation === 'portrait' ? 'landscape' : 'portrait';
    setOrientationState(next);
    setDeviceOrientation(next);
    showNotification(`Rotated to ${next.toUpperCase()}`);
  };

  const handleAddBook = () => {
    const b = mockBackend.addDummyBook();
    setShowAddMenu(false);
    showNotification(`Added book "${b.title}"`);
  };

  const handleAddManga = () => {
    const m = mockBackend.addDummyManga();
    setShowAddMenu(false);
    showNotification(`Added manga series "${m.title}"`);
  };

  const handleResetData = () => {
    if (confirm('Reset simulated library back to default mock books & manga?')) {
      mockBackend.resetToDefaults();
      showNotification('Library reset to defaults');
    }
  };

  const handleTriggerLowMemory = () => {
    if (onLowMemoryPress) {
      onLowMemoryPress();
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shiori-low-memory'));
    }
    showNotification('Dispatched shiori-low-memory event');
  };

  const handleHardwareBack = () => {
    if (onBackPress) {
      onBackPress();
    } else if (typeof window !== 'undefined') {
      window.history.back();
    }
    showNotification('Simulated Hardware Back');
  };

  if (isMinimized) {
    return (
      <div className="fixed top-3 right-3 z-[999999] flex items-center gap-2">
        {bannerMsg && (
          <div className="bg-primary/95 text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow-lg font-medium animate-in fade-in slide-in-from-top-2">
            {bannerMsg}
          </div>
        )}
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 bg-neutral-900/90 hover:bg-neutral-800 text-white border border-neutral-700/80 px-3 py-1.5 rounded-full shadow-2xl backdrop-blur-md text-xs font-semibold tracking-wide transition-all active:scale-95"
          title="Open Android Dev Simulator"
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          🤖 Android Sim
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[999999] flex flex-col items-center max-w-[95vw]">
      {/* Toast banner inside simulator */}
      {bannerMsg && (
        <div className="mb-2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1.5 rounded-full shadow-xl animate-in fade-in slide-in-from-top-2">
          {bannerMsg}
        </div>
      )}

      {/* Main Dev Toolbar */}
      <div className="flex items-center gap-1.5 bg-neutral-950/92 text-white border border-neutral-700/70 px-3 py-1.5 rounded-2xl shadow-2xl backdrop-blur-xl text-xs select-none">
        {/* Android / Desktop Platform Toggle */}
        <button
          onClick={() => toggleSimulatedAndroid()}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-bold tracking-tight transition-all active:scale-95 ${
            isAndroid
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
              : 'bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500/30'
          }`}
          title="Click to toggle between Android Mobile and Desktop mode"
        >
          {isAndroid ? <Smartphone size={14} /> : <Monitor size={14} />}
          <span>{isAndroid ? 'Android 14' : 'Desktop'}</span>
        </button>

        <div className="h-4 w-px bg-neutral-700 mx-0.5" />

        {/* Viewport Presets */}
        <div className="flex items-center bg-neutral-900/80 rounded-xl p-0.5 border border-neutral-800">
          <button
            onClick={() => handlePresetChange('phone')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${
              preset === 'phone'
                ? 'bg-neutral-700 text-white font-medium shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Phone (Pixel 8: 412x915)"
          >
            <Smartphone size={13} />
            <span className="hidden sm:inline">Phone</span>
          </button>
          <button
            onClick={() => handlePresetChange('tablet')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${
              preset === 'tablet'
                ? 'bg-neutral-700 text-white font-medium shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Tablet (800x1100)"
          >
            <Tablet size={13} />
            <span className="hidden sm:inline">Tablet</span>
          </button>
          <button
            onClick={() => handlePresetChange('responsive')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${
              preset === 'responsive'
                ? 'bg-neutral-700 text-white font-medium shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Responsive (Full Window)"
          >
            <Maximize2 size={13} />
            <span className="hidden sm:inline">Full</span>
          </button>
        </div>

        {/* Orientation Toggle */}
        <button
          onClick={handleOrientationToggle}
          className="p-1.5 rounded-xl hover:bg-neutral-800 text-neutral-300 hover:text-white active:scale-95 transition-all"
          title={`Orientation: ${orientation} (click to rotate)`}
        >
          <RotateCw size={14} className={orientation === 'landscape' ? 'rotate-90 text-primary' : ''} />
        </button>

        <div className="h-4 w-px bg-neutral-700 mx-0.5" />

        {/* Hardware Back Button */}
        <button
          onClick={handleHardwareBack}
          className="flex items-center gap-1 px-2 py-1 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-amber-300 border border-amber-500/30 active:scale-95 transition-all"
          title="Simulate Android Hardware Back button"
        >
          <ArrowLeft size={13} />
          <span className="font-semibold">Back</span>
        </button>

        {/* Low Memory Event Trigger */}
        <button
          onClick={handleTriggerLowMemory}
          className="p-1.5 rounded-xl hover:bg-neutral-800 text-amber-400/80 hover:text-amber-400 active:scale-95 transition-all"
          title="Trigger shiori-low-memory event"
        >
          <Zap size={14} />
        </button>

        <div className="h-4 w-px bg-neutral-700 mx-0.5" />

        {/* Add Dummy Data Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-primary/20 text-primary-foreground hover:bg-primary/30 border border-primary/40 active:scale-95 transition-all font-semibold"
          >
            <Plus size={13} />
            <span>Add Data</span>
            <ChevronDown size={11} />
          </button>

          {showAddMenu && (
            <div className="absolute top-full mt-2 left-0 bg-neutral-900 border border-neutral-700/80 rounded-xl shadow-2xl p-1.5 w-44 flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95">
              <button
                onClick={handleAddBook}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800 text-left text-neutral-200 hover:text-white text-xs font-medium"
              >
                <BookOpen size={13} className="text-blue-400" />
                <span>+ Dummy Book</span>
              </button>
              <button
                onClick={handleAddManga}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800 text-left text-neutral-200 hover:text-white text-xs font-medium"
              >
                <Layers size={13} className="text-purple-400" />
                <span>+ Dummy Manga</span>
              </button>
              <div className="h-px bg-neutral-800 my-0.5" />
              <button
                onClick={handleResetData}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 text-left text-red-400 text-xs font-medium"
              >
                <RotateCcw size={13} />
                <span>Reset Library</span>
              </button>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-neutral-700 mx-0.5" />

        {/* Minimize Button */}
        <button
          onClick={() => setIsMinimized(true)}
          className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
          title="Minimize toolbar"
        >
          <Minimize2 size={13} />
        </button>
      </div>
    </div>
  );
}
