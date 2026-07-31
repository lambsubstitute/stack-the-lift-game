/* The whole mutable world in one object.

   Modules import G and mutate it; nothing else holds game state. That single
   rule is what keeps the module graph acyclic — state.js imports only config,
   so every other module can depend on it freely. */

import { DAY_START, MAX_FLOOR, TEN } from './config.js';

export const G = {
  /* the building */
  floors: [],          // index 0 is the lobby; {type, sat, waitSum, waitN, gave, age}
  shafts: [],          // lift shafts, one car each
  links: [],           // links[f] joins floor f to f+1 (stairs or escalator)
  people: [],
  queue: [],           // queue[f] = people waiting on floor f

  /* the books */
  cash: 145000,
  day: 1,
  star: 1,
  debtDays: 0,      // consecutive days ending overdrawn
  today: { trips: 0, waitSum: 0, gave: 0, rent: 0, maint: 0 },

  /* the clock */
  simT: DAY_START,
  speed: 4,
  running: true,

  /* chrome */
  selected: -1,
  selShaft: null,
  nextId: 0,
  graph: [],
  ghost: [],
  gAcc: 0,
  gcTimer: 0
};

/** Wipe back to a brand-new tower. Boot uses it; so does every test scenario. */
export function resetWorld({ cash = 145000, floorCount = 6 } = {}) {
  G.floors = [];
  for (let i = 0; i < floorCount; i++) G.floors.push(newFloor());
  G.shafts = [];
  G.people = [];
  G.links = new Array(MAX_FLOOR).fill(null);
  G.queue = [];
  G.cash = cash;
  G.day = 1;
  G.star = 1;
  G.debtDays = 0;
  G.simT = DAY_START;
  G.selected = -1;
  G.selShaft = null;
  G.nextId = 0;
  G.graph = [];
  G.ghost = [];
  G.today = { trips: 0, waitSum: 0, gave: 0, rent: 0, maint: 0 };
}

export const height = () => G.floors.length;

export const popOf = f => (G.floors[f].type ? TEN[G.floors[f].type].pop : 0);

export const totalPop = () => G.floors.reduce((a, _, i) => a + popOf(i), 0);

export const eatFloors = () =>
  G.floors.map((f, i) => (f.type && TEN[f.type].eat ? i : -1)).filter(i => i > 0);

export function newFloor() { return { type: null, sat: 78, waitSum: 0, waitN: 0, gave: 0, age: 0 }; }

export const letCount = () => G.floors.filter((f, i) => i > 0 && f.type).length;

export function avgSat() {
  const L = G.floors.filter((f, i) => i > 0 && f.type);
  return L.length ? L.reduce((a, f) => a + f.sat, 0) / L.length : 0;
}

export const hasAmenity = k => G.floors.some(f => f.type === k);
