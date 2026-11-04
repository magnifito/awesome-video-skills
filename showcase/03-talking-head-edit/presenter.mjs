/**
 * Synthetic presenter: Mira, an illustrated (clearly fictional) speaker in a small studio room,
 * drawn as SVG frames. Her voice is committed audio (voice/mira.wav, AI-generated with Qwen3-TTS
 * VoiceDesign, a designed voice not based on a real person) and her lips follow that audio:
 * voice/mira.json carries the phoneme timing (visemes, from tools/voice/visemes.py) that picks
 * the mouth shape, and a per-frame loudness envelope that sets how far the jaw opens. Blinks,
 * glances, nods and brow raises are seeded or derived from the voice, so the same voice files
 * always produce the same frames.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Geist (OFL-1.1) as TTF. rsvg-convert renders text through Pango/HarfBuzz, which cannot load
 * the WOFF2 vendored for the motion engine, so the project carries the converted TTF.
 */
export const FONTS_DIR = path.join(HERE, 'fonts');

/** Magnifito palette (from the agency website): warm browns on cream, logo green sparingly. */
export const BRAND = {
  brown: '#7a584c',
  tan: '#ae8c72',
  sand: '#d8c6b4',
  cream: '#f0eadf',
  ink: '#2b1c17',
  inkSoft: '#573a30',
  gold: '#d5c299',
  green: '#8acf31',
};

// The real Magnifito logo (people mark + MAGNIFITO wordmark), copied from the agency website.
const LOGO = fs.readFileSync(path.join(HERE, 'assets', 'magnifito-logo.svg'), 'utf8');
const LOGO_BODY = LOGO.slice(LOGO.indexOf('>', LOGO.indexOf('<svg')) + 1, LOGO.lastIndexOf('</svg>'));
// Everything before the first wordmark glyph group is the people mark.
const LOGO_MARK = LOGO_BODY.slice(0, LOGO_BODY.indexOf('<g fill="#835947"'));

/**
 * The logo as a nested <svg> at (x, y), `height` px tall. `part: 'mark'` draws only the people
 * mark; `wordmark` recolours the MAGNIFITO letters (for dark backgrounds).
 */
export function logoSvg({ x, y, height, part = 'full', wordmark }) {
  const box = part === 'mark' ? [40, 132, 186, 186] : [38, 132, 802, 186];
  const body = part === 'mark' ? LOGO_MARK : wordmark ? LOGO_BODY.replaceAll('#835947', wordmark) : LOGO_BODY;
  return `<svg x="${x}" y="${y}" width="${(height * box[2]) / box[3]}" height="${height}" viewBox="${box.join(' ')}">${body}</svg>`;
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = t => { const x = clamp(t); return x * x * (3 - 2 * x); };
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Mira's voice for this clip, from the committed voice/ folder: voice/mira.wav (the audio) and
 * voice/mira.json (word times, a loudness mouth track per video frame, and phoneme timing).
 * Both are written by tools/voice/generate_mira.py; recipes never need the TTS model.
 */
export function loadVoice(dir = HERE) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'mira.json'), 'utf8'));
  return { ...meta, wav: path.join(dir, 'voice', 'mira.wav') };
}

/** Loudness mouth track at time t, from the audio: `open` 0..1 (jaw) and `wide` 0..1 (ee wide, oo rounded). */
export function mouthAt(t, voice) {
  const { fps, open, wide } = voice.mouth;
  const x = clamp(t * fps, 0, open.length - 1);
  const i = Math.floor(x);
  const j = Math.min(open.length - 1, i + 1);
  const k = x - i;
  return { open: open[i] + (open[j] - open[i]) * k, wide: wide[i] + (wide[j] - wide[i]) * k };
}

/** True while the speaker is producing a filler sound (eyes drift up, as people do). */
export function inFiller(t, voice) {
  return voice.words.some(w => w.filler && t >= w.start - 0.15 && t <= w.end + 0.2);
}

/**
 * Environment for rsvg-convert so it finds Geist in fonts/ through fontconfig
 * (Pango on macOS otherwise uses CoreText and ignores fontconfig).
 */
