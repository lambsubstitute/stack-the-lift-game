/* ---------------------------------------------------------------------------
   One-shot refactoring tool: mechanically splits the original single-file
   build into src/ modules.

   It is mechanical on purpose. Retyping seventeen hundred lines by hand is how
   you introduce silent behaviour changes; lifting each declaration verbatim and
   letting the golden-master snapshot prove nothing moved is how you don't.

   Kept in the repo as a record of how the split was done. It is not part of the
   build and never runs again.
--------------------------------------------------------------------------- */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = readFileSync(join(root, 'legacy', 'stack.legacy.html'), 'utf8')
  .split('<script>')[1].split('</script>')[0];

/* --- 1. cut the file into top-level blocks, keyed by declared name --- */
const lines = src.split('\n');
const blocks = [];
let cur = null, depth = 0;
const declRe = /^(?:function|class)\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/;

for (const line of lines) {
  if (depth === 0) {
    const m = line.match(declRe);
    if (m) { cur = { name: m[1] || m[2], body: [] }; blocks.push(cur); }
    else if (!cur) { cur = { name: '__preamble__', body: [] }; blocks.push(cur); }
  }
  cur.body.push(line);
  for (const ch of line) {
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
  }
  if (depth < 0) depth = 0;
  if (depth === 0 && /[;}]\s*$/.test(line)) cur = null;
}
const byName = new Map();
for (const b of blocks) {
  const text = b.body.join('\n').replace(/\s+$/, '');
  if (!text.trim()) continue;
  if (byName.has(b.name)) byName.set(b.name, byName.get(b.name) + '\n' + text);
  else byName.set(b.name, text);
}

/* --- 2. mutable cross-module state moves onto a single G object --- */
const STATE = ['floors','shafts','people','links','queue','cash','day','simT','speed',
               'running','star','selected','selShaft','nextId','today','graph','ghost',
               'gAcc','gcTimer'];

function toStateObject(code) {
  /* Rename must not touch comments or quoted strings. Without this, "High-speed"
     became "High-G.speed" and a tenant blurb read "within five G.floors" — the
     kind of bug a golden-master on numbers alone would never catch. Stash them,
     rename, put them back. Template literals are left in place so that ${star}
     inside one is still rewritten. */
  const stash = [];
  const hide = code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, m => {
    stash.push(m);
    return `__LIT${stash.length - 1}__`;
  });

  /* Object-literal keys share names with state: {star:2} on a tenant,
     {floors:20} in a star requirement. Neither spaces nor a NUL sentinel
     protect them — the lookbehind only refuses a dot or word character and
     matches happily across anything else. The placeholder must be MADE of word
     characters so the lookarounds block it themselves. */
  const guarded = hide.replace(
    new RegExp(`\\b(${STATE.join('|')})(\\s*:)`, 'g'),
    (_m, k, c) => `__K_${k}__${c}`
  );
  const renamed = STATE.reduce(
    (acc, name) => acc.replace(new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g'), `G.${name}`),
    guarded
  );
  return renamed
    .replace(/__K_(\w+?)__/g, '$1')
    .replace(/__LIT(\d+)__/g, (_m, i) => stash[+i]);
}

/* endOfDay used to poke the DOM directly. It now returns a summary and the UI
   decides what to show, which is what lets economy.js be unit-tested. */
function decoupleEndOfDay(text) {
  return text.replace(
    /\n\s*showEOD\([^)]*\);\n\s*renderAll\(\);\n\}/,
    `
  return { rent, maint, lost, unhappy, rose, cash: G.cash, star: G.star };
}`
  );
}

