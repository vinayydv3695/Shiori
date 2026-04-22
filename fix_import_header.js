import fs from 'fs';
const file = 'src/components/onboarding/steps/ImportStep.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<div className="flex items-center gap-3 shrink-0">\n          <FolderPlus className="h-7 w-7 text-indigo-400" \/>\n          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Import Your Collection<\/h2>\n        <\/div>/,
  `<div className="onb-fade-up flex items-center gap-3 shrink-0">\n          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-indigo-200">\n            <FolderPlus className="h-5 w-5 onb-icon-inner" />\n          </div>\n          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Import Your Collection</h2>\n        </div>`
);

fs.writeFileSync(file, content, 'utf8');
