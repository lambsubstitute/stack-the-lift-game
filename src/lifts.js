/* Where this passenger wants OFF this car — the end of their current leg,
   which is not necessarily where their journey ends. */
export const legDest = p => (p.legDest !== undefined ? p.legDest : p.dest);

/* Shafts, cars and dispatch: collective control with directional hall calls. */

import { CONN_BAYS, CORE, OUTSIDE, SHAFT_BASE, SHAFT_PER, UPG, UPG_KEYS } from './config.js';
import { linkOccupies } from './connectors.js';
import { G, height } from './state.js';
import { clamp } from './util.js';

export const serves = (s,f) => (f>=s.bottom && f<=s.top) || (s.express && f===0);

export const passes = (s,f) => f >= (s.express?0:s.bottom) && f<=s.top;

export const shaftCost = (bot,top,expr) => {
  const spanned = (expr?top+1:top-bot+1);
  return Math.round(SHAFT_BASE + SHAFT_PER*spanned*(expr?1.15:1));
};

export const floorCost = ()=> Math.round(4500 + height()*450);

export const spanOf   = s => (s.express? s.top+1 : s.top-s.bottom+1);

export const upgCost  = (s,k) => {
  const nx=s.up[k]+1, L=UPG[k].lv[nx];
  if(!L) return null;
  return {cost:Math.round(L.cost*(1+spanOf(s)/34)), star:L.star||1, label:L.label};
};

export const carSpd   = s => UPG.motor.lv[s.up.motor].v;

export const carCap   = s => UPG.cabin.lv[s.up.cabin].v;

export const doorMin  = () => 2.3;

export const doorPer  = s => UPG.cabin.lv[s.up.cabin].per;

export const ctrlOf   = s => UPG.control.lv[s.up.control].v;

export const upgTotal = s => UPG_KEYS.reduce((a,k)=>a+s.up[k],0);

export function buildShaft(bot,top,expr){
  const used=new Set(G.shafts.map(s=>s.bay));
  const bay=CORE.find(b=>!used.has(b));
  if(bay===undefined) return 'The core is full — no room for another shaft.';
  bot=clamp(Math.min(bot,top),0,height()-1);
  top=clamp(Math.max(bot,top),0,height()-1);
  if(top<=bot) return 'A shaft needs to span at least two floors.';
  const c=shaftCost(bot,top,expr);
  if(c>G.cash) return 'Not enough cash.';
  G.cash-=c;
  G.shafts.push({id:G.nextId++, bay, bottom:bot, top, express:!!expr,
    up:{motor:0,cabin:0,control:0},
    car:{y:bot, dir:0, state:'idle', stops:new Set(), callUp:new Set(), callDown:new Set(),
         riders:[], doorT:0, cw:0}});
  G.shafts.sort((a,b)=>a.bay-b.bay);
  return null;   /* callers invalidate the route cache; see routes.js */
}

export function upgradeShaft(s,k){
  const u=upgCost(s,k);
  if(!u) return 'Already at the top of that track.';
  if(u.star>G.star) return `${UPG[k].lv[s.up[k]+1].label} needs ★${u.star}.`;
  if(u.cost>G.cash) return `That upgrade costs ${money(u.cost)}.`;
  G.cash-=u.cost; s.up[k]++;
  return null;
}

export function shaftsFor(a,b){ return G.shafts.filter(s=>serves(s,a)&&serves(s,b)); }

export const extendCost = s => Math.round(SHAFT_PER*(height()-1-s.top)*1.25*(1+upgTotal(s)*0.12));

export const extendAllCost = ()=> G.shafts.reduce((a,s)=>a+(s.top<height()-1?extendCost(s):0),0);

export function coreBays(){
  let n=0;
  for(let f=0;f<height();f++){
    for(const s of G.shafts) if(passes(s,f)) n++;
    for(const b of CONN_BAYS) if(linkOccupies(f,b)) n++;
  }
  return n;
}

export function stepCar(s,dt){
  const c=s.car;
  if(c.state==='doors'){ stepDoors(s,dt); return; }
  if(c.state==='idle'){
    decide(s);
    const at=Math.round(c.y);
    /* A FULL car must leave. Answering a hall call it has no room for meant
       re-opening the doors on the same floor forever, boarding nobody and
       never departing — the car simply parked in the lobby at capacity. */
    const room = c.riders.length < carCap(s);
    const here = c.stops.has(at) || ((c.callUp.has(at)||c.callDown.has(at)) && room);
    if(here&&Math.abs(at-c.y)<1e-6){ openDoors(s,at); return; }
    if(c.dir===0) return;
    c.state='move';
  }
  if(c.state==='move'){
    const target=nextStop(s);
    if(target===null){ c.state='idle'; c.dir=0; return; }
    const d=target-c.y, m=carSpd(s)*dt;
    if(Math.abs(d)<=m){ c.y=target; openDoors(s,target); } else c.y+=Math.sign(d)*m;
  }
}

export function anyAbove(c,y){
  for(const f of c.stops)    if(f>y+1e-6) return true;
  for(const f of c.callUp)   if(f>y+1e-6) return true;
  for(const f of c.callDown) if(f>y+1e-6) return true;
  return false;
}