export function fontEnv(workDir) {
  const conf = path.join(workDir, 'fonts.conf');
  const includes = ['/opt/homebrew/etc/fonts/fonts.conf', '/usr/local/etc/fonts/fonts.conf', '/etc/fonts/fonts.conf']
    .filter(f => fs.existsSync(f)).map(f => `  <include ignore_missing="yes">${f}</include>`).join('\n');
  fs.writeFileSync(conf, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${includes}\n  <dir>${FONTS_DIR}</dir>\n  <cachedir>${path.join(workDir, 'fontcache')}</cachedir>\n</fontconfig>\n`);
  return { ...process.env, FONTCONFIG_FILE: conf, PANGOCAIRO_BACKEND: 'fc' };
}

export function rasterize(svgFile, pngFile, env) {
  execFileSync('rsvg-convert', ['-o', pngFile, svgFile], { env });
}

/**
 * Warm studio: cream wall, wooden floor, a shelf with books and a plant, and a framed print of
 * the Magnifito mark. `layout: 'left'` (speaker on the left third) hides the shelf and hangs the
 * print beside her head, so the right side of the frame stays empty for B-roll panels.
 */
export function roomSvg(W, H, layout = 'center') {
  const left = layout === 'left';
  const printX = left ? 84 : 210;
  return `
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3ede3"/><stop offset="1" stop-color="#ddcfbf"/>
    </linearGradient>
    <radialGradient id="lamp" cx="${left ? 0.28 : 0.5}" cy="0.35" r="0.65">
      <stop offset="0" stop-color="#fffaf2" stop-opacity="0.6"/><stop offset="1" stop-color="#fffaf2" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BRAND.tan}"/><stop offset="1" stop-color="#8f6f5d"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <rect width="${W}" height="${H}" fill="url(#lamp)"/>
  <rect y="${H * 0.83}" width="${W}" height="${H * 0.17}" fill="url(#floor)"/>
  <rect y="${H * 0.83 - 6}" width="${W}" height="10" fill="${BRAND.sand}"/>
  <!-- shelf with books and a plant -->
  <g transform="translate(1330,300)" opacity="${left ? 0 : 1}">
    <rect x="0" y="210" width="420" height="16" rx="3" fill="${BRAND.inkSoft}"/>
    <rect x="20" y="96" width="34" height="114" fill="${BRAND.brown}"/>
    <rect x="58" y="116" width="28" height="94" fill="${BRAND.ink}"/>
    <rect x="90" y="84" width="38" height="126" fill="${BRAND.tan}"/>
    <rect x="132" y="126" width="24" height="84" fill="${BRAND.gold}"/>
    <g transform="translate(300,210)">
      <path d="M-46 0 L46 0 L36 -70 L-36 -70 Z" fill="#b9785a"/>
      <path d="M0 -70 C-10 -140 -70 -170 -96 -150 C-60 -140 -30 -110 0 -70Z" fill="#6f8f4a"/>
      <path d="M0 -70 C10 -150 60 -190 92 -168 C56 -150 26 -116 0 -70Z" fill="#82a35a"/>
      <path d="M0 -70 C-4 -160 -10 -210 6 -236 C18 -196 12 -130 0 -70Z" fill="#5f7f3f"/>
    </g>
  </g>
  <!-- framed brand print -->
  <g transform="translate(${printX},${left ? 150 : 170}) scale(${left ? 0.8 : 1})">
    <rect width="230" height="300" rx="6" fill="#fbf8f2" stroke="${BRAND.inkSoft}" stroke-width="10"/>
    ${logoSvg({ x: 30, y: 30, height: 170, part: 'mark' })}
    <rect x="40" y="232" width="150" height="14" rx="7" fill="${BRAND.brown}"/>
    <rect x="66" y="258" width="98" height="10" rx="5" fill="${BRAND.sand}"/>
  </g>`;
}

// --- Mira -------------------------------------------------------------------------------------
// An illustrated, clearly fictional character (not based on a real person): an agency presenter
// in her early thirties, dark brown side-parted lob, brown blazer over a cream top. Coordinates
// below are in figure units: the body origin is the bottom centre, the head centre (eye line)
// sits at (0, -500) and the face is about 194 units wide.

const SKIN = { base: '#f0c39f', light: '#f6d4b6', shade: '#e0a580', deep: '#c8876a', neck: '#e3aa86' };
const HAIR = { base: '#3b261e', dark: '#2a1a15', mid: '#563628', light: '#8c5c40' };
const LIP = { upper: '#ad5049', lower: '#c46a62', line: '#7a2e2c', inner: '#45191b', tongue: '#c25d5a', teeth: '#fbf6ee' };
const EYE = { white: '#fbf7f1', iris: '#7a4f33', irisDark: '#3b2418', pupil: '#1c110c' };

/** Deterministic PRNG (mulberry32), so blinks and glances are the same on every render. */
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
const hashText = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** Per-voice schedule of blinks and glances, seeded by the script so every clip differs. */
const LIFE = new WeakMap();
function life(voice) {
  let l = LIFE.get(voice);
  if (l) return l;
  const r = rng(hashText(voice.words.map(w => w.word).join(' ')));
  const end = voice.duration + 2;
  const blinks = [];
  for (let t = 0.5 + r() * 1.2; t < end; t += 1.9 + r() * 3.4) {
    blinks.push(t);
    if (r() < 0.18) blinks.push(t + 0.3); // an occasional double blink
  }
  const glances = [{ t: -1, x: 0, y: 0 }];
  for (let t = 0.3 + r(); t < end; t += 0.45 + r() * 1.9) {
    // Mostly at the lens, sometimes a small look aside.
    const aside = r() < 0.25;
    glances.push({ t, x: (r() - 0.5) * (aside ? 9 : 3.5), y: (r() - 0.5) * (aside ? 4 : 2) });
  }
  l = { blinks, glances, phones: voice.visemes?.phones ?? [], emphasis: voice.visemes?.emphasis ?? [] };
  LIFE.set(voice, l);
  return l;
}

/** 0 open .. 1 closed: lids close in 60 ms and reopen in 110 ms. */
function blinkAt(t, l) {
  let v = 0;
  for (const b of l.blinks) {
    const d = t - b;
    if (d >= 0 && d < 0.06) v = Math.max(v, smooth(d / 0.06));
    else if (d >= 0.06 && d < 0.17) v = Math.max(v, 1 - smooth((d - 0.06) / 0.11));
  }
  return v;
}

/** Gaze offset in iris units: quick 60 ms saccades between seeded fixations. */
function gazeAt(t, l) {
  let i = 0;
  while (i + 1 < l.glances.length && l.glances[i + 1].t <= t) i++;
  const g = l.glances[i];
  const p = l.glances[Math.max(0, i - 1)];
  const k = smooth((t - g.t) / 0.06);
  return { x: p.x + (g.x - p.x) * k, y: p.y + (g.y - p.y) * k };
}

/** Emphasis 0..1 around loud stressed syllables: rises 100 ms before, decays over ~300 ms. */
function emphasisAt(t, l) {
  let v = 0;
  for (const [at, s] of l.emphasis) {
    const d = t - at;
    if (d < -0.12 || d > 1) continue;
    v = Math.max(v, s * (d < 0 ? smooth((d + 0.12) / 0.12) : Math.exp(-d / 0.28)));
  }
  return v;
}

/**
 * Mouth shapes (visemes, see tools/voice/visemes.py): open = jaw, wide = lip spread, round =
 * pucker, up/low = upper/lower teeth showing, tongue = tip raised, press = lips pressed, tuck =
 * lower lip under the upper teeth.
 */
export const SHAPES = {
  rest: { open: 0, wide: 0.45, round: 0, up: 0, low: 0, tongue: 0, press: 0.2, tuck: 0 },
  MBP: { open: 0, wide: 0.4, round: 0.1, up: 0, low: 0, tongue: 0, press: 1, tuck: 0 },
  FV: { open: 0.14, wide: 0.55, round: 0, up: 1, low: 0, tongue: 0, press: 0, tuck: 1 },
  L: { open: 0.45, wide: 0.55, round: 0, up: 0.8, low: 0.2, tongue: 1, press: 0, tuck: 0 },
  S: { open: 0.17, wide: 0.78, round: 0, up: 1, low: 0.9, tongue: 0, press: 0, tuck: 0 },
  AA: { open: 1, wide: 0.62, round: 0, up: 0.55, low: 0.1, tongue: 0.15, press: 0, tuck: 0 },
  E: { open: 0.62, wide: 0.88, round: 0, up: 0.85, low: 0.35, tongue: 0.1, press: 0, tuck: 0 },
  I: { open: 0.34, wide: 1, round: 0, up: 1, low: 0.6, tongue: 0, press: 0, tuck: 0 },
  O: { open: 0.74, wide: 0.12, round: 0.85, up: 0.3, low: 0, tongue: 0.1, press: 0, tuck: 0 },
  U: { open: 0.3, wide: 0, round: 1, up: 0.15, low: 0, tongue: 0, press: 0, tuck: 0 },
};
const mix = (a, b, k) => Object.fromEntries(Object.keys(a).map(n => [n, a[n] + (b[n] - a[n]) * k]));

/**
 * Lip shape at time t from the phoneme timing (voice.visemes.phones): the current phoneme's shape,
 * blended with its neighbours over up to 40 ms at each boundary (co-articulation), read 30 ms
 * ahead because lips move before the sound. Gaps between words relax towards rest. The jaw then
 * scales with the loudness envelope (voice.mouth.open), so stressed vowels open wider.
 */
export function visemeAt(t, voice) {
  const l = life(voice);
  const ph = l.phones;
  const tt = t + 0.03;
  const shapeOf = i => (i < 0 || i >= ph.length ? SHAPES.rest : SHAPES[ph[i][3]]);
  let i = ph.findIndex(p => p[1] > tt);
  let m;
  if (i < 0 || ph[i][0] > tt) {
    // Between phonemes: hold the edges briefly, then relax to rest in long gaps.
    const a = i < 0 ? ph.length - 1 : i - 1;
    const b = i < 0 ? ph.length : i;
    const from = a >= 0 ? ph[a][1] : -1;
    const to = b < ph.length ? ph[b][0] : Infinity;
    const gap = to - from;
    if (gap < 0.12) m = mix(shapeOf(a), shapeOf(b), smooth((tt - from) / gap));
    else {
      const out = smooth((tt - from) / 0.09);
      const into = smooth((to - tt) / 0.09);
      m = mix(mix(shapeOf(a), SHAPES.rest, out), shapeOf(b), 1 - into);
    }
  } else {
    const [s, e] = ph[i];
    const r = Math.min(0.04, (e - s) * 0.45);
    m = SHAPES[ph[i][3]];
    // Ease in from the previous shape and out to the next; exactly 50/50 at each boundary.
    const prev = i > 0 && s - ph[i - 1][1] < 0.12 ? shapeOf(i - 1) : SHAPES.rest;
    const next = i + 1 < ph.length && ph[i + 1][0] - e < 0.12 ? shapeOf(i + 1) : SHAPES.rest;
    if (tt - s < r) m = mix(m, prev, 0.5 * (1 - (tt - s) / r));
    else if (e - tt < r) m = mix(m, next, 0.5 * (1 - (e - tt) / r));
  }
  const loud = mouthAt(t + 0.03, voice).open;
  return { ...m, open: m.open * (0.35 + 0.65 * clamp(loud / 0.75)) };
}

/** The lips, teeth and tongue for mouth state m, centred on (0, 0) in head units. */
function mouthSvg(m, id) {
  const hw = 23 + m.wide * 10 - m.round * 8 + m.open * 3 * (1 - m.round);
  const gap = m.open * 25 * (1 - m.press);
  const smile = 2.4 * (1 - m.round) * (1 - m.open * 0.4);
  const cy = -smile;
  const top = -gap * 0.26;
  const bottom = gap * 0.74 * (1 - m.tuck * 0.8) - m.tuck * 1;
  const kx = 0.55 + m.round * 0.35;
  // Control y so the curve's extreme lands at `y` (a cubic with both controls at c peaks at 0.75c + 0.25cy).
  const ctl = y => (y - 0.25 * cy) / 0.75;
  const tu = 6.6 - m.press * 1.6 + m.round * 2.4;
  const tl = 9.6 - m.press * 2 + m.round * 2.8 - m.tuck * 2.5;
  const inner = `M${-hw} ${cy} C${-hw * kx} ${ctl(top)} ${hw * kx} ${ctl(top)} ${hw} ${cy} C${hw * kx} ${ctl(bottom)} ${-hw * kx} ${ctl(bottom)} ${-hw} ${cy}Z`;
  const T = top - tu;
  const upper = `M${-hw - 1.5} ${cy} C${-hw * 0.78} ${cy - tu * 0.55} ${-hw * 0.5} ${T} ${-hw * 0.24} ${T}
    Q${-hw * 0.09} ${T} 0 ${T + 2.4} Q${hw * 0.09} ${T} ${hw * 0.24} ${T}
    C${hw * 0.5} ${T} ${hw * 0.78} ${cy - tu * 0.55} ${hw + 1.5} ${cy}
    C${hw * kx} ${ctl(top)} ${-hw * kx} ${ctl(top)} ${-hw - 1.5} ${cy}Z`;
  const B = bottom + tl;
  const lower = `M${-hw - 1.5} ${cy} C${-hw * kx} ${ctl(bottom)} ${hw * kx} ${ctl(bottom)} ${hw + 1.5} ${cy}
    C${hw * 0.72} ${ctl(B) + 1} ${-hw * 0.72} ${ctl(B) + 1} ${-hw - 1.5} ${cy}Z`;
  const teethUp = Math.min(3 + m.up * 6, gap * 0.38);
  return `
    <path d="M${-hw * 0.4} ${B + 3.5} Q0 ${B + 6.5} ${hw * 0.4} ${B + 3.5}" stroke="${SKIN.deep}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity="0.2"/>
    ${gap > 0.6 ? `<clipPath id="${id}-in"><path d="${inner}"/></clipPath>
    <path d="${inner}" fill="${LIP.inner}"/>
    <g clip-path="url(#${id}-in)">
      <ellipse cx="0" cy="${bottom + 4 - m.tongue * (gap * 0.55)}" rx="${hw * 0.62}" ry="${6 + gap * 0.25}" fill="${LIP.tongue}"/>
      <rect x="${-hw * 0.78}" y="${top - 4}" width="${hw * 1.56}" height="${4 + teethUp}" rx="2.5" fill="${LIP.teeth}" opacity="${0.35 + 0.65 * m.up}"/>
      <rect x="${-hw * 0.66}" y="${bottom - 3 - m.low * 4}" width="${hw * 1.32}" height="10" rx="2.5" fill="${LIP.teeth}" opacity="${m.low}"/>
    </g>` : ''}
    <path d="${lower}" fill="${LIP.lower}"/>
    <ellipse cx="${hw * 0.12}" cy="${bottom + tl * 0.42}" rx="${hw * 0.34}" ry="2" fill="#ffffff" opacity="0.28"/>
    ${m.tuck > 0.2 ? `<rect x="${-hw * 0.6}" y="${top - 2}" width="${hw * 1.2}" height="6.5" rx="2.5" fill="${LIP.teeth}" opacity="${clamp((m.tuck - 0.2) * 1.6)}"/>` : ''}
    <path d="${upper}" fill="${LIP.upper}"/>
    <path d="M${-hw - 1} ${cy} C${-hw * kx} ${ctl(top)} ${hw * kx} ${ctl(top)} ${hw + 1} ${cy}" stroke="${LIP.line}" stroke-width="${gap > 2 ? 1 : 2.2}" fill="none" stroke-linecap="round"/>
    <path d="M${-hw - 1} ${cy - 1} q-3.5 1 -4.5 4.5 M${hw + 1} ${cy - 1} q3.5 1 4.5 4.5" stroke="${SKIN.deep}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="${0.55 * smile / 2.4}"/>`;
}

