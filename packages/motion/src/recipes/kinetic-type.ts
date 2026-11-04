/**
 * motion-kinetic-type: the scene copy builds word by word in the brand heading font while one
 * liquid highlight shape (the clip's carrier shape) springs from word to word and reveals each
 * word in inverted colour through a mask. Based on the kinetic-type rules of upstream
 * `explainer-high-energy` (MIT, Barty-Bart): words land on a grid with slight overshoot, a
 * spark opens the clip and the shape collapses back to a dot for the hand-off.
 */
import type { MotionRecipe } from './common.js';
import { baseData, commonCss, fragment } from './common.js';

export const kineticType: MotionRecipe = (scene, ctx) => {
  const words = scene.copy_text.replace(/[|\n]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 24);
  const data = { ...baseData(ctx), words };
  const css = `${commonCss(ctx)}
#base,#mask{position:absolute;left:0;top:0;width:0;height:0}
#mask{z-index:1}`;
  const js = `
(function(){
const W=D.W,H=D.H,T=D.T,P=D.P;
backdrop();hudInit();
const words=D.words.length?D.words:[D.brand];
const maxW=W*(W>H?0.78:0.84),maxLines=W>H?3:5;
let F=Math.round(Math.min(W,H)*(W>H?0.15:0.13)),lines,font;
for(;;){font=D.weight+' '+F+'px '+D.heading;lines=wrap(words,font,maxW,F*0.26,'-0.035em');
 const widest=Math.max(...lines.map(l=>l.w));if((lines.length<=maxLines&&widest<=maxW)||F<=36)break;F=Math.round(F*0.93);}
const space=F*0.26,lineH=F*1.12,boxH=F*1.3,padX=F*0.13;
const base=mk('div','',null);base.id='base';
const mask=mk('div','',null);mask.id='mask';
$('world').insertBefore(base,$('shape'));$('shape').appendChild(mask);
const items=[];const y0=-lines.length*lineH/2;
lines.forEach((ln,li)=>{let x=-ln.w/2;const yc=y0+lineH*(li+0.5);
 ln.words.forEach(wd=>{const mkw=(parent,color)=>{const e=mk('div','w',parent,wd.text);e.style.cssText+=';left:'+x.toFixed(2)+'px;top:'+(yc-boxH/2).toFixed(2)+'px;font:'+font+';line-height:'+boxH.toFixed(2)+'px;letter-spacing:-0.035em;color:'+color;return e;};
  items.push({a:mkw(base,P.ink),b:mkw(mask,P.onPrimary),L:x-padX,R:x+wd.w+padX,T:yc-F*0.62,B:yc+F*0.5});x+=wd.w+space;});});
const n=items.length,t0=0.42,tOut=D.last?null:T-0.34;
const step=n>1?Math.max(0.1,Math.min(0.42,(T-1.25-t0)/(n-1))):0;
items.forEach((it,i)=>{it.t=t0+i*step;it.tout=tOut==null?null:tOut+0.012*i;});
const d=26,dot={L:-d/2,R:d/2,T:-d/2,B:d/2};
const boxes=[{t:0,...dot},{t:0.16,L:-maxW*0.2,R:maxW*0.2,T:-3,B:3,sp:[16,0.8]}];
items.forEach(it=>boxes.push({t:it.t,L:it.L,R:it.R,T:it.T,B:it.B}));
if(tOut!=null)boxes.push({t:tOut,...dot,sp:M.MORPH});
const E=edgeTrack(boxes,[30,0.84],[19,0.9]);
const camS=t=>1+0.05*M.eio(t/T);
M.scene({W,H,T,bg:D.bg,intro:D.first?0.02:null,
 SH:{k:{w:d,h:d,r:d/2,bg:P.primary,cam:1}},start:'k',SEQ:[],
 geom:(t,g)=>{const L=E.L(t),R=E.R(t),Tp=E.T(t),B=E.B(t);g.w=Math.max(0,R-L);g.h=Math.max(0,B-Tp);g.cx=(L+R)/2;g.cy=(Tp+B)/2;g.r=F*0.14;
  g.s=camS(t);g.fx=g.cx*0.06;g.fy=g.cy*0.06;return g;},
 extra:(t,g)=>{
  mask.style.left=(-(g.cx-g.w/2)).toFixed(3)+'px';mask.style.top=(-(g.cy-g.h/2)).toFixed(3)+'px';
  for(const it of items){const v=M.vis(t,it.t,it.tout,{din:0,lin:0.2,blur:16});
   const y=(1-M.S(t-it.t,20,0.6))*F*0.42,tx='translateY('+y.toFixed(2)+'px) scale('+v.s.toFixed(4)+')';
   show(it.a,v,tx);show(it.b,v,tx);}
  hudTick(t);
 }});
})();`;
  return fragment({ title: `${ctx.brandName} · ${scene.scene_id}`, css, data, js });
};
