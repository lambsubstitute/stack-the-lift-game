/* Stairs and escalators: one floor to the next, never a queue, but resented
   more with every flight. */

import { CONN, CONN_BAYS } from './config.js';
import { G } from './state.js';

export const connBay = f => CONN_BAYS[f%2];

export const linkAt = f => (f>=0 && f<G.links.length) ? G.links[f] : null;

export function linkOccupies(f,bay){
  return (linkAt(f)   && connBay(f)===bay) ||
         (linkAt(f-1) && connBay(f-1)===bay);
}

export function connCost(kind){ return CONN[kind].cost; }

export function walkRoute(a,b){
  if(a===b) return null;
  const lo=Math.min(a,b), hi=Math.max(a,b), up=b>a;
  let time=0, pen=0, segs=0;
  for(let f=lo;f<hi;f++){
    const L=linkAt(f);
    if(!L) return null;
    const C=CONN[L.kind];
    time += up?C.up:C.down;
    pen  += C.penalty;
    segs++;
  }
  return {time, segs, discomfort: pen*Math.pow(segs,0.35)};
}

