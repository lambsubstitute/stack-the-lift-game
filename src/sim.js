/* The clock. step() advances everything by dt simulated seconds. */

import { CONN, DAY_START, GIVE_UP, MAX_FLOOR, OUTSIDE, WALK_SPD } from './config.js';
import { connBay, linkAt } from './connectors.js';
import { ctrlOf, legDest, serves, stepCar } from './lifts.js';
import { beginTrip, finishTrip, nextLeg, scheduleAll, walkTargetX } from './people.js';
import { rnd } from './rng.js';
import { G, height } from './state.js';
import { clamp } from './util.js';

export function resetQueues(){ G.queue=Array.from({length:MAX_FLOOR+1},()=>[]); }

export function startDay(){
  G.simT=DAY_START; G.gAcc=0;
  if(G.graph.length>6) G.ghost=G.graph;
  G.graph=[];
  G.today={trips:0,waitSum:0,gave:0,rent:0,maint:0};
  for(const f of G.floors){ f.waitSum=0; f.waitN=0; f.gave=0; }
  resetQueues();
  scheduleAll();
  for(const s of G.shafts){
    s.car.y=s.express?0:s.bottom; s.car.dir=0; s.car.state='idle';
    s.car.stops=new Set(); s.car.callUp=new Set(); s.car.callDown=new Set();
    s.car.riders=[]; s.car.doorT=0;
  }
}

export function step(dt){
  G.simT+=dt;

  for(const p of G.people){
    if(p.si>=p.sched.length) continue;
    const ev=p.sched[p.si];
    if(G.simT<ev.t) continue;
    if(ev.from===OUTSIDE){
      if(p.state!=='out') continue;
      p.si++;
      p.floor=0; p.x=1.5+rnd()*3; p.exiting=false;
      if(ev.to===0){ p.dest=0; p.state='settle'; continue; }
      p.state='settled';                    // so beginTrip will act on it
      beginTrip(p, ev.to, false);
      if(p.state==='settled'){ p.floor=ev.to; p.stuck=true; }   // unreachable
    } else {
      if(p.state!=='settled') continue;
      p.si++; beginTrip(p,ev.to,ev.exit);
    }
  }

  for(const p of G.people){
    if(p.state==='walk'){
      const tx=walkTargetX(p), d=tx-p.x, m=WALK_SPD*dt;
      if(Math.abs(d)<=m){
        p.x=tx;
        if(p.mode==='climb'){ p.state='climb'; p.cP=0; p.cT=0; }
        else { p.state='wait'; p.waitStart=G.simT; G.queue[p.floor].push(p); }
      } else p.x+=Math.sign(d)*m;

    } else if(p.state==='climb'){
      const li = p.cDir>0 ? p.floor : p.floor-1;
      const L=linkAt(li);
      if(!L){ p.state='settled'; continue; }          // someone tore it out mid-climb
      const C=CONN[L.kind], dur=p.cDir>0?C.up:C.down;
      p.cT+=dt; p.cP=clamp(p.cT/dur,0,1);
      if(p.cP>=1){
        p.floor+=p.cDir; p.cT=0; p.cP=0;
        if(p.floor===legDest(p)){ p.x=connBay(li)+0.5; nextLeg(p); }
        else if(!linkAt(p.cDir>0?p.floor:p.floor-1)){ p.state='settled'; p.x=p.spot; }
        else { p.x=connBay(p.cDir>0?p.floor:p.floor-1)+0.5; }
      }

    } else if(p.state==='transfer'){
      nextLeg(p);

    } else if(p.state==='settle'){
      const d=p.spot-p.x, m=WALK_SPD*dt;
      if(Math.abs(d)<=m){ p.x=p.spot; p.state='settled'; } else p.x+=Math.sign(d)*m;
    }
  }

  for(let f=0;f<height();f++){
    const q=G.queue[f];
    for(let i=q.length-1;i>=0;i--){
      const p=q[i];
      if(G.simT-p.waitStart>GIVE_UP){
        q.splice(i,1); G.today.gave++;
        G.floors[p.home].gave++;
        G.floors[p.home].waitSum+=GIVE_UP; G.floors[p.home].waitN++;
        p.state='settled'; p.x=p.spot;
      }
    }
  }

  /* Group control (controller 1) lets a waiting passenger be handed to a
     better car instead of being stuck with whichever one looked good when
     they pressed the button. Without it, a queue bound to one busy shaft will
     stand there while the shaft beside it runs empty. */
  G.gcTimer-=dt;
  if(G.gcTimer<=0){
    G.gcTimer=4;
    const grp=G.shafts.filter(s=>ctrlOf(s)>=1);
    if(grp.length>1){
      for(let f=0;f<height();f++){
        for(const p of G.queue[f]){
          if(ctrlOf(p.shaft)<1) continue;
          const opts=grp.filter(s=>serves(s,f)&&serves(s,legDest(p)));
          if(opts.length<2) continue;
          const score = s => {
            const c=s.car;
            const towards = (c.dir>0&&f>c.y)||(c.dir<0&&f<c.y)||c.dir===0;
            return Math.abs(c.y-f) + c.stops.size*1.5 + c.riders.length*0.6
                 + (towards?0:height()*0.5);
          };
          let best=p.shaft, bs=Infinity;
          for(const s of opts){ const sc=score(s); if(sc<bs){bs=sc;best=s;} }
          /* Hysteresis. Reassigning on any improvement at all made passengers
             ping-pong between cars every four seconds: each move invalidated
             the hall call the previous car was already answering, so cars kept
             re-planning and average waits got WORSE than no group control at
             all. Only move somebody for a materially better car — which is
             what real group controllers do, and for this reason. */
          if(best!==p.shaft && bs < score(p.shaft)*0.80) p.shaft=best;
        }
      }
    }
  }

  /* Hall calls carry a DIRECTION. Without it a car travelling up treats a
     down-call as a reason to stop, so the whole evening peak was spent
     sweeping to the roof with an empty car, opening its doors at every floor
     and boarding nobody. Rebuilt each tick straight from the queues, so it is
     self-correcting when a car fills up and has to leave people behind. */
  for(const s of G.shafts){ s.car.callUp.clear(); s.car.callDown.clear(); }
  for(let f=0;f<height();f++){
    for(const p of G.queue[f]){
      const c=p.shaft.car;
      if(legDest(p)>f) c.callUp.add(f); else c.callDown.add(f);
    }
  }

  for(const s of G.shafts) stepCar(s,dt);

  G.gAcc+=dt;
  if(G.gAcc>=150){ G.gAcc=0;
    let w=0; for(let f=0;f<height();f++) w+=G.queue[f].length;
    G.graph.push({t:G.simT,w});
  }
}

