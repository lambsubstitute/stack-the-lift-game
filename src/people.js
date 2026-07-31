/* Population, daily schedules, and the choice between waiting and climbing. */

import { BAYS, OUTSIDE, TEN } from './config.js';
import { connBay } from './connectors.js';
import { planRoute } from './routes.js';
import { carCap, carSpd, ctrlOf, shaftsFor } from './lifts.js';
import { gauss, pick, rnd } from './rng.js';
import { G, eatFloors, height } from './state.js';

export function spawnFloor(f){
  const t=G.floors[f].type; if(!t) return;
  for(let k=0;k<TEN[t].pop;k++){
    G.people.push({id:G.nextId++, home:f, kind:t, floor:OUTSIDE, x:BAYS/2,
      state:'out', dest:-1, waitStart:0, sched:[], si:0, shaft:null,
      spot:1+rnd()*(BAYS-2)});
  }
}

export function despawnFloor(f){ G.people=G.people.filter(p=>p.home!==f); }

export function amenityFloors(kind){
  const out=[];
  for(let f=1;f<height();f++){ const T=TEN[G.floors[f].type]; if(T&&T.visit===kind) out.push(f); }
  return out;
}

export function scheduleAll(){
  const eats=eatFloors();
  const evening=amenityFloors('evening'), morning=amenityFloors('morning');
  for(const p of G.people){
    const S=[]; const t=p.kind;
    if(t==='office'||t==='shops'||t==='food'){
      /* The morning peak is the sizing case for a lift core, and it is sharp:
         most of an office floor arrives inside about half an hour. Spread over
         ninety minutes instead, a single car could serve an eighteen-storey
         tower and the whole problem evaporated. */
      const arr=gauss(t==='office'?8.6*3600:8.0*3600,900);
      const lv =gauss(t==='office'?17.9*3600:19.3*3600,2600);
      S.push({t:arr,to:p.home,from:OUTSIDE});
      if(t==='office'&&eats.length){
        const l=gauss(12.85*3600,2400);
        S.push({t:l,to:pick(eats)}); S.push({t:l+gauss(2600,500),to:p.home});
      }
      if(t==='office'&&morning.length&&rnd()<0.25){
        const m=gauss(10.6*3600,1600);
        S.push({t:m,to:pick(morning)}); S.push({t:m+gauss(3000,700),to:p.home});
      }
      S.push({t:lv,to:0,exit:true});
      p.floor=OUTSIDE; p.state='out';
    } else {
      p.floor=p.home; p.state='settled'; p.x=p.spot;
      const out=gauss(t==='hotel'?9.3*3600:8.4*3600, t==='hotel'?3200:2600);
      const ret=gauss(t==='hotel'?16.5*3600:18.3*3600, t==='hotel'?4000:3400);
      S.push({t:out,to:0,exit:true});
      S.push({t:ret,to:p.home,from:OUTSIDE});
      if(eats.length&&rnd()<0.5){
        const e=gauss(19.6*3600,2200);
        S.push({t:e,to:pick(eats)}); S.push({t:e+gauss(3800,800),to:p.home});
      }
      if(evening.length&&rnd()<0.4){
        const g=gauss(18.9*3600,2000);
        S.push({t:g,to:pick(evening)}); S.push({t:g+gauss(3200,700),to:p.home});
      }
    }
    S.sort((a,b)=>a.t-b.t);
    p.sched=S; p.si=0; p.shaft=null;
  }
}

export function liftEstimate(a,b){
  const opts=shaftsFor(a,b);
  if(!opts.length) return null;
  let best=null, bt=Infinity;
  for(const s of opts){
    const c=s.car;
    const q=G.queue[a].filter(p=>p.shaft===s).length;
    const t = Math.abs(c.y-a)/carSpd(s) + c.stops.size*2.5
            + (q/carCap(s))*46 + Math.abs(b-a)/carSpd(s) + 9;
    if(t<bt){bt=t;best=s;}
  }
  return {time:bt, shaft:best};
}

/* A trip is now a PLAN: a list of legs, each either a lift ride or a climb.
   That is what lets one journey be "escalator to the sky lobby, express to the
   top" instead of forcing an all-or-nothing choice between the two. */
export function beginTrip(p,to,exit){
  p.dest=to; p.exiting=!!exit;
  if(to===p.floor){ if(exit){p.state='out';p.floor=OUTSIDE;} else p.state='settle'; return; }

  const plan=planRoute(p.floor,to);
  if(!plan || !plan.legs.length){ p.state='settled'; p.stuck=true; return; }

  p.plan=plan.legs;
  p.leg=0;
  p.discomfort=plan.discomfort;
  startLeg(p);
}

/** Set the person walking towards whatever their current leg needs. */
export function startLeg(p){
  const leg=p.plan?.[p.leg];
  if(!leg){ finishTrip(p); return; }
  if(leg.kind==='climb'){
    p.mode='climb'; p.shaft=null; p.cDir=Math.sign(leg.to-p.floor);
  } else {
    /* The PLAN says which legs to make; it must not pin the car. Routes are
       cached, so baking in one shaft sent every identical journey to the same
       car while its neighbours ran empty — on a podium tower that took stranded
       passengers from 9 to 428. Choose among the shafts that can do this leg,
       now, by how busy they actually are. */
    p.mode='lift';
    p.shaft=pickShaft(p.floor, leg.to) ?? leg.shaft;
  }
  p.legDest=leg.to;
  p.state='walk';
}

/** Advance to the next leg, or finish. Called when a leg's destination is reached. */
export function nextLeg(p){
  p.leg++;
  if(p.leg>=p.plan.length){ finishTrip(p); return; }
  startLeg(p);
}

/* Which car to take for this leg.

   Without group control you press a button for a particular lift and commit to
   it — all you can judge is where the indicator says the car is. A group
   controller is precisely the thing that assigns you the best car knowing every
   car's load. Giving that knowledge to everyone made the upgrade worthless,
   which is a modelling error, not a balance one. */
export function pickShaft(a,b){
  const opts=shaftsFor(a,b);
  if(!opts.length) return null;
  const grouped=opts.some(s=>ctrlOf(s)>=1);
  let best=opts[0], bs=Infinity;
  for(const s of opts){
    const c=s.car;
    const sc = grouped
      ? Math.abs(c.y-a) + c.stops.size*1.6 + c.riders.length*0.5
        + (G.queue[a].filter(w=>w.shaft===s).length/Math.max(1,carCap(s)))*22
      : Math.abs(c.y-a);                       // just the indicator
    if(sc<bs){bs=sc;best=s;}
  }
  return best;
}

export function walkTargetX(p){
  if(p.mode==='climb'){
    const li = p.cDir>0 ? p.floor : p.floor-1;
    return connBay(li)+0.5;
  }
  return p.shaft ? p.shaft.bay+0.5 : p.x;
}

/** One journey completed — counted once, however many legs it took. */
export function finishTrip(p){
  G.today.trips++;
  if(p.discomfort){
    G.today.waitSum+=p.discomfort;
    G.floors[p.home].waitSum+=p.discomfort; G.floors[p.home].waitN++;
  }
  p.plan=null; p.leg=0; p.legDest=undefined;
  if(p.exiting){ p.state='out'; p.floor=OUTSIDE; }
  else { p.state='settle'; }
}

