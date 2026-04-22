import fs from 'fs';
const file = 'src/components/onboarding/steps/TorboxIntegrationStep.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace section
content = content.replace(
  /<section className="w-full overflow-hidden rounded-3xl border border-border bg-card p-8 md:p-12">/,
  `<section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-slate-950 p-8 text-white shadow-xl shadow-black/40 md:p-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_70%)]" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">`
);

// close the flex-1 flex-col correctly at the end
content = content.replace(
  /<\/section>/,
  `      </div>\n    </section>`
);

// fix typography & layout classes
content = content.replace(/text-foreground/g, 'text-white');
content = content.replace(/text-muted-foreground/g, 'text-white/65');
content = content.replace(/border-border/g, 'border-white/10');
content = content.replace(/bg-card/g, 'bg-slate-950');
content = content.replace(/text-primary/g, 'text-indigo-400');
content = content.replace(/focus-visible:ring-primary\/60/g, 'focus-visible:ring-indigo-400/60');
content = content.replace(/bg-background\/40/g, 'bg-slate-900/40');
content = content.replace(/bg-background\/70/g, 'bg-slate-900/70');
content = content.replace(/bg-background/g, 'bg-slate-900');
content = content.replace(/hover:bg-accent hover:text-white/g, 'hover:bg-white/5 hover:text-white');
content = content.replace(/hover:bg-accent/g, 'hover:bg-white/5');

// make the content scrollable
content = content.replace(
  /<div className="flex items-center gap-3">([\s\S]*?)<div className="mt-10 flex items-center justify-between border-t border-white\/10 pt-8">/,
  `<div className="onb-fade-up flex items-center gap-3">$1<div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden"><div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
          {/* scroll content */}
        </div></div>\n        <div className="mt-4 flex shrink-0 items-center justify-between border-t border-white/10 bg-slate-950/95 pt-5 pb-1 backdrop-blur z-20">`
);

// Wait, the regex might fail because of greedy matching or missing `onb-fade-up`.
fs.writeFileSync(file, content, 'utf8');
