import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[100] overflow-hidden rounded-xl border border-border/60 bg-popover/95 px-3 py-1.5 text-xs font-semibold text-popover-foreground shadow-xl shadow-black/15 backdrop-blur-xl select-none pointer-events-none transition-all duration-150 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1.5 data-[side=left]:slide-in-from-right-1.5 data-[side=right]:slide-in-from-left-1.5 data-[side=top]:slide-in-from-bottom-1.5",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

export interface AppTooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  delayDuration?: number;
  className?: string;
  asChild?: boolean;
  disabled?: boolean;
}

export function AppTooltip({
  children,
  content,
  side = 'top',
  sideOffset = 6,
  delayDuration = 150,
  className,
  asChild = true,
  disabled = false,
}: AppTooltipProps) {
  if (!content || disabled) return <>{children}</>;

  const trigger = React.isValidElement(children) && asChild ? (
    <TooltipTrigger asChild>{children}</TooltipTrigger>
  ) : (
    <TooltipTrigger asChild>
      <span className="inline-flex max-w-full truncate">{children}</span>
    </TooltipTrigger>
  );

  return (
    <Tooltip delayDuration={delayDuration}>
      {trigger}
      <TooltipContent side={side} sideOffset={sideOffset} className={className}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
