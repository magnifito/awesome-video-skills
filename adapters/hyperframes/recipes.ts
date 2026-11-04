/**
 * Static-card layouts for six more HyperFrames visual recipes in styles/recipes/ (style-recipes.ts
 * holds cinematic-title, kinetic-typography, product-reveal, saas-interface-tour, retail-card
 * and newsletter-promo): milestone-reveal, model-comparison, isometric-feature-grid,
 * interview-speaker-card, broll-lower-third and broll-stat-callout.
 *
 * Each recipe reads structured copy from `copy_text`: fields separated by " | " (the
 * `copy_format` of the recipe JSON documents the fields). When the copy does not have the
 * fields a layout needs, the function returns null and the adapter falls back to its generic
 * card. Colours and type come from the brand profile only; the layout constants mirror the
 * `layout` block of each recipe JSON. Like every HyperFrames scene, the result is one still
 * SVG held for the scene duration: the recipe `motion` parameters are not animated.
 */
import { safeCssColor } from '../../packages/media/src/proc.js';
import type { ProjectContext } from '../interface.js';
import type { SceneImage } from './style-recipes.js';

export { loadSceneImages, type SceneImage } from './style-recipes.js';

type Scene = ProjectContext['scenePlan']['scenes'][0];
type Brand = ProjectContext['brand'];
type RecipeLogo = SceneImage;

export const GALLERY_RECIPES = [
  'milestone-reveal',
  'model-comparison',
  'isometric-feature-grid',
  'interview-speaker-card',
  'broll-lower-third',
  'broll-stat-callout',
] as const;

/**
 * Returns the recipe SVG, or null when the recipe is not one of these or the copy lacks its
 * fields. The first scene image, if any, is drawn as the logo.
 */
