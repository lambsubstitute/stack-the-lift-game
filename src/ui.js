/* The panel: everything the player clicks. Reads state, calls into the sim
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
import { save, clearSave } from './save.js';
import { invalidateRoutes } from './routes.js';

/* ==========================================================================
   UI
   ========================================================================== */
export const $ = id => document.getElementById(id);

export function toast(t){ const b=$('toast'); b.textContent=t; b.classList.add('on');
  clearTimeout(b._t); b._t=setTimeout(()=>b.classList.remove('on'),5000); }

export function renderAll(){ renderPanel(); renderTenants(); renderAmenitySummary(); renderShafts(); renderSel(); }

export function renderPanel(){
  $('money').textContent=money(G.cash);
  $('money').className='money'+(G.cash<0?' neg':'');
  $('daylbl').classList.toggle('warn', G.cash<0);
  $('daylbl').textContent=`Day ${G.day} · ${hhmm(G.simT)}`;
  $('stars').innerHTML='★'.repeat(G.star)+(G.star<5?'<s>'+'★'.repeat(5-G.star)+'</s>':'');
  const pop=totalPop();
  $('sPop').textContent=pop;
  $('sFl').textContent=height();
  let w=0; for(let f=0;f<height();f++) w+=G.queue[f].length;
  $('sWait').textContent=w;
  const avg=G.today.trips?G.today.waitSum/G.today.trips:0;
  $('sAvg').innerHTML=G.today.trips?`<span class="${avg>150?'bad':avg>70?'warn':'good'}">${secs(avg)}</span>`:'—';
  $('sGave').innerHTML=G.today.gave?`<span class="bad">${G.today.gave}</span>`:'0';
  let due=0; for(let f=1;f<height();f++) if(G.floors[f].type)
    due+=Math.round(TEN[G.floors[f].type].rent*rentMult(f)*(0.45+0.55*G.floors[f].sat/100));
  $('sRent').textContent=money(due);
  $('floorCost').textContent=money(floorCost());
  $('addFloor').disabled = height()>=MAX_FLOOR || floorCost()>G.cash;
  const cb=coreBays(), tot=height()*BAYS;
  $('sArea').textContent=(tot-cb)+' / '+tot;
  $('sLost').textContent=cb+' bays';
  $('shaftCost').textContent=money(shaftCost(+$('sBot').value,+$('sTop').value,$('expr').checked));
  const ec=extendAllCost();
  $('extCost').textContent=money(ec);
  $('extendAll').disabled = ec===0 || ec>G.cash;
  renderGoal();
}

export function leaseFloor(k){
  const t=TEN[k];
  if(G.selected<1 || G.floors[G.selected].type) return;
  if(t.star>G.star){ toast(`${t.name} needs ★${t.star}.`); return; }
  if(t.amenity && hasAmenity(k)){ toast(`The tower already has a ${t.name.toLowerCase()}.`); return; }
  if(t.topOnly && G.selected!==height()-1){ toast(`${t.name} has to be the top floor.`); return; }
  if(t.cost>G.cash){ toast('Not enough cash for that fit-out.'); return; }
  G.cash-=t.cost;
  G.floors[G.selected].type=k; G.floors[G.selected].sat=78; G.floors[G.selected].age=0;
  spawnFloor(G.selected); scheduleAll();
  if(t.amenity) toast(`${t.name} open. ${t.blurb}`);
  const reach=G.shafts.some(s=>serves(s,G.selected)&&serves(s,0));
  if(!reach) toast(`Floor ${G.selected} is let, but no lift reaches it from the lobby. Nobody can get to work.`);
  renderAll();
}

