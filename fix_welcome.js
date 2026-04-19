import fs from 'fs';
const file = 'src/components/onboarding/steps/WelcomeStep.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace section
content = content.replace(
  /<section className="relative min-h-\[560px\] w-full overflow-hidden rounded-\[2rem\] border border-white\/5 bg-slate-950 text-white shadow-2xl shadow-black\/50">/,
  `<section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-slate-950 text-white shadow-xl shadow-black/40">`
);

// Inner min-h-[560px]
content = content.replace(
  /<div className="relative z-10 flex min-h-\[560px\] flex-col items-center justify-center px-6 py-16 text-center">/,
  `<div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16 text-center">`
);

fs.writeFileSync(file, content, 'utf8');
