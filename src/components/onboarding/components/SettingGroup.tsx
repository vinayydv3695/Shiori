import type { ReactNode } from 'react';

type SettingGroupProps = {
  title: string;
  description?: string;
  children: ReactNode;
  icon?: ReactNode;
  theme?: 'default' | 'darkSlate';
};

export default function SettingGroup({ title, description, children, icon }: SettingGroupProps) {
  return (
    <section className="relative overflow-hidden rounded-[1.5rem] p-6 backdrop-blur-md transition-all md:p-8 border border-border/40 bg-card/40 shadow-xs">
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            {icon ? (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/40 bg-muted/40 text-foreground">
                {icon}
              </span>
            ) : null}
            <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
          </div>

          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </header>

        <div className="space-y-5">{children}</div>
      </div>
    </section>
  );
}