function tenantRow(k,amen){
  const t=TEN[k];
  const lock=t.star>G.star;
  const built=amen&&hasAmenity(k);
  const wrongFloor=t.topOnly&&G.selected!==height()-1;
  const d=document.createElement('div');
  d.className='t'+(lock||built?' lock':'');
  let note = lock?'★'+t.star : built?'built' : money(t.cost);
  d.innerHTML=`<i style="background:${t.col}"></i><b>${t.name}</b><em>${note}</em>`+
              (amen&&!built?`<span class="bl">${t.blurb}</span>`:'');
  if(!lock&&!built){
    if(t.cost>G.cash||wrongFloor) d.style.opacity='.5';
    d.onclick=()=>leaseFloor(k);
  }
  return d;
}

let goalSig='';
function renderGoal(){
  const box=$('goalBox');
  if(G.star>=5){
    if(goalSig!=='done'){
      goalSig='done';
      $('goalTitle').textContent='★★★★★';
      $('goalPct').textContent='complete';
      $('goalBar').style.width='100%';
      $('goalList').innerHTML='<div class="mini">Five stars. There is nothing left to prove.</div>';
    }
    return;
  }
  const rows=reqStatus(G.star+1), pct=Math.round(reqProgress(G.star+1)*100);
  const sig=G.star+'|'+pct+'|'+rows.map(r=>r.cur+'/'+r.need).join(',');
  if(sig===goalSig) return;                 // this runs every frame; only touch the DOM on change
  goalSig=sig;
  $('goalTitle').innerHTML='★'.repeat(G.star+1)+'<s>'+'★'.repeat(4-G.star)+'</s>';
  $('goalPct').textContent=pct+'%';
  $('goalBar').style.width=pct+'%';
  $('goalList').innerHTML=rows.map(r=>
    `<div class="req${r.met?' met':''}"><i></i><b>${r.k}</b>`+
    `<em>${r.na?'—':r.cur+(r.pct?'%':'')} / ${r.need}${r.pct?'%':''}</em></div>`).join('');
}

function renderTenants(){
  const el=$('tlist'); el.innerHTML='';
  for(const k in TEN) if(!TEN[k].amenity) el.appendChild(tenantRow(k,false));
  const ael=$('alist'); ael.innerHTML='';
  const any=AMENITY_KEYS.some(k=>TEN[k].star<=G.star);
  $('amenBox').style.display = (G.selected>0 && !G.floors[G.selected].type && any) ? '' : 'none';
  if(any) for(const k of AMENITY_KEYS) ael.appendChild(tenantRow(k,true));
}

/* a standing summary of what the tower's amenities are worth */
function renderAmenitySummary(){
  const box=$('amenHave'), built=AMENITY_KEYS.filter(hasAmenity);
  if(!built.length){ box.style.display='none'; return; }
  box.style.display='';
  box.innerHTML=built.map(k=>{
    const t=TEN[k];
    return `<div class="am"><i style="background:${t.col}"></i><b>${t.name}</b>`+
           `<em>+${Math.round(t.bonus.rent*100)}%${t.bonus.scope==='all'?'':' '+t.bonus.scope}</em></div>`;
  }).join('');
}

export function renderShafts(){
  const el=$('shaftList'); el.innerHTML='';
  G.shafts.forEach((s,i)=>{
    const d=document.createElement('div');
    d.className='sh'+(s===G.selShaft?' selsh':'');
    const lv=upgTotal(s);
    d.innerHTML=`<i></i><span>Lift ${i+1}${s.express?' ⇈':''} &nbsp;${s.bottom}–${s.top}`+
                `${lv?` &nbsp;<b style="color:#C9A227">+${lv}</b>`:''}</span>`;
    d.onclick=e=>{ if(e.target.tagName==='BUTTON')return; G.selShaft=(G.selShaft===s?null:s); renderAll(); };
    const ext=document.createElement('button'); ext.textContent='extend';
    ext.onclick=()=>{
      if(s.top>=height()-1){ toast('Already reaches the top.'); return; }
      const c=extendCost(s);
      if(c>G.cash){ toast(`Extending costs ${money(c)}.`); return; }
      G.cash-=c; s.top=height()-1; invalidateRoutes(); renderAll();
    };
    const rm=document.createElement('button'); rm.textContent='×';
    rm.onclick=()=>{ if(G.selShaft===s) G.selShaft=null; G.shafts.splice(i,1); invalidateRoutes(); rescue(); renderAll(); };
    d.appendChild(ext); d.appendChild(rm); el.appendChild(d);
  });
  if(!G.shafts.length) el.innerHTML='<div class="mini">No lifts. Nobody can get anywhere.</div>';
  renderUpgrades();
}

