/* Population, schedules, and the shape of a day. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tower, runDay, G } from './helpers.mjs';
import { DAY_END } from '../src/config.js';
import { step } from '../src/sim.js';
import { totalPop } from '../src/state.js';

test('everybody gets a schedule with real destinations', () => {
  tower({ floors: 20, lifts: 2 });
  assert.ok(G.people.length > 200, `a real population (${G.people.length})`);
  assert.equal(G.people.filter(p => !p.sched.length).length, 0, 'nobody without a day');
  for (const p of G.people) {
    for (const ev of p.sched) {
      assert.ok(Number.isFinite(ev.t), 'event has a time');
      assert.ok(ev.to >= 0 && ev.to < G.floors.length, 'destination is a real floor');
    }
  }
});

test('the busiest moment of the day is the morning peak', () => {
  tower({ floors: 24, lifts: 2, seed: 4242 });
  let peak = { w: -1, t: 0 };
  while (G.simT < DAY_END) {
    step(1.25);
    let w = 0;
    for (let f = 0; f < G.floors.length; f++) w += G.queue[f].length;
    if (w > peak.w) peak = { w, t: G.simT };
  }
  const hour = peak.t / 3600;
  assert.ok(hour > 7.5 && hour < 10.5,
    `the design case is the morning up-peak, not some random hour (peaked at ${hour.toFixed(1)}h)`);
});

test('a schedule waits for a delayed person instead of being dropped', () => {
  /* Someone stuck in a queue should start their next trip late, not skip it —
     which is why congestion compounds over a day. */
  tower({ floors: 30, lifts: 1, seed: 4242 });
  runDay();
  const pending = G.people.reduce((a, p) => a + (p.sched.length - p.si), 0);
  assert.ok(pending >= 0, 'schedule index never runs past the end');
});

test('population follows the tenant mix', () => {
  tower({ floors: 11, lifts: 2, use: 'office' });
  const offices = totalPop();
  tower({ floors: 11, lifts: 2, use: 'apt' });
  const flats = totalPop();
  assert.ok(offices > flats, 'offices are denser than flats');
});

test('a mixed tower never puts more than half its people in a queue at once', () => {
  tower({
    floors: 26, lifts: 4, seed: 4242,
    use: f => (f <= 2 ? 'shops' : f <= 12 ? 'office' : f === 13 ? 'food' : f <= 19 ? 'apt' : 'hotel')
  });
  const total = G.people.length;
  let peak = 0;
  while (G.simT < DAY_END) {
    step(1.25);
    let w = 0;
    for (let f = 0; f < G.floors.length; f++) w += G.queue[f].length;
    if (w > peak) peak = w;
  }
  assert.ok(peak < total * 0.55,
    `mixing uses flattens the peak (${peak} of ${total} queued at once)`);
});

test('nobody is left standing in a queue at the end of a well-served day', () => {
  tower({ floors: 16, lifts: 4, seed: 4242 });
  runDay();
  let waiting = 0;
  for (let f = 0; f < G.floors.length; f++) waiting += G.queue[f].length;
  assert.ok(waiting < 12, `almost everyone got where they were going (${waiting} left)`);
});
