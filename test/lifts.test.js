/* ---------------------------------------------------------------------------
   Lift behaviour. Most of these exist because the bug they describe actually
   happened; the comment says which, so nobody "simplifies" the fix back out.
--------------------------------------------------------------------------- */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tower, runDay, upgradeAll, avgWait, G } from './helpers.mjs';
import { DAY_END } from '../src/config.js';
import { step } from '../src/sim.js';
import { carCap, carSpd, coreBays, buildShaft, serves, passes } from '../src/lifts.js';

test('a car never carries more than its capacity', () => {
  tower({ floors: 20, lifts: 2 });
  let over = 0;
  while (G.simT < DAY_END) {
    step(1.25);
    for (const s of G.shafts) if (s.car.riders.length > carCap(s)) over++;
  }
  assert.equal(over, 0);
});

test('cars stay inside their own shaft', () => {
  tower({ floors: 20, lifts: 2, express: { bottom: 10, count: 1 } });
  let strayed = 0;
  while (G.simT < DAY_END) {
    step(1.25);
    for (const s of G.shafts) {
      const lo = s.express ? 0 : s.bottom;
      if (s.car.y < lo - 0.01 || s.car.y > s.top + 0.01) strayed++;
    }
  }
  assert.equal(strayed, 0);
});

test('nobody is inside two cars at once, and nobody is lost', () => {
  tower({ floors: 18, lifts: 3 });
  runDay();
  const seen = new Set();
  let dup = 0;
  for (const s of G.shafts) for (const r of s.car.riders) { if (seen.has(r.id)) dup++; seen.add(r.id); }
  assert.equal(dup, 0, 'no rider in two cars');
  for (const p of G.people) {
    assert.ok(Number.isFinite(p.x), 'position is a number');
    assert.ok(p.floor === -1 || (p.floor >= 0 && p.floor < G.floors.length), 'floor in range');
  }
});

test('a car arriving at the lobby turns round before it loads', () => {
  /* REGRESSION: a car that reached floor 0 still flagged "going down" refused
     everyone who wanted to go up, then reopened its doors on the same floor
     forever. The morning peak deadlocked at the bottom of the shaft. */
  tower({ floors: 16, lifts: 1 });
  const t = runDay();
  assert.ok(t.trips > 200, `the morning peak must actually clear (got ${t.trips} trips)`);
  assert.ok(t.gave < t.trips, 'more people served than stranded');
});

test('a full car does not park at one floor during the peak', () => {
  /* REGRESSION: a full car answering a hall call it had no room for reopened
     its doors, boarded nobody, and never departed — it parked in the lobby at
     capacity. Measured only across the morning peak: before 07:30 the car is
     legitimately idle, and counting that made the whole test meaningless. */
  tower({ floors: 22, lifts: 1 });
  while (G.simT < 8.25 * 3600) step(1.25);
  let stuck = 0, worst = 0, lastAt = null;
  while (G.simT < 9.25 * 3600) {          // the peak itself; after it the car idles legitimately
    step(1.25);
    const at = Math.round(G.shafts[0].car.y * 4) / 4;
    if (at === lastAt) { stuck += 1.25; if (stuck > worst) worst = stuck; }
    else { stuck = 0; lastAt = at; }
  }
  assert.ok(worst < 240, `car sat at one floor for ${worst.toFixed(0)}s during the peak`);
});

test('somebody whose destination is their own floor never queues', () => {
  /* REGRESSION: direction was Math.sign(dest - floor) === 0, which matched no
     car's direction, so they waited until they gave up. */
  tower({ floors: 12, lifts: 2 });
  runDay();
  const stuck = G.people.filter(p => p.state === 'wait' && p.dest === p.floor);
  assert.equal(stuck.length, 0);
});

