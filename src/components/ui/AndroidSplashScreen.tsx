import { useEffect, useState } from 'react';
import { type as osType } from '@tauri-apps/plugin-os';
import { isTauri } from '../../lib/tauri';

interface AndroidSplashScreenProps {
  onAnimationEnd: () => void;
  isReady: boolean;
}

export const AndroidSplashScreen = ({ onAnimationEnd, isReady }: AndroidSplashScreenProps) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [hasWaitedMinTime, setHasWaitedMinTime] = useState(false);

  useEffect(() => {
    // Determine if we should show the splash screen (only on Android)
    const isAndroid = isTauri ? osType() === 'android' : false;
    if (isAndroid) {
      setShouldRender(true);
    } else {
      // If not Android, just finish immediately
      onAnimationEnd();
    }
  }, [onAnimationEnd]);

  useEffect(() => {
    if (!shouldRender) return;

    // Minimum time to show the splash screen so the animation plays out
    const timeout = setTimeout(() => {
      setHasWaitedMinTime(true);
    }, 1200);

    return () => clearTimeout(timeout);
  }, [shouldRender]);

  useEffect(() => {
    // Start fading out when both conditions are met
    if (shouldRender && isReady && hasWaitedMinTime) {
      setIsFadingOut(true);
      
      // Wait for fade-out transition (500ms) before totally unmounting
      const fadeTimeout = setTimeout(() => {
        onAnimationEnd();
      }, 500);
      
      return () => clearTimeout(fadeTimeout);
    }
  }, [shouldRender, isReady, hasWaitedMinTime, onAnimationEnd]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center transition-opacity duration-500 ease-in-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="relative flex flex-col items-center justify-center">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Shiori Logo"
          className="w-40 h-40 object-contain animate-splash-logo"
        />
      </div>
    </div>
  );
};
