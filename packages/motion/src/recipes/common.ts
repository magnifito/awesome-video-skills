/**
 * Shared types and helpers for motion recipes.
 *
 * A recipe is `(scene, ctx) => fragment`: it returns a clip fragment in the upstream
 * motion-broll format (title, style, data-slot blocks, script) that `buildClipHtml` wraps
 * into a page. All user data (copy, claims, brand name, logo) reaches the page as one JSON
 * object (`const D = …`) serialised with `jsonForScript` and is written into the DOM with
 * `textContent`, so copy can never inject markup or script.
 */
import { safeCssColor, escapeXml } from '../../../media/src/proc.js';
import { jsonForScript, cssFontStack, sanitizeFontFamily, type EmbeddedFont } from '../engine.js';
import type { BrandProfile, ClaimItem, ScenePlanItem } from '../../../contracts/src/index.js';

export interface MotionPalette {
  bg: string;
  ink: string;
  primary: string;
  secondary: string;
  accent: string;
  /** Card colour and the text colour used on it. */
  surface: string;
  surfaceInk: string;
  /** Secondary text on the surface. */
  muted: string;
  /** Text colour on a primary-coloured shape. */
  onPrimary: string;
}

export interface MotionLogo {
  dataUri: string;
  /** height / width */
  aspect: number;
}

export interface RecipeContext {
  width: number;
  height: number;
  fps: number;
  /** Clip length in seconds (the scene duration). */
  duration: number;
  /** True renders bg:null (alpha) clips. */
  transparent: boolean;
  sceneIndex: number;
  sceneCount: number;
  /** Start of this scene on the full timeline (seconds), for the HUD timecode. */
  timelineOffset: number;
  brandName: string;
  palette: MotionPalette;
  fonts: { heading: string; body: string; mono: string; headingWeight: number };
  /** Claims referenced by the scene, in reference order. */
  claims: ClaimItem[];
  logo: MotionLogo | null;
  /**
   * Panel safe area in screen pixels. When set, the shape is centred in this rectangle and
   * sized to stay inside it (transparent B-roll next to the speaker). Null or absent uses
   * the whole frame.
   */
  panel?: { x: number; y: number; w: number; h: number } | null;
  /** Draws the corner HUD (brand, scene counter, timecode). Defaults to opaque clips only. */
  hud?: boolean;
}

export type MotionRecipe = (scene: ScenePlanItem, ctx: RecipeContext) => string;

/** Normalises #rgb / #rrggbb to lower-case #rrggbb (motion.js ctrack needs six digits). */
export function hex6(c: string): string {
  const v = safeCssColor(c);
  if (!/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`Motion recipes need #rgb or #rrggbb colours, got ${JSON.stringify(c)}`);
  return (v.length === 4 ? '#' + [...v.slice(1)].map(x => x + x).join('') : v).toLowerCase();
}