/** One eye in eye units; `side` -1 is the viewer-left eye (outer corner to the left). */
function eyeSvg(side, blink, gaze, id) {
  const h = -16 + 23 * blink; // upper lid control
  const shape = `M-22 -1 C-14 ${h} 8 ${h - 1} 18 2 C10 9 -12 9 -22 -1Z`;
  const lid = `M-22 -1 C-14 ${h} 8 ${h - 1} 18 2`;
  const gx = side * -gaze.x; // the group is mirrored for side 1
  return `<g transform="scale(${-side},1)">
      <clipPath id="${id}"><path d="${shape}"/></clipPath>
      <path d="M-21 -9 C-12 ${h - 8} 6 ${h - 8} 15 -5" stroke="${SKIN.deep}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.45"/>
      <path d="${shape}" fill="${EYE.white}"/>
      ${blink < 0.85 ? `<g clip-path="url(#${id})">
        <circle cx="${-1 + gx}" cy="${1.5 + gaze.y}" r="10.5" fill="url(#mira-iris)"/>
        <circle cx="${-1 + gx}" cy="${1.5 + gaze.y}" r="4.8" fill="${EYE.pupil}"/>
        <circle cx="${-4.5 * side * -1 + gx - 1}" cy="${-2 + gaze.y}" r="2.7" fill="#ffffff"/>
        <circle cx="${2.5 + gx}" cy="${5 + gaze.y}" r="1.2" fill="#ffffff" opacity="0.7"/>
        <path d="${lid}" stroke="${SKIN.shade}" stroke-width="7" fill="none" opacity="0.35"/>
      </g>` : ''}
      <path d="M-20 1 C-11 9.5 9 9.5 17 3" stroke="${SKIN.deep}" stroke-width="1.3" fill="none" opacity="0.55"/>
      <path d="${lid}" stroke="${BRAND.ink}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <path d="M-22 -1 C-17 ${h * 0.55} -12 ${h * 0.75} -6 ${h * 0.82}" stroke="${BRAND.ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M-22 -1 C-25 -3 -27.5 -5.5 -29 -9 C-25.5 -7.5 -22.5 -6 -18.5 -5.5Z" fill="${BRAND.ink}" transform="translate(0,${blink * 5})"/>
    </g>`;
}