export function anyBelow(c,y){
  for(const f of c.stops)    if(f<y-1e-6) return true;
  for(const f of c.callUp)   if(f<y-1e-6) return true;
  for(const f of c.callDown) if(f<y-1e-6) return true;
  return false;
}

export function nextStop(s){
  const c=s.car; let best=null;
  const room = c.riders.length < carCap(s);   // a full car answers no hall calls
  if(c.dir>0){
    for(const f of c.stops)  if(f>=c.y-1e-6 && (best===null||f<best)) best=f;
    if(room) for(const f of c.callUp) if(f>=c.y-1e-6 && (best===null||f<best)) best=f;
    if(best!==null) return best;
    if(!room) return null;
    let hi=null; for(const f of c.callDown) if(f>c.y+1e-6 && (hi===null||f>hi)) hi=f;
    return hi;
  }
  if(c.dir<0){
    for(const f of c.stops)    if(f<=c.y+1e-6 && (best===null||f>best)) best=f;
    if(room) for(const f of c.callDown) if(f<=c.y+1e-6 && (best===null||f>best)) best=f;
    if(best!==null) return best;
    if(!room) return null;
    let lo=null; for(const f of c.callUp) if(f<c.y-1e-6 && (lo===null||f<lo)) lo=f;
    return lo;
  }
  return null;
}

export function decide(s){
  const c=s.car, y=c.y;
  const above=anyAbove(c,y), below=anyBelow(c,y);
  if(!above&&!below){ c.dir=0; return; }
  if(c.dir>0&&above) return;
  if(c.dir<0&&below) return;
  c.dir=above?1:below?-1:0;
}

export function openDoors(s,f){
  const c=s.car;
  c.stops.delete(f);
  c.atFloor=f; c.state='doors';
  c.doorT=doorMin(); c.xferT=0; c.openT=0;

  const ahead = c.dir>0 ? anyAbove(c,f) : c.dir<0 ? anyBelow(c,f) : false;
  if(!ahead){
    const hq=G.queue[f].filter(p=>p.shaft===s);
    c.dir = anyAbove(c,f)?1 : anyBelow(c,f)?-1
          : hq.some(p=>legDest(p)>f)?1 : hq.some(p=>legDest(p)<f)?-1 : 0;
  }
  /* Destination dispatch groups a load by where it is going, so a full car
     makes four stops instead of twelve. It still fills the car — departing on
     a part-load gave away more throughput than the saved stops were worth. */
  c.zone=null;
  if(ctrlOf(s)>=2){
    const mine=G.queue[f].filter(p=>p.shaft===s&&(c.dir===0||Math.sign(legDest(p)-f)===c.dir));
    if(mine.length){
      const seed=c.riders.length?legDest(c.riders[0]):legDest(mine[0]);
      c.zone=[seed-4,seed+4];
    }
  }
}

export function boarderAt(s,f,zoneOnly){
  const c=s.car;
  if(c.riders.length>=carCap(s)) return -1;
  const q=G.queue[f];
  for(let i=0;i<q.length;i++){
    const p=q[i];
    /* Group control's real benefit: a hall call belongs to the GROUP, so any
       car in it that is passing and has room can pick you up. Reassignment
       alone was worth almost nothing — the initial choice is already good —
       and without hysteresis it actively made waits worse. */
    if(p.shaft!==s && !(ctrlOf(s)>=1 && p.shaft && ctrlOf(p.shaft)>=1)) continue;
    const want=Math.sign(legDest(p)-f);
    if(want===0) continue;
    if(c.dir!==0&&want!==c.dir) continue;
    if(zoneOnly&&c.zone&&(legDest(p)<c.zone[0]||legDest(p)>c.zone[1])) continue;
    return i;
  }
  return -1;
}

export function stepDoors(s,dt){
  const c=s.car, f=c.atFloor, per=doorPer(s);
  c.doorT-=dt; c.xferT+=dt; c.openT+=dt;
  let guard=0;
  while(c.xferT>=per && guard++<400){
    const ai=c.riders.findIndex(p=>legDest(p)===f);
    if(ai>=0){
      const p=c.riders[ai]; c.riders.splice(ai,1);
      /* Record the WAIT for this leg, but not a completed trip: a journey may
         have several legs and must count once. finishTrip books the journey. */
      const w=p.boardedAt-p.waitStart;
      G.today.waitSum+=w;
      G.floors[p.home].waitSum+=w; G.floors[p.home].waitN++;
      /* Do NOT call into people.js from here: lifts <-> people would be an
         import cycle, which the bundler rejects. Park them and let sim.js,
         which already depends on both, start their next leg. */
      p.floor=f; p.x=s.bay+0.5; p.state='transfer';
      c.xferT-=per; continue;
    }
    let bi=boarderAt(s,f,true);
    if(bi<0) bi=boarderAt(s,f,false);
    if(bi<0) break;
    const p=G.queue[f][bi]; G.queue[f].splice(bi,1);
    p.state='ride'; p.boardedAt=G.simT;
    c.riders.push(p); c.stops.add(legDest(p));
    if(c.dir===0) c.dir=Math.sign(legDest(p)-f);
    c.xferT-=per;
  }
  const moreOff=c.riders.some(p=>legDest(p)===f);
  const moreOn =boarderAt(s,f,false)>=0;
  if((c.doorT<=0 && !moreOff && !moreOn) || c.openT>doorMin()+14){
    c.state='idle'; decide(s);
  }
}

