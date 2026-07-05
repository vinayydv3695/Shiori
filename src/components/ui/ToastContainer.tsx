import { Toaster } from 'sonner';
import { useIsMobile, useIsTablet } from '@/hooks/useIsMobile';
import { isAndroid } from '@/lib/tauri';

export const ToastContainer = () => {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  
  // Use top-center for all mobile, tablet and Android devices
  const isMobileOrTablet = isMobile || isTablet || isAndroid;

  return (
    <Toaster
      richColors
      theme="system"
      position={isMobileOrTablet ? 'top-center' : 'bottom-right'}
      offset={isMobileOrTablet ? (isAndroid ? 48 : 24) : 72}
      expand={!isMobileOrTablet}
      toastOptions={{
        className: 'rounded-2xl px-4 py-3 text-sm shadow-xl font-medium tracking-tight border-0 ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl bg-background/80',
        style: {
          minHeight: 'auto',
          borderRadius: '16px',
        }
      }}
    />
  );
};