/** Eyebrow in eye units (viewer-left shape; mirrored for the other side), raised by `up`. */
function browSvg(side, up) {
  return `<g transform="scale(${-side},1) translate(0,${-30 - up})">
      <path d="M22 1 C14 -8 -6 -14 -18 -13 C-26 -12.5 -32 -9 -36 -4 C-27 -7.5 -15 -8 -4 -6 C6 -4.5 15 -1 22 5Z" fill="${HAIR.base}"/>
    </g>`;
}

/** The raised right hand (viewer's left): two fingers up when g is high, one when lower. */
function handSvg(g, shirt) {
  const wx = -175 + g * 20;
  const wy = 80 - g * 400;
  const two = g > 0.6 ? 1 : 0;
  return `
    <path d="M-262 160 L${wx} ${wy + 24}" stroke="${shirt}" stroke-width="74" stroke-linecap="round"/>
    <path d="M-262 160 L${wx} ${wy + 24}" stroke="#000000" stroke-width="74" stroke-linecap="round" opacity="0.12"/>
    <path d="M-236 160 L${wx + 22} ${wy + 30}" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity="0.06"/>
    <path d="M${wx - 1} ${wy + 22} L${wx} ${wy + 6}" stroke="${BRAND.cream}" stroke-width="56"/>
    <g transform="translate(${wx},${wy}) rotate(${-10 + g * 10}) scale(1.2)">
      <rect x="-21" y="-156" width="17" height="104" rx="8.5" fill="${SKIN.base}" opacity="${two}" transform="rotate(-5 -12 -60)"/>
      <path d="M-18 -128 l9 0" stroke="${SKIN.deep}" stroke-width="1.4" opacity="${0.5 * two}" transform="rotate(-5 -12 -60)"/>
      <rect x="-1" y="-150" width="17" height="98" rx="8.5" fill="${SKIN.light}" transform="rotate(4 8 -60)"/>
      <path d="M2 -122 l10 0" stroke="${SKIN.deep}" stroke-width="1.4" opacity="0.5" transform="rotate(4 8 -60)"/>
      <path d="M-26 6 C-32 -18 -33 -46 -29 -62 C-26 -72 26 -72 29 -62 C33 -46 31 -18 26 6Z" fill="${SKIN.base}"/>
      <path d="M-26 6 C-32 -18 -33 -46 -29 -62 C-28 -66 -24 -69 -18 -70 C-24 -50 -24 -20 -18 6Z" fill="${SKIN.shade}" opacity="0.5"/>
      ${two ? '' : `<rect x="-20" y="-82" width="20" height="26" rx="9" fill="${SKIN.base}" stroke="${SKIN.deep}" stroke-width="1.2" stroke-opacity="0.45"/>`}
      <rect x="-30" y="-74" width="24" height="20" rx="9" fill="${SKIN.base}" stroke="${SKIN.deep}" stroke-width="1.2" stroke-opacity="0.45"/>
      <rect x="-31" y="-58" width="21" height="18" rx="8.5" fill="${SKIN.base}" stroke="${SKIN.deep}" stroke-width="1.2" stroke-opacity="0.45"/>
      <path d="M24 -2 C36 -22 32 -46 14 -54 C2 -59 -10 -56 -14 -48 C-6 -42 4 -42 9 -36 C13 -28 12 -16 6 -6Z" fill="${SKIN.light}"/>
      <path d="M-14 -48 C-6 -42 4 -42 9 -36 C13 -28 12 -16 6 -6" stroke="${SKIN.deep}" stroke-width="1.6" fill="none" opacity="0.45"/>
      <path d="M-20 -24 C-10 -16 2 -14 12 -18" stroke="${SKIN.deep}" stroke-width="1.4" fill="none" opacity="0.3"/>
    </g>`;
}