/* --- the upgrade bench for whichever shaft is selected --- */
function renderUpgrades(){
  const box=$('upgBox'), el=$('upgList');
  if(!G.selShaft || !G.shafts.includes(G.selShaft)){ box.style.display='none'; G.selShaft=null; return; }
  const s=G.selShaft;
  box.style.display='';
  $('upgTitle').textContent=`Lift ${G.shafts.indexOf(s)+1} · floors ${s.bottom}–${s.top}${s.express?' (express)':''}`;
  el.innerHTML='';
  for(const k of UPG_KEYS){
    const cur=UPG[k].lv[s.up[k]], nx=upgCost(s,k);
    const row=document.createElement('div'); row.className='upg';
    const val = k==='motor'? cur.v.toFixed(2)+' fl/s'
              : k==='cabin'? cur.v+' people · '+cur.per.toFixed(2)+'s each'
              : cur.label;
    row.innerHTML=`<div class="uh"><b>${UPG[k].name}</b><em>${k==='control'?'':cur.label+' · '}${val}</em></div>`+
                  `<div class="pips">${UPG[k].lv.map((_,i)=>`<u class="${i<=s.up[k]?'on':''}"></u>`).join('')}</div>`;
    const b=document.createElement('button');
    if(!nx){ b.textContent='Maxed'; b.disabled=true; }
    else if(nx.star>G.star){ b.textContent=`${nx.label} — ★${nx.star}`; b.disabled=true; }
    else {
      b.textContent=`${nx.label} — ${money(nx.cost)}`;
      b.disabled=nx.cost>G.cash;
      b.onclick=()=>{ const err=upgradeShaft(s,k); invalidateRoutes();
        if(err) toast(err); else toast(`${UPG[k].name}: ${nx.label} fitted. Maintenance goes up with it.`);
        renderAll(); };
    }
    row.appendChild(b); el.appendChild(row);
  }
}

function rescue(){
  for(let f=0;f<height();f++){
    const q=G.queue[f];
    for(let i=q.length-1;i>=0;i--){
      const p=q[i];
      if(G.shafts.includes(p.shaft)) continue;
      q.splice(i,1);
      const o=shaftsFor(p.floor,p.dest);
      if(o.length){ p.shaft=o[0]; p.state='walk'; } else p.state='settled';
    }
  }
  for(const p of G.people) if(p.state==='walk'&&!G.shafts.includes(p.shaft)){
    const o=shaftsFor(p.floor,p.dest);
    if(o.length) p.shaft=o[0]; else p.state='settled';
  }
}

