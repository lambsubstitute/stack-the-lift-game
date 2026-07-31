/* Adapter over the refactored src/ modules. Deliberately mirrors the legacy
   adapter one-for-one so the same scenarios drive both. */
import { G, resetWorld, newFloor, totalPop, letCount, avgSat } from '../../src/state.js';
import { MAX_FLOOR, DAY_END } from '../../src/config.js';
import { setSeed } from '../../src/rng.js';
import { buildShaft, upgradeShaft, coreBays } from '../../src/lifts.js';
import { spawnFloor, scheduleAll } from '../../src/people.js';
import { invalidateRoutes } from '../../src/routes.js';
import { step, startDay } from '../../src/sim.js';
import { endOfDay } from '../../src/economy.js';

export function createModuleAdapter() {
  return {
    name: 'modules',
    reset(seed) {
      resetWorld({ cash: 9e6, floorCount: 1 });
      G.star = 5;
      setSeed(seed);
    },
    setStar(s) { G.star = s; },
    setFloors(n) { while (G.floors.length < n) G.floors.push(newFloor()); },
    buildShaft(bottom, top, express) { buildShaft(bottom, top, !!express); },
    upgrade(i, track) { upgradeShaft(G.shafts[i], track); },
    setLink(f, kind) { G.links[f] = { kind }; },
    lease(f, kind) {
      G.floors[f].type = kind;
      G.floors[f].sat = 78;
      G.floors[f].age = 0;
      spawnFloor(f);
    },
    beginDay() { invalidateRoutes(); scheduleAll(); startDay(); },
    runDay() {
      while (G.simT < DAY_END) step(1.25);
      return { ...G.today };
    },
    endDay() {
      endOfDay();
      return {
        rent: G.today.rent,
        maint: G.today.maint,
        star: G.star,
        avgSat: avgSat(),
        tenants: letCount()
      };
    },
    population() { return totalPop(); },
    coreBays() { return coreBays(); }
  };
}
