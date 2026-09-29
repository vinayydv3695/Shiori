#!/usr/bin/env node
/**
 * Eager import graph (perf/tools/eager-graph.mjs)
 *
 * BFS over STATIC imports (not `import(...)`) starting at src/main.tsx.
 * Answers "why is lib X in the entry chunk" with the shortest import chain.
 * Tree-shaking is not modelled — removal is verified separately against the
 * built chunk (literal grep / bundle_budget.sh).
 *
 * Usage: node perf/tools/eager-graph.mjs [pattern]
 *   pattern: substring of a module id (e.g. "react-markdown"); default = all
 *            node_modules leaves sorted by depth.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const pattern = process.argv[2] || '';

const files = new Map(); // absPath -> source
function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.set(p, fs.readFileSync(p, 'utf8'));
  }
}
collect(SRC);

const IMPORT_RE = /(?:^|\n)\s*(?:import\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?|export\s+(?:type\s+)?[^'"]*?\sfrom\s+)['"]([^'"]+)['"]/g;

function resolveSpec(spec, fromFile) {
  if (spec.startsWith('node:') || spec.startsWith('data:')) return null;
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return { external: spec };
  for (const cand of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (files.has(cand)) return { file: cand };
  }
  return null; // css / assets / unresolved
}

const start = path.join(SRC, 'main.tsx');
const seen = new Set();
const queue = [{ file: start, chain: ['src/main.tsx'] }];
const externals = []; // {spec, chain}

while (queue.length) {
  const { file, chain } = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const src = files.get(file) || '';
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1];
    const r = resolveSpec(spec, file);
    if (!r) continue;
    if (r.external) {
      externals.push({ spec: r.external, chain: [...chain, r.external] });
      continue;
    }
    if (r.file && !seen.has(r.file)) {
      queue.push({ file: r.file, chain: [...chain, path.relative(ROOT, r.file)] });
    }
  }
}

const hits = externals.filter((e) => e.spec.includes(pattern));
const bySpec = new Map();
for (const h of hits) {
  if (!bySpec.has(h.spec)) bySpec.set(h.spec, h.chain);
}
console.log(`eager node_modules imports${pattern ? ` matching "${pattern}"` : ''}: ${bySpec.size}`);
for (const [spec, chain] of [...bySpec.entries()].sort((a, b) => a[1].length - b[1].length)) {
  console.log(`\n${spec}\n  ${chain.join(' -> ')}`);
}
