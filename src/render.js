/* Everything that draws. No game rules live here — render.js reads state and
   paints it, and is the only module allowed to touch the canvas. */
import { G, height, popOf } from './state.js';
import { BAYS, TEN, LOBBY_COL, CONN_BAYS, DAY_START, DAY_END, SKY } from './config.js';
import { clamp } from './util.js';
import { rnd, setSeed } from './rng.js';
import { serves, passes, carCap } from './lifts.js';
import { linkAt, linkOccupies, connBay } from './connectors.js';

export const stage = document.getElementById('stage');
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');

/* ==========================================================================
   RENDER
   ========================================================================== */
let FH=24, BW=26, BX=0, BY=0, GH=88;

export function layout(){
  const w=stage.clientWidth, h=stage.clientHeight;
  const avail=h-GH-64;
  FH=clamp(Math.floor(avail/Math.max(height(),8)),9,30);
  BW=clamp(Math.round(FH*1.05),10,30);
  BX=Math.round((w-BAYS*BW)/2);
  BY=Math.round(h-GH-30-height()*FH);
}
export const fy =f=>BY+(height()-1-f)*FH;
export const bx =b=>BX+b*BW;

/* sky colour by hour — the cheapest way to make a screen feel alive */
function skyPair(h){
  for(let i=0;i<SKY.length-1;i++){
    if(h>=SKY[i][0]&&h<=SKY[i+1][0]){
      const t=(h-SKY[i][0])/(SKY[i+1][0]-SKY[i][0]);
      return [mix(SKY[i][1],SKY[i+1][1],t), mix(SKY[i][2],SKY[i+1][2],t)];
    }
  }
  return [SKY[0][1],SKY[0][2]];
}
function mix(a,b,t){
  const p=x=>[parseInt(x.slice(1,3),16),parseInt(x.slice(3,5),16),parseInt(x.slice(5,7),16)];
  const A=p(a),B=p(b);
  return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
const isNight=()=>{ const h=G.simT/3600; return h<6.6||h>18.6; };
const nightAmt=()=>{ const h=G.simT/3600;
  if(h<6.0) return 1; if(h<7.4) return 1-(h-6)/1.4;
  if(h<17.8) return 0; if(h<19.8) return (h-17.8)/2; return 1; };

let cityLine=null, bgSil=null, bgNight=null, bgW=0, bgH=0, lampGrad=null;
/* Bake the skyline once: silhouette on one layer, stars and lit windows on
   another, so a frame costs two drawImage calls instead of thousands of fills. */
function buildBackdrop(w,h,gy){
  bgSil=document.createElement('canvas');   bgSil.width=w;   bgSil.height=h;
  bgNight=document.createElement('canvas'); bgNight.width=w; bgNight.height=h;
  const a=bgSil.getContext('2d'), b=bgNight.getContext('2d');
  a.fillStyle='#141A26';
  for(const bd of cityLine) a.fillRect(bd.x,gy-bd.h,bd.w,bd.h);
  rs=7; b.fillStyle='rgba(255,255,240,.95)';
  for(let i=0;i<70;i++){ const sx=rnd()*w, sy=rnd()*(h-GH)*0.62, r=rnd()*1.1+0.3; b.fillRect(sx,sy,r,r); }
  rs=99; b.fillStyle='rgba(255,214,140,.8)';
  for(const bd of cityLine)
    for(let yy=gy-bd.h+6; yy<gy-4; yy+=7)
      for(let xx=bd.x+3; xx<bd.x+bd.w-4; xx+=6) if(rnd()<0.32) b.fillRect(xx,yy,2,3);
  lampGrad=null;
}
function makeCity(w){
  rs=42; const a=[];
  for(let x=-40;x<w+40;x+=1){ }
  let x=-40;
  while(x<w+60){ const bw=26+rnd()*70, bh=30+rnd()*150; a.push({x,w:bw,h:bh}); x+=bw+6+rnd()*16; }
  return a;
}

export function draw(){
  const w=stage.clientWidth,h=stage.clientHeight,dpr=window.devicePixelRatio||1;
  if(cv.width!==w*dpr||cv.height!==h*dpr){ cv.width=w*dpr;cv.height=h*dpr;
    cv.style.width=w+'px';cv.style.height=h+'px'; cityLine=null; bgSil=null; lampGrad=null; }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  layout();
  if(!cityLine) cityLine=makeCity(w);

  const hr=G.simT/3600, [c1,c2]=skyPair(hr), nA=nightAmt();
  const g=ctx.createLinearGradient(0,0,0,h-GH);
  g.addColorStop(0,c1); g.addColorStop(1,c2);
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h-GH+2);

  drawSunMoon(w,h,hr);

  /* The skyline and its lit windows are baked once and blitted, rather than
     redrawn every frame. The window loop was three deep — about eight thousand
     random calls and a couple of thousand draws PER FRAME — and it only
     switched on after dark, so the game ran beautifully all morning and then
     ground to a halt at dusk. */
  const gy=h-GH-30;
  if(!bgSil || bgW!==w || bgH!==h){ buildBackdrop(w,h,gy); bgW=w; bgH=h; }
  ctx.globalAlpha=0.30+0.34*nA;
  ctx.drawImage(bgSil,0,0);
  if(nA>0.02){ ctx.globalAlpha=0.72*nA; ctx.drawImage(bgNight,0,0); }
  ctx.globalAlpha=1;

  // ground
  ctx.fillStyle=nA>0.3?'#1B2029':'#3B3F36';
  ctx.fillRect(0,gy,w,h-gy);
  ctx.fillStyle=nA>0.3?'#232935':'#4A4E42';
  ctx.fillRect(0,gy,w,7);
  drawStreet(w,gy,nA);

  drawTower(nA);
  tintScene(hr,nA);
  drawGraph(w,h);
}

