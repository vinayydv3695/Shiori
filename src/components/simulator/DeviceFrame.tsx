import React, { useState, useEffect, useRef } from 'react';
import { Wifi, BatteryMedium, Signal } from 'lucide-react';
import {
  type DevicePreset,
  type DeviceOrientation,
  isSimulatedAndroid,
} from '@/lib/browserMock/initBrowserMock';

interface DeviceFrameProps {
  preset: DevicePreset;
  orientation: DeviceOrientation;
  onBackPress?: () => void;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

export function DeviceFrame({
  preset,
  orientation,
  onBackPress,
  iframeRef,
}: DeviceFrameProps) {
  const [time, setTime] = useState('');
  const isAndroid = isSimulatedAndroid();
  const iframeSrc = `/?simulated_frame=true&android=${isAndroid ? 'true' : 'false'}`;

  // Clock in status bar
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Compute dimensions
  let width = 412;
  let height = 915;

  if (preset === 'tablet') {
    width = 800;
    height = 1100;
  }

  if (orientation === 'landscape') {
    const tmp = width;
    width = height;
    height = tmp;
  }

  if (preset === 'responsive') {
    return (
      <div className="w-full h-full relative overflow-hidden bg-background">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          className="w-full h-full border-0 block"
          title="Shiori Android Responsive View"
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen flex items-center justify-center bg-neutral-950 p-4 md:p-8 overflow-auto">
      {/* Device Chassis Outer Frame */}
      <div
        className="relative flex flex-col transition-all duration-300 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] border-[10px] border-neutral-900 bg-neutral-900 rounded-[50px] ring-2 ring-neutral-800"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          maxHeight: '92vh',
          maxWidth: '96vw',
        }}
      >
        {/* Android Simulated Status Bar */}
        <div className="h-8 bg-neutral-900/90 text-neutral-300 px-6 flex items-center justify-between text-xs font-semibold select-none z-30 shrink-0">
          {/* Time */}
          <span className="tracking-tight text-[11px] font-bold text-neutral-200">{time || '12:45'}</span>

          {/* Punch-hole Camera Cutout */}
          <div className="w-3.5 h-3.5 rounded-full bg-black ring-1 ring-neutral-800 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-neutral-900" />
          </div>

          {/* Status Icons */}
          <div className="flex items-center gap-1.5 text-neutral-300">
            <Signal size={12} />
            <Wifi size={12} />
            <BatteryMedium size={14} className="rotate-90 text-emerald-400" />
          </div>
        </div>

        {/* Screen Viewport (Iframe hosting the application) */}
        <div className="flex-1 w-full h-full overflow-hidden relative bg-background">
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="w-full h-full border-0 block"
            title="Shiori Android Phone View"
          />
        </div>

        {/* Android Gesture Navigation Bar Pill */}
        <div
          onClick={onBackPress}
          className="h-5 bg-neutral-900 flex items-center justify-center cursor-pointer hover:bg-neutral-800/80 transition-colors shrink-0"
          title="Click bottom bar to simulate Android Back"
        >
          <div className="w-32 h-1 bg-neutral-600 rounded-full hover:bg-neutral-400 transition-colors" />
        </div>
      </div>
    </div>
  );
}
