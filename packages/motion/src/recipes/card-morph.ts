/**
 * motion-card-morph: upstream motion-broll "pill -> card -> control" pattern (MIT, Barty-Bart).
 * One shape never cuts: a dot springs into a headline pill, the pill morphs into a card whose
 * rows (up to 4) land on a stagger, then the card collapses into a control pill that the cursor
 * clicks; the control fills with the brand colour and its arrow turns into a check.
 *
 * Copy format: `Headline | row 1 | row 2 | …` (newlines also separate). Rows are capped at 4.
 * With `ctx.panel` set, the shape is centred in and sized to the panel safe area.
 */
import type { MotionRecipe } from './common.js';
import { baseData, commonCss, fragment, rgba, segments } from './common.js';

export const cardMorph: MotionRecipe = (scene, ctx) => {
  const segs = segments(scene.copy_text);
  const headline = segs[0] ?? ctx.brandName;
  const rows = segs.slice(1, 5);
  const p = ctx.palette;
  const data = { ...baseData(ctx), headline, rows, tile: rgba(p.primary, 0.14) };
  const css = `${commonCss(ctx)}
.row{position:absolute;display:flex;align-items:center;white-space:nowrap}
.pl{transform:translate(-50%,-50%);gap:18px;font-weight:600;letter-spacing:-.02em}
.ti{position:absolute;font-weight:650;letter-spacing:-.025em;white-space:nowrap}
.rw{position:absolute;display:flex;align-items:center;gap:22px;white-space:nowrap;font-weight:500}
.ib{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex:none}
.tile{position:absolute;width:76px;height:76px;border-radius:38px;display:flex;align-items:center;justify-content:center}
.tile>div{position:absolute;display:flex}`;
  const shape = `
<div class="L" id="Lpill"><div class="row pl" id="pl"><span id="icS"></span><span id="plT"></span></div></div>
<div class="L" id="Lcard"><div class="ti" id="cT"></div><div id="rows"></div></div>
<div class="L" id="Lctl"><div class="row pl" id="cl"><span id="clT"></span></div><div class="tile" id="tile"><div id="icA"></div><div id="icC"></div></div></div>`;
  const js = `
(function(){
const W=D.W,H=D.H,T=D.T,P=D.P;
backdrop();hudInit();
const pf='600 46px '+D.heading,tf='650 44px '+D.heading,rf='500 30px '+D.body;
const pillW=measure(D.headline,pf,'-0.02em')+46+18+104,pillH=116;
const rowsW=Math.max(0,...D.rows.map(r=>measure(r,rf)));
const cardW=Math.min(1240,Math.max(680,Math.max(measure(D.headline,tf,'-0.025em'),48+22+rowsW)+112));
const rowH=78,top0=52+56+26,cardH=D.rows.length?top0+D.rows.length*rowH+30:170;
const ctlW=measure(D.headline,pf,'-0.02em')+104+76+24,ctlH=124;
// Panels fill most of their safe area; full-frame clips keep the upstream breathing room.
const fit=(w,h,mx)=>Math.min(mx,D.FW*(D.panel?0.94:0.74)/w,D.FH*(D.panel?0.9:0.6)/h);
const cP=fit(pillW,pillH,1.9),cC=fit(cardW,cardH,1.4),cK=fit(ctlW,ctlH,1.7);
const tPill=0.14,tCard=Math.max(0.85,0.24*T);
const RT=D.rows.map((_,i)=>tCard+0.28+i*0.12);
const tCtl=Math.min(T-1.25,Math.max((RT.length?RT[RT.length-1]:tCard)+0.55,0.6*T));
const tClick=tCtl+0.42,tEnd=D.last?null:T-0.3;
const SH={dot:{w:26/cP,h:26/cP,r:13/cP,bg:P.primary,cam:cP},pill:{w:pillW,h:pillH,r:pillH/2,bg:P.primary,cam:cP},
 card:{w:cardW,h:cardH,r:36,bg:P.surface,cam:cC},ctl:{w:ctlW,h:ctlH,r:ctlH/2,bg:P.surface,cam:cK},
 done:{w:ctlW,h:ctlH,r:ctlH/2,bg:P.primary,cam:cK},end:{w:26/cK,h:26/cK,r:13/cK,bg:P.primary,cam:cK}};
const SEQ=[[tPill,'pill'],[tCard,'card'],[tCtl,'ctl'],[tClick+0.04,'done']];if(tEnd!=null)SEQ.push([tEnd,'end']);
// pill content
$('icS').innerHTML=M.icon('sparkle',42,P.onPrimary);
const plT=$('plT');plT.textContent=D.headline;plT.style.font=pf;plT.style.color=P.onPrimary;
// card content (anchored to the card's top edge)
const cT=$('cT');cT.textContent=D.headline;cT.style.cssText+=';font:'+tf+';color:'+P.surfaceInk+';left:'+(-cardW/2+56)+'px;top:50px';
const rowEls=D.rows.map((r,i)=>{const e=mk('div','rw',$('rows'));e.style.left=(-cardW/2+56)+'px';e.style.top=(top0+i*rowH)+'px';
 const ib=mk('div','ib',e);ib.style.background=D.tile;ib.innerHTML=M.icon('check',26,P.primary,2.6);
 const tx=mk('span','',e,r);tx.style.font=rf;tx.style.color=P.surfaceInk;return e;});
// control content
const clT=$('clT');clT.textContent=D.headline;clT.style.font=pf;
$('cl').style.left=(-ctlW/2+52+(ctlW-104-76-24)/2)+'px';
const tile=$('tile');tile.style.left=(ctlW/2-24-76)+'px';tile.style.top='-38px';
$('icA').innerHTML=M.icon('arrow',34,P.onPrimary,2.6);$('icC').innerHTML=M.icon('check',36,P.primary,3);
const txtC=M.ctrack(P.surfaceInk,[[tClick+0.04,P.onPrimary]]);
const tileC=M.ctrack(P.primary,[[tClick+0.04,P.surface]]);
const flip=M.track(0,[[tClick+0.02,1,[18,0.62]]]);
// Full frame: the cursor enters from off-screen right. Panel: it starts inside the safe area
// and drifts only a little after the click, so it never crosses into the speaker's side.
const ox=D.panel?(D.FW/2-56)/cK:(W/2)/cK+90,oy=D.panel?Math.min((D.FH/2-60)/cK,ctlH*1.4):(H/2)/cK*0.55,ax=ctlW/2-24-38+6,ay=10;
const dx=D.panel?20:120,dy=D.panel?24:90;
M.scene({W,H,T,center:D.center,geom:panelGeom,bg:D.bg,intro:D.first?0.02:null,SH,start:'dot',SEQ,
 layers:[{el:'Lpill',tin:tPill,tout:tCard},
  {el:'Lcard',tin:tCard,tout:tCtl,anchor:'t',update:(t)=>{rowEls.forEach((e,i)=>{const v=M.vis(t,RT[i],null,{din:0,lin:0.22});show(e,v,'translateX('+((1-v.a)*-22).toFixed(2)+'px)');});}},
  {el:'Lctl',tin:tCtl,tout:tEnd,update:(t)=>{const k=flip(t);clT.style.color=txtC(t);tile.style.background=tileC(t);
   const a=M.clamp(1-k*1.6),c=M.clamp(k);$('icA').style.opacity=a.toFixed(3);$('icA').style.transform='translateX('+(k*26).toFixed(2)+'px)';
   $('icC').style.opacity=c.toFixed(3);$('icC').style.transform='scale('+Math.max(0,0.4+0.6*k).toFixed(4)+')';}}],
 cursor:{size:44,clicks:[tClick],keys:[[0,ox,oy],[tCtl-0.05,ox,oy],[tClick-0.1,ax,ay],[tClick+0.08,ax,ay],[tClick+0.7,ax+dx,ay+dy],[T,ax+dx*1.15,ay+dy*1.1]]},
 shapePress:[tClick],
 extra:(t)=>hudTick(t)});
})();`;
  return fragment({ title: `${ctx.brandName} · ${scene.scene_id}`, css, shape, data, js });
};
