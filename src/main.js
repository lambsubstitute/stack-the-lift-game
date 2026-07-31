/* Boot and the animation loop. */
import { G, resetWorld } from './state.js';
import { MAX_FLOOR, DAY_END } from './config.js';
import { step, startDay } from './sim.js';
import { endOfDay } from './economy.js';
import { buildShaft } from './lifts.js';
import { draw } from './render.js';
import { renderAll, renderPanel, toast, showEOD, setSpeed } from './ui.js';
import { startTutorial, tutorialTick } from './tutorial.js';

/* ==========================================================================
   LOOP
   ========================================================================== */
let last=performance.now();
/* One uncaught error inside an animation frame stops requestAnimationFrame for
   good, and the page just freezes with no clue why. Catch it, surface it, and
   keep the loop alive. */
let errCount=0;
function frame(now){
  try{
    const dtR=Math.min(0.05,(now-last)/1000); last=now;
    if(G.running){
      let rem=dtR*10*G.speed;
      const mx=G.speed>=20?1.6:0.35;
      while(rem>0){ const s=Math.min(rem,mx); step(s); rem-=s; }
      if(G.simT>=DAY_END){ const s=endOfDay(); showEOD(s); renderAll(); }
    }
    draw();
    renderPanel();
    tutorialTick();
  }catch(e){
    errCount++;
    if(errCount<4){
      console.error('Stack: frame error',e);
      toast('Something went wrong: '+e.message+' — the game is still running.');
    }
    if(errCount===40){ G.running=false; toast('Too many errors; paused. Check the console.'); }
  }
  requestAnimationFrame(frame);
}
window.addEventListener('error',e=>console.error('Stack:',e.message));

/* --- boot --- */
G.floors=[newFloor()];                      // lobby
for(let i=0;i<5;i++) G.floors.push(newFloor());
G.links=new Array(MAX_FLOOR).fill(null);
resetQueues();
buildShaft(0,5,false);
G.cash=145000;
startDay();
renderAll();
window.addEventListener('resize',()=>{cityLine=null;bgSil=null;lampGrad=null;draw();});
requestAnimationFrame(frame);
setTimeout(()=>toast('Six floors, one lift, $145,000. Lease some floors and see who turns up.'),800);
startTutorial();