// Hair shapes (head units). The part is on her left (viewer right); the long side sweeps across
// the forehead to the viewer's left, the short side is tucked behind the ear.
const HAIR_BACK = 'M0 -186 C82 -188 130 -132 132 -52 C134 18 136 96 152 142 C156 160 140 172 120 170 C100 168 84 160 70 152 Q0 118 -70 152 C-84 160 -100 168 -120 170 C-140 172 -156 160 -152 142 C-136 96 -134 18 -132 -52 C-130 -132 -82 -188 0 -186Z';
const HAIR_SWOOP = 'M36 -188 C-30 -196 -114 -164 -128 -82 C-138 -20 -140 84 -158 144 C-164 162 -150 176 -128 174 C-114 172 -104 166 -98 158 C-104 100 -102 30 -96 -22 C-92 -50 -84 -70 -66 -82 C-40 -96 -6 -106 18 -128 C26 -136 30 -146 32 -158Z';
const HAIR_TUCK = 'M28 -188 C82 -186 120 -152 126 -98 C128 -72 122 -48 112 -34 C106 -58 98 -84 86 -100 C72 -120 50 -140 32 -158Z';
const FACE = j => `M0 -150 C60 -150 98 -112 98 -40 C98 14 95 50 83 ${80 + j * 0.5} C68 ${112 + j * 0.8} 34 ${133 + j} 0 ${135 + j} C-34 ${133 + j} -68 ${112 + j * 0.8} -83 ${80 + j * 0.5} C-95 50 -98 14 -98 -40 C-98 -112 -60 -150 0 -150Z`;
const TORSO = 'M-48 -306 C-104 -294 -172 -282 -206 -262 C-234 -248 -248 -222 -252 -188 L-270 40 L270 40 L252 -188 C248 -222 234 -248 206 -262 C172 -282 104 -294 48 -306Z';
const NECK = 'M-33 -450 L33 -450 L35 -336 C37 -316 50 -305 70 -298 L-70 -298 C-50 -305 -37 -316 -35 -336Z';

