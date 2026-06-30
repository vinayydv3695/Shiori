import { Toaster } from 'sonner';

export const ToastContainer = () => {
  return (
    <Toaster
      richColors
      theme="system"
      position="bottom-right"
      offset={72} /* clear the bottom nav bar (56px) + 16px gap */
      expand={true}
    />
  );
};
