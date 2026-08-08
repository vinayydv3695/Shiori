import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';

type GlassCardGlowColor = 'purple' | 'blue' | 'pink' | 'none';

type GlassCardProps = {
  children: ReactNode;
  className?: string;
  glowColor?: GlassCardGlowColor;
  theme?: 'light' | 'dark';
};

const glowClasses: Record<GlassCardGlowColor, string> = {
  purple: 'shadow-[0_0_50px_-12px_rgba(168,85,247,0.45)]',
  blue: 'shadow-[0_0_50px_-12px_rgba(59,130,246,0.45)]',
  pink: 'shadow-[0_0_50px_-12px_rgba(236,72,153,0.45)]',
  none: 'shadow-none',
};

export function GlassCard({ children, className, glowColor = 'none' }: GlassCardProps) {
  const baseClasses =
    'rounded-2xl border border-border/50 bg-card/60 p-6 backdrop-blur-xl transition-all duration-300 ease-out shadow-sm';

  const glowClass = glowClasses[glowColor];

  return (
    <div
      className={cn(
        baseClasses,
        glowClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

export default GlassCard;
