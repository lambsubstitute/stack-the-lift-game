/* Stairs, escalators, and the choice between climbing and waiting. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tower, runDay, G } from './helpers.mjs';
import { DAY_END, CONN } from '../src/config.js';
import { step } from '../src/sim.js';
import { walkRoute } from '../src/connectors.js';
import { coreBays } from '../src/lifts.js';

const chain = (kind, n) => {
  G.links = new Array(64).fill(null);
  for (let f = 0; f < n; f++) G.links[f] = { kind };
  return walkRoute(0, n);
};

test('a climb needs an unbroken run of connectors', () => {
  tower({ floors: 10, lifts: 1 });
  G.links = new Array(64).fill(null);
  G.links[0] = { kind: 'esc' };
  G.links[2] = { kind: 'esc' };            // gap at floor 1
  assert.equal(walkRoute(0, 1)?.segs, 1, 'one unbroken flight is a route');
  assert.equal(walkRoute(0, 3), null, 'a gap means no route at all');
});

test('discomfort grows faster than the number of flights', () => {
  tower({ floors: 14, lifts: 1 });
  const one = chain('esc', 1);
  const eight = chain('esc', 8);
  assert.ok(eight.discomfort / eight.segs > (one.discomfort / one.segs) * 1.5,
    'the eighth flight must hurt more than the first');
});

test('stairs are resented far more than escalators', () => {
  tower({ floors: 14, lifts: 1 });
  const stairs = chain('stair', 3);
  const esc = chain('esc', 3);
  assert.ok(stairs.discomfort > esc.discomfort * 2,
    `stairs ${stairs.discomfort.toFixed(0)} vs escalator ${esc.discomfort.toFixed(0)}`);
  assert.ok(stairs.time > esc.time, 'and take longer');
});

test('nobody chains a dozen flights of stairs when a lift exists', () => {
  tower({
    floors: 20, lifts: 2, seed: 4242,
    links: Array.from({ length: 12 }, (_, f) => ({ floor: f, kind: 'stair' }))
  });
  let longClimbs = 0;
  while (G.simT < DAY_END) {
    step(1.25);
    for (const p of G.people) if (p.state === 'climb' && Math.abs(p.dest - p.home) >= 8) longClimbs++;
  }
  assert.equal(longClimbs, 0);
});

test('with no lift at all, people take the stairs', () => {
  tower({
    floors: 6, lifts: 0, seed: 4242,
    links: Array.from({ length: 5 }, (_, f) => ({ floor: f, kind: 'stair' }))
  });
  const t = runDay();
  assert.ok(t.trips > 50, `stairs are better than nothing (${t.trips} trips)`);
  assert.equal(t.gave, 0, 'and nobody gives up waiting for a lift that does not exist');
});

test('an escalator podium is used, and costs only a few bays', () => {
  const podium = Array.from({ length: 6 }, (_, f) => ({ floor: f, kind: 'esc' }));

  tower({ floors: 24, lifts: 2, seed: 4242 });
  const bare = coreBays();

  tower({ floors: 24, lifts: 2, seed: 4242, links: podium });
  const withPodium = coreBays();
  const climbed = new Set();
  while (G.simT < DAY_END) {
    step(1.25);
    for (const p of G.people) if (p.state === 'climb') climbed.add(p.id);
  }

  assert.ok(climbed.size > 15, `people actually use it (${climbed.size})`);
  assert.ok(withPodium - bare <= 14, `for a modest slice of floor area (${withPodium - bare} bays)`);
});

test('an escalator is quicker and cheaper to run than a lift shaft', () => {
  assert.ok(CONN.esc.cost < 30000, 'cheap to build');
  assert.ok(CONN.esc.maint < 60, 'cheap to run');
  assert.ok(CONN.stair.cost < CONN.esc.cost, 'stairs cheaper still');
  assert.ok(CONN.stair.penalty > CONN.esc.penalty, 'and correspondingly more resented');
});
