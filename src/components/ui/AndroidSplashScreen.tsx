import { useEffect, useState } from 'react';
import { isAndroid } from '../../lib/tauri';

interface AndroidSplashScreenProps {
  onAnimationEnd: () => void;
  isReady: boolean;
}

export const AndroidSplashScreen = ({ onAnimationEnd, isReady }: AndroidSplashScreenProps) => {
  useEffect(() => {
    if (!isAndroid) {
      // Clean up native splash immediately on non-Android devices (if it exists)
      const splash = document.getElementById('native-splash');
      if (splash) splash.remove();
      onAnimationEnd();
      return;
    }

    if (isReady) {
      // Add a slight delay for smooth transition and giving React time to paint
      const timeout = setTimeout(() => {
        const splash = document.getElementById('native-splash');
        if (splash) {
          splash.style.opacity = '0';
          // Wait for the CSS fade-out transition (0.5s) to complete
          setTimeout(() => {
            splash.remove();
            onAnimationEnd();
          }, 500);
        } else {
          onAnimationEnd();
        }
      }, 300); // 300ms buffer 
      
      return () => clearTimeout(timeout);
    }
  }, [isReady, onAnimationEnd]);

  return null;
};
