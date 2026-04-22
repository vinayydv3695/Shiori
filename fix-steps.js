const fs = require('fs');
const path = require('path');

const stepsDir = 'src/components/onboarding/steps';
const files = fs.readdirSync(stepsDir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  let content = fs.readFileSync(path.join(stepsDir, file), 'utf8');

  // Fix 1: Section wrapper consistency
  // Make sure every section has flex h-full min-h-0 w-full flex-col
  content = content.replace(
    /<section className="[^"]*"/,
    (match) => {
      // extract classes
      let classes = match.match(/className="([^"]*)"/)[1];
      // ensure it has flex, flex-col, h-full, min-h-0, w-full, overflow-hidden, relative
      const required = ['relative', 'flex', 'h-full', 'min-h-0', 'w-full', 'flex-col', 'overflow-hidden'];
      const classList = classes.split(' ').map(c => c.trim()).filter(Boolean);
      for (const req of required) {
        if (!classList.includes(req)) classList.push(req);
      }
      // remove min-h-[560px] to allow it to shrink if needed, or keep it? The prompt asked for robust min-h-0
      const cleanList = classList.filter(c => !c.startsWith('min-h-[') || c === 'min-h-0');
      // replace bg-card border-border with theme
      if (cleanList.includes('bg-card')) {
        cleanList[cleanList.indexOf('bg-card')] = 'bg-slate-950';
      }
      if (cleanList.includes('border-border')) {
        cleanList[cleanList.indexOf('border-border')] = 'border-white/5';
      }
      if (cleanList.includes('rounded-3xl')) {
        cleanList[cleanList.indexOf('rounded-3xl')] = 'rounded-[2rem]';
      }
      return `<section className="${cleanList.join(' ')}"`;
    }
  );

  // Fix 2: Radial gradient consistency
  if (file !== 'WelcomeStep.tsx') {
    if (!content.includes('bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_70%)]')) {
      content = content.replace(
        /(<section[^>]*>)/,
        `$1\n      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_70%)]" />`
      );
    }
  }

  // Torbox theme consistency fixes
  if (file === 'TorboxIntegrationStep.tsx') {
    content = content.replace(/text-foreground/g, 'text-white');
    content = content.replace(/text-muted-foreground/g, 'text-white/60');
    content = content.replace(/border-border/g, 'border-white/10');
    content = content.replace(/bg-background\/40/g, 'bg-slate-900/40');
    content = content.replace(/bg-background\/70/g, 'bg-slate-900/70');
    content = content.replace(/bg-background/g, 'bg-slate-900');
    content = content.replace(/hover:bg-accent/g, 'hover:bg-white/5');
    content = content.replace(/text-primary/g, 'text-indigo-400');
    content = content.replace(/focus-visible:ring-primary\/60/g, 'focus-visible:ring-indigo-400/60');
    // wrap the content in relative z-10 flex min-h-0 flex-1 flex-col
    // and make scrollable area
    // Actually this requires manual fixing to be safe, I'll handle Torbox manually.
  }

  fs.writeFileSync(path.join(stepsDir, file), content, 'utf8');
}