/* --- 3. which declarations belong where --- */
const MODULES = {
  'config.js': {
    header: `/* Every tunable number in the game. Nothing here imports anything, so this
   file is safe to read top to bottom when you want to know how the tower
   behaves without reading any logic. */\n`,
    names: ['BAYS','MAX_FLOOR','CORE','DOOR_MIN','WALK_SPD','GIVE_UP','DAY_START','LOBBY',
            'TEN','AMENITY_KEYS','LOBBY_COL','SHAFT_BASE','UPG','UPG_KEYS','CONN',
            'CONN_BAYS','STAR_REQ','MAINT_PER_FLOOR','OUTSIDE','SKY']
  },
  'rng.js': {
    header: `/* A seeded RNG, so a scenario replays identically every time. The test suite
   depends on this: reseed, and the same day must produce the same numbers. */\n`,
    names: ['rs','rnd','gauss','pick'],
    extra: `export function setSeed(v){ rs = v; }\nexport function getSeed(){ return rs; }\n`
  },
  'util.js': { header: '', names: ['clamp','money','hhmm','secs'] },
  'lifts.js': {
    header: `/* Shafts, cars and dispatch: collective control with directional hall calls. */\n`,
    names: ['serves','passes','shaftCost','floorCost','spanOf','upgCost','carSpd','carCap',
            'doorMin','doorPer','ctrlOf','upgTotal','buildShaft','upgradeShaft','shaftsFor',
            'extendCost','extendAllCost','coreBays','stepCar','anyAbove','anyBelow','nextStop',
            'decide','openDoors','boarderAt','stepDoors']
  },
  'connectors.js': {
    header: `/* Stairs and escalators: one floor to the next, never a queue, but resented
   more with every flight. */\n`,
    names: ['connBay','linkAt','linkOccupies','connCost','walkRoute']
  },
  'people.js': {
    header: `/* Population, daily schedules, and the choice between waiting and climbing. */\n`,
    names: ['spawnFloor','despawnFloor','amenityFloors','scheduleAll','liftEstimate',
            'beginTrip','walkTargetX','finishTrip']
  },
  'sim.js': {
    header: `/* The clock. step() advances everything by dt simulated seconds. */\n`,
    names: ['resetQueues','startDay','step']
  },
  'economy.js': {
    header: `/* Rent, satisfaction, amenities and star ratings. */\n`,
    names: ['rentMult','satBonus','reqStatus','reqProgress','endOfDay']
  }
};

const IMPORTS = {
  'config.js': [],
  'rng.js': [],
  'util.js': [],
  'state.js': [`import { TEN, MAX_FLOOR, DAY_START } from './config.js';`],
  'connectors.js': [`import { CONN, CONN_BAYS } from './config.js';`,
                    `import { G } from './state.js';`],
  'lifts.js': [`import { CORE, UPG, UPG_KEYS, SHAFT_BASE, SHAFT_PER, CONN_BAYS } from './config.js';`,
               `import { G, height } from './state.js';`,
               `import { clamp } from './util.js';`,
               `import { linkOccupies } from './connectors.js';`],
  'people.js': [`import { TEN, OUTSIDE, WALK_SPD } from './config.js';`,
                `import { G, height, eatFloors } from './state.js';`,
                `import { rnd, gauss, pick } from './rng.js';`,
                `import { serves, shaftsFor, carSpd, carCap } from './lifts.js';`,
                `import { walkRoute, connBay } from './connectors.js';`],
  'sim.js': [`import { GIVE_UP, DAY_START, DAY_END, WALK_SPD, MAX_FLOOR, CONN } from './config.js';`,
             `import { G, height } from './state.js';`,
             `import { clamp } from './util.js';`,
             `import { stepCar, ctrlOf, serves } from './lifts.js';`,
             `import { beginTrip, walkTargetX, finishTrip } from './people.js';`,
             `import { linkAt, connBay } from './connectors.js';`,
             `import { rnd } from './rng.js';`],
  'economy.js': [`import { TEN, AMENITY_KEYS, STAR_REQ, MAINT_PER_FLOOR } from './config.js';`,
                 `import { G, height, popOf, totalPop, letCount, avgSat, hasAmenity, newFloor } from './state.js';`,
                 `import { clamp } from './util.js';`,
                 `import { spanOf, upgTotal } from './lifts.js';`,
                 `import { despawnFloor } from './people.js';`]
};

mkdirSync(join(root, 'src'), { recursive: true });
const used = new Set();
for (const [file, spec] of Object.entries(MODULES)) {
  const parts = [];
  for (const n of spec.names) {
    if (!byName.has(n)) { console.warn(`  ! missing declaration: ${n} (${file})`); continue; }
    used.add(n);
    let code = toStateObject(byName.get(n));
    if (n === 'endOfDay') code = decoupleEndOfDay(code);
    parts.push(exportify(code));
  }
  const out = [
    spec.header,
    ...(IMPORTS[file] ?? []),
    '',
    parts.join('\n\n'),
    spec.extra ?? ''
  ].join('\n');
  writeFileSync(join(root, 'src', file), out.replace(/\n{3,}/g, '\n\n').trimStart() + '\n');
  console.log(`  wrote src/${file}  (${spec.names.length} declarations)`);
}

function exportify(text) {
  return text.replace(/^(function |class |const |let |var )/, 'export $1');
}

const leftovers = [...byName.keys()].filter(n => !used.has(n) && n !== '__preamble__');
console.log('\nnot auto-split (hand-written into render.js / ui.js / main.js):');
console.log('  ' + leftovers.join(', '));
