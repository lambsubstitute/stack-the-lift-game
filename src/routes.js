/* ---------------------------------------------------------------------------
   Journey planning.

   The old chooser compared exactly two options — take a lift the whole way, or
   climb the whole way — and picked one. That made the sky lobby impossible to
   build: you could not ride an escalator to floor 6 and catch an express from
   there, which is the single arrangement every real tall building converges on.

   This plans over a layered graph instead:

     node (floor, WALK)      standing on a floor
     node (floor, shaft)     inside that shaft's car

     board    (f, WALK)  -> (f, s)      typical wait for that lift
     ride     (f, s)     -> (f±1, s)    travel time, plus a little per stop
     alight   (f, s)     -> (f, WALK)   free
     climb    (f, WALK)  -> (f±1, WALK) connector time + how much it is resented

   Dijkstra over that gives escalator-then-express for free, and any other
   combination the building happens to make sensible. Routes are cached per
   origin/destination and thrown away whenever the building changes — people
   plan on how the tower usually behaves, not on where a car happens to be this
   second, which is also what real people do.
--------------------------------------------------------------------------- */
import { G, height } from './state.js';
import { CONN } from './config.js';
import { serves, carSpd, carCap } from './lifts.js';
import { linkAt } from './connectors.js';

const WALK = -1;                 // the "on foot" layer
const STOP_PENALTY = 3.2;        // a ride is slower than pure travel: doors, stops
const CLIMB_WEIGHT = 1.4;        // how heavily discomfort counts against time
const BOARD_BASE = 14;           // typical wait for a lift you have just called

let cache = new Map();
let cacheSig = '';

/** Call whenever the building changes shape. */
export function invalidateRoutes() { cache = new Map(); cacheSig = ''; }

/* Everything a journey plan depends on: how tall the tower is, where every
   shaft runs and how fast it is, and which floors are joined by stairs or
   escalators. planRoute checks this on every call and drops the cache when it
   changes, so a caller that forgets invalidateRoutes() can no longer strand
   anyone. One did: the per-shaft "extend" button moved s.top without it, so
   whoever had already been told "no route" to a new floor kept that answer
   for good — the floor stayed unreachable until the player refreshed the page,
   which rebuilds the cache from scratch. */
function buildingSig() {
  let sig = height() + '|';
  for (const s of G.shafts) {
    sig += s.id + ':' + s.bottom + '-' + s.top + (s.express ? 'x' : '') + ':' +
           s.up.motor + s.up.cabin + s.up.control + ',';
  }
  sig += '|';
  for (let f = 0; f < G.links.length; f++) if (G.links[f]) sig += f + G.links[f].kind + ',';
  return sig;
}

/** Typical, not instantaneous — see the note above. */
function boardCost(s) {
  return BOARD_BASE + (height() / Math.max(1, carCap(s))) * 1.6;
}

/**
 * @returns {null | {legs: Array<{kind:'lift'|'climb', shaft?:object, to:number}>, cost:number}}
 */
export function planRoute(from, to) {
  if (from === to) return { legs: [], cost: 0 };
  const sig = buildingSig();
  if (sig !== cacheSig) { cache = new Map(); cacheSig = sig; }
  const key = from * 128 + to;
  if (cache.has(key)) return cache.get(key);

  const H = height();
  const shafts = G.shafts;
  const layers = shafts.length + 1;                  // WALK plus one per shaft
  const idx = (f, l) => f * layers + l;              // l: 0 = WALK, 1.. = shaft i-1
  const N = H * layers;

  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);

  const start = idx(from, 0);
  dist[start] = 0;

  /* A binary heap is overkill at this size; N is a few hundred and this runs
     once per origin/destination pair, then is cached. */
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;

    const f = (u / layers) | 0;
    const l = u % layers;
    if (f === to && l === 0) break;

    const relax = (v, w) => {
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    };

    if (l === 0) {
      // board any shaft that stops here
      for (let i = 0; i < shafts.length; i++) {
        const s = shafts[i];
        if (!serves(s, f)) continue;
        relax(idx(f, i + 1), boardCost(s));
      }
      // climb to an adjacent floor
      for (const d of [-1, 1]) {
        const nf = f + d;
        if (nf < 0 || nf >= H) continue;
        const L = linkAt(d > 0 ? f : nf);
        if (!L) continue;
        const C = CONN[L.kind];
        relax(idx(nf, 0), (d > 0 ? C.up : C.down) + C.penalty * CLIMB_WEIGHT);
      }
    } else {
      const s = shafts[l - 1];
      // step the car one floor
      for (const d of [-1, 1]) {
        const nf = f + d;
        if (nf < 0 || nf >= H) continue;
        if (nf < (s.express ? 0 : s.bottom) || nf > s.top) continue;
        relax(idx(nf, l), 1 / carSpd(s) + (serves(s, nf) ? STOP_PENALTY * 0.25 : 0));
      }
      // step out where it stops
      if (serves(s, f)) relax(idx(f, 0), STOP_PENALTY);
    }
  }

  const goal = idx(to, 0);
  let result = null;
  if (dist[goal] < Infinity) {
    /* Walk the predecessors back and collapse them into legs: a run inside one
       shaft is a single ride, a run of connectors is a single climb. */
    const path = [];
    for (let v = goal; v !== -1; v = prev[v]) path.push(v);
    path.reverse();

    const legs = [];
    for (let i = 1; i < path.length; i++) {
      const pf = (path[i - 1] / layers) | 0, pl = path[i - 1] % layers;
      const cf = (path[i] / layers) | 0, cl = path[i] % layers;
      if (pl === 0 && cl === 0) {
        // a climb; extend the previous one if it is also a climb
        const last = legs[legs.length - 1];
        if (last && last.kind === 'climb') last.to = cf;
        else legs.push({ kind: 'climb', to: cf });
      } else if (pl > 0 && cl === 0 && pf === cf) {
        // alighting: the ride leg already recorded where it ends
        if (legs.length) legs[legs.length - 1].to = cf;
      } else if (pl === 0 && cl > 0) {
        legs.push({ kind: 'lift', shaft: shafts[cl - 1], to: cf });
      } else if (pl > 0 && cl > 0) {
        legs[legs.length - 1].to = cf;
      }
    }
    /* Discomfort of the climbing parts, on the same curve connectors.js uses:
       it grows faster than the number of flights. */
    let pen = 0, segs = 0, at = from;
    for (const leg of legs) {
      if (leg.kind === 'climb') {
        const lo = Math.min(at, leg.to), hi = Math.max(at, leg.to);
        for (let f = lo; f < hi; f++) { const L = linkAt(f); if (L) { pen += CONN[L.kind].penalty; segs++; } }
      }
      at = leg.to;
    }
    const discomfort = segs ? pen * Math.pow(segs, 0.35) : 0;
    result = { legs: legs.filter(l => l.kind !== 'lift' || l.to !== undefined), cost: dist[goal], discomfort };
  }

  cache.set(key, result);
  return result;
}
