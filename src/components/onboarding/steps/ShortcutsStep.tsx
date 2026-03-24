import type { LucideIcon } from "lucide-react";
import { Keyboard, HelpCircle, ArrowLeftRight, PanelRightOpen } from "lucide-react";
import { SHORTCUTS_CATALOG, type ShortcutCategory } from "@/lib/shortcutsCatalog";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  General: HelpCircle,
  "Book Reader": ArrowLeftRight,
  "Manga Reader": PanelRightOpen,
};

function ShortcutGroup({ category }: { category: ShortcutCategory }) {
  const Icon = CATEGORY_ICONS[category.title] ?? Keyboard;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
      <div className="mb-4 flex items-center gap-2 text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{category.title}</h3>
      </div>
      <div className="space-y-2">
        {category.shortcuts.map((item) => (
          <div key={`${category.title}-${item.keys}-${item.action}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{item.action}</p>
              <p className="text-xs text-muted-foreground">{item.context}</p>
            </div>
            <kbd className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground whitespace-nowrap">
              {item.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShortcutsStep() {
  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight">Keyboard Shortcuts</h2>
        <p className="mt-2 text-muted-foreground">Use shortcuts to navigate faster in library, book reader, and manga reader.</p>
      </div>

      <div className="grid gap-4">
        {SHORTCUTS_CATALOG.map((category) => (
          <ShortcutGroup key={category.title} category={category} />
        ))}
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Tip: you can always open the full shortcuts popup later from the toolbar help icon.
      </div>
    </div>
  );
}
