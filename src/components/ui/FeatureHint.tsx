import * as React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useFeatureDiscoveryStore, type FeatureId } from '@/store/featureDiscoveryStore';

interface FeatureHintProps {
  featureId: FeatureId;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  arrow?: boolean;
  offset?: number;
  onDismiss?: () => void;
  children: React.ReactNode;
}

export function FeatureHint({
  featureId,
  title,
  description,
  position = 'bottom',
  arrow = true,
  offset = 8,
  onDismiss,
  children,
}: FeatureHintProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [showTimeout, setShowTimeout] = React.useState<ReturnType<typeof setTimeout> | null>(null);
  const shouldShow = useFeatureDiscoveryStore((state) => state.shouldShowHint(featureId));
  const dismissHint = useFeatureDiscoveryStore((state) => state.dismissHint);
  const markDiscovered = useFeatureDiscoveryStore((state) => state.markFeatureDiscovered);

  const [showHint, setShowHint] = React.useState(false);

  React.useEffect(() => {
    if (shouldShow) {
      const timeout = setTimeout(() => {
        setShowHint(true);
      }, 1000);
      setShowTimeout(timeout);

      return () => {
        if (showTimeout) clearTimeout(showTimeout);
      };
    }
  }, [shouldShow]);

  const handleDismiss = () => {
    dismissHint(featureId);
    setShowHint(false);
    onDismiss?.();
  };

  const handleInteraction = () => {
    markDiscovered(featureId);
    setShowHint(false);
  };

  if (!shouldShow && !showHint) {
    return <>{children}</>;
  }

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-blue-600',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-blue-600',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-blue-600',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-blue-600',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleInteraction}
    >
      {children}

      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'absolute z-50 w-72 rounded-lg bg-blue-600 text-white shadow-xl p-4',
              positionClasses[position]
            )}
            style={{
              [position === 'top' || position === 'bottom' ? 'marginTop' : 'marginLeft']:
                position === 'top' || position === 'bottom'
                  ? `${offset}px`
                  : position === 'left'
                  ? `-${offset}px`
                  : `${offset}px`,
            }}
          >
            {arrow && (
              <div
                className={cn(
                  'absolute w-0 h-0 border-8',
                  arrowClasses[position]
                )}
              />
            )}

            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1">{title}</h4>
                <p className="text-xs text-blue-50 leading-relaxed">{description}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDismiss();
                }}
                className="flex-shrink-0 p-1 rounded hover:bg-blue-700 transition-colors"
                aria-label="Dismiss hint"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-200">Click to try it!</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDismiss();
                }}
                className="text-blue-200 hover:text-white underline"
              >
                Got it
              </button>
            </div>

            <motion.div
              className="absolute inset-0 rounded-lg border-2 border-blue-400"
              animate={{
                opacity: [0.4, 0.8, 0.4],
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
