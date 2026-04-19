import fs from 'fs';
const file = 'src/components/onboarding/steps/ImportStep.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace section
content = content.replace(
  /<section className="w-full overflow-hidden rounded-3xl border border-white\/5 bg-slate-950 p-8 md:p-12">/,
  `<section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-slate-950 p-8 text-white shadow-xl shadow-black/40 md:p-10">\n      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_70%)]" />\n      <div className="relative z-10 flex min-h-0 flex-1 flex-col">`
);

// Inner scrollable content
content = content.replace(
  /<div>\n        <div className="flex items-center gap-3">/,
  `<div className="flex items-center gap-3 shrink-0">`
);

content = content.replace(
  /<div className="mt-6 rounded-2xl border border-white\/5 bg-slate-900\/40 p-5">/,
  `<div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">\n          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">\n            <div className="mt-4 rounded-2xl border border-white/5 bg-slate-900/40 p-5">`
);

// Fix footer
content = content.replace(
  /<div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white\/5 pt-8">/,
  `          </div>\n        </div>\n\n        <div className="mt-4 flex shrink-0 items-center justify-between border-t border-white/10 bg-slate-950/95 pt-5 pb-1 backdrop-blur z-20">`
);

// Close section correctly
content = content.replace(
  /<\/div>\n    <\/section>/,
  `      </div>\n    </section>`
);

fs.writeFileSync(file, content, 'utf8');
