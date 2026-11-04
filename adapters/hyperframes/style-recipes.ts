/**
 * Static-card layouts for six HyperFrames visual recipes in styles/recipes/: cinematic-title,
 * kinetic-typography, product-reveal, saas-interface-tour, retail-card and newsletter-promo.
 * Each layout reads its layout/motion parameters from the recipe JSON and draws one SVG frame
 * in the brand palette and heading font.
 *
 * The HyperFrames adapter holds one frame per scene, so motion parameters (drift, stagger,
 * slide-up, pulse, shimmer sweep) are drawn as their resting or mid-motion state, not animated.
 *
 * Copy convention: `copy_text` is split on `|` into segments; each layout documents its own
 * segment order. Images come from the scene's `asset_refs`, in order.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeXml, safeCssColor, safeJoin } from '../../packages/media/src/proc.js';
import { ShotRecipeRegistry, type ShotRecipe } from '../../styles/recipes/registry.js';
import type { ProjectContext } from '../interface.js';

type Scene = ProjectContext['scenePlan']['scenes'][0];
type Brand = ProjectContext['brand'];

export interface SceneImage {
  dataUri: string;
  /** Height divided by width. */
  aspect: number;
}

/**
 * Loads the scene's referenced SVG/PNG/JPEG assets as data URIs, in `asset_refs` order. With `strict` (the default) a
 * referenced file that is missing throws; without it the asset is skipped, for recipes where
 * the image is optional decoration.
 */
export function loadSceneImages(scene: Scene, source: Pick<ProjectContext, 'projectDir' | 'assets'>, strict = true): SceneImage[] {
  const images: SceneImage[] = [];
  for (const ref of scene.asset_refs) {
    const asset = source.assets.assets.find(a => a.asset_id === ref);
    if (!asset?.local_path) continue;
    const file = safeJoin(source.projectDir, asset.local_path);
    if (!existsSync(file)) {
      if (strict) throw new Error(`Asset ${ref} not found at ${asset.local_path}`);
      continue;
    }
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
    if (!mime) continue;
    const buf = readFileSync(file);
    let aspect = 1;
    if (ext === '.svg') {
      const vb = /viewBox="\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*"/.exec(buf.toString('utf8'));
      if (vb) aspect = Number(vb[2]) / Number(vb[1]);
    } else if (ext === '.png' && buf.length > 24) {
      aspect = buf.readUInt32BE(20) / buf.readUInt32BE(16);
    }
    images.push({ dataUri: `data:${mime};base64,${buf.toString('base64')}`, aspect });
  }
  return images;
}

let registry: ShotRecipeRegistry | null | undefined;

