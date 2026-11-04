/**
 * Frame-by-frame animation for HyperFrames scene cards.
 *
 * A recipe draws one SVG card at rest. This module splits that card into its top-level
 * elements and, for any time inside the scene, writes the card with each element at its
 * animated state:
 *   - entrance: elements fade in and rise into place one after another (staggered), with an
 *     optional overshoot; the background (defs and full-frame fills) never moves
 *   - camera drift: recipes with a camera move scale the content slowly about the frame centre
 *   - exit: before a cut to the next scene, the content fades out together
 *
 * Timing comes from the brand `motion_preferences.tempo`, recipe motion values and the scene
 * length. `camera_style: "static"` turns the drift off. States are rounded so that identical
 * frames (the hold) share one rendered image.
 */
import type { ProjectContext } from '../interface.js';

type Scene = ProjectContext['scenePlan']['scenes'][0];
type Brand = ProjectContext['brand'];

export interface SvgParts {
  /** Root `<svg ...>` opening tag. */
  open: string;
  /** Top-level children in document order. */
  elements: { markup: string; static: boolean }[];
}

export interface MotionProfile {
  /** Seconds one element takes to enter. */
  enter: number;
  /** Seconds between the starts of consecutive elements. */
  stagger: number;
  /** Rise distance as a fraction of the frame height. */
  rise: number;
  /** Overshoot factor for the rise (1 = none). */
  overshoot: number;
  /** Content scale at the start and end of the scene (camera drift). */
  driftFrom: number;
  driftTo: number;
  /** Seconds of fade-out before the cut; 0 for the last scene. */
  exit: number;
}

const TEMPO: Record<Brand['motion_preferences']['tempo'], { enter: number; stagger: number; rise: number; overshoot: number }> = {
  energetic: { enter: 0.45, stagger: 0.07, rise: 0.04, overshoot: 1 },
  punchy: { enter: 0.38, stagger: 0.05, rise: 0.05, overshoot: 1.05 },
  smooth: { enter: 0.6, stagger: 0.09, rise: 0.03, overshoot: 1 },
  calm: { enter: 0.8, stagger: 0.12, rise: 0.02, overshoot: 1 },
};

/** Recipe motion values that change the entrance or add a camera move. */
const RECIPE_MOTION: Record<string, Partial<Pick<MotionProfile, 'enter' | 'stagger' | 'overshoot' | 'driftFrom' | 'driftTo'>>> = {
  'kinetic-typography': { stagger: 0.06, overshoot: 1.05 },
  'cinematic-title': { driftFrom: 0.97, driftTo: 1.03, enter: 0.9 },
  'product-reveal': { driftFrom: 1, driftTo: 1.03 },
  'interview-speaker-card': { enter: 0.3, driftFrom: 1, driftTo: 1.04 },
  'isometric-feature-grid': { stagger: 0.15 },
  'retail-card': { stagger: 0.15 },
  'newsletter-promo': { enter: 0.45 },
  'broll-lower-third': { enter: 0.3, stagger: 0.05 },
  'broll-stat-callout': { overshoot: 1.08 },
};

const CONTAINER_TAGS = new Set(['defs', 'style', 'linearGradient', 'radialGradient', 'filter', 'clipPath', 'mask', 'pattern', 'symbol', 'metadata', 'title', 'desc']);

/** Splits an SVG document into its root tag and top-level elements. */
export function splitSvg(svg: string, width: number, height: number): SvgParts {
  const openMatch = /<svg\b[^>]*>/.exec(svg);
  const close = svg.lastIndexOf('</svg>');
  if (!openMatch || close < 0) throw new Error('HyperFrames: scene SVG has no root <svg> element');
  const bodyStart = openMatch.index + openMatch[0].length;
  const body = svg.slice(bodyStart, close);

  const elements: SvgParts['elements'] = [];
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let depth = 0;
  let start = -1;
  let rootTag = '';
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body))) {
    if (m[0].startsWith('<!--')) continue;
    const [, closing, name, attrs, selfClosing] = m;
    if (closing) {
      depth--;
      if (depth === 0 && start >= 0) {
        elements.push(classify(body.slice(start, m.index + m[0].length), rootTag, '', width, height, elements));
        start = -1;
      }
      continue;
    }
    if (depth === 0) {
      start = m.index;
      rootTag = name;
      if (selfClosing) {
        elements.push(classify(m[0], name, attrs, width, height, elements));
        start = -1;
        continue;
      }
    }
    if (!selfClosing) depth++;
  }
  if (depth !== 0) throw new Error('HyperFrames: scene SVG is not well formed');
  return { open: openMatch[0], elements };
}

