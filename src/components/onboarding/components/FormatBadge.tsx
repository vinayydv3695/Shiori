type FormatBadgeProps = {
  format: string;
};

export default function FormatBadge({ format }: FormatBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-lg border border-border/40 bg-muted/30 px-3 py-1.5 text-xs font-bold tracking-widest text-muted-foreground backdrop-blur-sm transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground">
      {format}
    </span>
  );
}
