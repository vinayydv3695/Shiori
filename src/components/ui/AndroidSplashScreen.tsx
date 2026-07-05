import { useEffect, useState } from 'react';
import { isAndroid } from '../../lib/tauri';

interface AndroidSplashScreenProps {
  onAnimationEnd: () => void;
  isReady: boolean;
}

export const AndroidSplashScreen = ({ onAnimationEnd, isReady }: AndroidSplashScreenProps) => {
  // Initialize synchronously so there's no first-tick flash
  const [shouldRender] = useState(isAndroid);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [hasWaitedMinTime, setHasWaitedMinTime] = useState(false);

  useEffect(() => {
    if (!isAndroid) {
      onAnimationEnd();
    }
  }, [onAnimationEnd]);

  useEffect(() => {
    if (!shouldRender) return;

    // Minimum time to show the splash screen so the animation plays out
    const timeout = setTimeout(() => {
      setHasWaitedMinTime(true);
    }, 2000); // Increased minimum time to let the new 1.2s + 0.3s text animation breathe

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
      className={`fixed inset-0 z-[9999] bg-background splash-gradient flex flex-col items-center justify-center transition-opacity duration-500 ease-in-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="relative flex flex-col items-center justify-center gap-6">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Shiori Logo"
          className="w-32 h-32 object-contain animate-splash-logo"
        />
        <h1 className="text-primary font-bold text-2xl tracking-[0.6em] animate-splash-text ml-[0.6em] select-none">
          SHIORI
        </h1>
      </div>
    </div>
  );
};
