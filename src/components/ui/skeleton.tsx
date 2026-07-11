import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/20 backdrop-blur-md border border-white/5 shadow-inner",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 z-10 animate-glass-shimmer pointer-events-none" />
    </div>
  )
}

export { Skeleton }
