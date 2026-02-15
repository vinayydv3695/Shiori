import { create } from 'zustand';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface ToastStore {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(7);
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    
    // Auto-remove after duration
    const duration = toast.duration || 3000;
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },
  
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  
  clearAll: () => set({ toasts: [] }),
}));

// Helper hook for easier usage
export const useToast = () => {
  const { addToast } = useToastStore();
  
  return {
    success: (title: string, description?: string) => 
      addToast({ title, description, variant: 'success' }),
    error: (title: string, description?: string) => 
      addToast({ title, description, variant: 'error' }),
    info: (title: string, description?: string) => 
      addToast({ title, description, variant: 'info' }),
    warning: (title: string, description?: string) => 
      addToast({ title, description, variant: 'warning' }),
    toast: addToast,
  };
};
