/**
 * motion-bars-chart: upstream motion-broll "rows or bars appearing on words" pattern (MIT,
 * Barty-Bart). A dot springs into a title pill, the pill opens into a chart card and up to six
 * labelled bars grow on a stagger while their values count up; the largest value takes the
 * brand colour. Values settle on the exact source text, so approved claim wording is shown
 * verbatim at rest.
 *
 * Values come from the scene's referenced claims first (approved wording such as
 * "Render time: 12 min"), then from copy segments that contain a number. The first copy
 * segment without a number is the title.
 */
import type { MotionRecipe } from './common.js';
import { baseData, commonCss, fragment, parseValue, rgba, segments, type ParsedValue } from './common.js';

export const barsChart: MotionRecipe = (scene, ctx) => {
  const segs = segments(scene.copy_text);
  const items: ParsedValue[] = [];
  const seen = new Set<string>();
  for (const phrase of [...ctx.claims.map(c => c.approved_wording), ...segs]) {
    if (items.length >= 6 || seen.has(phrase)) continue;
    const v = parseValue(phrase);
    if (!v) continue;
    seen.add(phrase);
    // A claim that is also a copy segment is listed once.
    for (const s of segs) if (s.includes(phrase) || phrase.includes(s)) seen.add(s);
    items.push(v);
  }
  if (items.length === 0) {
    throw new Error(`motion-bars-chart: scene ${scene.scene_id} has no numeric values in its claims or copy (e.g. "Render time: 12 min").`);
  }
  const title = segs.find(s => !parseValue(s)) ?? ctx.brandName;
  const p = ctx.palette;
  const data = { ...baseData(ctx), title, items, trackBg: rgba(p.surfaceInk, 0.07) };
  const css = `${commonCss(ctx)}
.pl{position:absolute;display:flex;align-items:center;gap:18px;white-space:nowrap;transform:translate(-50%,-50%);font-weight:600;letter-spacing:-.02em}
.ti{position:absolute;font-weight:650;letter-spacing:-.025em;white-space:nowrap}
.lb,.vl{position:absolute;white-space:nowrap}
.tr,.fl{position:absolute;border-radius:12px}
.vl{font-feature-settings:"tnum" 1}`;
  const shape = `
<div class="L" id="Lpill"><div class="pl"><span id="icS"></span><span id="plT"></span></div></div>
<div class="L" id="Lchart"><div class="ti" id="cT"></div><div id="bars"></div></div>`;
  const js = `
(function(){
const W=D.W,H=D.H,T=D.T,P=D.P,N=D.items.length;
backdrop();hudInit();
const pf='600 46px '+D.heading,tf='650 46px '+D.heading,lf='500 29px '+D.body,vf='650 30px '+D.heading;
const pillW=measure(D.title,pf,'-0.02em')+46+18+104,pillH=116;
const labW=Math.min(420,Math.max(120,...D.items.map(it=>measure(it.label,lf))));
const valW=Math.max(...D.items.map(it=>measure(it.text,vf)))+8;
const trackW=D.FW>D.FH?600:420,gap=28;
const cardW=Math.max(measure(D.title,tf,'-0.025em')+112,56+labW+gap+trackW+gap+valW+56);
const rowH=66,top0=52+58+30,cardH=top0+N*rowH+34;
const fit=(w,h,mx)=>Math.min(mx,D.FW*(D.panel?0.94:0.8)/w,D.FH*(D.panel?0.9:0.66)/h);
const cP=fit(pillW,pillH,1.9),cC=fit(cardW,cardH,1.45);
const tPill=0.14,tCard=Math.max(0.8,0.22*T),tEnd=D.last?null:T-0.34;
// Stagger shrinks with the clip length but never below 0.05 s, so short clips stay in order.
const BT=D.items.map((_,i)=>tCard+0.36+i*Math.max(0.05,Math.min(0.16,(T-tCard-1.6)/Math.max(1,N))));
const SH={dot:{w:26/cP,h:26/cP,r:13/cP,bg:P.primary,cam:cP},pill:{w:pillW,h:pillH,r:pillH/2,bg:P.primary,cam:cP},
 card:{w:cardW,h:cardH,r:36,bg:P.surface,cam:cC},end:{w:26/cC,h:26/cC,r:13/cC,bg:P.primary,cam:cC}};
const SEQ=[[tPill,'pill'],[tCard,'card']];if(tEnd!=null)SEQ.push([tEnd,'end']);
$('icS').innerHTML=M.icon('sparkle',42,P.onPrimary);
const plT=$('plT');plT.textContent=D.title;plT.style.font=pf;plT.style.color=P.onPrimary;
const cT=$('cT');cT.textContent=D.title;cT.style.cssText+=';font:'+tf+';color:'+P.surfaceInk+';left:'+(-cardW/2+56)+'px;top:50px';
const max=Math.max(...D.items.map(it=>Math.abs(it.value)))||1;
const x0=-cardW/2+56,xT=x0+labW+gap,xV=xT+trackW+gap;
const rows=D.items.map((it,i)=>{const y=top0+i*rowH,g=mk('div','',$('bars'));g.style.position='absolute';
 const lb=mk('div','lb',g,it.label);lb.style.cssText+=';font:'+lf+';color:'+P.muted+';left:'+x0+'px;top:'+(y+6)+'px;max-width:'+labW+'px;overflow:hidden;text-overflow:ellipsis';
 const tr=mk('div','tr',g);tr.style.cssText+=';left:'+xT+'px;top:'+(y+12)+'px;width:'+trackW+'px;height:24px;background:'+D.trackBg;
 const fl=mk('div','fl',g);const top=Math.abs(it.value)===max;fl.style.cssText+=';left:'+xT+'px;top:'+(y+12)+'px;height:24px;background:'+(top?P.primary:P.surfaceInk);
 const vl=mk('div','vl',g,it.text);vl.style.cssText+=';font:'+vf+';color:'+P.surfaceInk+';left:'+xV+'px;top:'+(y+4)+'px';
 return {g,fl,vl,it,grow:M.track(0,[[BT[i],1,[10,0.78]]]),cnt:M.track(0,[[BT[i],1,[9,1]]])};});
const fmt=(it,k)=>{if(k>0.999)return it.text;let s=(it.value*k).toFixed(it.decimals);if(it.sep===',')s=s.replace('.',',');return it.prefix+s+it.suffix;};
M.scene({W,H,T,center:D.center,geom:panelGeom,bg:D.bg,intro:D.first?0.02:null,SH,start:'dot',SEQ,
 layers:[{el:'Lpill',tin:tPill,tout:tCard},
  {el:'Lchart',tin:tCard,tout:tEnd,anchor:'t',update:(t)=>{rows.forEach((r,i)=>{const v=M.vis(t,BT[i]-0.08,null,{din:0,lin:0.2});
   if(!show(r.g,v,'translateY('+((1-v.a)*14).toFixed(2)+'px)'))return;
   const k=Math.max(0,r.grow(t));r.fl.style.width=(Math.max(24,trackW*k*Math.abs(r.it.value)/max)).toFixed(2)+'px';
   r.fl.style.opacity=M.clamp(k*3).toFixed(3);M.setText(r.vl,fmt(r.it,M.clamp(r.cnt(t))));});}}],
 extra:(t)=>hudTick(t)});
})();`;
  return fragment({ title: `${ctx.brandName} · ${scene.scene_id}`, css, shape, data, js });
};
