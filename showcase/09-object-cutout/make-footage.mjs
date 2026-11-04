/**
 * Generates the inputs for showcase 09 (all under work/):
 *   - source.mp4    1280x720, 30 fps, 8 s, silent: a Magnifito mug (the subject, with an open
 *                   handle so the mask has a hole to get right) sways, bobs and tilts across a
 *                   busy background of drifting confetti, stripes and blobs
 *   - brand-bg.png  the new Magnifito-branded background the cut-out is composited onto: the
 *                   real Magnifito logo (assets/magnifito-logo.svg) large, so the mug passes
 *                   in front of the wordmark
 *   - label-*.png   corner labels for the before/after split
 *
 * Everything is drawn as SVG and rasterized with rsvg-convert; a seeded PRNG keeps it
 * deterministic. The mug starts at about (330, 400): the SAM click points in showcase.json
 * sit on its body and its handle on frame 0.
 *
 * Usage (from this folder): node make-footage.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const FRAMES = path.join(WORK, 'source-frames');
// Geist (OFL-1.1) as TTF: rsvg-convert (Pango/HarfBuzz) cannot load the vendored WOFF2.
const FONTS_DIR = path.join(HERE, 'fonts');
const W = 1280;
const H = 720;
const FPS = 30;
const DURATION = 8;
// Magnifito palette (from the agency website): warm browns on cream.
const BROWN = '#7a584c';
const TAN = '#ae8c72';
const SAND = '#d8c6b4';
const CREAM = '#f0eadf';
const INK = '#2b1c17';
const INK_SOFT = '#573a30';
const GOLD = '#d5c299';

// The real Magnifito logo (people mark + MAGNIFITO wordmark), copied from the agency website.
const LOGO = fs.readFileSync(path.join(HERE, 'assets', 'magnifito-logo.svg'), 'utf8');
const LOGO_BODY = LOGO.slice(LOGO.indexOf('>', LOGO.indexOf('<svg')) + 1, LOGO.lastIndexOf('</svg>'));
// Everything before the first wordmark glyph group is the people mark.
const LOGO_MARK = LOGO_BODY.slice(0, LOGO_BODY.indexOf('<g fill="#835947"'));
/** The logo as a nested <svg> at (x, y), `height` px tall; `part: 'mark'` draws only the people mark. */
function logoSvg({ x, y, height, part = 'full' }) {
  const box = part === 'mark' ? [40, 132, 186, 186] : [38, 132, 802, 186];
  return `<svg x="${x}" y="${y}" width="${(height * box[2]) / box[3]}" height="${height}" viewBox="${box.join(' ')}">${part === 'mark' ? LOGO_MARK : LOGO_BODY}</svg>`;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rsvg-convert through fontconfig so Geist from fonts/ is used. */
function fontEnv() {
  const conf = path.join(WORK, 'fonts.conf');
  const includes = ['/opt/homebrew/etc/fonts/fonts.conf', '/usr/local/etc/fonts/fonts.conf', '/etc/fonts/fonts.conf']
    .filter(f => fs.existsSync(f)).map(f => `  <include ignore_missing="yes">${f}</include>`).join('\n');
  fs.writeFileSync(conf, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${includes}\n  <dir>${FONTS_DIR}</dir>\n  <cachedir>${path.join(WORK, 'fontcache')}</cachedir>\n</fontconfig>\n`);
  return { ...process.env, FONTCONFIG_FILE: conf, PANGOCAIRO_BACKEND: 'fc' };
}
fs.mkdirSync(WORK, { recursive: true });
const env = fontEnv();
function render(svg, png) {
  const file = path.join(WORK, 'tmp.svg');
  fs.writeFileSync(file, svg);
  execFileSync('rsvg-convert', ['-o', png, file], { env });
}
const svgDoc = (body, w = W, h = H) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// --- Busy background: confetti shapes in three parallax layers -----------------------------
const rand = rng(2026);
const PALETTE = ['#ff6b4a', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#8338ec', '#3a86ff', '#fb5607', '#2ec4b6', '#e9c46a', '#264653', '#f4a261'];
const pick = a => a[Math.floor(rand() * a.length)];
const shapes = Array.from({ length: 150 }, () => ({
  kind: pick(['circle', 'rect', 'tri', 'ring', 'bar']),
  x: rand() * (W + 200) - 100,
  y: rand() * (H + 200) - 100,
  s: 18 + rand() * 70,
  rot: rand() * 360,
  spin: (rand() - 0.5) * 40,
  layer: Math.floor(rand() * 3),
  fill: pick(PALETTE),
  op: 0.55 + rand() * 0.45,
}));
function shapeSvg(sh, t) {
  const speed = [14, 26, 44][sh.layer];
  const x = ((sh.x + speed * t + 100) % (W + 200)) - 100;
  const y = sh.y + Math.sin(t * 0.8 + sh.x) * 8;
  const r = sh.rot + sh.spin * t;
  const s = sh.s;
  const body = {
    circle: `<circle r="${s / 2}" fill="${sh.fill}"/>`,
    rect: `<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s * 0.7}" rx="${s * 0.12}" fill="${sh.fill}"/>`,
    tri: `<path d="M0 ${-s / 2} L${s / 2} ${s / 2} L${-s / 2} ${s / 2} Z" fill="${sh.fill}"/>`,
    ring: `<circle r="${s / 2.4}" fill="none" stroke="${sh.fill}" stroke-width="${s / 7}"/>`,
    bar: `<rect x="${-s}" y="${-s / 8}" width="${s * 2}" height="${s / 4}" rx="${s / 8}" fill="${sh.fill}"/>`,
  }[sh.kind];
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${r.toFixed(1)})" opacity="${sh.op.toFixed(2)}">${body}</g>`;
}
function busyBackground(t) {
  const stripes = Array.from({ length: 14 }, (_, i) => {
    const x = ((i * 120 + t * 20) % (W + 240)) - 120;
    return `<rect x="${x}" y="-100" width="44" height="${H + 200}" fill="${i % 2 ? '#ffffff' : '#000000'}" opacity="0.05" transform="rotate(18 ${x} ${H / 2})"/>`;
  }).join('');
  const layers = [0, 1, 2].map(l => shapes.filter(s => s.layer === l).map(s => shapeSvg(s, t)).join('')).join('');
  return `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fdf0d5"/><stop offset="0.5" stop-color="#cde7f0"/><stop offset="1" stop-color="#f7d6e0"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>${stripes}${layers}`;
}

