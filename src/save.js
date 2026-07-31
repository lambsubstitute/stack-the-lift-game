/* ---------------------------------------------------------------------------
   Saving.

   People are NOT saved. There can be nearly two thousand of them, each with a
   schedule, and every one is derivable from the floors they live on — so the
   save is the building plus the books, and the population is rebuilt on load.
   That keeps a save around 2 kB instead of a megabyte, and it means a save from
   an older build still loads after the population model changes.
--------------------------------------------------------------------------- */
import { G, resetWorld, newFloor } from './state.js';
import { MAX_FLOOR } from './config.js';
import { spawnFloor, scheduleAll } from './people.js';
import { startDay } from './sim.js';
import { invalidateRoutes } from './routes.js';

const KEY = 'stack.save.v1';
const VERSION = 1;

export function snapshot() {
  return {
    v: VERSION,
    cash: Math.round(G.cash),
    day: G.day,
    star: G.star,
    debtDays: G.debtDays,
    floors: G.floors.map(f => (f.type ? { t: f.type, s: Math.round(f.sat), a: f.age } : 0)),
    shafts: G.shafts.map(s => ({
      b: s.bay, lo: s.bottom, hi: s.top, x: s.express ? 1 : 0,
      u: [s.up.motor, s.up.cabin, s.up.control]
    })),
    links: G.links.map(l => (l ? l.kind : 0))
  };
}

export function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot()));
    return true;
  } catch { return false; }
}

export function hasSave() {
  try { return !!window.localStorage.getItem(KEY); } catch { return false; }
}

export function clearSave() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Rebuild the world from a snapshot. Returns false if there is nothing valid. */
export function restore(data) {
  const d = data ?? readStored();
  if (!d || d.v !== VERSION || !Array.isArray(d.floors)) return false;

  resetWorld({ cash: d.cash, floorCount: d.floors.length });
  G.day = d.day ?? 1;
  G.star = d.star ?? 1;
  G.debtDays = d.debtDays ?? 0;

  d.floors.forEach((f, i) => {
    if (!f || i === 0) return;
    G.floors[i] = { ...newFloor(), type: f.t, sat: f.s ?? 78, age: f.a ?? 0 };
  });

  G.links = new Array(MAX_FLOOR).fill(null);
  (d.links ?? []).forEach((k, i) => { if (k) G.links[i] = { kind: k }; });

  for (const s of d.shafts ?? []) {
    G.shafts.push({
      id: G.nextId++, bay: s.b, bottom: s.lo, top: s.hi, express: !!s.x,
      up: { motor: s.u?.[0] ?? 0, cabin: s.u?.[1] ?? 0, control: s.u?.[2] ?? 0 },
      car: { y: s.lo, dir: 0, state: 'idle', stops: new Set(), callUp: new Set(),
             callDown: new Set(), riders: [], doorT: 0, cw: 0 }
    });
  }
  G.shafts.sort((a, b) => a.bay - b.bay);

  // the population is derived, never stored
  for (let f = 1; f < G.floors.length; f++) if (G.floors[f].type) spawnFloor(f);
  invalidateRoutes();
  scheduleAll();
  startDay();
  return true;
}

function readStored() {
  try { return JSON.parse(window.localStorage.getItem(KEY) || 'null'); }
  catch { return null; }
}
