/**
 * motion-logo-reveal: a dot sparks into a brand-coloured line, the logo rises out from behind
 * the line (masked by it) with a spring and a soft blur, a ring pulse marks the landing, and
 * the tagline words settle in under the line. Without a logo asset the brand name is set in
 * the heading font instead. Ends on a hold unless another clip follows.
 *
 * Copy is the tagline. The logo is the first SVG/PNG/JPEG asset referenced by the scene.
 */
import type { MotionRecipe } from './common.js';
import { baseData, commonCss, fragment, rgba } from './common.js';

export const logoReveal: MotionRecipe = (scene, ctx) => {
  const tagline = scene.copy_text.replace(/[|\n]+/g, ' ').trim();
  const p = ctx.palette;
  const data = {
    ...baseData(ctx),
    tagline: tagline.split(/\s+/).filter(Boolean),
    logo: ctx.logo,
    glow: rgba(p.primary, 0.22)
  };
  const css = `${commonCss(ctx)}
#lw{position:absolute;overflow:hidden}
#lw>*{position:absolute;left:0;top:0}
#glow,#ring{position:absolute;border-radius:50%}`;
  const js = `
(function(){
const W=D.W,H=D.H,T=D.T,P=D.P,U=Math.min(W,H)/1080;
backdrop();hudInit();
const world=$('world');
const glow=mk('div','',null);glow.id='glow';world.insertBefore(glow,$('shape'));
const ring=mk('div','',null);ring.id='ring';world.insertBefore(ring,$('shape'));
let lw,lh,logoEl;
if(D.logo){lw=Math.min(W*0.36,H*0.26/D.logo.aspect);lh=lw*D.logo.aspect;logoEl=mk('img','',null);logoEl.src=D.logo.dataUri;logoEl.style.width=lw+'px';logoEl.style.height=lh+'px';}
else{const F=Math.round(Math.min(W*0.1,H*0.16)),f=D.weight+' '+F+'px '+D.heading;lw=measure(D.brand,f,'-0.04em');lh=F*1.15;
 logoEl=mk('div','w',null,D.brand);logoEl.style.cssText+=';font:'+f+';letter-spacing:-0.04em;line-height:'+lh+'px;color:'+P.ink;}
const tf='400 '+Math.round(40*U)+'px '+D.body,tlines=wrap(D.tagline,tf,W*0.7,Math.round(40*U)*0.28),tlh=Math.round(40*U)*1.35;
const g1=34*U,g2=44*U,lineT=6*U,total=lh+g1+lineT+g2+tlines.length*tlh;
const top=-total/2,lineY=top+lh+g1+lineT/2;
const lwrap=mk('div','',null);lwrap.id='lw';lwrap.style.cssText+=';left:'+(-lw/2-40*U)+'px;top:'+(top-40*U)+'px;width:'+(lw+80*U)+'px;height:'+(lineY-top+40*U)+'px';
logoEl.style.left=(40*U)+'px';logoEl.style.top=(40*U)+'px';lwrap.appendChild(logoEl);world.appendChild(lwrap);
const words=[];tlines.forEach((ln,li)=>{let x=-ln.w/2;const y=lineY+lineT/2+g2+li*tlh;
 ln.words.forEach(wd=>{const e=mk('div','w',world,wd.text);e.style.cssText+=';left:'+x+'px;top:'+y+'px;font:'+tf+';line-height:'+tlh+'px;color:'+P.ink+';opacity:.86';words.push(e);x+=wd.w+Math.round(40*U)*0.28;});});
const tLine=0.18,tRise=0.42,tEnd=D.last?null:T-0.34;
const WT=words.map((_,i)=>0.95+i*Math.min(0.08,(T-1.6)/Math.max(1,words.length)));
const d=26;
const SH={dot:{w:d,h:d,r:d/2,bg:P.primary,cam:1},line:{w:lw*1.12,h:lineT,r:lineT/2,bg:P.primary,cam:1},end:{w:d,h:d,r:d/2,bg:P.primary,cam:1}};
const SEQ=[[tLine,'line']];if(tEnd!=null)SEQ.push([tEnd,'end']);
const cy=M.track(0,tEnd==null?[[tLine,lineY,[14,0.8]]]:[[tLine,lineY,[14,0.8]],[tEnd,0,M.MORPH]]);
const rise=t=>M.S(t-tRise,11,0.74);
const R=Math.max(W,H)*0.55;
M.scene({W,H,T,bg:D.bg,intro:D.first?0.02:null,SH,start:'dot',SEQ,
 geom:(t,g)=>{g.cy=cy(t);g.s=1+0.035*M.eio(t/T);g.fy=g.cy*0.15;return g;},
 extra:(t,g)=>{
  const k=rise(t),out=tEnd==null?0:M.eo((t-tEnd)/0.18);
  logoEl.style.transform='translateY('+((1-k)*(lh+60*U)).toFixed(2)+'px)';
  const bl=Math.abs(1-k)*10+out*12;logoEl.style.filter=bl>0.05?'blur('+bl.toFixed(2)+'px)':'none';
  lwrap.style.opacity=(1-out).toFixed(4);
  const gk=M.clamp(M.S(t-tRise-0.1,6,1))*(1-out),gs=lw*1.9;
  Object.assign(glow.style,{left:(-gs/2)+'px',top:(top+lh/2-gs/2)+'px',width:gs+'px',height:gs+'px',opacity:gk.toFixed(4),
   background:'radial-gradient(circle,'+D.glow+' 0%,rgba(0,0,0,0) 62%)'});
  const rk=M.clamp((t-tRise-0.12)/0.9),rs=M.eo(rk)*R*2;
  if(rk<=0||rk>=1)ring.style.display='none';else Object.assign(ring.style,{display:'',left:(-rs/2)+'px',top:(lineY-rs/2)+'px',width:rs+'px',height:rs+'px',
   border:Math.max(1,3*U*(1-rk)).toFixed(2)+'px solid '+P.primary,opacity:(0.55*(1-rk)).toFixed(4)});
  words.forEach((e,i)=>{const v=M.vis(t,WT[i],tEnd==null?null:tEnd+0.01*i,{din:0,lin:0.24,blur:10});
   show(e,v,'translateY('+((1-M.S(t-WT[i],16,0.7))*22*U).toFixed(2)+'px)');});
  hudTick(t);
 }});
})();`;
  return fragment({ title: `${ctx.brandName} · ${scene.scene_id}`, css, data, js });
};
