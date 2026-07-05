import { Toaster } from 'sonner';
import { useIsMobile } from '@/hooks/useIsMobile';

export const ToastContainer = () => {
  const isMobile = useIsMobile();

  return (
    <Toaster
      richColors
      theme="system"
      position={isMobile ? 'top-center' : 'bottom-right'}
      offset={isMobile ? 16 : 72}
      expand={true}
      toastOptions={{
        className: 'rounded-full px-5 py-3 text-sm shadow-xl',
        style: {
          minHeight: 'auto',
          borderRadius: '9999px',
        }
      }}
    />
  );
};
