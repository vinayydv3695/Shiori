import React, { type ReactNode } from 'react';

type GlowButtonVariant = 'primary' | 'secondary';
type GlowButtonTheme = 'light' | 'dark';

export interface GlowButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
}

const cx = (...classes: Array<string | undefined | false>) => classes.filter(Boolean).join(' ');

export const GlowButton: React.FC<GlowButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  className,
  icon,
}) => {
  const baseClasses =
    'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-6 py-3 text-sm font-bold tracking-[0.14em] uppercase transition-all duration-300 ease-out focus:outline-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';

  const variantClasses =
    variant === 'primary'
      ? 'border border-primary/20 bg-primary text-primary-foreground hover:scale-105 hover:bg-primary/90 hover:shadow-lg focus-visible:ring-4 focus-visible:ring-primary/20'
      : 'border border-border/40 bg-card/40 text-muted-foreground backdrop-blur-md hover:bg-primary/10 hover:text-primary hover:border-primary/30';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(baseClasses, variantClasses, className)}
    >
      <span className="relative z-10 flex items-center gap-2">
        {icon ? <span className="inline-flex shrink-0 items-center">{icon}</span> : null}
        <span>{children}</span>
      </span>
      {variant === 'primary' && !disabled && (
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent translate-x-[-100%] transition-transform duration-700 ease-in-out group-hover:translate-x-[100%]" />
      )}
    </button>
  );
};

export default GlowButton;
