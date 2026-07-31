/* Phase two of the one-shot split: the DOM-facing sections.

   render.js, ui.js and main.js are lifted whole by section banner rather than
   by declaration, because they are already contiguous in the original and are
   full of anonymous event-wiring statements that a declaration parser cannot
   name. Same verbatim-lift principle as phase one.
--------------------------------------------------------------------------- */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = readFileSync(join(root, 'legacy', 'stack.legacy.html'), 'utf8')
  .split('<script>')[1].split('</script>')[0];

const STATE = ['floors','shafts','people','links','queue','cash','day','simT','speed',
               'running','star','selected','selShaft','nextId','today','graph','ghost',
               'gAcc','gcTimer'];

function toStateObject(code) {
  const stash = [];
  const hide = code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, m => {
    stash.push(m); return `__LIT${stash.length - 1}__`;
  });
  const guarded = hide.replace(new RegExp(`\\b(${STATE.join('|')})(\\s*:)`, 'g'),
    (_m, k, c) => `__K_${k}__${c}`);
  const renamed = STATE.reduce(
    (acc, n) => acc.replace(new RegExp(`(?<![.\\w$])${n}(?![\\w$])`, 'g'), `G.${n}`), guarded);
  return renamed.replace(/__K_(\w+?)__/g, '$1').replace(/__LIT(\d+)__/g, (_m, i) => stash[+i]);
}

const at = title => src.indexOf(`   ${title}\n`);
const cut = (from, to) => src.slice(src.lastIndexOf('/* ===', at(from)), to ? src.lastIndexOf('/* ===', at(to)) : src.length);

const sections = {
  render: cut('RENDER', 'UI'),
  ui: cut('UI', 'LOOP'),
  main: cut('LOOP')
};

/* Declarations each section needs from the simulation modules. */
const HEADERS = {
  render: `/* Everything that draws. No game rules live here — render.js reads state and
   paints it, and is the only module allowed to touch the canvas. */
import { G, height, popOf } from './state.js';
import { BAYS, TEN, LOBBY_COL, CONN_BAYS, DAY_START, DAY_END, SKY } from './config.js';
import { clamp } from './util.js';
import { rnd, setSeed } from './rng.js';
import { serves, passes, carCap } from './lifts.js';
import { linkAt, linkOccupies, connBay } from './connectors.js';

export const stage = document.getElementById('stage');
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
`,
  ui: `/* The panel: everything the player clicks. Reads state, calls into the sim
   modules, and re-renders. */
import { G, height, totalPop, letCount, avgSat, hasAmenity, newFloor } from './state.js';
import { BAYS, TEN, CONN, UPG, UPG_KEYS, AMENITY_KEYS, MAX_FLOOR } from './config.js';
import { clamp, money, hhmm, secs } from './util.js';
import { serves, shaftsFor, buildShaft, upgradeShaft, upgCost, shaftCost, floorCost,
         extendCost, extendAllCost, coreBays, spanOf, upgTotal } from './lifts.js';
import { spawnFloor, despawnFloor, scheduleAll } from './people.js';
import { rentMult, satBonus, reqStatus, reqProgress } from './economy.js';
import { startDay } from './sim.js';
import { draw, stage } from './render.js';
import { tutorialSaw } from './tutorial.js';
`,
  main: `/* Boot and the animation loop. */
import { G, resetWorld } from './state.js';
import { MAX_FLOOR, DAY_END } from './config.js';
import { step, startDay } from './sim.js';
import { endOfDay } from './economy.js';
import { buildShaft } from './lifts.js';
import { draw } from './render.js';
import { renderAll, renderPanel, toast, showEOD, setSpeed } from './ui.js';
import { startTutorial } from './tutorial.js';
`
};

/* Names other modules need to reach. */
const EXPORTS = {
  render: ['draw', 'layout', 'fy', 'bx'],
  ui: ['renderAll', 'renderPanel', 'renderSel', 'renderShafts', 'toast', 'showEOD',
       'setSpeed', 'leaseFloor', '$'],
  main: []
};

for (const [name, rawBody] of Object.entries(sections)) {
  /* drawTower has a LOCAL `const day = 1 - nA` (daylight, not the day counter).
     The blanket state rename turned it into `const G.day =`. Locals that happen
     to share a state name have to be renamed out of the way first. */
  const body = name === 'render'
    ? rawBody.replace(/const day=1-nA;/, 'const daylight=1-nA;')
             .replace(/([\d.]+)\*day\}/g, '$1*daylight}')
    : rawBody;
  let code = toStateObject(body);
  for (const ex of EXPORTS[name]) {
    code = code
      .replace(new RegExp(`^function ${ex}\\(`, 'm'), `export function ${ex}(`)
      .replace(new RegExp(`^const ${ex}\\s*=`, 'm'), `export const ${ex} =`);
  }
  // these now live in their own modules
  code = code
    .replace(/^const stage=document\.getElementById\('stage'\);\n/m, '')
    .replace(/^const cv=document\.getElementById\('cv'\), ctx=cv\.getContext\('2d'\);\n/m, '')
    .replace(/^const \$=id=>document\.getElementById\(id\);\n/m, 'export const $ = id => document.getElementById(id);\n');
  /* A lifted section may re-declare something it now imports (SKY, hhmm, secs).
     Drop the local copy so the import wins. */
  const imported = new Set();
  for (const m of HEADERS[name].matchAll(/import \{([^}]+)\}/g))
    m[1].split(',').forEach(x => imported.add(x.trim()));
  for (const dup of imported) {
    code = code
      .replace(new RegExp(`^const ${dup}\\s*=[\\s\\S]*?;\\n`, 'm'), '')
      .replace(new RegExp(`^function ${dup}\\([\\s\\S]*?\\n\\}\\n`, 'm'), '');
  }
  writeFileSync(join(root, 'src', `${name}.js`), HEADERS[name] + '\n' + code.trimStart() + '\n');
  console.log(`  wrote src/${name}.js  (${code.split('\n').length} lines)`);
}
