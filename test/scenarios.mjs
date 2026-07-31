/* ---------------------------------------------------------------------------
   Scenarios used by BOTH the golden-master recorder (which drives the old
   single-file build) and the module test suite. Because both sides run exactly
   these, a refactor that changes any observable number will fail loudly.

   Every scenario is fully deterministic: the adapter reseeds the RNG on reset,
   so the same inputs must always produce the same trips, waits and rent.
--------------------------------------------------------------------------- */

/** @typedef {import('./adapters/types.js').Adapter} Adapter */

const officeTower = (floors, lifts) => ({
  floors,
  lifts: [{ bottom: 0, top: floors - 1, express: false, count: lifts }],
  lease: f => (f === 11 || f === 23 ? 'food' : 'office')
});

export const SCENARIOS = [
  {
    name: 'small tower, one lift',
    seed: 555111,
    ...officeTower(8, 1),
    days: 2
  },
  {
    name: 'mid tower, three lifts',
    seed: 555111,
    ...officeTower(20, 3),
    days: 2
  },
  {
    name: 'tall tower, under-lifted',
    seed: 778899,
    ...officeTower(30, 2),
    days: 1
  },
  {
    name: 'upgraded lifts',
    seed: 555111,
    ...officeTower(24, 2),
    star: 5,
    upgrades: [
      { shaft: 0, track: 'motor', levels: 3 },
      { shaft: 0, track: 'cabin', levels: 3 },
      { shaft: 1, track: 'control', levels: 2 }
    ],
    days: 1
  },
  {
    name: 'express plus escalator podium',
    seed: 555111,
    floors: 24,
    star: 5,
    lifts: [{ bottom: 6, top: 23, express: true, count: 3 }],
    links: Array.from({ length: 6 }, (_, f) => ({ floor: f, kind: 'esc' })),
    lease: f => (f < 6 ? 'shops' : f === 13 ? 'food' : 'office'),
    days: 1
  },
  {
    name: 'stairs only, no lifts',
    seed: 555111,
    floors: 6,
    lifts: [],
    links: Array.from({ length: 5 }, (_, f) => ({ floor: f, kind: 'stair' })),
    lease: () => 'office',
    days: 1
  },
  {
    name: 'amenities change rent and traffic',
    seed: 778899,
    floors: 22,
    star: 5,
    lifts: [{ bottom: 0, top: 21, express: false, count: 3 }],
    lease: f => (f === 10 ? 'foodcourt' : f === 11 ? 'gym' : f === 12 ? 'conf' : f <= 3 ? 'apt' : 'office'),
    days: 2
  },
  {
    name: 'mixed-use, four lifts, two days',
    seed: 20240931,
    floors: 26,
    star: 5,
    lifts: [{ bottom: 0, top: 25, express: false, count: 4 }],
    lease: f => (f <= 2 ? 'shops' : f <= 12 ? 'office' : f === 13 ? 'food' : f <= 19 ? 'apt' : 'hotel'),
    days: 2
  }
];

/**
 * Drive one scenario through an adapter and return every number worth pinning.
 * @param {Adapter} api
 */
export function runScenario(api, sc) {
  api.reset(sc.seed);
  if (sc.star) api.setStar(sc.star);
  api.setFloors(sc.floors);

  for (const spec of sc.lifts ?? []) {
    for (let i = 0; i < (spec.count ?? 1); i++) {
      api.buildShaft(spec.bottom, spec.top, spec.express);
    }
  }
  for (const l of sc.links ?? []) api.setLink(l.floor, l.kind);
  for (let f = 1; f < sc.floors; f++) {
    const kind = sc.lease(f);
    if (kind) api.lease(f, kind);
  }
  for (const u of sc.upgrades ?? []) {
    for (let i = 0; i < u.levels; i++) api.upgrade(u.shaft, u.track);
  }

  api.beginDay();
  const days = [];
  for (let d = 0; d < (sc.days ?? 1); d++) {
    const traffic = api.runDay();
    const books = api.endDay();
    days.push({
      trips: traffic.trips,
      gaveUp: traffic.gave,
      waitSum: round(traffic.waitSum),
      rent: books.rent,
      maint: books.maint,
      star: books.star,
      satisfaction: round(books.avgSat),
      tenants: books.tenants
    });
    api.beginDay();
  }

  return {
    scenario: sc.name,
    population: api.population(),
    coreBays: api.coreBays(),
    days
  };
}

const round = n => Math.round(n * 100) / 100;

export function runAll(api) {
  return SCENARIOS.map(sc => runScenario(api, sc));
}
