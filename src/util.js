
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;

export const money=v=>(v<0?'-$':'$')+Math.abs(Math.round(v)).toLocaleString('en-US');

export const hhmm=t=>String(Math.floor(t/3600)%24).padStart(2,'0')+':'+String(Math.floor(t/60)%60).padStart(2,'0');

export const secs=s=>s<60?Math.round(s)+'s':Math.floor(s/60)+'m'+String(Math.round(s%60)).padStart(2,'0');