/** Reads a recipe JSON, finding styles/recipes/ by walking up from this module (source or dist/). */
function recipeFromJson(id: string): ShotRecipe | undefined {
  if (registry === undefined) {
    registry = null;
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (;;) {
      const candidate = path.join(dir, 'styles', 'recipes');
      if (existsSync(path.join(candidate, 'brand-title.json'))) {
        registry = new ShotRecipeRegistry(candidate);
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return registry?.getRecipe(id);
}

interface Palette {
  bg: string;
  ink: string;
  primary: string;
  secondary: string;
  accent: string;
  /** Between secondary and background: borders, soft fills. */
  soft: string;
  /** Between primary and ink: deep backgrounds. */
  deep: string;
  /** Background lifted towards white: cards and paper. */
  paper: string;
}

interface Ctx {
  brand: Brand;
  width: number;
  height: number;
  transparent: boolean;
  images: SceneImage[];
  layout: Record<string, unknown>;
  motion: Record<string, unknown>;
  /** Scale factor relative to a 1080 px short side. */
  s: number;
  seg: string[];
  font: string;
  weight: string;
  c: Palette;
}

const LAYOUTS: Record<string, (ctx: Ctx) => string> = {
  'cinematic-title': cinematicTitle,
  'kinetic-typography': kineticTypography,
  'product-reveal': productReveal,
  'saas-interface-tour': saasInterfaceTour,
  'retail-card': retailCard,
  'newsletter-promo': newsletterPromo,
};

/** Returns the scene SVG for a recipe implemented here, or null when the recipe is not. */
export function renderStyleRecipeSvg(
  scene: Scene,
  brand: Brand,
  width: number,
  height: number,
  transparent: boolean,
  images: SceneImage[]
): string | null {
  const layoutFn = LAYOUTS[scene.visual_recipe];
  if (!layoutFn) return null;
  const recipe = recipeFromJson(scene.visual_recipe);
  const font = brand.fonts[0]?.family.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'sans-serif';
  const weight = /^[1-9]00$/.test(brand.fonts[0]?.weight ?? '') ? brand.fonts[0].weight : '700';
  const bg = safeCssColor(brand.colors.background);
  const ink = safeCssColor(brand.colors.text_primary);
  const primary = safeCssColor(brand.colors.primary);
  const secondary = safeCssColor(brand.colors.secondary ?? mix(primary, bg, 0.5));
  const c: Palette = {
    bg,
    ink,
    primary,
    secondary,
    accent: safeCssColor(brand.colors.accent ?? primary),
    soft: mix(secondary, bg, 0.55),
    deep: mix(primary, ink, 0.55),
    paper: mix(bg, '#ffffff', 0.55),
  };
  const body = layoutFn({
    brand, width, height, transparent, images,
    layout: recipe?.layout ?? {},
    motion: recipe?.motion ?? {},
    s: Math.min(width, height) / 1080,
    seg: scene.copy_text.split('|').map(x => x.trim()),
    font, weight, c,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>`;
}

/**
 * cinematic-title. Segments: `Title | Subtitle`.
 * Letterboxed dark frame, atmospheric glow and a lens-flare streak behind an uppercase,
 * widely tracked title (layout.letter_spacing_em, layout.text_transform, motion.glow_intensity).
 */
function cinematicTitle(x: Ctx): string {
  const { width: w, height: h, s, c } = x;
  const ls = num(x.layout.letter_spacing_em, 0.15);
  const glow = num(x.motion.glow_intensity, 0.8);
  const title = x.layout.text_transform === 'uppercase' ? x.seg[0].toUpperCase() : x.seg[0];
  const sub = x.seg[1] ?? '';
  const maxW = w * 0.82;
  const size = fitSize(title, 112 * s, maxW, 0.7 + ls, 2);
  const lines = wrapWords(title, Math.floor(maxW / (size * (0.7 + ls))));
  const lh = size * 1.15;
  const subSize = Math.round(30 * s);
  const subLines = sub ? wrapWords(sub, Math.floor(maxW / (subSize * 0.62))) : [];
  const gap = sub ? 64 * s : 0;
  const blockH = lines.length * lh + gap + subLines.length * subSize * 1.4;
  const top = (h - blockH) / 2;
  const cy = top + size * 0.45;
  const bar = Math.max(0, (h - w / 2.39) / 2);
  const titleW = Math.max(...lines.map(l => estWidth(l, size, 0.7 + ls)));
  const flareX = Math.max(w * 0.08, w / 2 - titleW / 2 - 30 * s);
  // Tracking adds space after the last glyph too, so shift centred lines by half of it.
  const titleEls = lines.map((l, i) =>
    text(w / 2 + (size * ls) / 2, top + i * lh + size * 0.82, l, { size, fill: c.bg, font: x.font, weight: x.weight, anchor: 'middle', ls: size * ls })).join('\n');
  const ruleY = top + lines.length * lh + gap / 2;
  const subEls = subLines.map((l, i) =>
    text(w / 2 + (subSize * ls * 0.5) / 2, ruleY + gap / 2 + i * subSize * 1.4 + subSize * 0.8, l, { size: subSize, fill: c.soft, font: x.font, weight: '400', anchor: 'middle', ls: subSize * ls * 0.5 })).join('\n');
  return `<defs>
  <radialGradient id="cineBg" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="${c.deep}"/><stop offset="0.6" stop-color="${c.ink}"/><stop offset="1" stop-color="${mix(c.ink, '#000000', 0.45)}"/></radialGradient>
  <radialGradient id="cineGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${c.secondary}" stop-opacity="${(0.55 * glow).toFixed(3)}"/><stop offset="1" stop-color="${c.secondary}" stop-opacity="0"/></radialGradient>
  <linearGradient id="cineStreak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.bg}" stop-opacity="0"/><stop offset="0.5" stop-color="${c.bg}" stop-opacity="${(0.7 * glow).toFixed(3)}"/><stop offset="1" stop-color="${c.bg}" stop-opacity="0"/></linearGradient>
  <radialGradient id="cineHot" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff" stop-opacity="${(0.85 * glow).toFixed(3)}"/><stop offset="1" stop-color="${c.secondary}" stop-opacity="0"/></radialGradient>
  <filter id="cineBlur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="${(3 * s).toFixed(1)}"/></filter>
</defs>
${x.transparent ? '' : `<rect width="${w}" height="${h}" fill="url(#cineBg)"/>`}
<ellipse cx="${w / 2}" cy="${cy}" rx="${w * 0.42}" ry="${h * 0.3}" fill="url(#cineGlow)"/>
<rect x="${w * 0.04}" y="${cy - 3 * s}" width="${w * 0.92}" height="${6 * s}" fill="url(#cineStreak)" filter="url(#cineBlur)"/>
<ellipse cx="${flareX}" cy="${cy}" rx="${64 * s}" ry="${64 * s}" fill="url(#cineHot)"/>
${[0.18, 0.34, 0.47].map((f, i) => `<circle cx="${flareX + f * w}" cy="${cy + f * h * 0.5}" r="${(22 - i * 6) * s}" fill="${c.secondary}" fill-opacity="${(0.16 * glow).toFixed(3)}"/>`).join('\n')}
${titleEls}
${sub ? `<rect x="${w / 2 - 60 * s}" y="${ruleY - 1 * s}" width="${120 * s}" height="${2 * s}" fill="${c.secondary}"/>` : ''}
${subEls}
${bar > 0 && !x.transparent ? `<rect width="${w}" height="${bar}" fill="#000000"/><rect y="${h - bar}" width="${w}" height="${bar}" fill="#000000"/>` : ''}`;
}

/**
 * kinetic-typography. Segments: `Statement | Emphasis`.
 * Large centred lines wrapped at layout.max_characters_per_line; the emphasis segment is set in
 * the primary colour over an accent bar. Shows the end state of the word-by-word reveal.
 */
function kineticTypography(x: Ctx): string {
  const { width: w, height: h, s, c } = x;
  const maxChars = num(x.layout.max_characters_per_line, 26);
  const size = Math.min(120 * s, (w * 0.86) / (maxChars * 0.56));
  const lh = size * 1.08;
  const plain = x.seg[0] ? wrapWords(x.seg[0], maxChars) : [];
  const emph = x.seg[1] ? wrapWords(x.seg[1], maxChars) : [];
  const lines = [...plain.map(t => ({ t, e: false })), ...emph.map(t => ({ t, e: true }))];
  const top = (h - lines.length * lh) / 2;
  const els = lines.map((l, i) => {
    const y = top + i * lh + size * 0.8;
    const barW = estWidth(l.t, size, 0.49);
    const bar = l.e && i === lines.length - 1
      ? `<rect x="${w / 2 - barW / 2}" y="${y + size * 0.16}" width="${barW}" height="${size * 0.1}" rx="${size * 0.05}" fill="${c.accent}"/>\n`
      : '';
    return `${bar}${text(w / 2, y, l.t, { size, fill: l.e ? c.primary : c.ink, font: x.font, weight: '800', anchor: 'middle', ls: -size * 0.02 })}`;
  }).join('\n');
  return `<defs><linearGradient id="ktBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.soft}"/></linearGradient></defs>
${x.transparent ? '' : `<rect width="${w}" height="${h}" fill="url(#ktBg)"/>`}
${els}`;
}

/**
 * product-reveal. Segments: `Product name | Badge | Tagline`. Images: product, optional logo.
 * Spotlit product on a glow at the focal point with a floor shadow and a specular glint; the
 * badge sits at layout.badge_placement (top_left or top_right), the logo in the other corner.
 */
function productReveal(x: Ctx): string {
  const { width: w, height: h, s, c } = x;
  const [product, logo] = x.images;
  const boxW = w * 0.5;
  const boxH = h * 0.54;
  let pw = boxW;
  let ph = product ? pw * product.aspect : 0;
  if (product && ph > boxH) { ph = boxH; pw = ph / product.aspect; }
  const cx = w / 2;
  const cy = h * 0.43;
  const name = x.seg[0] ?? '';
  const badge = (x.seg[1] ?? '').toUpperCase();
  const tagline = x.seg[2] ?? '';
  const nameSize = Math.round(62 * s);
  const tagSize = Math.round(32 * s);
  const nameY = cy + ph / 2 + 100 * s;
  const badgeSize = Math.round(22 * s);
  const badgeW = estWidth(badge, badgeSize, 0.72) + 56 * s;
  const right = x.layout.badge_placement === 'top_right';
  const bx = right ? w - 80 * s - badgeW : 80 * s;
  const by = 72 * s;
  const logoW = 240 * s;
  return `<defs>
  <radialGradient id="prBg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="${c.paper}"/><stop offset="0.55" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.soft}"/></radialGradient>
  <radialGradient id="prGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${c.secondary}" stop-opacity="0.55"/><stop offset="1" stop-color="${c.secondary}" stop-opacity="0"/></radialGradient>
  <radialGradient id="prShadow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${c.ink}" stop-opacity="0.35"/><stop offset="1" stop-color="${c.ink}" stop-opacity="0"/></radialGradient>
</defs>
${x.transparent ? '' : `<rect width="${w}" height="${h}" fill="url(#prBg)"/>`}
<ellipse cx="${cx}" cy="${cy}" rx="${pw * 0.85}" ry="${ph * 0.85 + 40 * s}" fill="url(#prGlow)"/>
<ellipse cx="${cx}" cy="${cy + ph / 2 + 10 * s}" rx="${pw * 0.5}" ry="${24 * s}" fill="url(#prShadow)"/>
${product ? `<image x="${cx - pw / 2}" y="${cy - ph / 2}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid meet" href="${product.dataUri}"/>` : ''}
${product ? sparkle(cx + pw * 0.4, cy - ph * 0.42, 30 * s, '#ffffff') : ''}
${badge ? `<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeSize * 2.4}" rx="${badgeSize * 1.2}" fill="${c.primary}"/>
${text(bx + badgeW / 2, by + badgeSize * 1.58, badge, { size: badgeSize, fill: c.bg, font: x.font, weight: x.weight, anchor: 'middle', ls: badgeSize * 0.08 })}` : ''}
${logo ? `<image x="${right ? 80 * s : w - 80 * s - logoW}" y="${by}" width="${logoW}" height="${logoW * logo.aspect}" preserveAspectRatio="xMidYMid meet" href="${logo.dataUri}"/>` : ''}
${text(cx, nameY, name, { size: nameSize, fill: c.ink, font: x.font, weight: x.weight, anchor: 'middle' })}
${tagline ? text(cx, nameY + tagSize * 1.7, tagline, { size: tagSize, fill: c.primary, font: x.font, weight: '500', anchor: 'middle' }) : ''}`;
}

/**
 * saas-interface-tour. Segments: `Callout title | Callout body`. Images: screen capture.
 * The capture fills a browser window magnified by layout.viewport_crop about its centre, the
 * element at the centre gets a glowing highlight (motion.highlight_border_glow) and a cursor
 * click, and the callout card sits at layout.callout_position (bottom_right or bottom_left).
 */
function saasInterfaceTour(x: Ctx): string {
  const { width: w, height: h, s, c } = x;
  const [screen] = x.images;
  const crop = parseFloat(String(x.layout.viewport_crop ?? '130%')) / 100 || 1.3;
  const winW = w * 0.8;
  const winH = h * 0.8;
  const left = x.layout.callout_position === 'bottom_left';
  const winX = left ? w - w * 0.06 - winW : w * 0.06;
  const winY = h * 0.07;
  const barH = 44 * s;
  const vx = winX;
  const vy = winY + barH;
  const vw = winW;
  const vh = winH - barH;
  // Fit the capture to the viewport width, then magnify it by viewport_crop about its centre.
  const iw = vw * crop;
  const ih = screen ? iw * screen.aspect : 0;
  const ix = vx + (vw - iw) / 2;
  const iy = vy + (vh - ih) / 2;
  const hx = vx + vw / 2;
  const hy = vy + vh / 2;
  const hw = vw * 0.36;
  const hh = vh * 0.34;
  const squash = num(x.motion.cursor_click_squash, 0.92);
  const glowOn = x.motion.highlight_border_glow !== false;
  const title = x.seg[0] ?? '';
  const bodyText = x.seg[1] ?? '';
  const tSize = Math.round(36 * s);
  const bSize = Math.round(25 * s);
  const cardW = 600 * s;
  const bodyLines = wrapWords(bodyText, Math.floor((cardW - 80 * s) / (bSize * 0.52)));
  const cardH = 68 * s + tSize * 1.2 + bodyLines.length * bSize * 1.4 + 28 * s;
  const cardX = left ? w * 0.03 : w - w * 0.03 - cardW;
  const cardY = h - h * 0.05 - cardH;
  const curX = hx + hw * 0.18;
  const curY = hy + hh * 0.12;
  const rr = 18 * s;
  return `<defs>
  <linearGradient id="stBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.soft}"/></linearGradient>
  <clipPath id="stView"><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}"/></clipPath>
  <filter id="stShadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="${18 * s}" stdDeviation="${26 * s}" flood-color="${c.ink}" flood-opacity="0.22"/></filter>
  <filter id="stGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${10 * s}"/></filter>
</defs>
${x.transparent ? '' : `<rect width="${w}" height="${h}" fill="url(#stBg)"/>`}
<rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="${rr}" fill="${c.paper}" filter="url(#stShadow)"/>
<path d="M${winX} ${winY + rr} a${rr} ${rr} 0 0 1 ${rr} ${-rr} h${winW - 2 * rr} a${rr} ${rr} 0 0 1 ${rr} ${rr} v${barH - rr} h${-winW} Z" fill="${c.soft}"/>
${[0, 1, 2].map(i => `<circle cx="${winX + (30 + i * 24) * s}" cy="${winY + barH / 2}" r="${7 * s}" fill="${[c.primary, c.secondary, c.bg][i]}"/>`).join('')}
<rect x="${winX + winW / 2 - 220 * s}" y="${winY + 10 * s}" width="${440 * s}" height="${barH - 20 * s}" rx="${(barH - 20 * s) / 2}" fill="${c.paper}"/>
<g clip-path="url(#stView)">
${screen ? `<image x="${ix}" y="${iy}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid meet" href="${screen.dataUri}"/>` : ''}
${glowOn ? `<rect x="${hx - hw / 2}" y="${hy - hh / 2}" width="${hw}" height="${hh}" rx="${16 * s}" fill="none" stroke="${c.accent}" stroke-width="${12 * s}" stroke-opacity="0.55" filter="url(#stGlow)"/>` : ''}
<rect x="${hx - hw / 2}" y="${hy - hh / 2}" width="${hw}" height="${hh}" rx="${16 * s}" fill="none" stroke="${c.primary}" stroke-width="${4 * s}"/>
</g>
<circle cx="${curX}" cy="${curY}" r="${30 * s}" fill="${c.primary}" fill-opacity="0.18" stroke="${c.primary}" stroke-width="${3 * s}"/>
<path transform="translate(${curX} ${curY}) scale(${(1.7 * s * squash).toFixed(3)} ${(1.7 * s).toFixed(3)})" d="M0 0 L0 34 L9 26 L15 40 L21 37 L15 24 L27 24 Z" fill="${c.ink}" stroke="${c.paper}" stroke-width="2" stroke-linejoin="round"/>
<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${20 * s}" fill="${c.ink}" filter="url(#stShadow)"/>
<circle cx="${cardX + 48 * s}" cy="${cardY + 40 * s + tSize * 0.48}" r="${9 * s}" fill="${c.accent}"/>
${text(cardX + 72 * s, cardY + 40 * s + tSize * 0.82, title, { size: tSize, fill: c.bg, font: x.font, weight: x.weight })}
${bodyLines.map((l, i) => text(cardX + 40 * s, cardY + 68 * s + tSize * 1.2 + i * bSize * 1.4 + bSize * 0.6, l, { size: bSize, fill: c.soft, font: x.font, weight: '400' })).join('\n')}`;
}

/**
 * retail-card. Segments: `Product | Price | Badge | Call to action | Fine print`.
 * Images: optional logo. A bold offer card with a badge popping over its corner, a shimmer
 * band mid-sweep and a CTA button sized by layout.cta_button_prominence
 * (layout.card_padding_px sets the inner padding).
 */
function retailCard(x: Ctx): string {
  const { width: w, height: h, s, c } = x;
  const [logo] = x.images;
  const pad = num(x.layout.card_padding_px, 40) * s * 1.6;
  const cardW = 1080 * s;
  const cardH = 640 * s;
  const cx = (w - cardW) / 2;
  const cy = (h - cardH) / 2;
  const r = (x.brand.motion_preferences.border_radius ?? 24) * 1.5 * s;
  const [name = '', price = '', badge = '', cta = '', fine = ''] = x.seg;
  const nameSize = Math.round(54 * s);
  const priceSize = Math.round(132 * s);
  const ctaSize = Math.round(34 * s);
  const ctaH = (x.layout.cta_button_prominence === 'low' ? 72 : 96) * s;
  const ctaW = estWidth(cta, ctaSize, 0.58) + 150 * s;
  const ctaX = cx + cardW - pad - ctaW;
  const ctaY = cy + cardH - pad - ctaH;
  const logoH = 52 * s;
  const logoW = logo ? logoH / logo.aspect : 0;
  const nameY = cy + pad + (logo ? logoH + 76 * s : 50 * s);
  const badgeR = 118 * s;
  const badgeLines = wrapWords(badge, 10);
  const bSize = Math.round((badgeLines.length > 2 ? 30 : 36) * s);
  const bcx = cx + cardW - 40 * s;
  const bcy = cy + 30 * s;
  return `<defs>
  <linearGradient id="rcBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.primary}"/><stop offset="1" stop-color="${c.deep}"/></linearGradient>
  <linearGradient id="rcShimmer" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
  <clipPath id="rcCard"><rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" rx="${r}"/></clipPath>
  <filter id="rcShadow" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="${24 * s}" stdDeviation="${34 * s}" flood-color="#000000" flood-opacity="0.3"/></filter>
</defs>
${x.transparent ? '' : `<rect width="${w}" height="${h}" fill="url(#rcBg)"/>`}
<rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" rx="${r}" fill="${c.paper}" filter="url(#rcShadow)"/>
<g clip-path="url(#rcCard)"><rect x="${cx + cardW * 0.55}" y="${cy - cardH * 0.2}" width="${170 * s}" height="${cardH * 1.4}" transform="rotate(20 ${cx + cardW * 0.55} ${cy})" fill="url(#rcShimmer)"/></g>
${logo ? `<image x="${cx + pad}" y="${cy + pad}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet" href="${logo.dataUri}"/>` : ''}
${text(cx + pad, nameY, name, { size: nameSize, fill: c.ink, font: x.font, weight: x.weight })}
${text(cx + pad - 6 * s, nameY + priceSize * 1.1, price, { size: priceSize, fill: c.primary, font: x.font, weight: '800', ls: -priceSize * 0.03 })}
${fine ? text(cx + pad, cy + cardH - pad - 4 * s, fine, { size: Math.round(22 * s), fill: c.primary, font: x.font, weight: '500' }) : ''}
${cta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="${ctaH / 2}" fill="${c.ink}"/>
${text(ctaX + ctaW / 2 - 18 * s, ctaY + ctaH / 2 + ctaSize * 0.36, cta, { size: ctaSize, fill: c.bg, font: x.font, weight: x.weight, anchor: 'middle' })}
<path d="M${ctaX + ctaW - 70 * s} ${ctaY + ctaH / 2} h${30 * s} m${-12 * s} ${-12 * s} l${12 * s} ${12 * s} l${-12 * s} ${12 * s}" fill="none" stroke="${c.accent}" stroke-width="${4 * s}" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
${badge ? `<g transform="rotate(-10 ${bcx} ${bcy})"><circle cx="${bcx}" cy="${bcy}" r="${badgeR}" fill="${c.accent}"/>
${badgeLines.map((l, i) => text(bcx, bcy + (i - (badgeLines.length - 1) / 2) * bSize * 1.1 + bSize * 0.36, l, { size: bSize, fill: c.ink, font: x.font, weight: '800', anchor: 'middle' })).join('\n')}</g>` : ''}`;
}

/**
 * newsletter-promo. Segments: `Masthead | Issue line | Headline... | Subscriber badge | Button`.
 * Images: author avatar (a wide logo is cropped to its left-hand mark). An editorial card with
 * the avatar at layout.author_avatar_placement, numbered headlines (in a serif when
 * layout.editorial_serif is set: the brand's second font, else the system serif), a subscriber
 * badge and a subscribe button with its pulse ring (motion.subscribe_button_pulse).
 */
function newsletterPromo(x: Ctx): string {
  const { width: w, height: h, s, c } = x;
  const [avatar] = x.images;
  const seg = x.seg;
  const masthead = seg[0] ?? '';
  const issue = seg[1] ?? '';
  const button = seg.length >= 4 ? seg[seg.length - 1] : '';
  const badge = seg.length >= 5 ? seg[seg.length - 2] : '';
  const heads = seg.slice(2, seg.length >= 5 ? -2 : seg.length >= 4 ? -1 : undefined);
  const second = x.brand.fonts[1]?.family.replace(/[^\p{L}\p{N} _-]/gu, '').trim();
  const serif = x.layout.editorial_serif === true
    ? (second || "Georgia, 'PT Serif', 'Times New Roman', 'DejaVu Serif', serif")
    : x.font;
  const pad = 64 * s;
  const av = 92 * s;
  const cardW = 1000 * s;
  // Shrink headlines (down to 34 px at 1080p) so each fits on one line before wrapping.
  const headW = cardW - 2 * pad - 90 * s;
  const longest = Math.max(1, ...heads.map(hl => hl.length));
  const hSize = Math.round(Math.max(34 * s, Math.min(46 * s, headW / (longest * 0.55))));
  const headMax = Math.floor(headW / (hSize * 0.55));
  const headLines = heads.map(hl => wrapWords(hl, headMax));
  const headsH = headLines.reduce((acc, l) => acc + l.length * hSize * 1.18 + 34 * s, 0);
  const btnH = 84 * s;
  const cardH = pad + av + 40 * s + 44 * s + headsH + 30 * s + btnH + pad;
  const cx = (w - cardW) / 2;
  const cy = (h - cardH) / 2;
  const right = x.layout.author_avatar_placement === 'top_right';
  const avX = right ? cx + cardW - pad - av : cx + pad;
  const avY = cy + pad;
  const textX = right ? cx + pad : avX + av + 28 * s;
  const mSize = Math.round(40 * s);
  const iSize = Math.round(22 * s);
  const ruleY = avY + av + 40 * s;
  let y = ruleY + 44 * s;
  const headEls: string[] = [];
  headLines.forEach((lines, i) => {
    headEls.push(text(cx + pad, y + hSize * 0.82, String(i + 1).padStart(2, '0'), { size: Math.round(24 * s), fill: c.primary, font: x.font, weight: x.weight }));
    lines.forEach((l, j) => headEls.push(text(cx + pad + 90 * s, y + hSize * 0.85 + j * hSize * 1.18, l, { size: hSize, fill: c.ink, font: serif, weight: '700' })));
    y += lines.length * hSize * 1.18 + 34 * s;
    if (i < headLines.length - 1) headEls.push(`<rect x="${cx + pad + 90 * s}" y="${y - 17 * s}" width="${cardW - 2 * pad - 90 * s}" height="${1.5 * s}" fill="${c.soft}"/>`);
  });
  const btnSize = Math.round(30 * s);
  const btnW = estWidth(button, btnSize, 0.58) + 96 * s;
  const btnX = cx + cardW - pad - btnW;
  const btnY = cy + cardH - pad - btnH;
  const pulse = x.motion.subscribe_button_pulse !== false;
  const bSize = Math.round(22 * s);
  const badgeW = estWidth(badge, bSize, 0.56) + 72 * s;
  const badgeY = btnY + (btnH - 52 * s) / 2;
  return `<defs>
  <linearGradient id="npBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.soft}"/><stop offset="1" stop-color="${c.secondary}"/></linearGradient>
  <clipPath id="npAvatar"><circle cx="${avX + av / 2}" cy="${avY + av / 2}" r="${av / 2}"/></clipPath>
  <filter id="npShadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="${22 * s}" stdDeviation="${30 * s}" flood-color="${c.ink}" flood-opacity="0.25"/></filter>
</defs>
${x.transparent ? '' : `<rect width="${w}" height="${h}" fill="url(#npBg)"/>`}
<rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" rx="${22 * s}" fill="${c.paper}" filter="url(#npShadow)"/>
<circle cx="${avX + av / 2}" cy="${avY + av / 2}" r="${av / 2}" fill="${c.bg}" stroke="${c.soft}" stroke-width="${3 * s}"/>
${avatar ? `<image x="${avX + av * 0.15}" y="${avY + av * 0.11}" width="${av * 0.7}" height="${av * 0.78}" preserveAspectRatio="xMinYMid slice" clip-path="url(#npAvatar)" href="${avatar.dataUri}"/>` : ''}
${text(textX, avY + av * 0.47, masthead, { size: mSize, fill: c.ink, font: x.font, weight: x.weight })}
${text(textX, avY + av * 0.47 + iSize * 1.7, issue, { size: iSize, fill: c.primary, font: x.font, weight: '500', ls: iSize * 0.04 })}
<rect x="${cx + pad}" y="${ruleY}" width="${cardW - 2 * pad}" height="${3 * s}" fill="${c.ink}"/>
${headEls.join('\n')}
${badge ? `<rect x="${cx + pad}" y="${badgeY}" width="${badgeW}" height="${52 * s}" rx="${26 * s}" fill="${c.bg}" stroke="${c.soft}" stroke-width="${2 * s}"/>
<circle cx="${cx + pad + 28 * s}" cy="${badgeY + 26 * s}" r="${8 * s}" fill="${c.accent}"/>
${text(cx + pad + 48 * s, badgeY + 26 * s + bSize * 0.36, badge, { size: bSize, fill: c.ink, font: x.font, weight: '600' })}` : ''}
${button ? `${pulse ? `<rect x="${btnX - 10 * s}" y="${btnY - 10 * s}" width="${btnW + 20 * s}" height="${btnH + 20 * s}" rx="${(btnH + 20 * s) / 2}" fill="${c.primary}" fill-opacity="0.18"/>` : ''}
<rect x="${btnX}" y="${btnY}" width="${btnW}" height="${btnH}" rx="${btnH / 2}" fill="${c.primary}"/>
${text(btnX + btnW / 2, btnY + btnH / 2 + btnSize * 0.36, button, { size: btnSize, fill: c.bg, font: x.font, weight: x.weight, anchor: 'middle' })}` : ''}`;
}

/* Helpers */

function text(
  x: number,
  y: number,
  content: string,
  o: { size: number; fill: string; font: string; weight: string; anchor?: 'start' | 'middle' | 'end'; ls?: number }
): string {
  const ls = o.ls ? ` letter-spacing="${o.ls.toFixed(2)}"` : '';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${escapeXml(o.font)}" font-size="${Math.round(o.size)}" font-weight="${o.weight}" fill="${o.fill}" text-anchor="${o.anchor ?? 'start'}"${ls}>${escapeXml(content)}</text>`;
}

/** Four-point star used as a specular glint. */
function sparkle(cx: number, cy: number, r: number, fill: string): string {
  const k = r * 0.18;
  return `<path d="M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r} Z" fill="${fill}" fill-opacity="0.9"/>`;
}

/** Rough advance width of a string: `em` is the average glyph width in ems. */
function estWidth(content: string, size: number, em: number): number {
  return content.length * size * em;
}

/** Largest font size up to `max` that fits `content` in `maxLines` lines of `maxW`. */
function fitSize(content: string, max: number, maxW: number, em: number, maxLines: number): number {
  let size = max;
  while (size > 12 && wrapWords(content, Math.floor(maxW / (size * em))).length > maxLines) size -= 2;
  return size;
}

function wrapWords(content: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of content.split(/\s+/).filter(Boolean)) {
    if (current && (current + ' ' + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Mixes two #rgb/#rrggbb colours; t = 0 gives `a`, 1 gives `b`. */
function mix(a: string, b: string, t: number): string {
  const pa = rgb(a);
  const pb = rgb(b);
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function rgb(hex: string): number[] {
  let hx = hex.replace('#', '');
  if (hx.length === 3) hx = hx.split('').map(ch => ch + ch).join('');
  return [0, 2, 4].map(i => parseInt(hx.slice(i, i + 2), 16));
}
