import fs from 'fs';
const file = 'src/components/onboarding/steps/ThemeStep.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/      <\/div>\n          <\/div>\n    <\/section>\n  \);/g, '      </div>\n    </section>\n  );');
fs.writeFileSync(file, content, 'utf8');
