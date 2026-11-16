import React from 'react';
import { useReadingSettings } from '@/store/premiumReaderStore';

interface ReaderFocusVignetteProps {
  enabled?: boolean;
}

export const ReaderFocusVignette: React.FC<ReaderFocusVignetteProps> = ({ enabled: propEnabled }) => {
  const storeEnabled = useReadingSettings((s) => s.focusVignette);
  const theme = useReadingSettings((s) => s.theme);
  const isEnabled = propEnabled ?? storeEnabled;

  if (!isEnabled) {
    return null;
  }

  return (
    <div
      className={`reader-focus-vignette theme-${theme} pointer-events-none select-none`}
      aria-hidden="true"
    />
  );
};
