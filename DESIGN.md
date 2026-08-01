# STACK — design notes

Written to be dropped into project knowledge, so a future conversation can pick
this up without re-deriving it. Repo: `lambsubstitute/stack-the-lift-game`.

---

## What it is

A cross-section tower you build, let, and then have to keep moving. You own the
building; the people who move in need to get to work in the morning and home at
night.

**The one rule everything comes from:**

> A lift shaft occupies its bay on every floor it passes, let or not.

Capacity is always bought with the floor area it exists to serve. Taller tower →
longer trips → more shafts → less rentable space. That single constraint is why
sky lobbies, express shafts and double-deck cars exist in real buildings, and
they're all worth building here for the same reasons.

## How it got here

It started as a different game. **Watershed** — a city builder where you only
build the water infrastructure — was designed, prototyped and abandoned. Two
reasons worth remembering:

1. Its hook ("you only build the thing nobody sees") was in direct conflict with
   what the player actually enjoys: watching a system cope, and building
   something good-looking. Invisible infrastructure can't be watched or admired.
2. The prototype was beautiful and inert. Terrain was built before motion, and
   it took two rounds to notice nothing moved.

**The lesson that shaped Stack: build the watchable moment first.** Stack's first
build was a day running, people queuing, cars moving — ugly but alive — before
any economy, art or progression.

Also worth knowing: the earlier design assumed a player who liked crisis
management and punishment (cholera outbreaks, poisoning your own water supply).
That was writing for the wrong person. Stack's failure states are soft: bad
service bleeds satisfaction, tenants leave, nothing is sudden.

## Systems

| | |
|---|---|
| **Tenants** | shops, offices, apartments, restaurants, hotel, penthouses — each with its own daily traffic profile |
| **Amenities** | food court, gym & spa, conference centre, sky garden, observation deck; one of each, tower-wide rent bonuses, and each is also a destination that fills your lifts |
| **Lifts** | shafts with per-shaft upgrades: motor (speed), cabin (capacity + loading), controller (collective → group control → destination dispatch) |
| **Express shafts** | serve the lobby and a range, skipping the middle — but still occupy a bay on every floor they pass |
| **Connectors** | stairs and escalators join one floor to the next; never queue, cost almost nothing, but resentment compounds with every flight |
| **Journey planning** | Dijkstra over a layered graph, so a trip can chain escalator → express. This is what makes sky lobbies buildable |
| **Economy** | daily rent scaled by satisfaction, lift maintenance, overdraft interest, bankruptcy |
| **Progression** | five star ratings, each with a multi-part checklist (population, floors, lifts, amenities, satisfaction) |

## The three levers

Players reach for more shafts first; it's the worst answer because it eats
rentable area. The other two:

- **Upgrade** a shaft — capacity without taking another bay.
- **Mix the tenants** — offices peak at 08:50, flats in the evening, a hotel is
  busy all day. Mixing flattens demand instead of chasing it.

## Balance figures that matter

- Morning arrivals cluster tightly (σ ≈ 15 min). Spread over ninety minutes
  instead, one car could serve an eighteen-storey tower and the game evaporated.
- Satisfaction is graded against real lift standards: ~30 s average wait is
  good, over a minute is poor. Rewarding 90 s waits made bad towers thrive.
- Amenity patience is capped at +4/day, deliberately below the −8 for poor
  service: a spa softens a mediocre lift, it must never excuse a bad one.
- Star targets: ★2 at 120 people, ★3 at 350, ★4 at 750, ★5 at 1,300 — reachable
  in a 60-floor tower, which tops out near 1,700.
- Difficulty gradient, verified: 29 floors on one lift → 160 s waits, every
  tenant gone in ten days. 17 floors on one lift → 37 s, survivable. 17 on four
  → 13 s, delighted.

## Bugs that shaped the design

Each of these is now a named regression test. They are listed because the
comments in the tests are load-bearing — they exist so nobody "simplifies" a fix
back out.

- A car reaching the lobby still flagged "going down" refused everyone wanting
  to go up, then reopened its doors forever. The morning peak deadlocked.
- Hall calls had no direction, so every evening the cars swept to the roof empty,
  opening their doors at each floor and boarding nobody.
- A **full** car answering a call it had no room for reopened its doors, boarded
  nobody and never departed — it parked in the lobby at capacity.
- Loading was instantaneous, so the door dwell was secretly a passenger
  collection window and "faster doors" made cars carry fewer people.
- Group control without hysteresis made passengers ping-pong between cars every
  four seconds; waits came out worse than not having it at all.
- Caching a route pinned one shaft, so every identical journey piled into the
  same car while its neighbours idled (9 → 428 stranded on a podium tower).
- Giving every tower dynamic car selection made group control worthless. Without
  a group controller you press a button for one lift and commit to it — that IS
  the upgrade.
- The skyline's lit windows were recomputed every frame, gated behind "is it
  dark", so the game ran fine all morning and seized up at dusk.
- The refactor's mechanical rename leaked `G.` into on-screen prose ("Avg wait
  G.today"), and in one place dropped the `G.` instead — `today.gave` killed the
  end-of-day panel at 23:00. No test had ever driven a whole day through the
  DOM. `bundle.test.js` now does, and `prose.test.js` fails on any state name
  appearing in text a player reads.
- The night-cost test was vacuous: it ran 4,000 frames at the default speed,
  about forty-five minutes of game time, and compared midday against midday. It
  now uses the ×60 control and asserts the clock reached the evening.

## Architecture

`src/` is thirteen modules. `state.js` imports only `config.js` and exports one
mutable `G`; everything else mutates it. That single rule keeps the graph
acyclic. `render.js`, `ui.js` and `main.js` are the only files that touch a DOM,
so everything else unit-tests in Node.

`tools/build.mjs` is a ~90-line dependency-free bundler that flattens `src/` into
one double-clickable `dist/stack.html`, and fails the build on import cycles or
duplicate top-level names.

**`test/golden.test.js` is the safety net.** Eight scenarios recorded before the
single-file build was split into modules, replayed against `src/` and required to
match exactly. Re-record deliberately with `npm run record`, as its own commit.

## Known gaps / next

1. **Floors don't subdivide.** Every floor is one tenant across 16 bays. Letting
   a plate hold a large, two mediums or four smalls would make the bays lost to
   the core a concrete constraint you feel on every lease. This changes the data
   model and deserves its own pass plus a golden re-record.
2. Leases and named tenants — fixed terms, renewal conditional on service.
3. "Why is this floor unhappy" — show the worst waits, not just a percentage.
4. Street life: people arriving and leaving at pavement level.
5. No end-of-run score or summary.