export function renderSel(){
  const box=$('selBox'), lease=$('leaseBox');
  if(G.selected<0){ box.style.display='none'; lease.style.display='none'; return; }
  box.style.display='';
  const fl=G.floors[G.selected];
  if(G.selected===0){
    lease.style.display='none';
    $('sel').innerHTML=`<h3>Floor 0 — Lobby</h3><div class="mini">Everyone enters and leaves here. Every lift should reach it.</div>`+connectorHTML(0);
    wireConnectors(0);
    return;
  }
  if(!fl.type){
    lease.style.display='';
    $('sel').innerHTML=`<h3>Floor ${G.selected} — Vacant</h3><div class="mini">Choose a use below.</div>`+connectorHTML(G.selected);
    wireConnectors(G.selected);
    return;
  }
  lease.style.display='none';
  const t=TEN[fl.type];
  const avg=fl.waitN?fl.waitSum/fl.waitN:0;
  const col=fl.sat>60?'#2F7D52':fl.sat>35?'#B07D22':'#C0392B';
  const reach=G.shafts.some(s=>serves(s,G.selected)&&serves(s,0));
  $('sel').innerHTML=
    `<h3>Floor ${G.selected} — ${t.name}</h3>`+
    `<div class="bar"><i style="width:${fl.sat}%;background:${col}"></i></div>`+
    `<div class="stats">
       <div><span>Satisfaction</span><b style="color:${col}">${Math.round(fl.sat)}%</b></div>
       <div><span>People</span><b>${t.pop}</b></div>
       <div><span>Avg wait today</span><b>${fl.waitN?secs(avg):'—'}</b></div>
       <div><span>Gave up today</span><b class="${fl.gave?'bad':''}">${fl.gave}</b></div>
       <div><span>Rent</span><b>${money(Math.round(t.rent*rentMult(G.selected)))}${rentMult(G.selected)>1.001?' <em style="font-style:normal;color:#2F7D52">+'+Math.round((rentMult(G.selected)-1)*100)+'%</em>':''}</b></div>
     </div>`+
    (reach?'':`<div class="mini bad" style="margin-top:7px">No lift connects this floor to the lobby.</div>`)+
    connectorHTML(G.selected)+
    `<button style="margin-top:8px" id="clearFl">Clear floor</button>`;
  wireConnectors(G.selected);
  $('clearFl').onclick=()=>{ despawnFloor(G.selected); G.floors[G.selected]=newFloor(); renderAll(); };
}

/* Connectors are offered on the floor below the pair they join, which is how
   a person thinks about it: "put an escalator up from here". */
function connectorHTML(f){
  if(f>=height()-1) return '<div class="mini" style="margin-top:8px">Top floor — nothing above to connect to.</div>';
  const L=linkAt(f);
  if(L) return `<div class="conn"><b>${CONN[L.kind].name}</b> up to floor ${f+1}`+
               `<button id="rmConn">remove</button></div>`;
  let h='<div class="mini" style="margin-top:9px;margin-bottom:5px">Connect up to floor '+(f+1)+':</div>';
  for(const k in CONN){
    const C=CONN[k], lock=C.star>G.star;
    h+=`<button class="connBtn" data-k="${k}" ${lock||C.cost>G.cash?'disabled':''} style="margin-bottom:3px">`+
       `${C.name} — ${lock?'★'+C.star:money(C.cost)}</button>`;
  }
  return h;
}
function wireConnectors(f){
  const rm=$('rmConn');
  if(rm) rm.onclick=()=>{ G.links[f]=null; invalidateRoutes(); renderAll(); };
  document.querySelectorAll('.connBtn').forEach(b=>{
    b.onclick=()=>{
      const k=b.getAttribute('data-k'), C=CONN[k];
      if(C.star>G.star){ toast(`${C.name} needs ★${C.star}.`); return; }
      if(C.cost>G.cash){ toast('Not enough cash.'); return; }
      G.cash-=C.cost; G.links[f]={kind:k}; invalidateRoutes();
      toast(k==='esc'
        ? 'Escalator in. It never queues — but people will only chain a few before they resent it.'
        : 'Stairs in. Almost free, almost no space, and almost nobody will climb more than two flights.');
      renderAll();
    };
  });
}