/* A sun and a moon on the same arc. Nothing else communicates "a day is
   passing" as cheaply or as immediately. */
function drawSunMoon(w,h,hr){
  const gy=h-GH-30;
  const body=(t,core,glow,r)=>{
    if(t<0||t>1) return;
    const x=w*0.07+w*0.86*t, y=gy-Math.sin(t*Math.PI)*(gy*0.70)-14;
    const g=ctx.createRadialGradient(x,y,0,x,y,r*5.5);
    g.addColorStop(0,glow); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r*5.5,0,6.284); ctx.fill();
    ctx.fillStyle=core; ctx.beginPath(); ctx.arc(x,y,r,0,6.284); ctx.fill();
  };
  if(hr>5.3&&hr<19.5) body((hr-5.3)/14.2,'#FFE9A8','rgba(255,214,130,.34)',15);
  else body(hr>=19.5?(hr-19.5)/10.1:(hr+4.5)/10.1,'#E9EDF4','rgba(200,215,240,.22)',10);
}

/* Lamp glows are cached — a fresh radial gradient per lamp per frame is one of
   the more expensive things you can ask a canvas to do. */
function drawStreet(w,gy,nA){
  ctx.fillStyle=nA>0.3?'#2A313D':'#585C4E';
  const xs=[];
  for(let x=18;x<w;x+=190){ xs.push(x); ctx.fillRect(x,gy-26,2,26); ctx.fillRect(x-4,gy-28,10,3); }
  if(nA<=0.25) return;
  if(!lampGrad){
    lampGrad=xs.map(x=>{
      const g=ctx.createRadialGradient(x+1,gy-26,0,x+1,gy-26,34);
      g.addColorStop(0,'rgba(255,206,130,1)'); g.addColorStop(1,'rgba(255,206,130,0)');
      return g;
    });
  }
  ctx.globalAlpha=0.5*nA;
  for(let i=0;i<xs.length && i<lampGrad.length;i++){
    ctx.fillStyle=lampGrad[i];
    ctx.beginPath(); ctx.arc(xs[i]+1,gy-26,34,0,6.284); ctx.fill();
  }
  ctx.globalAlpha=1;
}

/* A wash over the building only — golden at either end of the day, cold at
   night. It is one rectangle, and it does most of the work of making the
   tower feel like it is standing in real light. */
