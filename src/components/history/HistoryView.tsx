import React from 'react';
import { isAndroid } from '@/lib/tauri';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useHistoryData } from './useHistoryData';
import { HistoryViewDesktop } from './HistoryViewDesktop';
import { HistoryViewAndroid } from './HistoryViewAndroid';

interface HistoryViewProps {
  onClose: () => void;
  onOpenBook: (bookId: number, location?: string) => void;
  onViewDetails: (bookId: number) => void;
  onEditBook: (bookId: number) => void;
  onDeleteBook: (bookId: number) => void;
  onOpenStatistics?: () => void;
  dialogs: any;
}

export function HistoryView(props: HistoryViewProps) {
  const data = useHistoryData();
  const isMobile = useIsMobile();

  if (isAndroid || isMobile) {
    return <HistoryViewAndroid {...props} data={data} />;
  }

  return <HistoryViewDesktop {...props} data={data} />;
}
