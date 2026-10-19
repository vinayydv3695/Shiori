import React, { useState, useEffect, useRef } from 'react';
import {
  isBrowserMode,
  getDevicePreset,
  getDeviceOrientation,
  type DevicePreset,
  type DeviceOrientation,
} from '@/lib/browserMock/initBrowserMock';
import { AndroidSimulatorToolbar } from './AndroidSimulatorToolbar';
import { DeviceFrame } from './DeviceFrame';

interface BrowserSimulatorRootProps {
  children: React.ReactNode;
}

export function BrowserSimulatorRoot({ children }: BrowserSimulatorRootProps) {
  const [inBrowser, setInBrowser] = useState(false);
  const [isIframe, setIsIframe] = useState(false);
  const [preset, setPreset] = useState<DevicePreset>('phone');
  const [orientation, setOrientation] = useState<DeviceOrientation>('portrait');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const isBrowser = isBrowserMode();
    const isInsideIframe = typeof window !== 'undefined' && (
      window.self !== window.top ||
      new URLSearchParams(window.location.search).has('simulated_frame')
    );

    setInBrowser(isBrowser);
    setIsIframe(isInsideIframe);
    setPreset(getDevicePreset());
    setOrientation(getDeviceOrientation());

    const handleConfigChange = () => {
      setPreset(getDevicePreset());
      setOrientation(getDeviceOrientation());
    };

    if (!isInsideIframe) {
      const splash = document.getElementById('native-splash');
      if (splash) splash.remove();
    }

    window.addEventListener('shiori-sim-config-change', handleConfigChange);
    return () => window.removeEventListener('shiori-sim-config-change', handleConfigChange);
  }, []);

  // Native Tauri / device builds: 0 overhead, render children directly
  if (!inBrowser) {
    return <>{children}</>;
  }

  // Inside the iframe phone screen: render pure children directly
  if (isIframe) {
    return (
      <div className="w-full h-full relative overflow-hidden bg-background">
        {children}
      </div>
    );
  }

  // Top-level window: If 'responsive' is chosen, render children full-screen with toolbar
  if (preset === 'responsive') {
    return (
      <div className="w-full h-full min-h-screen relative overflow-hidden">
        {children}
        <AndroidSimulatorToolbar
          onBackPress={() => window.history.back()}
          onLowMemoryPress={() => window.dispatchEvent(new CustomEvent('shiori-low-memory'))}
          isIframeParent={false}
        />
      </div>
    );
  }

  // Top-level window: Render inside realistic phone or tablet chassis frame
  return (
    <div className="w-full h-full min-h-screen relative overflow-hidden bg-neutral-950">
      <AndroidSimulatorToolbar
        onBackPress={() => {
          try {
            iframeRef.current?.contentWindow?.history.back();
          } catch {
            window.history.back();
          }
        }}
        onLowMemoryPress={() => {
          try {
            iframeRef.current?.contentWindow?.dispatchEvent(new CustomEvent('shiori-low-memory'));
          } catch {
            window.dispatchEvent(new CustomEvent('shiori-low-memory'));
          }
        }}
        isIframeParent={true}
      />
      <DeviceFrame
        preset={preset}
        orientation={orientation}
        iframeRef={iframeRef}
        onBackPress={() => {
          try {
            iframeRef.current?.contentWindow?.history.back();
          } catch {
            window.history.back();
          }
        }}
      />
    </div>
  );
}