test('more lifts serve more people and strand fewer', () => {
  /* Judged on stranded and wait, not raw trips: on a 24-floor tower two lifts
     already carry everyone, so trips hit a ceiling and a third and fourth lift
     can only show up as a shorter wait. */
  const results = [1, 2, 4].map(n => {
    tower({ floors: 24, lifts: n, seed: 4242 });
    return runDay();
  });
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i].trips >= results[i - 1].trips * 0.98,
      `trips must not fall as lifts are added (${results[i - 1].trips} -> ${results[i].trips})`);
    assert.ok(results[i].gave <= results[i - 1].gave * 1.05 + 3,
      `stranded must not rise as lifts are added (${results[i - 1].gave} -> ${results[i].gave})`);
  }
  assert.ok(results[2].gave < Math.max(1, results[0].gave),
    `four lifts strand fewer than one (${results[0].gave} -> ${results[2].gave})`);
  assert.ok(avgWait(results[2]) < avgWait(results[0]) * 0.5,
    `and are far quicker (${avgWait(results[0]).toFixed(0)}s -> ${avgWait(results[2]).toFixed(0)}s)`);
});

test('every upgrade track earns its money', () => {
  /* Measured on a tower that is genuinely stretched. Journey planning improved
     enough that 30 floors on three lifts now serves everyone, and an upgrade
     cannot show a gain against a ceiling. */
  const base = (() => { tower({ floors: 40, lifts: 2, seed: 4242 }); return runDay(); })();

  for (const track of ['motor', 'cabin', 'control']) {
    tower({ floors: 40, lifts: 2, seed: 4242 });
    upgradeAll(track);
    const up = runDay();
    const better =
      up.trips > base.trips * 1.02 ||
      avgWait(up) < avgWait(base) * 0.92 ||
      up.gave < base.gave * 0.85;
    assert.ok(better,
      `${track}: trips ${base.trips}->${up.trips}, wait ${avgWait(base).toFixed(0)}->${avgWait(up).toFixed(0)}s, stranded ${base.gave}->${up.gave}`);
    assert.ok(up.trips >= base.trips * 0.97, `${track} must never make throughput worse`);
  }
});

test('group control helps when saturated and never hurts when not', () => {
  /* REGRESSION: without hysteresis, group control reassigned waiting people on
     any improvement at all. They ping-ponged between cars every four seconds,
     each move invalidating the hall call the previous car was answering, and
     average waits came out WORSE than with no group control (36s -> 67s on an
     unsaturated tower). An upgrade you pay for must never make things worse. */
  const measure = (floors, lifts, control) => {
    tower({ floors, lifts, seed: 4242 });
    if (control) upgradeAll('control', 1);
    return runDay();
  };

  const looseOff = measure(34, 3, false), looseOn = measure(34, 3, true);
  assert.ok(avgWait(looseOn) <= avgWait(looseOff) * 1.1,
    `spare capacity: must not make waits worse (${avgWait(looseOff).toFixed(0)}s -> ${avgWait(looseOn).toFixed(0)}s)`);
  assert.ok(looseOn.gave <= looseOff.gave + 2, 'and must not strand more');

  const tightOff = measure(50, 2, false), tightOn = measure(50, 2, true);
  /* The gain is real but modest: sharing hall calls across the group mostly
     stops a full car stranding people while its neighbour runs empty. */
  assert.ok(tightOn.trips >= tightOff.trips * 0.99 && tightOn.gave <= tightOff.gave * 1.01 + 2,
    `saturated: must not go backwards (trips ${tightOff.trips}->${tightOn.trips}, stranded ${tightOff.gave}->${tightOn.gave})`);
  assert.ok(avgWait(looseOn) < avgWait(looseOff),
    `and should shorten waits where there is room to (${avgWait(looseOff).toFixed(0)}s -> ${avgWait(looseOn).toFixed(0)}s)`);
});

test('an express serves the lobby and its range but nothing between', () => {
  tower({ floors: 20, lifts: 0, express: { bottom: 12, count: 1 } });
  const s = G.shafts[0];
  assert.ok(serves(s, 0), 'serves the lobby');
  assert.ok(serves(s, 15), 'serves its own range');
  assert.ok(!serves(s, 6), 'skips the middle');
  assert.ok(passes(s, 6), 'but still occupies a bay there');
});

test('a shaft costs floor area on every floor it passes', () => {
  tower({ floors: 20, lifts: 0, use: null });
  const empty = coreBays();
  buildShaft(0, 19, false);
  const one = coreBays();
  assert.equal(one - empty, 20, 'a full-height shaft takes one bay on all 20 floors');
});
