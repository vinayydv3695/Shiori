import * as ToastPrimitive from '@radix-ui/react-toast';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ToastProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  variant?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

export const Toast = ({
  open,
  onOpenChange,
  title,
  description,
  variant = 'info',
  duration = 3000,
}: ToastProps) => {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const styles = {
    success: 'border-green-500/50 bg-green-50 dark:bg-green-900/20',
    error: 'border-red-500/50 bg-red-50 dark:bg-red-900/20',
    warning: 'border-amber-500/50 bg-amber-50 dark:bg-amber-900/20',
    info: 'border-blue-500/50 bg-blue-50 dark:bg-blue-900/20',
  };

  return (
    <ToastPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
      className={cn(
        'flex items-start gap-3 rounded-lg border-2 bg-white dark:bg-gray-900 p-4 shadow-lg',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[swipe=end]:animate-out data-[state=closed]:fade-out-80',
        'data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
        styles[variant]
      )}
    >
      <div className="flex-shrink-0">{icons[variant]}</div>
      <div className="flex-1">
        <ToastPrimitive.Title className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {description}
          </ToastPrimitive.Description>
        )}
      </div>
      <ToastPrimitive.Close className="flex-shrink-0 rounded-lg p-1 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
        <X className="w-4 h-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
};

export const ToastProvider = ToastPrimitive.Provider;
export const ToastViewport = ({ className, ...props }: ToastPrimitive.ToastViewportProps) => (
  <ToastPrimitive.Viewport
    className={cn(
      'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',
      className
    )}
    {...props}
  />
);