export function renderRecipeSvg(
  scene: Scene,
  brand: Brand,
  width: number,
  height: number,
  transparent: boolean,
  images: SceneImage[],
): string | null {
  const logo = images[0] ?? null;
  const k = kit(brand, width, height, transparent);
  const fields = scene.copy_text.split('|').map(s => s.trim()).filter(Boolean);
  let body: string | null;
  switch (scene.visual_recipe) {
    case 'milestone-reveal': body = milestone(k, fields, logo); break;
    case 'model-comparison': body = comparison(k, fields, logo); break;
    case 'isometric-feature-grid': body = isoGrid(k, fields, logo); break;
    case 'interview-speaker-card': body = speakerCard(k, fields, logo); break;
    case 'broll-lower-third': body = lowerThird(k, fields); break;
    case 'broll-stat-callout': body = statCallout(k, fields); break;
    default: return null;
  }
  if (body === null) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${body}
</svg>`;
}

interface Kit {
  W: number; H: number; s: number; transparent: boolean;
  bg: string; bg2: string; ink: string; primary: string; accent: string;
  font: string; h1: number; h2: number; body: number; caption: number; radius: number;
  text(x: number, y: number, str: string, size: number, fill: string, opts?: { weight?: number; anchor?: string; opacity?: number; spacing?: number }): string;
  backdrop(): string;
}

function kit(brand: Brand, W: number, H: number, transparent: boolean): Kit {
  const s = Math.min(W, H) / 1080;
  const bg = safeCssColor(brand.colors.background);
  const primary = safeCssColor(brand.colors.primary);
  const font = escapeXml(cssFamily(brand.fonts[0]?.family));
  return {
    W, H, s, transparent, bg, primary,
    bg2: safeCssColor(brand.colors.secondary ?? brand.colors.background),
    ink: safeCssColor(brand.colors.text_primary),
    accent: safeCssColor(brand.colors.accent ?? brand.colors.primary),
    font,
    h1: brand.type_scale.h1 * s,
    h2: brand.type_scale.h2 * s,
    body: brand.type_scale.body * s,
    caption: (brand.type_scale.caption ?? 18) * s,
    radius: brand.motion_preferences.border_radius * s,
    text(x, y, str, size, fill, o = {}) {
      return `<text x="${r(x)}" y="${r(y)}" font-family="${font}" font-size="${r(size)}" font-weight="${o.weight ?? 600}" fill="${fill}" text-anchor="${o.anchor ?? 'start'}"${o.opacity !== undefined ? ` fill-opacity="${o.opacity}"` : ''}${o.spacing ? ` letter-spacing="${r(o.spacing)}"` : ''}>${escapeXml(str)}</text>`;
    },
    backdrop() {
      if (transparent) return '';
      return `<defs><linearGradient id="rcpBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${this.bg2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#rcpBg)"/>`;
    },
  };
}

/** Splits "150+ websites launched" into the first token that holds a digit and the rest. */
function splitMetric(field: string): { metric: string; label: string } | null {
  const words = field.split(/\s+/);
  const i = words.findIndex(w => /\d/.test(w));
  if (i < 0) return null;
  return { metric: words[i], label: [...words.slice(0, i), ...words.slice(i + 1)].join(' ') };
}

function logoImage(logo: RecipeLogo | null, x: number, y: number, h: number, anchor: 'start' | 'middle' = 'start'): string {
  if (!logo) return '';
  const w = h / logo.aspect;
  const lx = anchor === 'middle' ? x - w / 2 : x;
  return `<image x="${r(lx)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" preserveAspectRatio="xMidYMid meet" href="${logo.dataUri}"/>`;
}

/** milestone-reveal: one large metric with its label below (layout.label_placement), a radial glow and a particle ring. */
function milestone(k: Kit, f: string[], logo: RecipeLogo | null): string | null {
  const m = f[0] ? splitMetric(f[0]) : null;
  if (!m) return null;
  const { W, H, s } = k;
  const cx = W / 2;
  const cy = H * 0.45;
  // layout.metric_size_px (96) is the floor; a hero metric on a full frame needs about 2.6x h1.
  const metricSize = Math.max(96 * s, k.h1 * 2.6);
  const glowR = metricSize * 2.1;
  // Particle ring (motion.particle_burst_at_percent): drawn at its settled position.
  const dots: string[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.2;
    const rr = glowR * (0.82 + (i % 3) * 0.07);
    const size = (i % 4 === 0 ? 7 : 4.5) * s;
    dots.push(`<circle cx="${r(cx + Math.cos(a) * rr * 1.25)}" cy="${r(cy - metricSize * 0.3 + Math.sin(a) * rr * 0.7)}" r="${r(size)}" fill="${i % 6 === 0 ? k.accent : k.primary}" fill-opacity="${i % 6 === 0 ? 0.9 : 0.35}"/>`);
  }
  const labelLines = wrap(m.label, Math.floor((W * 0.7) / (k.h2 * 0.55)));
  const labelTop = cy + metricSize * 0.42;
  return `${k.backdrop()}
<defs><radialGradient id="rcpGlow" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="${k.primary}" stop-opacity="0.30"/>
  <stop offset="0.55" stop-color="${k.primary}" stop-opacity="0.10"/>
  <stop offset="1" stop-color="${k.primary}" stop-opacity="0"/>
</radialGradient></defs>
<ellipse cx="${r(cx)}" cy="${r(cy - metricSize * 0.3)}" rx="${r(glowR * 1.35)}" ry="${r(glowR * 0.85)}" fill="url(#rcpGlow)"/>
${dots.join('\n')}
${k.text(cx, cy, m.metric, metricSize, k.ink, { weight: 800, anchor: 'middle', spacing: -metricSize * 0.03 })}
<rect x="${r(cx - 60 * s)}" y="${r(labelTop - 6 * s)}" width="${r(120 * s)}" height="${r(8 * s)}" rx="${r(4 * s)}" fill="${k.accent}"/>
${labelLines.map((l, i) => k.text(cx, labelTop + k.h2 * (1.25 + i * 1.2), l, k.h2, k.primary, { anchor: 'middle' })).join('\n')}
${f[1] ? k.text(cx, H - 70 * s, f[1], k.caption, k.ink, { anchor: 'middle', weight: 500, opacity: 0.6 }) : ''}
${logoImage(logo, 80 * s, 64 * s, 56 * s)}`;
}

/**
 * model-comparison: "title | left heading | a; b; c | right heading | a; b; c [| footnote]".
 * 50/50 columns, a VS badge on the centre divider, the right column highlighted as the winner.
 */
function comparison(k: Kit, f: string[], logo: RecipeLogo | null): string | null {
  if (f.length < 5) return null;
  const [title, leftHead, leftItems, rightHead, rightItems, foot] = f;
  const { W, H, s } = k;
  const margin = 120 * s;
  const gap = 90 * s;
  const colW = (W - margin * 2 - gap) / 2;
  const itemSize = k.body * 1.15;
  const maxChars = Math.floor((colW - 150 * s) / (itemSize * 0.53));
  // Columns are as tall as the longer list needs, never taller than the frame allows.
  const listH = (items: string) => items.split(';').map(t => t.trim()).filter(Boolean)
    .reduce((acc, item) => acc + wrap(item, maxChars).length * itemSize * 1.2 + itemSize * 0.95, 0);
  const colH = Math.min(H - 400 * s, 190 * s + Math.max(listH(leftItems), listH(rightItems)) + 40 * s);
  // Title (90 px above the columns) and columns sit centred between the frame top and the footnote.
  const top = Math.max(250 * s, (H - 150 * s - colH + 90 * s) / 2 + 20 * s);
  const column = (x: number, head: string, items: string, win: boolean): string => {
    const fill = win ? k.primary : k.bg2;
    const headFill = win ? k.bg : k.ink;
    const itemFill = win ? k.bg : k.ink;
    const list = items.split(';').map(t => t.trim()).filter(Boolean);
    let y = top + 190 * s;
    const rows: string[] = [];
    for (const item of list) {
      const lines = wrap(item, maxChars);
      const mx = x + 64 * s;
      const my = y - itemSize * 0.36;
      rows.push(win
        ? `<circle cx="${r(mx)}" cy="${r(my)}" r="${r(17 * s)}" fill="${k.accent}"/><path d="M${r(mx - 8 * s)} ${r(my)} l${r(6 * s)} ${r(6 * s)} l${r(11 * s)} ${r(-12 * s)}" fill="none" stroke="${k.ink}" stroke-width="${r(4 * s)}" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<circle cx="${r(mx)}" cy="${r(my)}" r="${r(14 * s)}" fill="none" stroke="${k.ink}" stroke-opacity="0.45" stroke-width="${r(3 * s)}"/><path d="M${r(mx - 6 * s)} ${r(my)} h${r(12 * s)}" stroke="${k.ink}" stroke-opacity="0.45" stroke-width="${r(3 * s)}" stroke-linecap="round"/>`);
      lines.forEach((l, i) => rows.push(k.text(x + 104 * s, y + i * itemSize * 1.2, l, itemSize, itemFill, { weight: 500, opacity: win ? 1 : 0.75 })));
      y += lines.length * itemSize * 1.2 + itemSize * 0.95;
    }
    return `<rect x="${r(x)}" y="${r(top)}" width="${r(colW)}" height="${r(colH)}" rx="${r(k.radius * 1.4)}" fill="${fill}"${win ? '' : ' fill-opacity="0.55"'}${win ? ` stroke="${k.accent}" stroke-width="${r(5 * s)}"` : ''}/>
${win ? `<rect x="${r(x + colW - 210 * s)}" y="${r(top - 24 * s)}" width="${r(170 * s)}" height="${r(48 * s)}" rx="${r(24 * s)}" fill="${k.accent}"/>${k.text(x + colW - 125 * s, top + 9 * s, 'BETTER FIT', k.caption, k.ink, { weight: 700, anchor: 'middle', spacing: 1.5 * s })}` : ''}
${k.text(x + 64 * s, top + 105 * s, head, k.h2 * 0.92, headFill, { weight: 700 })}
${rows.join('\n')}`;
  };
  const dx = W / 2;
  return `${k.backdrop()}
${k.text(dx, top - 90 * s, title, k.h2, k.ink, { weight: 700, anchor: 'middle' })}
${column(margin, leftHead, leftItems, false)}
${column(margin + colW + gap, rightHead, rightItems, true)}
<line x1="${r(dx)}" y1="${r(top + 30 * s)}" x2="${r(dx)}" y2="${r(top + colH - 30 * s)}" stroke="${k.ink}" stroke-opacity="0.25" stroke-width="${r(3 * s)}"/>
<circle cx="${r(dx)}" cy="${r(top + colH / 2)}" r="${r(52 * s)}" fill="${k.ink}"/>
${k.text(dx, top + colH / 2 + k.body * 0.36, 'VS', k.body * 1.05, k.bg, { weight: 800, anchor: 'middle', spacing: 1 * s })}
${foot ? k.text(dx, H - 70 * s, foot, k.caption, k.ink, { anchor: 'middle', weight: 500, opacity: 0.6 }) : ''}
${logoImage(logo, W - 80 * s - 56 * s / (logo?.aspect ?? 1), 64 * s, 56 * s)}`;
}

/** isometric-feature-grid: "title | tile | tile | ..." with up to six tiles on a 3x2 isometric grid. */
function isoGrid(k: Kit, f: string[], logo: RecipeLogo | null): string | null {
  if (f.length < 3) return null;
  const [title, ...rest] = f;
  const footIdx = rest.length > 6 ? 6 : -1;
  const tiles = rest.slice(0, 6);
  const foot = footIdx >= 0 ? rest[6] : '';
  const { W, H, s } = k;
  const cols = 3;
  // 2:1-ish isometric projection (layout rotation 45/-30): x axis runs down-right, y axis down-left.
  const tw = 380 * s;
  const th = tw * 0.577;
  const depth = 46 * s;
  const step = 1.15;
  const ax = { x: (tw / 2) * step, y: (th / 2) * step };
  const ay = { x: -(tw / 2) * step, y: (th / 2) * step };
  const rows = Math.ceil(tiles.length / cols);
  // Centre the footprint horizontally and under the title.
  const ox = W / 2 - ((cols - 1) * ax.x + (rows - 1) * ay.x) / 2;
  const footprintH = (cols - 1) * ax.y + (rows - 1) * ay.y + th + depth;
  const oy = 300 * s + (H - 300 * s - 120 * s - footprintH) / 2 + th / 2;
  const shades = [k.primary, mix(k.primary, k.bg, 0.35), mix(k.primary, k.bg, 0.62)];
  const order = tiles.map((t, i) => ({ t, i, c: i % cols, rw: Math.floor(i / cols) })).sort((a, b) => a.c + a.rw - (b.c + b.rw) || a.c - b.c);
  const parts = order.map(({ t, i, c, rw }) => {
    const cx = ox + c * ax.x + rw * ay.x;
    const cy = oy + c * ax.y + rw * ay.y;
    const top = shades[(c + rw) % shades.length];
    const left = mix(top, k.ink, 0.28);
    const right = mix(top, k.ink, 0.45);
    const P = (x: number, y: number) => `${r(x)},${r(y)}`;
    const nT = P(cx, cy - th / 2), nR = P(cx + tw / 2, cy), nB = P(cx, cy + th / 2), nL = P(cx - tw / 2, cy);
    const dR = P(cx + tw / 2, cy + depth), dB = P(cx, cy + th / 2 + depth), dL = P(cx - tw / 2, cy + depth);
    const light = (c + rw) % shades.length === 2;
    const label = wrap(t, 13);
    const size = k.body * (label.some(l => l.length > 10) ? 0.98 : 1.1);
    return `<polygon points="${nL} ${nB} ${dB} ${dL}" fill="${left}"/>
<polygon points="${nB} ${nR} ${dR} ${dB}" fill="${right}"/>
<polygon points="${nT} ${nR} ${nB} ${nL}" fill="${top}"/>
${i === 0 ? `<polygon points="${nT} ${nR} ${nB} ${nL}" fill="none" stroke="${k.accent}" stroke-width="${r(4 * s)}"/>` : ''}
${k.text(cx, cy - th * 0.16, String(i + 1).padStart(2, '0'), k.caption * 0.95, light ? k.ink : k.bg, { weight: 600, anchor: 'middle', opacity: 0.7 })}
${label.map((l, j) => k.text(cx, cy + size * (0.42 + j * 1.1 - (label.length - 1) * 0.3), l, size, light ? k.ink : k.bg, { weight: 700, anchor: 'middle' })).join('\n')}`;
  });
  return `${k.backdrop()}
${k.text(W / 2, 170 * s, title, k.h2, k.ink, { weight: 700, anchor: 'middle' })}
${parts.join('\n')}
${foot ? k.text(W / 2, H - 70 * s, foot, k.caption, k.ink, { anchor: 'middle', weight: 500, opacity: 0.6 }) : ''}
${logoImage(logo, 80 * s, 64 * s, 56 * s)}`;
}

/**
 * interview-speaker-card: "name | role | topic [| kicker]". A split frame (layout.split_portrait):
 * a brand panel with left-aligned credentials on the left, the speaker's footage on the right.
 */
function speakerCard(k: Kit, f: string[], logo: RecipeLogo | null): string | null {
  if (f.length < 2) return null;
  const [name, role, topic, kicker] = f;
  const { W, H, s } = k;
  const panelW = W * 0.46;
  const x = 120 * s;
  const nameSize = k.h1 * 1.05;
  const topicLines = topic ? wrap(topic, Math.floor((panelW - x - 80 * s) / (k.h2 * 0.78 * 0.55))) : [];
  const roleLines = wrap(role, Math.floor((panelW - x - 80 * s) / (k.body * 1.2 * 0.55)));
  const blockH = k.caption * 2.4 + nameSize * 1.1 + roleLines.length * k.body * 1.6 + 70 * s + topicLines.length * k.h2 * 0.95;
  let y = (H - blockH) / 2 + k.caption;
  const out: string[] = [];
  out.push(k.text(x, y, (kicker ?? 'In conversation').toUpperCase(), k.caption, k.primary, { weight: 700, spacing: 3 * s }));
  y += k.caption * 1.4 + nameSize;
  out.push(k.text(x, y, name, nameSize, k.ink, { weight: 800, spacing: -nameSize * 0.015 }));
  y += k.body * 1.7;
  roleLines.forEach(l => { out.push(k.text(x, y, l, k.body * 1.2, k.primary, { weight: 500 })); y += k.body * 1.6; });
  y += 18 * s;
  out.push(`<rect x="${r(x)}" y="${r(y)}" width="${r(110 * s)}" height="${r(8 * s)}" rx="${r(4 * s)}" fill="${k.accent}"/>`);
  y += 40 * s + k.h2 * 0.78;
  topicLines.forEach(l => { out.push(k.text(x, y, l, k.h2 * 0.78, k.ink, { weight: 600 })); y += k.h2 * 0.95; });
  return `${k.transparent ? '' : `<rect width="${W}" height="${H}" fill="${k.bg2}"/>`}
<rect width="${r(panelW)}" height="${H}" fill="${k.bg}"/>
<rect x="${r(panelW)}" width="${r(10 * s)}" height="${H}" fill="${k.primary}"/>
${out.join('\n')}
${logoImage(logo, x, H - 120 * s, 50 * s)}`;
}

/** broll-lower-third: "name | affiliation", bottom-left at the layout margins, with an accent line. */
function lowerThird(k: Kit, f: string[]): string | null {
  if (f.length < 1) return null;
  const [name, affiliation] = f;
  const { W, H, s } = k;
  // layout.margin_left_px / margin_bottom_px at 1080p.
  const mx = 80 * s;
  const mb = 80 * s;
  const nameSize = k.h2 * 0.95;
  const affSize = k.body * 1.05;
  const plateH = affiliation ? 150 * s : 104 * s;
  const plateW = Math.max(name.length * nameSize * 0.56, (affiliation ?? '').length * affSize * 0.54) + 110 * s;
  const y = H - mb - plateH;
  return `${k.transparent ? '' : `<rect width="${W}" height="${H}" fill="${k.bg2}"/>`}
<rect x="${r(mx)}" y="${r(y)}" width="${r(plateW)}" height="${r(plateH)}" rx="${r(k.radius * 0.6)}" fill="${k.ink}" fill-opacity="0.88"/>
<rect x="${r(mx + 28 * s)}" y="${r(y + 26 * s)}" width="${r(7 * s)}" height="${r(plateH - 52 * s)}" rx="${r(3.5 * s)}" fill="${k.accent}"/>
${k.text(mx + 62 * s, y + (affiliation ? 72 * s : 70 * s), name, nameSize, k.bg, { weight: 700 })}
${affiliation ? k.text(mx + 62 * s, y + 118 * s, affiliation, affSize, k.bg2, { weight: 500 }) : ''}`;
}

/**
 * broll-stat-callout: "<metric> <label> [| footnote]" in a bubble at the upper right
 * (layout.position), at most layout.max_width_px wide, with a pointer towards the speaker.
 */
function statCallout(k: Kit, f: string[]): string | null {
  const m = f[0] ? splitMetric(f[0]) : null;
  if (!m) return null;
  const { W, H, s } = k;
  const maxW = 360 * s;
  const pad = 34 * s;
  const statSize = k.h1 * 1.25;
  const labelSize = k.body * 1.05;
  const labelLines = wrap(m.label, Math.floor((maxW - pad * 2) / (labelSize * 0.54)));
  const footSize = k.caption * 0.95;
  const bh = pad + statSize * 0.9 + 18 * s + labelLines.length * labelSize * 1.25 + (f[1] ? footSize * 1.9 : 0) + pad * 0.8;
  const x = W - 120 * s - maxW;
  const y = 120 * s;
  // The pointer reaches down-left, towards a speaker framed left of the bubble.
  const tipX = x - 240 * s;
  const tipY = y + bh + 150 * s;
  let ty = y + pad + statSize * 0.86;
  const out = [k.text(x + pad, ty, m.metric, statSize, k.bg, { weight: 800, spacing: -statSize * 0.02 })];
  ty += 18 * s;
  labelLines.forEach(l => { ty += labelSize * 1.25; out.push(k.text(x + pad, ty, l, labelSize, k.bg, { weight: 500 })); });
  if (f[1]) out.push(k.text(x + pad, ty + footSize * 1.9, f[1], footSize, k.bg2, { weight: 500 }));
  return `${k.transparent ? '' : `<rect width="${W}" height="${H}" fill="${k.bg2}"/>`}
<path d="M${r(x + 40 * s)} ${r(y + bh - 4 * s)} L${r(tipX)} ${r(tipY)} L${r(x + 120 * s)} ${r(y + bh - 4 * s)} Z" fill="${k.primary}"/>
<rect x="${r(x)}" y="${r(y)}" width="${r(maxW)}" height="${r(bh)}" rx="${r(k.radius)}" fill="${k.primary}"/>
<rect x="${r(x + pad)}" y="${r(y)}" width="${r(90 * s)}" height="${r(8 * s)}" fill="${k.accent}"/>
<circle cx="${r(tipX)}" cy="${r(tipY)}" r="${r(10 * s)}" fill="${k.accent}"/>
<circle cx="${r(tipX)}" cy="${r(tipY)}" r="${r(24 * s)}" fill="none" stroke="${k.accent}" stroke-opacity="0.6" stroke-width="${r(4 * s)}"/>
${out.join('\n')}`;
}

/** Greedy word wrap to at most `maxChars` characters per line. */
function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && `${cur} ${w}`.length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Mixes two #rgb/#rrggbb colours; t = 0 gives a, 1 gives b. */
function mix(a: string, b: string, t: number): string {
  const p = (c: string) => {
    const h = c.length === 4 ? c.slice(1).split('').map(x => x + x).join('') : c.slice(1, 7);
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  };
  const [ca, cb] = [p(a), p(b)];
  return `#${ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function cssFamily(family: string | undefined): string {
  const cleaned = (family ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim();
  return cleaned || 'sans-serif';
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}

function escapeXml(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
