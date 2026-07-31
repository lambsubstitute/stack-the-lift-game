/* ---------------------------------------------------------------------------
   Bundles src/ into a single self-contained dist/stack.html.

   The point of the build is that the game stays a file you can double-click.
   Browsers refuse ES modules over file://, so shipping raw modules would mean
   running a web server just to play.

   This is a deliberately tiny bundler rather than esbuild or rollup, because
   the module graph here is trivially simple — static named imports, no dynamic
   import, no cycles — and the payoff is that the whole repo has ZERO
   dependencies. Clone it and `npm test` and `npm run build` just work.

     node tools/build.mjs            build once
     node tools/build.mjs --watch    rebuild on save
--------------------------------------------------------------------------- */
import { readFileSync, writeFileSync, mkdirSync, watch as fsWatch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SRC = join(root, 'src');
const ENTRY = 'main.js';

const IMPORT_RE = /^import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*(?:from\s*)?['"]\.\/([^'"]+)['"];?\s*$/gm;

function readModule(file) {
  const text = readFileSync(join(SRC, file), 'utf8');
  const deps = [...text.matchAll(IMPORT_RE)].map(m => m[1]);
  return { file, text, deps };
}

/** Depth-first topological sort, so a module is emitted after everything it needs. */
function order(entry) {
  const seen = new Map();
  const out = [];
  const stack = [];
  (function visit(file) {
    if (seen.get(file) === 'done') return;
    if (seen.get(file) === 'open') {
      throw new Error(`import cycle: ${[...stack, file].join(' -> ')}`);
    }
    seen.set(file, 'open');
    stack.push(file);
    const mod = readModule(file);
    for (const d of mod.deps) visit(d);
    stack.pop();
    seen.set(file, 'done');
    out.push(mod);
  })(entry);
  return out;
}

/** Everything lands in one scope, so a duplicate top-level name is a real bug. */
function assertNoCollisions(mods) {
  const owner = new Map();
  /* Must handle `const cv = ..., ctx = ...` — catching only the first name let a
     real collision (render's canvas ctx vs the tutorial's own ctx) through. */
  const fnRe = /^(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm;
  const varRe = /^(?:export\s+)?(?:const|let|var)\s+([^;\n]*)/gm;
  const namesIn = text => {
    const out = [];
    for (const m of text.matchAll(fnRe)) out.push(m[1]);
    for (const m of text.matchAll(varRe))
      for (const d of m[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?==|,|$)/g)) out.push(d[1]);
    return out;
  };
  for (const m of mods) {
    for (const name of namesIn(m.text)) {
      if (owner.has(name) && owner.get(name) !== m.file) {
        throw new Error(
          `"${name}" is declared at top level in both ${owner.get(name)} and ${m.file}.\n` +
          `The bundle flattens every module into one scope, so top-level names must be unique.`
        );
      }
      owner.set(name, m.file);
    }
  }
}

function bundle() {
  const mods = order(ENTRY);
  assertNoCollisions(mods);
  const body = mods
    .map(m => {
      const stripped = m.text
        .replace(IMPORT_RE, '')
        .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\s)/gm, '')
        .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
      return `/* ---- ${m.file} ${'-'.repeat(Math.max(0, 60 - m.file.length))} */\n${stripped.trim()}`;
    })
    .join('\n\n');
  return `"use strict";\n(function(){\n${body}\n})();`;
}

function emit() {
  const shell = readFileSync(join(root, 'shell.html'), 'utf8');
  const css = readFileSync(join(SRC, 'style.css'), 'utf8');
  const js = bundle();
  const html = shell.replace('/*__CSS__*/', () => css).replace('//__JS__', () => js);
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'stack.html'), html);
  console.log(`built dist/stack.html  (${(Buffer.byteLength(html) / 1024).toFixed(1)} kB)`);
}

try {
  emit();
} catch (e) {
  console.error('build failed:', e.message);
  process.exitCode = 1;
}

if (process.argv.includes('--watch')) {
  console.log('watching src/ …');
  let t = null;
  fsWatch(SRC, () => {
    clearTimeout(t);
    t = setTimeout(() => { try { emit(); } catch (e) { console.error('build failed:', e.message); } }, 60);
  });
}
