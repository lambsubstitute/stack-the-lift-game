/* Record the golden-master snapshot from the ORIGINAL single-file build.
   Run once, before refactoring:   npm run record
   After that, `npm test` replays the same scenarios against src/ and fails on
   any difference. Re-record only when you have deliberately changed balance. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createModuleAdapter } from '../adapters/modules.mjs';
import { createLegacyAdapter } from '../adapters/legacy.mjs';
import { runAll } from '../scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'snapshot.json');

const t0 = Date.now();
/* Records from src/ by default. Pass --legacy to record from the original
   single-file build instead — that is how the first snapshot was taken, to
   prove the module split changed nothing. */
const fromLegacy = process.argv.includes('--legacy');
const results = runAll(fromLegacy ? createLegacyAdapter() : createModuleAdapter());
writeFileSync(out, JSON.stringify(results, null, 2) + '\n');

console.log(`recorded ${results.length} scenarios from ${fromLegacy ? 'legacy' : 'src'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const r of results) {
  const d = r.days[r.days.length - 1];
  console.log(
    `  ${r.scenario.padEnd(34)} pop ${String(r.population).padStart(4)}  ` +
      `trips ${String(d.trips).padStart(4)}  stranded ${String(d.gaveUp).padStart(4)}  ` +
      `rent ${String(d.rent).padStart(7)}`
  );
}
console.log(`\nwrote ${out}`);