const DEFS = `
    <linearGradient id="mira-skin" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0" stop-color="${SKIN.light}"/><stop offset="0.55" stop-color="${SKIN.base}"/><stop offset="1" stop-color="#e4ad89"/>
    </linearGradient>
    <linearGradient id="mira-neck" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d4977a"/><stop offset="0.55" stop-color="${SKIN.neck}"/><stop offset="1" stop-color="${SKIN.neck}"/>
    </linearGradient>
    <radialGradient id="mira-iris" cx="0.5" cy="0.45" r="0.55">
      <stop offset="0" stop-color="${EYE.iris}"/><stop offset="0.75" stop-color="#5a3825"/><stop offset="1" stop-color="${EYE.irisDark}"/>
    </radialGradient>
    <radialGradient id="mira-blush" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ea8f7c" stop-opacity="0.42"/><stop offset="1" stop-color="#ea8f7c" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mira-hair" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${HAIR.mid}"/><stop offset="0.45" stop-color="${HAIR.base}"/><stop offset="1" stop-color="${HAIR.dark}"/>
    </linearGradient>
    <filter id="mira-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>`;

/**
 * The presenter at time t. `cx` is the body centre, `scale` the figure size. `voice` comes from
 * loadVoice(); `gesture` 0..1 raises the right hand into view (counting on fingers, pointing).
 * `shadow` draws her soft drop shadow on the wall and `pin` colours her lapel pin (both changed on
 * a green screen, where a shadow would key badly and a green pin would key out). `pose` overrides the
 * computed state (mouth, blink, gaze, emphasis) for stills.
 */
