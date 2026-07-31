/* ---------------------------------------------------------------------------
   A five-step opening that teaches by asking you to do the thing, then getting
   out of the way. No modal boxes and nothing is blocked: each step watches for
   the action it described and advances the moment you do it. If you already
   know what you are doing you will finish it without noticing it was there.

   The last step deliberately teaches the trade-off rather than a button —
   floor area is what a lift costs, and that is the whole game.
--------------------------------------------------------------------------- */
import { G, height, letCount } from './state.js';

const STEPS = [
  {
    id: 'lease',
    title: 'Let a floor',
    body: 'Click any empty floor in the tower, then pick <b>Offices</b> from the list. ' +
          'Tenants pay rent every evening — nothing happens until somebody moves in.',
    done: () => letCount() >= 1
  },
  {
    id: 'watch',
    title: 'Watch the morning',
    body: 'People arrive from about 08:00 and queue for the lift. They turn <b>amber</b>, ' +
          'then <b>red</b>, the longer they wait. Let the clock run.',
    done: () => G.today.trips >= 6
  },
  {
    id: 'build',
    title: 'Add a floor',
    body: 'Press <b>Add floor</b> in the Build section, then let it out too. ' +
          'The tower only grows when you pay for it.',
    done: (s) => height() > s.startHeight
  },
  {
    id: 'extend',
    title: 'Make the lift reach it',
    body: 'A new floor has no lift service — nobody can get to work. ' +
          'Use <b>Extend all to top</b> under Lifts, or <b>extend</b> on the shaft itself.',
    done: () => G.shafts.length > 0 && G.shafts.every(s => s.top >= height() - 1)
  },
  {
    id: 'stairs',
    title: 'One last thing: stairs',
    body: 'Every lift shaft eats a bay on <i>every floor it passes</i>, let or not — ' +
          'capacity costs you the space it serves. <b>Stairs</b> and <b>escalators</b> ' +
          '(on a selected floor) connect just one floor to the next for almost nothing. ' +
          'People will happily ride an escalator a floor or two, and resent a long climb.',
    done: () => false,          // final card: dismissed by the player
    final: true
  }
];

let idx = 0;
let active = false;
let progress = { startHeight: 0 };
let el = null;

export function startTutorial() {
  if (localStorage_get('stack.tutorial.done') === '1') return;
  active = true;
  progress.startHeight = height();
  build();
  show();
}

/** Called once per frame by main.js; cheap, and stops entirely once finished. */
export function tutorialTick() {
  if (!active) return;
  const step = STEPS[idx];
  if (step.id === 'build') progress.startHeight = Math.min(progress.startHeight, height());
  if (step.done(progress)) advance();
}

/** ui.js reports player actions that are hard to detect from state alone. */
export function tutorialSaw(what) {
  if (!active) return;
  if (what === 'addFloor' && STEPS[idx].id === 'build') progress.startHeight = height() - 1;
}

function advance() {
  idx++;
  if (idx >= STEPS.length) return finish();
  if (STEPS[idx].id === 'build') progress.startHeight = height();
  show();
}

function finish() {
  active = false;
  if (el) el.classList.remove('on');
  localStorage_set('stack.tutorial.done', '1');
}

function build() {
  el = document.getElementById('tut');
  if (!el) return;
  el.innerHTML =
    `<div class="tut-step" id="tutStep"></div>
     <h4 id="tutTitle"></h4>
     <p id="tutBody"></p>
     <div class="tut-row">
       <button id="tutSkip" class="ghost">Skip</button>
       <button id="tutNext">Got it</button>
     </div>`;
  document.getElementById('tutSkip').onclick = finish;
  document.getElementById('tutNext').onclick = () => (STEPS[idx].final ? finish() : advance());
}

function show() {
  if (!el) return;
  const s = STEPS[idx];
  document.getElementById('tutStep').textContent = `Step ${idx + 1} of ${STEPS.length}`;
  document.getElementById('tutTitle').textContent = s.title;
  document.getElementById('tutBody').innerHTML = s.body;
  document.getElementById('tutNext').textContent = s.final ? 'Start playing' : 'Got it';
  document.getElementById('tutNext').style.display = s.final ? '' : 'none';
  el.classList.add('on');
}

/* localStorage is unavailable in some embedded contexts; never let it throw. */
function localStorage_get(k) {
  try { return window.localStorage.getItem(k); } catch { return null; }
}
function localStorage_set(k, v) {
  try { window.localStorage.setItem(k, v); } catch { /* ignore */ }
}

/** Test seam: lets the suite drive the tutorial without a DOM. */
export const __tutorial = {
  steps: STEPS,
  reset() { idx = 0; active = true; progress = { startHeight: height() }; el = null; },
  current: () => STEPS[idx],
  isActive: () => active,
  tick: () => { const s = STEPS[idx]; if (active && s.done(progress)) advance(); },
  setCtx: c => Object.assign(progress, c)
};
