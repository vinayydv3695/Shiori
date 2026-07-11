import React, { type ReactNode } from 'react';

type GlowButtonVariant = 'primary' | 'secondary';
type GlowButtonTheme = 'light' | 'dark';

export interface GlowButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: GlowButtonVariant;
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
  theme?: GlowButtonTheme;
}

const cx = (...classes: Array<string | undefined | false>) => classes.filter(Boolean).join(' ');

export const GlowButton: React.FC<GlowButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  className,
  icon,
  theme = 'light',
}) => {
  const baseClasses =
    'relative inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold tracking-wide transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

  const variantClasses =
    theme === 'dark'
      ? variant === 'primary'
        ? 'bg-gradient-to-b from-white to-zinc-200 text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,1),inset_0_-1px_0_rgba(0,0,0,0.1),0_4px_12px_rgba(0,0,0,0.4),0_0_20px_rgba(255,255,255,0.15)] hover:from-white hover:to-zinc-100 hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),inset_0_-1px_0_rgba(0,0,0,0.05),0_6px_16px_rgba(0,0,0,0.5),0_0_30px_rgba(255,255,255,0.3)] hover:-translate-y-0.5'
        : 'bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md text-zinc-200 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.3)] hover:from-white/15 hover:to-white/10 hover:text-white hover:border-white/20 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(255,255,255,0.1),0_6px_16px_rgba(0,0,0,0.4),0_0_15px_rgba(255,255,255,0.05)] hover:-translate-y-0.5'
      : variant === 'primary'
        ? 'text-white bg-gradient-to-r from-zinc-700 via-zinc-600 to-zinc-500 shadow-[0_0_18px_rgba(161,161,170,0.25)] hover:shadow-[0_0_24px_rgba(161,161,170,0.35)] hover:scale-[1.02]'
        : 'text-white/90 bg-white/5 backdrop-blur-md border border-white/20 shadow-[0_0_14px_rgba(161,161,170,0.22)] hover:bg-white/10 hover:border-white/35 hover:shadow-[0_0_18px_rgba(161,161,170,0.3)] hover:scale-[1.02]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(baseClasses, variantClasses, className)}
    >
      {icon ? <span className="inline-flex shrink-0 items-center">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
};

export default GlowButton;
