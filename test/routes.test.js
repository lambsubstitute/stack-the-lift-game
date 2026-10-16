/* ---------------------------------------------------------------------------
   Journey planning: the thing that makes a sky lobby buildable.
--------------------------------------------------------------------------- */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tower, runDay, avgWait, G } from './helpers.mjs';
import { planRoute, invalidateRoutes } from '../src/routes.js';
import { buildShaft } from '../src/lifts.js';

const escalators = n => Array.from({ length: n }, (_, f) => ({ floor: f, kind: 'esc' }));
const shape = r => (r ? r.legs.map(l => `${l.kind}->${l.to}`).join(' ') : 'none');

test('a journey can combine a climb and a ride', () => {
  /* The whole point. The old chooser compared "all lift" against "all stairs"
     and picked one, so a lift that started above the lobby was unreachable and
     the sky lobby — the arrangement every real tall building lands on — could
     not be built at all. */
  tower({ floors: 26, lifts: 0, seed: 4242, links: escalators(6) });
  for (let i = 0; i < 3; i++) buildShaft(6, 25, false);
  invalidateRoutes();

  const r = planRoute(0, 20);
  assert.ok(r, `must find a route (${shape(r)})`);
  assert.ok(r.legs.length > 1, `must be more than one leg (${shape(r)})`);
  assert.ok(r.legs.some(l => l.kind === 'climb'), 'includes the escalator up to the sky lobby');
  assert.ok(r.legs.some(l => l.kind === 'lift'), 'and the lift above it');
  assert.equal(r.legs.at(-1).to, 20, 'and it arrives');
});

test('it still takes the lift when the lift is simply better', () => {
  tower({ floors: 26, lifts: 2, seed: 4242, links: escalators(6) });
  invalidateRoutes();
  const r = planRoute(0, 3);
  assert.equal(r.legs.length, 1, `one leg (${shape(r)})`);
  assert.equal(r.legs[0].kind, 'lift');
});

test('a floor no lift reaches and no stair climbs has no route', () => {
  tower({ floors: 20, lifts: 0, use: null, seed: 4242 });
  buildShaft(0, 10, false);
  invalidateRoutes();
  assert.equal(planRoute(0, 15), null, 'floor 15 is unreachable');
  assert.ok(planRoute(0, 8), 'floor 8 is fine');
});

test('a route to your own floor is empty, not null', () => {
  tower({ floors: 10, lifts: 1, seed: 4242 });
  const r = planRoute(4, 4);
  assert.ok(r);
  assert.equal(r.legs.length, 0);
});

test('the cache is dropped when the building changes', () => {
  tower({ floors: 20, lifts: 0, use: null, seed: 4242 });
  buildShaft(0, 10, false);
  invalidateRoutes();
  assert.equal(planRoute(0, 18), null, 'unreachable before');

  buildShaft(0, 19, false);
  invalidateRoutes();
  assert.ok(planRoute(0, 18), 'reachable after — a stale cache would still say no');
});

test('a long chain of stairs is planned but still resented', () => {
  tower({
    floors: 14, lifts: 0, seed: 4242,
    links: Array.from({ length: 12 }, (_, f) => ({ floor: f, kind: 'stair' }))
  });
  invalidateRoutes();
  const near = planRoute(0, 1);
  const far = planRoute(0, 12);
  assert.ok(far.discomfort > near.discomfort * 8,
    `twelve flights must hurt far more than one (${near.discomfort.toFixed(1)} vs ${far.discomfort.toFixed(1)})`);
});

test('a sky-lobby tower actually runs a day', () => {
  tower({ floors: 26, lifts: 0, seed: 4242, links: escalators(6) });
  for (let i = 0; i < 3; i++) buildShaft(6, 25, false);
  invalidateRoutes();
  for (let f = 1; f < 26; f++) {
    G.floors[f].type = f < 6 ? 'shops' : 'office';
    G.floors[f].sat = 78;
  }
  const t = runDay();
  assert.ok(t.trips > 300, `people get to work through the sky lobby (${t.trips} trips)`);
  assert.ok(avgWait(t) < 200, `and not absurdly slowly (${avgWait(t).toFixed(0)}s)`);
});

test('extending a shaft by hand reaches the new floor without a refresh', () => {
  /* The per-shaft "extend" button moved s.top and never told the route cache.
     Anyone who had already asked for the new floor kept the cached "no route",
     so its tenants never got to work — and a page refresh, which rebuilds the
     cache, made the problem vanish. That is the "it gets stuck and you have to
     refresh" report. The cache now notices the building change by itself. */
  tower({ floors: 8, lifts: 0, use: null, seed: 4242 });
  const err = buildShaft(0, 6, false);
  assert.equal(err, null);
  invalidateRoutes();
  assert.equal(planRoute(0, 7), null, 'floor 7 starts unreachable');

  G.shafts[0].top = 7;                       // exactly what the button does
  const r = planRoute(0, 7);
  assert.ok(r, 'after extending, floor 7 has a route with no explicit invalidate');
  assert.equal(shape(r), 'lift->7');
});

test('a removed shaft is never handed back from the cache', () => {
  tower({ floors: 8, lifts: 1, use: null, seed: 4242 });
  assert.ok(planRoute(0, 7), 'route via the only lift');
  G.shafts.splice(0, 1);                     // removed without an invalidate
  assert.equal(planRoute(0, 7), null, 'no lift, no route');
});

test('a new stair is used without an explicit invalidate', () => {
  tower({ floors: 8, lifts: 0, use: null, seed: 4242 });
  buildShaft(0, 5, false);
  invalidateRoutes();
  assert.equal(planRoute(0, 6), null);
  G.links[5] = { kind: 'stair' };
  assert.equal(shape(planRoute(0, 6)), 'lift->5 climb->6');
});
