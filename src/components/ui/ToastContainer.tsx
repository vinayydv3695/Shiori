import { Toast, ToastProvider, ToastViewport } from './Toast';
import { useToastStore } from '../../store/toastStore';

export const ToastContainer = () => {
  const toasts = useToastStore(state => state.toasts);
  const removeToast = useToastStore(state => state.removeToast);

  return (
    <ToastProvider>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) removeToast(toast.id);
          }}
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          duration={toast.duration}
          action={toast.action}
        />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
};
