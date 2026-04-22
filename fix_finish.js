import fs from 'fs';
const file = 'src/components/onboarding/steps/FinishStep.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add import
content = content.replace(
  /import { OnboardingMotionStyles } from '\.\.\/components';/,
  `import { OnboardingMotionStyles } from '../components';\nimport { ShioriMark } from '@/components/icons/ShioriIcons';`
);

// Fix layout
content = content.replace(
  /<section className="relative h-full min-h-0 w-full overflow-hidden rounded-\[2rem\] border border-white\/5 bg-slate-950 p-8 text-white shadow-2xl shadow-black\/40 md:p-12">/,
  `<section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-slate-950 p-8 text-white shadow-xl shadow-black/40 md:p-10">`
);

// Fix inner scrollable wrapper
content = content.replace(
  /<div className="relative z-10 flex min-h-0 flex-1 flex-col items-center">/,
  `<div className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-hidden">\n        <div className="w-full flex-1 overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30 flex flex-col items-center">`
);

// Move footer outside the scroll area
content = content.replace(
  /<div className="onb-fade-up onb-delay-300 mt-12 flex w-full max-w-4xl shrink-0 flex-col items-center justify-center gap-4 border-t border-white\/10 pt-8">/,
  `        </div>\n        <div className="onb-fade-up onb-delay-300 mt-4 flex w-full shrink-0 flex-col items-center justify-center gap-4 border-t border-white/10 bg-slate-950/95 pt-5 pb-1 backdrop-blur z-20">`
);

// Add logo to button
content = content.replace(
  /\{isFinishing \? 'Launching Shiori\.\.\.' : 'Launch Shiori'\}/,
  `<div className="flex items-center gap-3">
                <span>{isFinishing ? 'Launching Shiori...' : 'Launch Shiori'}</span>
                <ShioriMark size={24} className="text-white" aria-hidden="true" />
              </div>`
);

fs.writeFileSync(file, content, 'utf8');
