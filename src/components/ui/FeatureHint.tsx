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

  // User requested to completely remove the blue popups
  return <>{children}</>;
}
