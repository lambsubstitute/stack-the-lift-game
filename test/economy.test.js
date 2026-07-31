/* Rent, satisfaction, amenities and star progression. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tower, runDay, runAndClose, G } from './helpers.mjs';
import { TEN, AMENITY_KEYS, STAR_REQ } from '../src/config.js';
import { rentMult, satBonus, reqStatus, reqProgress } from '../src/economy.js';
import { hasAmenity, letCount, height } from '../src/state.js';
import { spawnFloor, scheduleAll } from '../src/people.js';

const put = (f, kind) => {
  G.people = G.people.filter(p => p.home !== f);
  G.floors[f].type = kind;
  G.floors[f].sat = 78;
  G.floors[f].age = 0;
  spawnFloor(f);
  scheduleAll();
};

test('good service raises satisfaction, bad service sinks it', () => {
  tower({ floors: 18, lifts: 4, seed: 4242 });
  const good = runAndClose();
  assert.ok(good.avgSat > 78, `well-served tenants get happier (${good.avgSat.toFixed(0)}%)`);

  tower({ floors: 30, lifts: 1, seed: 4242 });
  let last = 0;
  for (let d = 0; d < 6; d++) last = runAndClose().avgSat;
  assert.ok(last < 60, `a badly served tower collapses (${last.toFixed(0)}%)`);
});

test('tenants who are never served eventually leave', () => {
  tower({ floors: 30, lifts: 1, seed: 4242 });
  const before = letCount();
  for (let d = 0; d < 10; d++) runAndClose();
  assert.ok(letCount() < before, `tenants walk out (${before} -> ${letCount()})`);
});

test('amenities lift rent across the tower', () => {
  tower({ floors: 20, lifts: 4, seed: 4242 });
  const plain = rentMult(15);
  put(10, 'foodcourt');
  assert.ok(rentMult(15) > plain, 'a food court raises everyone');
  assert.ok(Math.abs(rentMult(15) - 1.08) < 0.001, '+8% exactly');
});

test('amenity scopes hit the right floors', () => {
  tower({ floors: 20, lifts: 4, seed: 4242, use: f => (f <= 3 ? 'apt' : 'office') });
  put(10, 'gym');
  assert.ok(rentMult(2) > 1.05, 'gym lifts homes');
  assert.equal(rentMult(15), 1, 'but not offices');

  tower({ floors: 20, lifts: 4, seed: 4242 });
  put(10, 'garden');
  assert.ok(rentMult(12) > 1.1, 'sky garden reaches five floors');
  assert.equal(rentMult(18), 1, 'and no further');
});

test('the patience amenities buy is capped below the penalty for bad service', () => {
  /* REGRESSION: the cap was +9 while "poor service" only costs -8, so a fully
     appointed tower GAINED satisfaction while its lifts failed. An amenity may
     soften a mediocre lift; it must never excuse a bad one. */
  tower({ floors: 24, lifts: 4, seed: 4242 });
  for (const [f, k] of [[10, 'foodcourt'], [11, 'gym'], [12, 'conf'], [13, 'garden']]) put(f, k);
  assert.ok(satBonus(14) <= 4, `capped (${satBonus(14)})`);

  tower({ floors: 26, lifts: 1, seed: 4242 });
  for (const [f, k] of [[10, 'foodcourt'], [11, 'gym'], [12, 'conf'], [13, 'garden']]) put(f, k);
  const first = runAndClose().avgSat;
  let last = first;
  for (let d = 0; d < 6; d++) last = runAndClose().avgSat;
  assert.ok(last < first, `every amenity plus one lift still bleeds (${first.toFixed(0)}% -> ${last.toFixed(0)}%)`);
});

test('amenities are a trade: they also fill the lifts', () => {
  tower({ floors: 24, lifts: 2, seed: 4242 });
  const without = runDay();
  tower({ floors: 24, lifts: 2, seed: 4242 });
  for (const [f, k] of [[12, 'foodcourt'], [13, 'gym'], [14, 'conf']]) put(f, k);
  const withAmenities = runDay();
  assert.ok(withAmenities.trips > without.trips * 1.02,
    `amenities add real traffic (${without.trips} -> ${withAmenities.trips})`);
});

test('no star requirement can deadlock on content it unlocks', () => {
  for (let s = 2; s <= 5; s++) {
    const need = STAR_REQ[s]?.amenities;
    if (need === undefined) continue;
    const unlockedBefore = AMENITY_KEYS.filter(k => TEN[k].star <= s - 1).length;
    assert.ok(unlockedBefore >= need,
      `★${s} needs ${need} amenities but only ${unlockedBefore} are unlocked by ★${s - 1}`);
  }
});

test('the requirement checklist reports sane progress', () => {
  tower({ floors: 10, lifts: 2, seed: 4242 });
  G.star = 1;
  const rows = reqStatus(2);
  assert.ok(rows.length >= 3, 'several specific jobs, not one number');
  for (const r of rows) {
    assert.ok(Number.isFinite(r.p) && r.p >= 0 && r.p <= 1, `${r.k} progress in range`);
    assert.equal(r.met, r.cur >= r.need);
  }
  const p = reqProgress(2);
  assert.ok(p >= 0 && p <= 1, 'overall progress in range');
});

test('satisfaction shows as not-applicable before anything is let', () => {
  /* It used to read "0% / 50%", which looks like a failure at something you
     cannot attempt on day one. */
  tower({ floors: 8, lifts: 1, use: null, seed: 4242 });
  const sat = reqStatus(2).find(r => r.k === 'Average satisfaction');
  assert.ok(sat.na, 'flagged not-applicable with no tenants');
});

test('stars advance only when every requirement is met', () => {
  tower({ floors: 10, lifts: 2, seed: 4242 });
  G.star = 1;
  const rows = reqStatus(2);
  const unmet = rows.filter(r => !r.met);
  if (unmet.length) {
    runAndClose();
    assert.equal(G.star, 1, 'no promotion while something is outstanding');
  }
});
