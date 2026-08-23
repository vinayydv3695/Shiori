import { useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import 'sonner/dist/styles.css';
import { useIsMobile, useIsTablet } from '@/hooks/useIsMobile';
import { isAndroid } from '@/lib/tauri';
import { usePreferencesStore } from '@/store/preferencesStore';

export const ToastContainer = () => {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const appTheme = usePreferencesStore((s) => s.preferences?.theme ?? 'dark');
  
  const isDark = appTheme !== 'light' && appTheme !== 'white' && appTheme !== 'sepia';
  
  // Use top-center for all mobile, tablet and Android devices
  const isMobileOrTablet = isMobile || isTablet || isAndroid;

  // Touch gesture listener for swiping toasts sideways (left/right) or up to dismiss
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let currentToastEl: HTMLElement | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-sonner-toast]') as HTMLElement | null;
      if (target) {
        currentToastEl = target;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!currentToastEl || e.touches.length === 0) return;
      const deltaX = e.touches[0].clientX - startX;
      const deltaY = e.touches[0].clientY - startY;

      if (Math.abs(deltaX) > 15 || deltaY < -15) {
        currentToastEl.style.transform = `translate3d(${deltaX}px, ${Math.min(0, deltaY)}px, 0)`;
        currentToastEl.style.opacity = `${Math.max(0.1, 1 - Math.abs(deltaX) / 180 - Math.abs(deltaY) / 120)}`;
        currentToastEl.style.transition = 'none';
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!currentToastEl) return;
      const endX = e.changedTouches[0]?.clientX ?? startX;
      const endY = e.changedTouches[0]?.clientY ?? startY;
      const deltaX = endX - startX;
      const deltaY = endY - startY;

      const isSwipeHorizontal = Math.abs(deltaX) > 35;
      const isSwipeUp = deltaY < -25;

      if (isSwipeHorizontal || isSwipeUp) {
        currentToastEl.style.transition = 'all 0.15s ease-out';
        currentToastEl.style.opacity = '0';
        currentToastEl.style.transform = isSwipeUp ? 'translate3d(0, -60px, 0)' : `translate3d(${deltaX > 0 ? 200 : -200}px, 0, 0)`;
        toast.dismiss();
      } else {
        currentToastEl.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        currentToastEl.style.transform = '';
        currentToastEl.style.opacity = '';
      }
      currentToastEl = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <Toaster
      theme={isDark ? 'dark' : 'light'}
      position={isMobileOrTablet ? 'top-center' : 'bottom-right'}
      offset={isMobileOrTablet ? (isAndroid ? 48 : 24) : 72}
      duration={1200}
      visibleToasts={2}
      swipeDirections={['left', 'right', 'top', 'bottom']}
      closeButton
      className="!z-[99999] shiori-toaster"
      toastOptions={{
        duration: 1200,
        className: 'shiori-toast-item rounded-2xl px-4 py-3 text-sm shadow-2xl font-medium tracking-tight cursor-pointer select-none active:scale-95 transition-transform touch-pan-y',
        style: {
          minHeight: 'auto',
          borderRadius: '18px',
        }
      }}
    />
  );
};