function tintScene(hr,nA){
  let col=null;
  if(hr>5.6&&hr<8.2)       col=`rgba(255,168,86,${0.20*(1-Math.abs(hr-6.9)/1.3)})`;
  else if(hr>16.8&&hr<19.6)col=`rgba(255,148,72,${0.24*(1-Math.abs(hr-18.2)/1.4)})`;
  if(nA>0.05) col=`rgba(28,44,86,${0.34*nA})`;
  if(!col) return;
  ctx.fillStyle=col;
  ctx.fillRect(BX-6,fy(height()-1)-8,BAYS*BW+12,height()*FH+10);
}

/* ---- interior silhouettes: cheap, tiny, and the single biggest thing that
   makes one floor read differently from the next ---- */
function furnish(kind,x0,yb,w,hgt){
  const g=ctx;
  if(hgt<3) return;
  if(kind==='office'){
    g.fillRect(x0+2,yb-hgt*0.5,w*0.38,hgt*0.5);
    g.fillRect(x0+w*0.55,yb-hgt*0.5,w*0.35,hgt*0.5);
    g.fillRect(x0+3,yb-hgt*0.85,2,hgt*0.35);
  } else if(kind==='apt'){
    g.fillRect(x0+1,yb-hgt*0.45,w*0.55,hgt*0.45);
    g.fillRect(x0+w*0.72,yb-hgt*0.9,2,hgt*0.9);
    g.fillRect(x0+w*0.66,yb-hgt,5,2);
  } else if(kind==='hotel'){
    g.fillRect(x0+1,yb-hgt*0.4,w*0.7,hgt*0.4);
    g.fillRect(x0+1,yb-hgt*0.62,w*0.22,hgt*0.24);
  } else if(kind==='food'){
    g.fillRect(x0+w*0.3,yb-hgt*0.55,w*0.4,2);
    g.fillRect(x0+w*0.47,yb-hgt*0.55,2,hgt*0.55);
    g.fillRect(x0+w*0.12,yb-hgt*0.4,2,hgt*0.4);
    g.fillRect(x0+w*0.82,yb-hgt*0.4,2,hgt*0.4);
  } else if(kind==='shops'){
    g.fillRect(x0+2,yb-hgt*0.95,w*0.3,hgt*0.95);
    g.fillRect(x0+w*0.6,yb-hgt*0.95,w*0.3,hgt*0.95);
  } else if(kind==='sky'){
    g.fillRect(x0+1,yb-hgt*0.4,w*0.5,hgt*0.4);
    g.fillRect(x0+w*0.68,yb-hgt*0.75,w*0.24,hgt*0.75);
  } else if(kind==='lobby'){
    g.fillRect(x0,yb-hgt*0.45,w,hgt*0.45);
  }
}

