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

export function GlassCard({ children, className, glowColor = 'none', theme = 'light' }: GlassCardProps) {
  const baseClasses =
    theme === 'dark'
      ? 'rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-none transition-all duration-300 ease-out'
      : 'rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-all duration-300 ease-out';

  const glowClass = theme === 'dark' ? 'shadow-none' : glowClasses[glowColor];

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
