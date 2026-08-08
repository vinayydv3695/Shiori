import React from 'react';
import { isAndroid } from '@/lib/tauri';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAnnotationsData } from './useAnnotationsData';
import { AnnotationsViewDesktop } from './AnnotationsViewDesktop';
import { AnnotationsViewAndroid } from './AnnotationsViewAndroid';

interface AnnotationsViewProps {
  onClose: () => void;
  onOpenBook?: (bookId: number, location?: string) => void;
}

export function AnnotationsView({ onClose, onOpenBook }: AnnotationsViewProps) {
  const data = useAnnotationsData();
  const isMobile = useIsMobile();

  if (isAndroid || isMobile) {
    return <AnnotationsViewAndroid onClose={onClose} onOpenBook={onOpenBook} data={data} />;
  }

  return <AnnotationsViewDesktop onClose={onClose} onOpenBook={onOpenBook} data={data} />;
}