function rgb(c: string): [number, number, number] {
  const h = hex6(c);
  return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance. */
export function luminance(c: string): number {
  const [r, g, b] = rgb(c).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Mixes two colours: t=0 gives a, t=1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function rgba(c: string, a: number): string {
  const [r, g, b] = rgb(c);
  return `rgba(${r},${g},${b},${a})`;
}

/** Derives the recipe palette from brand colours. */
export function buildPalette(colors: BrandProfile['colors']): MotionPalette {
  const bg = hex6(colors.background);
  const ink = hex6(colors.text_primary);
  const primary = hex6(colors.primary);
  const secondary = hex6(colors.secondary ?? mix(colors.primary, '#000000', 0.45));
  const accent = hex6(colors.accent ?? colors.primary);
  const darkBg = luminance(bg) < 0.4;
  // Cards invert against the canvas: a light card on a dark brand, white on a light one.
  const surface = darkBg ? ink : '#ffffff';
  const surfaceInk = darkBg ? (luminance(bg) < 0.03 ? bg : mix(bg, '#000000', 0.5)) : ink;
  const muted = mix(surfaceInk, surface, 0.45);
  const light = luminance(bg) > luminance(ink) ? bg : ink;
  const dark = light === bg ? ink : bg;
  const onPrimary = contrast(primary, dark) >= contrast(primary, light) ? dark : light;
  return { bg, ink, primary, secondary, accent, surface, surfaceInk, muted, onPrimary };
}

/** Font stacks: brand heading font first, embedded Geist / Geist Mono as fallback. */
export function buildFonts(brand: Pick<BrandProfile, 'fonts'>, embedded: EmbeddedFont[]): RecipeContext['fonts'] {
  const head = brand.fonts[0];
  const body = brand.fonts[1] ?? brand.fonts[0];
  const headFamily = sanitizeFontFamily(head?.family);
  const embeddedHead = embedded.find(f => f.family === headFamily);
  // Geist is variable (100-900); a fixed-weight brand file can only render its own weight.
  let headingWeight = 800;
  if (embeddedHead && !embeddedHead.weight.includes(' ')) headingWeight = Number(embeddedHead.weight);
  else if (!embeddedHead && /^[1-9]00$/.test(head?.weight ?? '') && headFamily && headFamily !== 'Geist') headingWeight = Number(head.weight);
  return {
    heading: cssFontStack(head?.family),
    body: cssFontStack(body?.family),
    mono: "'Geist Mono',ui-monospace,monospace",
    headingWeight
  };
}

/** Splits scene copy into segments on newlines or `|`. */
export function segments(copy: string): string[] {
  return copy.split(/\s*(?:\n|\|)\s*/).map(s => s.trim()).filter(Boolean);
}

export interface ParsedValue {
  label: string;
  value: number;
  /** The value exactly as written in the source, e.g. "92%" or "4×". */
  text: string;
  /** Number of decimals and separator used in the source, for count-ups. */
  decimals: number;
  sep: '.' | ',';
  prefix: string;
  suffix: string;
}

/**
 * Pulls one labelled value out of a phrase: "Render time: 12 min", "92% on-brand",
 * "4× faster renders". Returns null when the phrase has no number.
 */
export function parseValue(phrase: string): ParsedValue | null {
  const m = /([$€£]?)(\d+(?:[.,]\d+)?)(\s?(?:%|×|x\b|[kKmM]\b|ms\b|s\b|min\b|h\b|fps\b|px\b))?/u.exec(phrase);
  if (!m) return null;
  const numStr = m[2];
  const sep: '.' | ',' = numStr.includes(',') ? ',' : '.';
  const value = Number(numStr.replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const decimals = /[.,](\d+)/.exec(numStr)?.[1].length ?? 0;
  const prefix = m[1] ?? '';
  const suffix = m[3] ?? '';
  const text = prefix + numStr + suffix;
  const label = (phrase.slice(0, m.index) + ' ' + phrase.slice(m.index + m[0].length))
    .replace(/\s+/g, ' ')
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
    .trim();
  return { label, value, text, decimals, sep, prefix, suffix };
}

/** Recipe data common to every clip, serialised into the page as part of `D`. */
export function baseData(ctx: RecipeContext): Record<string, unknown> {
  const area = ctx.panel ?? null;
  return {
    W: ctx.width,
    H: ctx.height,
    // Camera centre and the box the shape must fit in (the panel area, or the whole frame).
    center: area ? [area.x + area.w / 2, area.y + area.h / 2] : [ctx.width / 2, ctx.height / 2],
    FW: area ? area.w : ctx.width,
    FH: area ? area.h : ctx.height,
    panel: !!area,
    T: ctx.duration,
    fps: ctx.fps,
    bg: ctx.transparent ? null : ctx.palette.bg,
    P: ctx.palette,
    heading: ctx.fonts.heading,
    body: ctx.fonts.body,
    mono: ctx.fonts.mono,
    weight: ctx.fonts.headingWeight,
    first: ctx.sceneIndex === 0,
    last: ctx.sceneIndex === ctx.sceneCount - 1,
    idx: ctx.sceneIndex,
    count: ctx.sceneCount,
    offset: ctx.timelineOffset,
    brand: ctx.brandName,
    hud: ctx.hud ?? !ctx.transparent
  };
}

/** Clip CSS shared by all recipes (backdrop, HUD). Colours come from the validated palette. */
export function commonCss(ctx: RecipeContext): string {
  const p = ctx.palette;
  const u = Math.min(ctx.width, ctx.height) / 1080;
  const darkBg = luminance(p.bg) < 0.4;
  return `
.bd{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;
 background:radial-gradient(ellipse 75% 70% at 50% 46%,rgba(0,0,0,0) 40%,${darkBg ? 'rgba(0,0,0,.38)' : rgba(p.ink, 0.10)} 100%),
 radial-gradient(circle,${rgba(p.ink, darkBg ? 0.07 : 0.09)} ${(1.3 * u).toFixed(2)}px,rgba(0,0,0,0) ${(1.8 * u).toFixed(2)}px) 0 0/${Math.round(44 * u)}px ${Math.round(44 * u)}px}
.hud{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;color:${p.ink};opacity:.5;font-family:${ctx.fonts.mono};font-size:${Math.round(14 * u)}px;letter-spacing:.08em;z-index:5}
.hud .br{position:absolute;width:${Math.round(26 * u)}px;height:${Math.round(26 * u)}px;border:0 solid ${p.ink}}
.hud .tx{position:absolute;white-space:nowrap;text-transform:uppercase}
.hud .rec{display:inline-block;width:${Math.round(8 * u)}px;height:${Math.round(8 * u)}px;border-radius:50%;background:#ff3b30;margin-right:${Math.round(8 * u)}px;vertical-align:middle}
.w{position:absolute;white-space:nowrap;transform-origin:50% 60%}
`;
}

/**
 * JS helpers shared by all recipes. Plain ES2020; runs inside the page after fonts load.
 * Exposes: $, mk, measure, wrap, show, backdrop, hudInit, hudTick, panelGeom, edgeTrack.
 */
export const COMMON_JS = `
const $=id=>document.getElementById(id);
const stageEl=$('stage');
function mk(tag,cls,parent,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;if(parent)parent.appendChild(e);return e;}
const _m=mk('span','',document.body);_m.style.cssText='position:absolute;left:-99999px;top:0;white-space:pre;visibility:hidden';
function measure(text,font,ls){_m.style.font=font;_m.style.letterSpacing=ls||'normal';_m.textContent=text;return _m.getBoundingClientRect().width;}
function wrap(words,font,maxW,space,ls){const lines=[];let cur=null;for(const w of words){const ww=measure(w,font,ls);if(cur&&cur.w+space+ww<=maxW){cur.words.push({text:w,w:ww});cur.w+=space+ww;}else{cur={words:[{text:w,w:ww}],w:ww};lines.push(cur);}}return lines;}
function show(el,v,tx){if(v.o<0.002){el.style.display='none';return false;}el.style.display='';el.style.opacity=v.o.toFixed(4);el.style.filter=v.blur>0.05?'blur('+v.blur.toFixed(2)+'px)':'none';el.style.transform=tx||'';return true;}
function backdrop(){if(!D.bg)return;const b=mk('div','bd');stageEl.insertBefore(b,stageEl.firstChild);}
let _hudTc=null;
function hudInit(){if(!D.hud)return;const U=Math.min(D.W,D.H)/1080,m=Math.round(34*U),h=mk('div','hud',stageEl);
 [['left','top'],['right','top'],['left','bottom'],['right','bottom']].forEach(([x,y])=>{const b=mk('div','br',h);b.style[x]=m+'px';b.style[y]=m+'px';b.style['border-'+x+'-width']=Math.max(1,Math.round(2*U))+'px';b.style['border-'+y+'-width']=Math.max(1,Math.round(2*U))+'px';});
 const pad=Math.round(m+40*U);
 const tl=mk('div','tx',h,D.brand);tl.style.left=pad+'px';tl.style.top=(m+Math.round(6*U))+'px';
 const tr=mk('div','tx',h,String(D.idx+1).padStart(2,'0')+' / '+String(D.count).padStart(2,'0'));tr.style.right=pad+'px';tr.style.top=(m+Math.round(6*U))+'px';
 const br=mk('div','tx',h);br.style.right=pad+'px';br.style.bottom=(m+Math.round(4*U))+'px';mk('span','rec',br);_hudTc=mk('span','',br);}
function hudTick(t){if(!_hudTc)return;const g=D.offset+t,s=Math.floor(g+1e-6),f=Math.floor((g-s)*D.fps+1e-6);M.setText(_hudTc,String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')+':'+String(f).padStart(2,'0'));}
// Panels: the width spring outruns the camera zoom during a morph, so the shape would briefly
// grow past its safe area. Clamp the camera each frame so the shape never exceeds the area.
const panelGeom=D.panel?(t,g)=>{const k=Math.min(1,D.FW*0.98/Math.max(1e-6,g.w*g.s),D.FH*0.98/Math.max(1e-6,g.h*g.s));g.s*=k;return g;}:undefined;
// Liquid edge tracks: the edge moving in the direction of travel leads (FAST), the other trails (SLOW).
function edgeTrack(boxes,lead,trail){const LD=lead||M.FAST,TR=trail||M.SLOW;const keys={L:[],R:[],T:[],B:[]};for(let i=1;i<boxes.length;i++){const a=boxes[i-1],b=boxes[i],sp=b.sp;
 const right=(b.L+b.R)>=(a.L+a.R),down=(b.T+b.B)>=(a.T+a.B);
 keys.L.push([b.t,b.L,sp||(right?TR:LD)]);keys.R.push([b.t,b.R,sp||(right?LD:TR)]);
 keys.T.push([b.t,b.T,sp||(down?TR:LD)]);keys.B.push([b.t,b.B,sp||(down?LD:TR)]);}
 const b0=boxes[0];return {L:M.track(b0.L,keys.L),R:M.track(b0.R,keys.R),T:M.track(b0.T,keys.T),B:M.track(b0.B,keys.B)};}
`;

/** Assembles a fragment in the upstream format. `title` is escaped; `data` is JSON-encoded. */
export function fragment(parts: {
  title: string;
  css: string;
  world?: string;
  shape?: string;
  over?: string;
  data: Record<string, unknown>;
  js: string;
}): string {
  return [
    `<title>${escapeXml(parts.title)}</title>`,
    `<style>${parts.css}</style>`,
    `<div data-slot="world">${parts.world ?? ''}</div><!--/world-->`,
    `<div data-slot="shape">${parts.shape ?? ''}</div><!--/shape-->`,
    `<div data-slot="over">${parts.over ?? ''}</div><!--/over-->`,
    `<script>const D=${jsonForScript(parts.data)};\n${COMMON_JS}\n${parts.js}</script>`
  ].join('\n');
}