function classify(markup: string, tag: string, attrs: string, width: number, height: number, before: SvgParts['elements']): SvgParts['elements'][0] {
  if (CONTAINER_TAGS.has(tag)) return { markup, static: true };
  // Full-frame fills at the start of the card are the background; they stay put.
  const allStaticSoFar = before.every(e => e.static);
  if (allStaticSoFar && (tag === 'rect' || tag === 'image')) {
    const a = attrs || /^<[^>]*>/.exec(markup)?.[0] || '';
    const w = /\bwidth="([^"]+)"/.exec(a)?.[1];
    const h = /\bheight="([^"]+)"/.exec(a)?.[1];
    const full = (v: string | undefined, size: number) => v === '100%' || (v !== undefined && Number.parseFloat(v) >= size);
    if (full(w, width) && full(h, height)) return { markup, static: true };
  }
  return { markup, static: false };
}

export function motionProfile(scene: Scene, brand: Brand, isLast: boolean): MotionProfile {
  const base = TEMPO[brand.motion_preferences?.tempo ?? 'smooth'] ?? TEMPO.smooth;
  const recipe = RECIPE_MOTION[scene.visual_recipe] ?? {};
  const drift = brand.motion_preferences?.camera_style !== 'static';
  const d = scene.duration_seconds;
  return {
    enter: Math.min(recipe.enter ?? base.enter, d * 0.3),
    stagger: recipe.stagger ?? base.stagger,
    rise: base.rise,
    overshoot: recipe.overshoot ?? base.overshoot,
    driftFrom: drift ? recipe.driftFrom ?? 1 : 1,
    driftTo: drift ? recipe.driftTo ?? 1 : 1,
    exit: isLast ? 0 : Math.min(0.25, d * 0.1),
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
/** Ease-out with overshoot; `amount` 1 means no overshoot. */
function easeOutBack(p: number, amount: number): number {
  if (amount <= 1) return easeOutCubic(p);
  const c = (amount - 1) * 30;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
}
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

export interface FrameState {
  /** Per animated element: [opacity, rise in px]. */
  elements: [number, number][];
  scale: number;
  fade: number;
}

/** Animated state at local scene time `t` (seconds). */
export function frameState(parts: SvgParts, profile: MotionProfile, t: number, duration: number, height: number): FrameState {
  const animated = parts.elements.filter(e => !e.static).length;
  // The whole entrance must finish within 45% of the scene, so long cards compress the stagger.
  const budget = Math.max(0, duration * 0.45 - profile.enter);
  const stagger = animated > 1 ? Math.min(profile.stagger, budget / (animated - 1)) : 0;
  const rise = profile.rise * height;
  const elements: [number, number][] = [];
  for (let i = 0; i < animated; i++) {
    const p = profile.enter > 0 ? clamp01((t - i * stagger) / profile.enter) : 1;
    const opacity = round(easeOutCubic(clamp01(p * 1.6)), 3);
    const dy = round((1 - easeOutBack(p, profile.overshoot)) * rise, 1);
    elements.push([opacity, dy]);
  }
  const progress = duration > 0 ? clamp01(t / duration) : 1;
  const scale = round(profile.driftFrom + (profile.driftTo - profile.driftFrom) * progress, 4);
  const fade = profile.exit > 0 ? round(clamp01((duration - t) / profile.exit), 3) : 1;
  return { elements, scale, fade };
}

/** Writes the SVG for one frame state. */
export function composeFrame(parts: SvgParts, state: FrameState, width: number, height: number): string {
  const out: string[] = [parts.open];
  const content: string[] = [];
  let i = 0;
  for (const el of parts.elements) {
    if (el.static) {
      // Static elements keep their place in the stacking order only before any content.
      if (content.length === 0) out.push(el.markup);
      else content.push(el.markup);
      continue;
    }
    const [opacity, dy] = state.elements[i++];
    if (opacity <= 0) continue;
    const attrs = [opacity < 1 ? `opacity="${opacity}"` : '', dy !== 0 ? `transform="translate(0 ${dy})"` : ''].filter(Boolean).join(' ');
    content.push(attrs ? `<g ${attrs}>${el.markup}</g>` : el.markup);
  }
  const cx = width / 2;
  const cy = height / 2;
  const groupAttrs = [
    state.fade < 1 ? `opacity="${state.fade}"` : '',
    state.scale !== 1 ? `transform="translate(${cx} ${cy}) scale(${state.scale}) translate(${-cx} ${-cy})"` : '',
  ].filter(Boolean).join(' ');
  if (state.fade > 0 && content.length) out.push(groupAttrs ? `<g ${groupAttrs}>${content.join('\n')}</g>` : content.join('\n'));
  out.push('</svg>');
  return out.join('\n');
}
