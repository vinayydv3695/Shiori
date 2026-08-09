import React from 'react';
import { isAndroid } from '@/lib/tauri';
import { RadialMenu, type RadialMenuItem } from './RadialMenu';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { LucideIcon } from 'lucide-react';

export type LibraryMenuItem = 
  | { isSeparator: true; label?: string }
  | { label: string; icon?: LucideIcon; onClick: () => void; destructive?: boolean; isSeparator?: false };

interface LibraryContextMenuProps {
  children: React.ReactNode;
  items: LibraryMenuItem[];
}

export function LibraryContextMenu({ children, items }: LibraryContextMenuProps) {
  if (isAndroid) {
    // Filter out separators for the radial menu, as it doesn't need them
    const radialItems = items.filter(item => !item.isSeparator) as RadialMenuItem[];
    return <RadialMenu items={radialItems}>{children}</RadialMenu>;
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[180px] bg-popover text-popover-foreground backdrop-blur-md border border-border rounded-xl shadow-2xl p-1.5 z-50 text-sm animate-in fade-in zoom-in-95 duration-200">
          {items.map((item, index) => {
            if (item.isSeparator) {
              return <ContextMenu.Separator key={`sep-${index}`} className="h-px bg-border/50 my-1.5 mx-1" />;
            }
            return (
              <ContextMenu.Item 
                key={item.label}
                className={`flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none ${
                  item.destructive 
                    ? 'hover:bg-destructive/15 focus:bg-destructive/15 text-destructive' 
                    : 'hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground text-foreground/90'
                }`}
                onClick={item.onClick}
              >
                {item.icon && <item.icon className="w-4 h-4 mr-2.5" />}
                <span className="font-medium tracking-tight">{item.label}</span>
              </ContextMenu.Item>
            );
          })}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