export function showEOD({rent,maint,interest,lost,unhappy,rose,bankrupt,debtDays}){
  $('eodTitle').textContent=`Day ${G.day} closed`;
  $('eodStats').innerHTML=
    `<div><span>Rent collected</span><b class="good">${money(rent)}</b></div>
     <div><span>Lift maintenance</span><b class="bad">-${money(maint)}</b></div>
     ${interest?`<div><span>Overdraft interest</span><b class="bad">-${money(interest)}</b></div>`:''}
     <div><span>Net</span><b class="${rent-maint-interest>=0?'good':'bad'}">${money(rent-maint-interest)}</b></div>
     <div><span>Trips served</span><b>${G.today.trips}</b></div>
     <div><span>Gave up waiting</span><b class="${G.today.gave?'bad':''}">${G.today.gave}</b></div>
     <div><span>Cash</span><b>${money(G.cash)}</b></div>`;
  let note='';
  if(bankrupt) note='The bank has called in your overdraft. This tower is finished — start another.';
  else if(G.cash<0) note=`You are ${money(-G.cash)} overdrawn, day ${debtDays} of ${5}. Interest is compounding.`;
  else if(rose) note=`★ The tower is now rated ${G.star} stars. New tenants, amenities and lift upgrades are available.`;
  else if(lost.length) note=`${lost.length} tenant${lost.length>1?'s':''} gave up and left (floor${lost.length>1?'s':''} ${lost.join(', ')}). They were waiting too long, every day.`;
  else if(unhappy) note=`${unhappy} tenant${unhappy>1?'s are':' is'} unhappy with the lifts. Fix it before they leave.`;
  else if(G.today.gave>20) note=`${G.today.gave} people gave up waiting today. That number turns into departures.`;
  else if(G.star<5){
    const short=reqStatus(G.star+1).filter(r=>!r.met)
      .sort((a,b)=>a.p-b.p)
      .map(r=>`${r.k.toLowerCase()} (${r.cur}${r.pct?'%':''} of ${r.need}${r.pct?'%':''})`);
    note = short.length
      ? `A good day. For ★${G.star+1} you still need ${short.slice(0,2).join(', and ')}.`
      : `A good day — and the tower qualifies for ★${G.star+1}.`;
  }
  else note='A good day. Everyone got where they were going.';
  $('eodNote').textContent=note;
  $('eod').classList.add('on');
}
$('eodNext').onclick=()=>{
  save();
  $('eod').classList.remove('on');
  G.day++; startDay(); G.running=true; renderAll();
};

/* --- controls --- */
const sp={0:$('sp0'),1:$('sp1'),4:$('sp4'),20:$('sp20'),60:$('sp60')};
export function setSpeed(v){ G.speed=v; G.running=v>0 && !$('eod').classList.contains('on');
  for(const k in sp) sp[k].classList.toggle('on',+k===v); }
$('sp0').onclick=()=>setSpeed(0); $('sp1').onclick=()=>setSpeed(1);
$('sp4').onclick=()=>setSpeed(4); $('sp20').onclick=()=>setSpeed(20);
$('sp60').onclick=()=>setSpeed(60);

$('addFloor').onclick=()=>{
  const c=floorCost();
  if(c>G.cash||height()>=MAX_FLOOR) return;
  G.cash-=c; G.floors.push(newFloor()); invalidateRoutes(); tutorialSaw('addFloor');
  if(G.links.length<height()) G.links.length=height();
  $('sTop').value=height()-1;
  toast(`Floor ${height()-1} built. No lift reaches it yet.`);
  renderAll();
};
$('extendAll').onclick=()=>{
  const c=extendAllCost();
  if(!c||c>G.cash) return;
  G.cash-=c;
  for(const s of G.shafts) if(s.top<height()-1) s.top=height()-1;
  invalidateRoutes();
  toast('Every shaft now runs to the top — and occupies a bay on each new floor.');
  renderAll();
};
$('addShaft').onclick=()=>{
  const err=buildShaft(+$('sBot').value,+$('sTop').value,$('expr').checked);
  invalidateRoutes();
  if(err) toast(err);
  else toast('Shaft built. That bay is now gone from every floor it passes.');
  renderAll();
};
for(const id of ['sBot','sTop','expr']) $(id).addEventListener('input',renderPanel);

stage.addEventListener('click',e=>{
  const r=stage.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  if(mx<BX-30||mx>BX+BAYS*BW+30){ G.selected=-1; renderSel(); return; }
  const f=height()-1-Math.floor((my-BY)/FH);
  G.selected=(f>=0&&f<height())?f:-1;
  renderSel();
});