function drawTower(nA){
  const daylight=1-nA;
  const gyGround=fy(0)+FH;

  // ground shadow
  ctx.fillStyle=`rgba(8,10,14,${0.30+0.25*daylight})`;
  ctx.fillRect(BX-14,gyGround+2,BAYS*BW+28,6);

  for(let f=0;f<height();f++){
    const y=fy(f), fl=G.floors[f];
    const kind = f===0?'lobby':fl.type;
    const col  = f===0 ? LOBBY_COL : fl.type ? TEN[fl.type].col : '#63615B';

    // plate
    ctx.fillStyle = (fl.type||f===0) ? col : 'rgba(84,82,76,.6)';
    ctx.fillRect(BX,y,BAYS*BW,FH-1);
    // interior floor shading
    ctx.fillStyle='rgba(0,0,0,.13)';
    ctx.fillRect(BX,y+FH*0.5,BAYS*BW,FH*0.5-1);

    const occ = f===0 ? 0.8 : popOf(f)? G.people.filter(p=>p.floor===f).length/popOf(f) : 0;
    const glazeH=Math.max(2,FH*0.44), furnH=Math.max(2,FH*0.34);

    for(let b=0;b<BAYS;b++){
      if(G.shafts.some(s=>s.bay===b&&passes(s,f))||linkOccupies(f,b)) continue;
      const x0=bx(b);
      // glazing
      if(FH>=11){
        if(nA>0.2 && occ>0.03){
          ctx.fillStyle=`rgba(255,205,128,${0.22+0.55*Math.min(1,occ*1.4)*nA})`;
        } else if(nA>0.2){
          ctx.fillStyle='rgba(40,52,74,.5)';
        } else {
          ctx.fillStyle=`rgba(196,222,240,${0.30+0.22*daylight})`;
        }
        ctx.fillRect(x0+2,y+2,BW-4,glazeH);
        ctx.fillStyle='rgba(255,255,255,.16)';        // reflection streak
        ctx.fillRect(x0+2,y+2,BW-4,Math.max(1,glazeH*0.3));
        ctx.fillStyle='rgba(20,24,30,.30)';           // mullion
        ctx.fillRect(x0+BW-1,y+1,1,FH-3);
      }
      // furniture
      if(FH>=15 && (fl.type||f===0)){
        ctx.fillStyle=`rgba(24,28,34,${0.34+0.16*nA})`;
        furnish(kind,x0+2,y+FH-3,BW-5,furnH);
      }
    }

    // shafts punched through
    for(const s of G.shafts){
      if(!passes(s,f)) continue;
      const x0=bx(s.bay);
      ctx.fillStyle = serves(s,f) ? '#1B2027' : '#0E1116';
      ctx.fillRect(x0,y-1,BW,FH);
      if(FH>=12){                                    // guide rails
        ctx.fillStyle='rgba(150,160,175,.18)';
        ctx.fillRect(x0+3,y-1,1,FH); ctx.fillRect(x0+BW-4,y-1,1,FH);
      }
    }

    // slab
    ctx.fillStyle='rgba(255,255,255,.10)'; ctx.fillRect(BX,y+FH-3,BAYS*BW,1);
    ctx.fillStyle='rgba(8,10,14,.55)';     ctx.fillRect(BX,y+FH-2,BAYS*BW,2);

    if(f===G.selected){ ctx.strokeStyle='#FFF'; ctx.lineWidth=2;
      ctx.strokeRect(BX-1,y-1,BAYS*BW+2,FH+1); }
    if(FH>=11){
      ctx.fillStyle='rgba(255,255,255,.42)';
      ctx.font='9px "SF Mono",Menlo,monospace';
      ctx.textAlign='right'; ctx.textBaseline='middle';
      ctx.fillText(f,BX-8,y+FH/2);
      if(fl.type&&FH>=15){ ctx.textAlign='left'; ctx.fillStyle='rgba(20,24,30,.45)';
        ctx.fillText(TEN[fl.type].name,BX+BAYS*BW+8,y+FH/2); }
    }
  }

  // facade shading, gives the slab some form
  const fg=ctx.createLinearGradient(BX,0,BX+BAYS*BW,0);
  fg.addColorStop(0,'rgba(0,0,0,.16)'); fg.addColorStop(0.42,'rgba(255,255,255,.05)');
  fg.addColorStop(1,'rgba(0,0,0,.20)');
  ctx.fillStyle=fg;
  ctx.fillRect(BX,fy(height()-1),BAYS*BW,height()*FH);

  // roof: parapet, plant room, mast and beacon
  const ty=fy(height()-1);
  ctx.fillStyle='#252A32'; ctx.fillRect(BX-5,ty-7,BAYS*BW+10,7);
  ctx.fillStyle='#2E343D'; ctx.fillRect(BX+BAYS*BW*0.30,ty-15,BAYS*BW*0.26,8);
  ctx.fillStyle='#3A414B'; ctx.fillRect(BX+BAYS*BW*0.62,ty-12,BAYS*BW*0.12,5);
  ctx.fillStyle='#4A515C'; ctx.fillRect(BX+BAYS*BW*0.5-1,ty-30,2,16);
  const blink=Math.floor(G.simT/1.4)%2===0;
  if(blink){ ctx.fillStyle='rgba(220,70,60,.95)';
    ctx.fillRect(BX+BAYS*BW*0.5-2.5,ty-33,5,4); }

  // entrance canopy
  const y0=fy(0);
  ctx.fillStyle='#39404A'; ctx.fillRect(BX-10,y0+FH-1,BAYS*BW+20,3);
  ctx.fillStyle=nA>0.25?'rgba(255,208,142,.9)':'rgba(255,255,255,.34)';
  ctx.fillRect(BX+BAYS*BW/2-Math.max(9,BW*0.7),y0+FH-Math.max(6,FH*0.5),
               Math.max(18,BW*1.4),Math.max(4,FH*0.42));

  // ---- stairs and escalators ----
  for(let f=0;f<G.links.length && f<height()-1;f++){
    const L=G.links[f]; if(!L) continue;
    const b=connBay(f), x=bx(b), yTop=fy(f+1), yBot=fy(f);
    ctx.fillStyle = L.kind==='esc' ? '#4C5A66' : '#4A4640';
    ctx.fillRect(x+1,yTop+1,BW-2,(yBot-yTop)+FH-2);
    // the incline
    ctx.strokeStyle = L.kind==='esc' ? 'rgba(190,225,240,.75)' : 'rgba(215,208,192,.6)';
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x+2,yBot+FH-3); ctx.lineTo(x+BW-2,yTop+3); ctx.stroke();
    if(L.kind==='esc'){
      // moving step marks
      const n=6, run=G.simT*0.55;
      ctx.fillStyle='rgba(210,238,250,.55)';
      for(let i=0;i<n;i++){
        const t=((i/n)+(run%1))%1;
        const px=x+2+(BW-4)*t, py=(yBot+FH-3)+((yTop+3)-(yBot+FH-3))*t;
        ctx.fillRect(px-1,py-1,2.5,2.5);
      }
    } else {
      ctx.strokeStyle='rgba(215,208,192,.30)'; ctx.lineWidth=1;
      for(let i=1;i<4;i++){
        const t=i/4, px=x+2+(BW-4)*t, py=(yBot+FH-3)+((yTop+3)-(yBot+FH-3))*t;
        ctx.beginPath(); ctx.moveTo(px-3,py); ctx.lineTo(px+3,py); ctx.stroke();
      }
    }
  }

  // ---- cars and counterweights ----
  for(const s of G.shafts){
    const x=bx(s.bay), c=s.car, cy=fy(c.y), cap=carCap(s);
    // counterweight rides opposite the car
    const cwF=clamp(s.bottom+s.top-c.y,s.bottom,s.top);
    ctx.fillStyle='rgba(120,130,145,.30)';
    ctx.fillRect(x+BW-6,fy(cwF)+3,3,Math.max(4,FH-7));

    ctx.fillStyle=c.state==='doors'?'#F4F0E6':'#C6C0B3';
    ctx.fillRect(x+2,cy+2,BW-4,FH-5);
    ctx.fillStyle='rgba(255,246,214,.55)';                 // cabin light
    ctx.fillRect(x+3,cy+3,BW-6,2);

    if(c.state==='doors'){                                  // doors slid apart
      ctx.fillStyle='rgba(24,28,34,.72)';
      ctx.fillRect(x+3,cy+4,Math.max(1,(BW-6)*0.22),FH-8);
      ctx.fillRect(x+BW-3-Math.max(1,(BW-6)*0.22),cy+4,Math.max(1,(BW-6)*0.22),FH-8);
    } else if(FH>=13 && c.dir!==0){
      ctx.fillStyle='rgba(30,36,44,.75)';
      ctx.font='7px "SF Mono",Menlo,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(c.dir>0?'▲':'▼',x+BW/2,cy+5);
    }
    const load=c.riders.length/cap;
    ctx.fillStyle=load>0.9?'#C0392B':load>0.6?'#D9A441':'#3E8058';
    ctx.fillRect(x+3,cy+FH-6,(BW-6)*load,3);
    if(FH>=16&&c.riders.length){
      ctx.fillStyle='#191D23'; ctx.font='8px "SF Mono",Menlo,monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(c.riders.length,x+BW/2,cy+FH/2);
    }
    if(s===G.selShaft){ ctx.strokeStyle='#C9A227'; ctx.lineWidth=1.5;
      ctx.strokeRect(x-0.5,fy(s.top)-0.5,BW+1,(s.top-(s.express?0:s.bottom)+1)*FH+1); }
  }

  // ---- people ----
  const pw=Math.max(2,Math.round(BW*0.15));
  for(const p of G.people){
    if(p.state==='out'||p.state==='ride') continue;
    if(p.floor<0||p.floor>=height()) continue;
    if(p.state==='climb'){
      const li=p.cDir>0?p.floor:p.floor-1, b=connBay(li);
      const y0=fy(p.floor)+FH-3, y1=fy(p.floor+p.cDir)+FH-3;
      const ph2=Math.max(3,Math.round(FH*0.34));
      const px2=Math.round(bx(b+0.15+0.7*(p.cDir>0?p.cP:1-p.cP))-1);
      const py2=Math.round(y0+(y1-y0)*p.cP)-ph2;
      ctx.fillStyle='rgba(20,26,34,.85)';
      ctx.fillRect(px2,py2,Math.max(2,Math.round(BW*0.15)),ph2);
      continue;
    }
    const ph=Math.max(3,Math.round(FH*0.36)+(p.id%3===0?1:0));
    const y=fy(p.floor)+FH-3-ph;
    let col='rgba(18,22,28,.5)';
    if(p.state==='wait'){
      const w8=G.simT-p.waitStart;
      col = w8>230?'#C0392B': w8>105?'#D9A441':'#12171E';
    } else if(p.state==='walk') col='rgba(18,22,28,.8)';
    const px=Math.round(bx(p.x)-pw/2);
    ctx.fillStyle=col;
    ctx.fillRect(px,y,pw,ph);
    if(ph>=6) ctx.fillRect(px-0.5,y-1.5,pw+1,1.5);
  }
  for(let f=0;f<height();f++){
    const byS=new Map();
    for(const p of G.queue[f]){ const a=byS.get(p.shaft)||[]; a.push(p); byS.set(p.shaft,a); }
    for(const [s,arr] of byS) arr.forEach((p,i)=>{
      const side=i%2?1:-1, stp=Math.ceil((i+1)/2);
      p.x=clamp(s.bay+0.5+side*stp*0.42,0.4,BAYS-0.4);
    });
  }
}

