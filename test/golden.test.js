/* ---------------------------------------------------------------------------
   The refactor's safety net.

   snapshot.json was recorded from the original single-file build BEFORE the
   code was split into modules. These scenarios replay against src/ and must
   produce byte-identical numbers: same trips, same people stranded, same rent,
   same satisfaction, same star. If a refactor changes behaviour anywhere, one
   of these fails and names the scenario and the field.

   If you change balance ON PURPOSE, re-record with `npm run record` and commit
   the new snapshot as its own change so the diff is reviewable.
--------------------------------------------------------------------------- */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createModuleAdapter } from './adapters/modules.mjs';
import { SCENARIOS, runScenario } from './scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(readFileSync(join(here, 'golden', 'snapshot.json'), 'utf8'));
const api = createModuleAdapter();

for (const sc of SCENARIOS) {
  test(`golden: ${sc.name}`, () => {
    const expected = snapshot.find(s => s.scenario === sc.name);
    assert.ok(expected, `no recorded snapshot for "${sc.name}" — run npm run record`);

    const actual = runScenario(api, sc);

    assert.equal(actual.population, expected.population, 'population');
    assert.equal(actual.coreBays, expected.coreBays, 'core bays');
    assert.equal(actual.days.length, expected.days.length, 'day count');

    actual.days.forEach((day, i) => {
      const want = expected.days[i];
      for (const key of Object.keys(want)) {
        assert.equal(day[key], want[key], `day ${i + 1} ${key}`);
      }
    });
  });
}
