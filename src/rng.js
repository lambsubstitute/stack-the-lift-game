/* A seeded RNG, so a scenario replays identically every time. The test suite
   depends on this: reseed, and the same day must produce the same numbers. */

export let rs=987654321;

export function rnd(){ rs|=0; rs=rs+0x6D2B79F5|0; let t=Math.imul(rs^rs>>>15,1|rs);
  t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }

export function gauss(mu,sd){ let u=0,v=0; while(!u)u=rnd(); while(!v)v=rnd();
  return mu+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

export const pick=a=>a[(rnd()*a.length)|0];
export function setSeed(v){ rs = v; }
export function getSeed(){ return rs; }

