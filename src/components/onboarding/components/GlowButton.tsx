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
        ? 'bg-black text-white border border-white/20 hover:bg-slate-950 hover:border-white/30 hover:scale-[1.02]'
        : 'bg-slate-900 text-white border border-white/10 hover:bg-slate-800 hover:border-white/20 hover:scale-[1.02]'
      : variant === 'primary'
        ? 'text-white bg-gradient-to-r from-violet-500 via-fuchsia-500 to-blue-500 shadow-[0_0_18px_rgba(99,102,241,0.35)] hover:shadow-[0_0_24px_rgba(99,102,241,0.45)] hover:scale-[1.02]'
        : 'text-white/90 bg-white/5 backdrop-blur-md border border-white/20 shadow-[0_0_14px_rgba(99,102,241,0.3)] hover:bg-white/10 hover:border-white/35 hover:shadow-[0_0_18px_rgba(99,102,241,0.4)] hover:scale-[1.02]';

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
