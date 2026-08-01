/* Re-record the golden-master snapshot:   npm run record

   The snapshot was originally taken from the pre-refactor single-file build and
   replayed against src/ to prove the module split changed nothing. That build
   has since been retired — the snapshot itself is the record of its behaviour.
   Re-record ONLY when you have deliberately changed balance, and commit the new
   snapshot as its own change so the diff is reviewable. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createModuleAdapter } from '../adapters/modules.mjs';
import { runAll } from '../scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'snapshot.json');

const t0 = Date.now();
const results = runAll(createModuleAdapter());
writeFileSync(out, JSON.stringify(results, null, 2) + '\n');

console.log(`recorded ${results.length} scenarios in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const r of results) {
  const d = r.days[r.days.length - 1];
  console.log(
    `  ${r.scenario.padEnd(34)} pop ${String(r.population).padStart(4)}  ` +
      `trips ${String(d.trips).padStart(4)}  stranded ${String(d.gaveUp).padStart(4)}  ` +
      `rent ${String(d.rent).padStart(7)}`
  );
}
console.log(`\nwrote ${out}`);
