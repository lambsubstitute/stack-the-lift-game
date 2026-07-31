/* Rent, satisfaction, amenities and star ratings. */

import { AMENITY_KEYS, CONN, MAINT_PER_FLOOR, STAR_REQ, TEN } from './config.js';
import { linkAt } from './connectors.js';
import { spanOf, upgTotal } from './lifts.js';
import { despawnFloor } from './people.js';
import { G, avgSat, hasAmenity, height, letCount, newFloor, popOf, totalPop } from './state.js';
import { clamp } from './util.js';

export function rentMult(f){
  let m=1;
  const mine=G.floors[f].type; if(!mine) return 1;
  for(let a=1;a<height();a++){
    const T=TEN[G.floors[a].type]; if(!T||!T.bonus) continue;
    const sc=T.bonus.scope;
    if(sc==='all') m+=T.bonus.rent;
    else if(sc==='near'    && Math.abs(a-f)<=5) m+=T.bonus.rent;
    else if(sc==='homes'   && (mine==='apt'||mine==='hotel'||mine==='sky')) m+=T.bonus.rent;
    else if(sc==='offices' && mine==='office') m+=T.bonus.rent;
  }
  return m;
}

export function satBonus(f){
  let b=0;
  for(let a=1;a<height();a++){
    const T=TEN[G.floors[a].type]; if(!T||!T.sat) continue;
    if(T.bonus && T.bonus.scope==='near' && Math.abs(a-f)>5) continue;
    b+=T.sat;
  }
  return Math.min(b,4);
}

export function reqStatus(s){
  const R=STAR_REQ[s]; if(!R) return [];
  const out=[];
  if(R.pop!==undefined)       out.push({k:'Residents and workers', cur:totalPop(),  need:R.pop});
  if(R.floors!==undefined)    out.push({k:'Floors built',          cur:height(),    need:R.floors});
  if(R.let!==undefined)       out.push({k:'Floors let',            cur:letCount(),  need:R.let});
  if(R.lifts!==undefined)     out.push({k:'Lift shafts',           cur:G.shafts.length,need:R.lifts});
  if(R.amenities!==undefined) out.push({k:'Amenities',             cur:AMENITY_KEYS.filter(hasAmenity).length, need:R.amenities});
  if(R.sat!==undefined)       out.push({k:'Average satisfaction',  cur:Math.round(avgSat()), need:R.sat,
                                        pct:true, na:letCount()===0});
  for(const r of out){ r.met = r.cur>=r.need; r.p = clamp(r.cur/r.need,0,1); }
  return out;
}

export const reqProgress = s => { const r=reqStatus(s); return r.length? r.reduce((a,x)=>a+x.p,0)/r.length : 1; };

export function endOfDay(){
  G.running=false;
  let rent=0, maint=0, lost=[], unhappy=0;
  for(let f=1;f<height();f++){
    const fl=G.floors[f];
    if(!fl.type) continue;
    const avg = fl.waitN? fl.waitSum/fl.waitN : 0;
    /* Graded against real lift-service standards, where about 30 seconds of
       average waiting is the target and anything past a minute is considered
       poor. Rewarding 90-second waits let a single car keep an eighteen-storey
       tower perfectly happy, which took all the pressure out of the game. */
    let d;
    if(fl.waitN===0)      d = popOf(f)>0 ? -10 : 0;   // nobody could move at all
    else if(avg< 25)      d = +8;
    else if(avg< 45)      d = +3;
    else if(avg< 70)      d = -1;
    else if(avg<110)      d = -8;
    else                  d = -16;
    fl.sat=clamp(fl.sat+d+satBonus(f),0,100);
    fl.age++;
    const r=Math.round(TEN[fl.type].rent*rentMult(f)*(0.45+0.55*fl.sat/100));
    rent+=r;
    if(fl.sat<20 && fl.age>2){ lost.push(f); }
    else if(fl.sat<45) unhappy++;
  }
  for(const s of G.shafts) maint += Math.round(MAINT_PER_FLOOR*spanOf(s)*(1+upgTotal(s)*0.16));
  for(let f=0;f<height()-1;f++){ const L=linkAt(f); if(L) maint += CONN[L.kind].maint; }
  G.today.rent=rent; G.today.maint=maint;
  G.cash += rent-maint;
  for(const f of lost){ despawnFloor(f); G.floors[f]={...newFloor(), sat:60}; }

  let rose=false;
  while(G.star<5 && reqStatus(G.star+1).every(r=>r.met)){ G.star++; rose=true; }
  return { rent, maint, lost, unhappy, rose, cash: G.cash, star: G.star };
}