// --- The subject: a white ceramic mug printed with the Magnifito mark between two brown rims -
function mugPose(t) {
  return {
    x: 640 + 330 * Math.sin((2 * Math.PI * t) / 8 - 1.22),
    y: 395 + 24 * Math.sin((2 * Math.PI * t) / 2.7),
    rot: 7 * Math.sin((2 * Math.PI * t) / 3.3),
    s: 1 + 0.06 * Math.sin((2 * Math.PI * t) / 5),
  };
}
function mugSvg(t) {
  const p = mugPose(t);
  return `<g transform="translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) rotate(${p.rot.toFixed(2)}) scale(${p.s.toFixed(4)})">
    <defs>
      <linearGradient id="cer" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#d9d6e6"/><stop offset="0.3" stop-color="#ffffff"/><stop offset="0.75" stop-color="#f1effa"/><stop offset="1" stop-color="#bcb8cf"/>
      </linearGradient>
      <linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${INK_SOFT}"/><stop offset="0.35" stop-color="${BROWN}"/><stop offset="1" stop-color="${INK_SOFT}"/>
      </linearGradient>
    </defs>
    <!-- handle: a thick ring with a real hole -->
    <path d="M88 -70 C190 -76 196 66 88 60 L88 28 C150 32 150 -40 88 -36 Z" fill="url(#cer)" stroke="#a9a4c0" stroke-width="3"/>
    <!-- body -->
    <path d="M-100 -120 L100 -120 L92 108 C90 128 76 136 56 136 L-56 136 C-76 136 -90 128 -92 108 Z" fill="url(#cer)" stroke="#a9a4c0" stroke-width="3"/>
    <path d="M-99 -92 L99 -92 L99 -80 L-99 -80 Z" fill="url(#band)"/>
    <path d="M-94 84 L94 84 L93 96 L-93 96 Z" fill="url(#band)"/>
    <ellipse cx="0" cy="-120" rx="100" ry="20" fill="#e9e6f5" stroke="#a9a4c0" stroke-width="3"/>
    <ellipse cx="0" cy="-117" rx="86" ry="14" fill="#5a3b2a"/>
    ${logoSvg({ x: -62, y: -66, height: 124, part: 'mark' })}
  </g>`;
}

// --- Frames ----------------------------------------------------------------------------------
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const frames = DURATION * FPS;
for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  render(svgDoc(`${busyBackground(t)}${mugSvg(t)}`), path.join(FRAMES, `${String(f).padStart(5, '0')}.png`));
}
execFileSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.png'),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  path.join(WORK, 'source.mp4'),
]);

// --- New background: Magnifito brand plate with the logo behind the subject ----------------
render(svgDoc(`<defs>
    <radialGradient id="g" cx="0.5" cy="0.45" r="0.8">
      <stop offset="0" stop-color="#fbf7f0"/><stop offset="0.6" stop-color="${CREAM}"/><stop offset="1" stop-color="${SAND}"/>
    </radialGradient>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="2" fill="${BROWN}" opacity="0.12"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <circle cx="1120" cy="110" r="220" fill="${TAN}" opacity="0.55"/>
  <circle cx="140" cy="650" r="170" fill="${GOLD}" opacity="0.7"/>
  ${logoSvg({ x: 640 - (210 * 802) / 186 / 2, y: 196, height: 210 })}
  <text x="640" y="560" font-family="Geist" font-size="30" font-weight="600" fill="${INK_SOFT}" text-anchor="middle" letter-spacing="3">WEBSITES · SOCIAL MEDIA · EMAIL · ADS · AUTOMATION</text>`), path.join(WORK, 'brand-bg.png'));

// --- Corner labels (transparent PNGs, full frame so they overlay at 0,0) --------------------
const label = (text, x, anchor, color) => {
  const w = text.length * 15 + 44;
  const rx = anchor === 'end' ? x - w : x;
  return svgDoc(`<rect x="${rx}" y="24" width="${w}" height="50" rx="25" fill="${color}" fill-opacity="0.92"/>
  <text x="${rx + w / 2}" y="57" font-family="Geist" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="1">${text}</text>`);
};
render(label('ORIGINAL', 24, 'start', INK), path.join(WORK, 'label-original.png'));
render(label('SAM 2.1 MASK', 24, 'start', INK), path.join(WORK, 'label-mask.png'));
render(label('NEW BACKGROUND', W - 24, 'end', INK), path.join(WORK, 'label-after.png'));
fs.rmSync(path.join(WORK, 'tmp.svg'));
console.log(`source: ${frames} frames, ${DURATION} s -> work/source.mp4; brand-bg.png and labels written`);
