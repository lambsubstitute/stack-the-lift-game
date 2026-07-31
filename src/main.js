/* Boot and the animation loop. */
import { G, resetWorld } from './state.js';
import { DAY_END } from './config.js';
import { step, startDay } from './sim.js';
import { endOfDay } from './economy.js';
import { buildShaft } from './lifts.js';
import { scheduleAll } from './people.js';
import { invalidateRoutes } from './routes.js';
import { draw, onResize } from './render.js';
import { renderAll, renderPanel, toast, showEOD } from './ui.js';
import { startTutorial, tutorialTick } from './tutorial.js';
import { restore, hasSave, save } from './save.js';

/* ==========================================================================
   LOOP
   ========================================================================== */
let last = performance.now();
/* One uncaught error inside an animation frame stops requestAnimationFrame for
   good, and the page just freezes with no clue why. Catch it, surface it, and
   keep the loop alive. */
let errCount = 0;
function frame(now) {
  try {
    const dtR = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.running) {
      let rem = dtR * 10 * G.speed;
      const mx = G.speed >= 20 ? 1.6 : 0.35;
      while (rem > 0) { const s = Math.min(rem, mx); step(s); rem -= s; }
      if (G.simT >= DAY_END) {
        const summary = endOfDay();
        save();
        showEOD(summary);
        renderAll();
      }
    }
    draw();
    renderPanel();
    tutorialTick();
  } catch (e) {
    errCount++;
    if (errCount < 4) {
      console.error('Stack: frame error', e);
      toast('Something went wrong: ' + e.message + ' — the game is still running.');
    }
    if (errCount === 40) { G.running = false; toast('Too many errors; paused. Check the console.'); }
  }
  requestAnimationFrame(frame);
}
window.addEventListener('error', e => console.error('Stack:', e.message));

/* ==========================================================================
   BOOT
   ========================================================================== */
function newTower() {
  resetWorld({ cash: 145000, floorCount: 6 });
  buildShaft(0, 5, false);
  invalidateRoutes();
  scheduleAll();
  startDay();
  startTutorial();
  setTimeout(
    () => toast('Six floors, one lift, $145,000. Lease some floors and see who turns up.'),
    800
  );
}

/* Pick up where the player left off, if they left off anywhere. */
if (!(hasSave() && restore())) newTower();

renderAll();
window.addEventListener('resize', onResize);
window.addEventListener('beforeunload', save);
requestAnimationFrame(frame);

export { newTower };
