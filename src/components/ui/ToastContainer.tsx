import { Toaster } from 'sonner';
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

  return (
    <Toaster
      theme={isDark ? 'dark' : 'light'}
      position={isMobileOrTablet ? 'top-center' : 'bottom-right'}
      offset={isMobileOrTablet ? (isAndroid ? 48 : 24) : 72}
      expand={!isMobileOrTablet}
      className="!z-[99999] shiori-toaster"
      toastOptions={{
        className: 'shiori-toast-item rounded-2xl px-4 py-3 text-sm shadow-2xl font-medium tracking-tight',
        style: {
          minHeight: 'auto',
          borderRadius: '18px',
        }
      }}
    />
  );
};