export function presenterSvg({ t, cx, baseY = 1080, scale = 1, voice, gesture = 0, shirt = BRAND.brown, shadow = true, pin = BRAND.green, pose = {} }) {
  const l = life(voice);
  const filler = inFiller(t, voice);
  const m = pose.mouth ?? visemeAt(t, voice);
  const blink = pose.blink ?? blinkAt(t, l);
  const emph = pose.emphasis ?? emphasisAt(t, l);
  const look = pose.gaze ?? (filler ? { x: -4, y: -4 } : gazeAt(t, l));
  const talking = voice.words.some(w => t >= w.start - 0.3 && t <= w.end + 0.3);
  // Head: slow sway, a nod that follows stressed syllables, a tilt that drifts while talking.
  const sway = Math.sin(t * 0.9) * 3 + Math.sin(t * 2.3) * 1.2;
  const nod = emph * 5 + Math.sin(t * 1.7) * 1.5 + m.open * 2;
  const tilt = Math.sin(t * 0.6) * 2 + (talking ? Math.sin(t * 1.3 + 1) * 1.2 : 0) + (filler ? -3 : 0) - emph * 1.2;
  const brow = emph * 4 + (filler ? 4 : 0) + (talking ? 1 : 0);
  const breath = Math.sin(t * 1.35) * 0.5 + 0.5;
  const jaw = m.open * 25 * (1 - m.press) * 0.45;
  const g = smooth(gesture);
  const head = `translate(${sway},${-500 + nod}) rotate(${tilt})`;
  return `
  <g transform="translate(${cx},${baseY}) scale(${scale})">
    <defs>${DEFS}
      <clipPath id="mira-face"><path d="${FACE(jaw)}"/></clipPath>
      <clipPath id="mira-neck-clip"><path d="${NECK}"/></clipPath>
    </defs>
    ${shadow ? `<g transform="translate(22,14)" fill="#4a2f25" opacity="0.2" filter="url(#mira-soft)">
      <path d="${TORSO}"/><g transform="${head}"><path d="${HAIR_BACK}"/></g>
    </g>` : ''}
    <g transform="translate(0,${-breath * 2.5})">
      <!-- blazer -->
      <path d="${TORSO}" fill="${shirt}"/>
      <path d="${TORSO}" fill="#ffffff" opacity="0.07" transform="translate(-30,0) scale(0.75,1)"/>
      <path d="M-232 -196 C-236 -120 -240 -40 -246 40 M232 -196 C236 -120 240 -40 246 40" stroke="#000000" stroke-width="3" opacity="0.12" fill="none"/>
      <path d="M-74 -300 Q-50 -344 -24 -338 L24 -338 Q50 -344 74 -300Z" fill="${shirt}"/>
      <path d="M-74 -300 Q-50 -344 -24 -338 L24 -338 Q50 -344 74 -300Z" fill="#000000" opacity="0.22"/>
    </g>
    <g transform="${head}">
      <path d="${HAIR_BACK}" fill="${HAIR.dark}"/>
    </g>
    <!-- neck and chest -->
    <g transform="translate(0,${-breath * 2.5})">
      <path d="M-70 -300 L70 -300 L0 -96Z" fill="${SKIN.neck}"/>
      <path d="${NECK}" fill="url(#mira-neck)"/>
      <g clip-path="url(#mira-neck-clip)">
        <ellipse cx="${sway}" cy="${-500 + nod + 140 + jaw}" rx="52" ry="30" fill="#c9876a" opacity="0.4"/>
      </g>
      <path d="M-52 -262 Q0 -206 52 -262 L0 -96Z" fill="${BRAND.cream}"/>
      <path d="M-52 -262 Q0 -206 52 -262" stroke="#d9cbb8" stroke-width="3" fill="none"/>
      <!-- lapels, with a soft shadow under them -->
      <g opacity="0.25" transform="translate(4,6)"><path d="M-74 -301 L-106 -286 L-126 -214 L-106 -206 L-8 -92 L-60 -296Z M74 -301 L106 -286 L126 -214 L106 -206 L8 -92 L60 -296Z" fill="#000000"/></g>
      <path d="M-74 -301 L-106 -286 L-126 -214 L-106 -206 L-8 -92 L-60 -296Z" fill="${shirt}"/>
      <path d="M74 -301 L106 -286 L126 -214 L106 -206 L8 -92 L60 -296Z" fill="${shirt}"/>
      <path d="M-74 -301 L-106 -286 L-126 -214 L-106 -206 L-8 -92 L-60 -296Z" fill="#ffffff" opacity="0.08"/>
      <path d="M74 -301 L106 -286 L126 -214 L106 -206 L8 -92 L60 -296Z" fill="#000000" opacity="0.1"/>
      <path d="M-106 -206 L-8 -92 M106 -206 L8 -92" stroke="#000000" stroke-width="2.5" opacity="0.18"/>
      <circle cx="98" cy="-222" r="7" fill="${pin}"/>
      <circle cx="98" cy="-222" r="7" fill="none" stroke="${pin === BRAND.green ? '#5c8f1c' : '#000000'}" stroke-opacity="${pin === BRAND.green ? 1 : 0.3}" stroke-width="2"/>
    </g>
    <!-- head -->
    <g transform="${head}">
      <path d="M90 -18 C104 -28 116 -8 112 14 C108 34 98 42 88 36Z" fill="${SKIN.shade}"/>
      <path d="M95 -6 C104 -10 108 4 104 18" stroke="${SKIN.deep}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.6"/>
      <circle cx="101" cy="44" r="4.5" fill="${BRAND.gold}"/>
      <path d="M101 48 L101 58" stroke="${BRAND.gold}" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="101" cy="62" r="4" fill="${BRAND.gold}"/>
      <path d="${FACE(jaw)}" fill="url(#mira-skin)"/>
      <g clip-path="url(#mira-face)">
        <path d="${HAIR_SWOOP}" fill="#c58063" opacity="0.5" transform="translate(5,9)"/>
        <path d="${HAIR_TUCK}" fill="#c58063" opacity="0.4" transform="translate(-4,8)"/>
      </g>
      <ellipse cx="-54" cy="44" rx="28" ry="17" fill="url(#mira-blush)"/>
      <ellipse cx="54" cy="44" rx="28" ry="17" fill="url(#mira-blush)"/>
      <!-- brows and eyes -->
      <g transform="translate(-40,-6) scale(1.16)">${browSvg(-1, brow)}${eyeSvg(-1, blink, look, 'mira-eye-l')}</g>
      <g transform="translate(40,-6) scale(1.16)">${browSvg(1, brow * 0.9)}${eyeSvg(1, blink, look, 'mira-eye-r')}</g>
      <!-- nose -->
      <path d="M7 -8 C9 12 12 28 15 37" stroke="${SKIN.shade}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.6"/>
      <path d="M-9 43 C-5 48 6 49 13 41" stroke="${SKIN.deep}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="0" cy="35" r="5" fill="${SKIN.light}" opacity="0.7"/>
      <!-- mouth -->
      <g transform="translate(0,${84 + jaw * 0.25})">${mouthSvg(m, 'mira-mouth')}</g>
      <!-- hair over the face -->
      <path d="${HAIR_SWOOP}" fill="url(#mira-hair)"/>
      <path d="${HAIR_TUCK}" fill="url(#mira-hair)"/>
      <path d="M22 -180 C-42 -182 -102 -150 -118 -90 C-98 -134 -46 -164 18 -166Z" fill="${HAIR.light}" opacity="0.45"/>
      <path d="M8 -150 C-36 -140 -70 -116 -84 -84 C-62 -110 -30 -128 8 -138Z" fill="${HAIR.mid}" opacity="0.7"/>
      <path d="M-122 -50 C-128 10 -128 90 -146 150 C-130 92 -118 12 -112 -50Z" fill="${HAIR.light}" opacity="0.18"/>
      <path d="M-104 -40 C-108 20 -106 90 -114 150 C-102 92 -98 22 -98 -36Z" fill="${HAIR.dark}" opacity="0.3"/>
      <path d="M56 -180 C90 -172 112 -146 118 -110 C104 -140 84 -160 54 -170Z" fill="${HAIR.light}" opacity="0.4"/>
      <path d="M34 -158 C30 -170 30 -180 36 -188" stroke="${HAIR.dark}" stroke-width="2.5" fill="none" opacity="0.7"/>
    </g>
    ${g > 0.01 ? handSvg(g, shirt) : ''}
  </g>`;
}

/** Slow handheld-like camera drift: a translate + scale applied to the whole frame. */
export function cameraTransform(t, W, H, amount = 1) {
  const dx = (Math.sin(t * 0.31) * 7 + Math.sin(t * 0.83 + 1) * 3) * amount;
  const dy = (Math.sin(t * 0.27 + 2) * 5 + Math.sin(t * 0.71) * 2) * amount;
  const s = 1.03 + Math.sin(t * 0.13) * 0.008 * amount;
  return `translate(${W / 2 + dx},${H / 2 + dy}) scale(${s}) translate(${-W / 2},${-H / 2})`;
}
