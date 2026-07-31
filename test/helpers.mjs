/* Shared fixtures for the unit suites. Every test builds its tower through
   these so a scenario reads as a sentence rather than fifteen lines of setup. */
import { G, resetWorld, newFloor, avgSat, letCount, totalPop } from '../src/state.js';
import { DAY_END, MAX_FLOOR } from '../src/config.js';
import { setSeed } from '../src/rng.js';
import { buildShaft, upgradeShaft, coreBays } from '../src/lifts.js';
import { spawnFloor, scheduleAll } from '../src/people.js';
import { invalidateRoutes } from '../src/routes.js';
import { step, startDay } from '../src/sim.js';
import { endOfDay } from '../src/economy.js';

/**
 * Stand up a tower.
 * @param {object} o
 * @param {number} o.floors     total floors including the lobby
 * @param {number} o.lifts      full-height shafts
 * @param {function|string} o.use   tenant kind per floor
 * @param {object[]} o.links    [{floor, kind}]
 * @param {number} o.seed
 */
export function tower({
  floors = 12,
  lifts = 2,
  use = 'office',
  links = [],
  seed = 4242,
  star = 5,
  cash = 9e6,
  express = null
} = {}) {
  resetWorld({ cash, floorCount: 1 });
  G.star = star;
  setSeed(seed);
  while (G.floors.length < floors) G.floors.push(newFloor());

  for (let i = 0; i < lifts; i++) buildShaft(0, floors - 1, false);
  if (express) for (let i = 0; i < express.count; i++) buildShaft(express.bottom, floors - 1, true);
  for (const l of links) G.links[l.floor] = { kind: l.kind };

  const pick = typeof use === 'function' ? use : () => use;
  for (let f = 1; f < floors; f++) {
    const kind = pick(f);
    if (!kind) continue;
    G.floors[f].type = kind;
    G.floors[f].sat = 78;
    G.floors[f].age = 0;
    spawnFloor(f);
  }
  invalidateRoutes();
  scheduleAll();
  startDay();
  return G;
}

/** Run one full day and return the traffic it produced. */
export function runDay(dt = 1.25) {
  while (G.simT < DAY_END) step(dt);
  return { ...G.today };
}

/** Run a day, close the books, and start the next one. */
export function runAndClose(dt = 1.25) {
  const traffic = runDay(dt);
  const books = endOfDay();
  const summary = {
    ...traffic,
    ...books,
    avgSat: avgSat(),
    tenants: letCount(),
    population: totalPop(),
    coreBays: coreBays()
  };
  scheduleAll();
  startDay();
  return summary;
}

export function upgradeAll(track, levels = 9) {
  for (const s of G.shafts) for (let i = 0; i < levels; i++) upgradeShaft(s, track);
}

export const avgWait = t => (t.trips ? t.waitSum / t.trips : 0);
export { G, MAX_FLOOR };