function drawGraph(w,h){
  const gy=h-GH+14, gh=GH-40, gx=52, gw=w-gx-34;
  ctx.fillStyle='rgba(239,235,228,.9)'; ctx.fillRect(0,h-GH,w,GH);
  ctx.strokeStyle='#D3CCC0'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(gx,gy+gh+.5); ctx.lineTo(gx+gw,gy+gh+.5); ctx.stroke();
  let peak=10;
  for(const s of G.graph) if(s.w>peak)peak=s.w;
  for(const s of G.ghost) if(s.w>peak)peak=s.w;
  const px=t=>gx+gw*clamp((t-DAY_START)/(DAY_END-DAY_START),0,1);
  const py=v=>gy+gh-gh*clamp(v/peak,0,1);
  ctx.fillStyle='#B3AA98'; ctx.font='8px "SF Mono",Menlo,monospace'; ctx.textAlign='center';
  for(let hh=6;hh<=22;hh+=2){ const X=px(hh*3600); ctx.fillRect(X,gy+gh,1,3);
    ctx.fillText(String(hh).padStart(2,'0'),X,gy+gh+13); }
  if(G.ghost.length>1){ ctx.strokeStyle='rgba(25,29,35,.2)'; ctx.lineWidth=1.5; ctx.beginPath();
    G.ghost.forEach((s,i)=>i?ctx.lineTo(px(s.t),py(s.w)):ctx.moveTo(px(s.t),py(s.w))); ctx.stroke(); }
  if(G.graph.length>1){ ctx.strokeStyle='#C0392B'; ctx.lineWidth=2; ctx.beginPath();
    G.graph.forEach((s,i)=>i?ctx.lineTo(px(s.t),py(s.w)):ctx.moveTo(px(s.t),py(s.w))); ctx.stroke(); }
  ctx.strokeStyle='rgba(25,29,35,.45)'; ctx.lineWidth=1; ctx.beginPath();
  ctx.moveTo(px(G.simT),gy-3); ctx.lineTo(px(G.simT),gy+gh); ctx.stroke();
  ctx.fillStyle='#8B8378'; ctx.textAlign='left';
  ctx.fillText('PEOPLE WAITING',gx,gy-4);
  ctx.textAlign='right'; ctx.fillText(peak,gx-7,gy+4);
}


