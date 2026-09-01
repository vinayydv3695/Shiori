import { create } from 'zustand';
import { recordAction } from './actionLogStore';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastStore {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

import { toast as sonnerToast, Toaster } from 'sonner';
export { Toaster, sonnerToast as toast };

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  
  addToast: (toast) => {
    const toastDuration = toast.duration ?? 1200;

    // Toasts are the app's visible response to an action — mirror them into the
    // (opt-in) action log. No-op unless logging is enabled; never throws.
    try {
      recordAction(
        'app',
        `Toast (${toast.variant ?? 'default'}): ${toast.title}${toast.description ? ` — ${toast.description}` : ''}`
      );
    } catch {
      // ignore
    }

    // Intercept to Sonner
    if (toast.variant === 'success') {
      sonnerToast.success(toast.title, { description: toast.description, action: toast.action, duration: toastDuration });
    } else if (toast.variant === 'error') {
      sonnerToast.error(toast.title, { description: toast.description, action: toast.action, duration: toastDuration });
    } else if (toast.variant === 'warning') {
      sonnerToast.warning(toast.title, { description: toast.description, action: toast.action, duration: toastDuration });
    } else if (toast.variant === 'info') {
      sonnerToast.info(toast.title, { description: toast.description, action: toast.action, duration: toastDuration });
    } else {
      sonnerToast(toast.title, { description: toast.description, action: toast.action, duration: toastDuration });
    }

    // Keep state for backwards compatibility if needed
    const id = Math.random().toString(36).substring(7);
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    
    // Auto-remove after duration
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, toastDuration);
  },
  
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  
  clearAll: () => {
    sonnerToast.dismiss();
    set({ toasts: [] });
  },
}));

// Helper hook for easier usage
export const useToast = () => {
  const { addToast } = useToastStore();
  
  return {
    success: (title: string, descriptionOrOptions?: string | { description?: string, action?: { label: string; onClick: () => void } }, options?: { action?: { label: string; onClick: () => void } }) => {
      const desc = typeof descriptionOrOptions === 'string' ? descriptionOrOptions : descriptionOrOptions?.description;
      const action = typeof descriptionOrOptions === 'object' ? descriptionOrOptions.action : options?.action;
      addToast({ title, description: desc, variant: 'success', action });
    },
    error: (title: string, description?: string) => 
      addToast({ title, description, variant: 'error' }),
    info: (title: string, description?: string) => 
      addToast({ title, description, variant: 'info' }),
    warning: (title: string, description?: string) => 
      addToast({ title, description, variant: 'warning' }),
    toast: addToast,
  };
};
