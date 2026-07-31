# STACK

[![tests](https://github.com/lambsubstitute/stack-the-lift-game/actions/workflows/ci.yml/badge.svg)](https://github.com/lambsubstitute/stack-the-lift-game/actions/workflows/ci.yml)

A tower you build, let, and then have to keep moving.

You own a building. You let its floors, and the people who move in need to get
to work in the morning and home again at night. Everything else follows from
one rule:

> **A lift shaft occupies its bay on every floor it passes, let or not.**

Capacity is always bought with the space it exists to serve. A taller tower
means longer trips, which means more shafts, which means less rentable area —
which is exactly why real supertall buildings invented sky lobbies, express
shafts and double-deck cars. All of them are in here, and all of them are worth
building for the same reasons they are worth building in reality.

---

## Running it

You need **Node 18 or newer**. There are no dependencies — not one.

```bash
git clone https://github.com/lambsubstitute/stack-the-lift-game.git
cd stack-the-lift-game
npm run build        # writes dist/stack.html
open dist/stack.html # or just double-click it
```

`dist/stack.html` is completely self-contained: one file, no server, no network.
Send it to someone and it works.

While developing:

```bash
npm run dev          # rebuild on every save
npm test             # the whole suite, about 40 seconds
npm run test:watch   # re-run on save
```

> **Why a build step at all?** Browsers refuse to load ES modules over
> `file://`, so shipping raw modules would mean running a web server just to
> play. `tools/build.mjs` is a ~90-line bundler that flattens `src/` into one
> `<script>` and inlines the CSS. Keeping the game double-clickable was worth
> more than using a real bundler and inheriting a dependency tree.

---

## Playing it

The first time you open it, a five-step tutorial walks you through letting a
floor, watching the morning rush, adding a floor, extending the lift to reach
it, and what stairs are for. It never blocks you — each step notices when you
have done the thing and moves on. Skip is always there.

After that:

| | |
|---|---|
| **Click a floor** | lease it, inspect its satisfaction, or add stairs/escalators |
| **Click a lift** in the panel | open its upgrade bench |
| **Speed controls** | ❚❚ · ×1 · ×4 · ×20 · ×60 — a full day is about 16 in-game hours |
| **End of day** | rent comes in, maintenance goes out, unhappy tenants may leave |

Watch the queues. People waiting go dark → **amber** → **red**. The graph at the
bottom is how many are waiting across the day, with yesterday ghosted behind
today so you can see whether a change actually helped.

**Three levers, not one.** More shafts is the obvious answer and the worst one —
it eats your floor area. Upgrading a shaft's motor, cabin or controller buys
capacity without taking another bay. And mixing your tenants (offices peak at
08:50, flats peak in the evening, a hotel is busy all day) flattens demand
instead of chasing it.

---

## How the code is laid out

```
src/
  config.js       every tunable number: tenants, upgrades, costs, star requirements
  rng.js          seeded RNG, so a scenario replays identically
  util.js         formatting helpers
  state.js        the whole mutable world, as one object `G`
  lifts.js        shafts, cars, dispatch, doors
  connectors.js   stairs and escalators
  people.js       population, schedules, and the choice between waiting and climbing
  sim.js          the clock: step(dt)
  economy.js      rent, satisfaction, amenities, star ratings
  render.js       everything that draws — no game rules live here
  ui.js           the panel: everything you click
  tutorial.js     the opening five steps
  main.js         boot and the animation loop
```

One rule keeps the module graph acyclic: **`state.js` imports only `config.js`,
and everything else mutates the `G` object it exports.** No module owns state
that another module needs to reassign. The bundler enforces the rest — it fails
the build on an import cycle, and on any duplicate top-level name, because the
bundle flattens everything into one scope.

`render.js`, `ui.js` and `main.js` are the only files that touch the DOM. Every
other module is pure enough to unit-test in Node with no browser.

---

## Tests

```bash
npm test
```

50 tests, no framework — Node's built-in runner.

**`golden.test.js` is the important one.** Eight scenarios were recorded from
the original single-file build *before* the code was split into modules, and
they must replay against `src/` with byte-identical results: same trips, same
people stranded, same rent, same satisfaction, same star. That is what proved
the refactor changed nothing, and it is what will catch it if a future change
moves a number you did not mean to move.

If you change balance **on purpose**:

```bash
npm run record       # re-record the snapshot from src/
```

Commit the new `snapshot.json` as its own change so the diff is reviewable.

The rest:

| file | covers |
|---|---|
| `lifts.test.js` | capacity, dispatch, upgrades, express shafts, floor-area cost |
| `people.test.js` | schedules, the shape of a day, peak timing |
| `connectors.test.js` | stair/escalator routing and how much a climb is resented |
| `economy.test.js` | rent, satisfaction, amenities, star progression |
| `tutorial.test.js` | the five steps advance on the right actions |
| `bundle.test.js` | the built file boots in a stub DOM and survives 400 frames |

Many tests name the bug they exist to prevent. Those comments are load-bearing —
they are there so nobody "simplifies" a fix back out. A sample of what they
caught:

- A car reaching the lobby still flagged "going down" refused everyone who
  wanted to go up, then reopened its doors forever. The morning peak deadlocked
  at the bottom of the shaft.
- A **full** car answering a hall call it had no room for reopened its doors,
  boarded nobody, and never departed — it parked in the lobby at capacity.
- Hall calls had no direction, so during the evening every car swept to the roof
  empty, opening its doors at each floor and boarding nobody.
- Group control without hysteresis made passengers ping-pong between cars every
  four seconds; average waits came out **worse** than not having it.
- Amenities granted more patience (+9/day) than bad service cost (−8/day), so a
  well-appointed tower gained satisfaction while its lifts failed.
- The skyline's lit windows were recomputed every frame — ~2,400 iterations,
  gated behind "is it dark". The game ran fine all morning and seized up at
  dusk. `bundle.test.js` measures night against midday to stop it regressing.

---

## `legacy/` and `tools/split*.mjs`

`legacy/stack.legacy.html` is the original single-file build, kept only so the
golden master can be re-recorded from it with `npm run record -- --legacy`.
`tools/split.mjs` and `tools/split-ui.mjs` are the one-shot scripts that
performed the refactor — mechanical on purpose, because retyping 1,700 lines by
hand is how you introduce silent behaviour changes. They never run again and can
be deleted once you no longer care about the provenance.

---

## Licence

MIT.
