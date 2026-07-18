import { Toaster } from '@/store/toastStore';
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
        // NOTE: avoid bg-background/80, backdrop-blur-xl and other CSS-variable-
        // dependent Tailwind classes here — Sonner renders toasts in a portal
        // outside the React root, so CSS custom properties (--background etc.)
        // are not inherited in production builds.
        className: 'rounded-2xl px-4 py-3 text-sm shadow-xl font-medium tracking-tight border-0',
        style: {
          minHeight: 'auto',
          borderRadius: '16px',
        }
      }}
    />
  );
};

