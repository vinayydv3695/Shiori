import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useReadingSettings, READER_THEME_COLORS } from '@/store/premiumReaderStore';
import { cn } from '@/lib/utils';

interface ReaderTooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  delayDuration?: number;
  className?: string;
}

export function ReaderTooltip({
  children,
  content,
  side = 'bottom',
  sideOffset = 8,
  delayDuration = 0,
  className,
}: ReaderTooltipProps) {
  const theme = useReadingSettings((s) => s.theme) || 'light';
  const themeColors = READER_THEME_COLORS[theme] || READER_THEME_COLORS.light;

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={sideOffset}
          style={{
            backgroundColor: themeColors['--bg-elevated'] || '#ffffff',
            color: themeColors['--text-primary'] || '#1a1817',
            borderColor: themeColors['--ui-border'] || 'rgba(0,0,0,0.1)',
            boxShadow: `0 8px 24px ${themeColors['--shadow'] || 'rgba(0,0,0,0.12)'}`,
          }}
          className={cn(
            "z-[120] overflow-hidden rounded-xl border px-3 py-1.5 text-xs font-semibold select-none pointer-events-none transition-all duration-150 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1.5 data-[side=left]:slide-in-from-right-1.5 data-[side=right]:slide-in-from-left-1.5 data-[side=top]:slide-in-from-bottom-1.5",
            className
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
