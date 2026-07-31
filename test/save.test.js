/* Saving, and money that can run out. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tower, runAndClose, G } from './helpers.mjs';
import { snapshot, restore } from '../src/save.js';
import { OVERDRAFT_LIMIT, DEBT_GRACE_DAYS } from '../src/config.js';
import { totalPop, letCount } from '../src/state.js';
import { endOfDay } from '../src/economy.js';
import { buildShaft, upgradeShaft, coreBays } from '../src/lifts.js';

test('a saved tower comes back exactly as it was', () => {
  tower({
    floors: 22, lifts: 2, seed: 4242,
    use: f => (f <= 3 ? 'apt' : f === 10 ? 'foodcourt' : 'office'),
    links: [{ floor: 0, kind: 'esc' }, { floor: 1, kind: 'stair' }]
  });
  upgradeShaft(G.shafts[0], 'motor');
  upgradeShaft(G.shafts[0], 'cabin');
  G.cash = 12345;
  G.day = 9;
  G.star = 3;

  const before = {
    floors: G.floors.map(f => f.type),
    shafts: G.shafts.map(s => [s.bay, s.bottom, s.top, s.express, { ...s.up }]),
    links: G.links.map(l => l && l.kind),
    pop: totalPop(),
    core: coreBays()
  };
  const data = snapshot();

  // wreck the world, then restore
  tower({ floors: 4, lifts: 0, use: null, seed: 1 });
  assert.ok(restore(data), 'restore succeeds');

  assert.deepEqual(G.floors.map(f => f.type), before.floors, 'floors');
  assert.deepEqual(G.shafts.map(s => [s.bay, s.bottom, s.top, s.express, { ...s.up }]),
    before.shafts, 'shafts and their upgrades');
  assert.deepEqual(G.links.map(l => l && l.kind), before.links, 'connectors');
  assert.equal(G.cash, 12345, 'cash');
  assert.equal(G.day, 9, 'day');
  assert.equal(G.star, 3, 'star');
  assert.equal(totalPop(), before.pop, 'population rebuilt from the floors');
  assert.equal(coreBays(), before.core, 'core geometry');
});

test('the save does not carry the population', () => {
  /* There can be nearly two thousand people, each with a schedule. They are all
     derivable from the floors, so the save stays a couple of kilobytes and
     survives changes to how people are modelled. */
  tower({ floors: 30, lifts: 3, seed: 4242 });
  const data = snapshot();
  const json = JSON.stringify(data);
  assert.ok(!('people' in data), 'no people in the snapshot');
  assert.ok(json.length < 6000, `save stays small (${json.length} bytes for ${G.people.length} people)`);
});

test('a restored tower has a working population', () => {
  tower({ floors: 18, lifts: 2, seed: 4242 });
  const data = snapshot();
  assert.ok(restore(data));
  assert.ok(G.people.length > 100, 'people were rebuilt');
  assert.equal(G.people.filter(p => !p.sched.length).length, 0, 'and all have schedules');
});

test('a save from another version is refused rather than half-loaded', () => {
  tower({ floors: 10, lifts: 1, seed: 4242 });
  assert.equal(restore({ v: 999, floors: [] }), false);
  assert.equal(restore(null), false);
});

test('an overdraft costs interest', () => {
  /* Interest is charged on what is still owed at close, AFTER the day's rent —
     so the hole has to be deeper than a day's takings or the rent clears it. */
  tower({ floors: 14, lifts: 2, seed: 4242 });
  G.cash = -200000;
  const books = endOfDay();
  assert.ok(books.interest > 0, `interest charged (${books.interest})`);
  assert.ok(G.debtDays === 1, 'and the day is counted');
});

test('staying overdrawn ends the run', () => {
  tower({ floors: 14, lifts: 2, seed: 4242 });
  G.cash = -200000;
  let bankrupt = false;
  for (let d = 0; d <= DEBT_GRACE_DAYS + 1 && !bankrupt; d++) {
    G.cash = -200000;               // keep them under, whatever the rent does
    bankrupt = endOfDay().bankrupt;
  }
  assert.ok(bankrupt, `the bank calls it in after ${DEBT_GRACE_DAYS} days`);
});

test('a big enough hole is immediately fatal', () => {
  tower({ floors: 14, lifts: 2, seed: 4242 });
  /* Rent lands before the limit is checked, so the hole must be deeper than a
     day's takings — otherwise the tower earns its way back over the line. */
  G.cash = OVERDRAFT_LIMIT - 100000;
  assert.ok(endOfDay().bankrupt, 'past the limit, it is over the same evening');
});

test('clearing the overdraft clears the count', () => {
  tower({ floors: 14, lifts: 2, seed: 4242 });
  G.cash = -200000; endOfDay();
  assert.equal(G.debtDays, 1);
  G.cash = 50000; endOfDay();
  assert.equal(G.debtDays, 0, 'back in the black, the clock resets');
});
