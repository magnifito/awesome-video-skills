/**
 * Synthetic presenter: a stylised speaker in a small studio room, drawn as SVG frames, plus a
 * voice-like tone track that follows the transcript. Everything is deterministic: the same
 * transcript always produces the same frames and samples.
 *
 * There is no speech here. The "voice" is a pitched harmonic tone per syllable, shaped like
 * speech rhythm, so the mouth, the audio and the captions line up and cuts are audible.
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

/** Small seeded PRNG (mulberry32) so every run draws the same noise. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = t => { const x = clamp(t); return x * x * (3 - 2 * x); };
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FILLERS = new Set(['um', 'uh', 'erm', 'hmm']);
export const isFiller = w => FILLERS.has(w.toLowerCase().replace(/[^a-z]/g, ''));

/**
 * Splits transcript words into syllables with start/end in seconds. Each syllable carries
 * a pitch and a vowel colour so the tone track sounds like speech rhythm, not a beep.
 */
export function syllables(words, seed = 7) {
  const rand = rng(seed);
  const out = [];
  for (const w of words) {
    const s = w.start_ms / 1000;
    const e = w.end_ms / 1000;
    const clean = w.word.toLowerCase().replace(/[^a-z']/g, '');
    const filler = isFiller(clean);
    const n = filler ? 1 : Math.max(1, (clean.match(/[aeiouy]+/g) ?? []).length - (/[^aeiou]e$/.test(clean) && clean.length > 3 ? 1 : 0));
    const end = /[.,!?]$/.test(w.word);
    for (let i = 0; i < n; i++) {
      const a = s + ((e - s) * i) / n;
      const b = s + ((e - s) * (i + 1)) / n;
      out.push({
        start: a,
        end: b,
        filler,
        // Lips stay almost closed on "um"; "uh" is a lazy half-open vowel.
        open: filler ? (clean.startsWith('u') && clean.endsWith('m') ? 0.12 : 0.45) : 0.65 + rand() * 0.35,
        f0: filler ? 150 : 185 + rand() * 40 - (end && i === n - 1 ? 30 : 0),
        formant: filler ? 380 : 550 + rand() * 650,
      });
    }
  }
  return out;
}

/** Mouth opening 0..1 at time t. */
export function mouthOpen(t, sylls) {
  for (const s of sylls) {
    if (t < s.start - 0.03 || t > s.end + 0.03) continue;
    const ph = clamp((t - s.start) / Math.max(0.04, s.end - s.start));
    return s.filler ? s.open * (0.6 + 0.4 * Math.sin(Math.PI * ph)) : s.open * Math.pow(Math.sin(Math.PI * ph), 0.7);
  }
  return 0;
}

/** True while the speaker is producing a filler sound (eyes drift up, as people do). */
export function inFiller(t, sylls) {
  return sylls.some(s => s.filler && t >= s.start - 0.15 && t <= s.end + 0.2);
}

/** Voice-like tone track: harmonics of f0 shaped by one moving formant, plus room tone. */
export function synthVoice(sylls, duration, rate = 48000, seed = 11) {
  const n = Math.ceil(duration * rate);
  const out = new Float32Array(n);
  const rand = rng(seed);
  for (let i = 0; i < n; i++) out[i] = (rand() * 2 - 1) * 0.0015;
  for (const s of sylls) {
    const i0 = Math.max(0, Math.floor(s.start * rate));
    const i1 = Math.min(n, Math.ceil(s.end * rate));
    const len = Math.max(1, i1 - i0);
    let phase = 0;
    for (let i = i0; i < i1; i++) {
      const p = (i - i0) / len;
      const t = (i - i0) / rate;
      const env = Math.min(1, t / 0.018) * Math.min(1, (i1 - i) / rate / 0.05) * (s.filler ? 0.8 : 1);
      const f0 = s.f0 * (1 + 0.04 * Math.sin(Math.PI * p) - 0.03 * p);
      phase += (2 * Math.PI * f0) / rate;
      let v = 0;
      for (let k = 1; k <= 14; k++) {
        const fk = f0 * k;
        const w = 1 / (1 + Math.pow((fk - s.formant) / 260, 2)) + 0.35 / k;
        v += Math.sin(phase * k) * w;
      }
      // A short noise burst at the onset reads as a consonant.
      const burst = !s.filler && t < 0.025 ? (rand() * 2 - 1) * 0.5 * (1 - t / 0.025) : 0;
      out[i] += (v * 0.07 + burst * 0.15) * env;
    }
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

/** Writes 16-bit mono PCM WAV. */
export function writeWav(file, samples, rate = 48000) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(clamp(samples[i], -1, 1) * 32767), 44 + i * 2);
  fs.writeFileSync(file, buf);
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

/**
 * The presenter at time t. `cx` is the body centre, `scale` the figure size.
 * `gesture` 0..1 raises the right hand into view (counting on fingers, pointing).
 */
export function presenterSvg({ t, cx, baseY = 1080, scale = 1, sylls, gesture = 0, shirt = BRAND.brown }) {
  const open = mouthOpen(t, sylls);
  const filler = inFiller(t, sylls);
  const talking = sylls.some(s => t >= s.start - 0.2 && t <= s.end + 0.2);
  // Head sway and a small nod that follows the voice.
  const sway = Math.sin(t * 0.9) * 3 + Math.sin(t * 2.3) * 1.5;
  const nod = open * 5 + Math.sin(t * 1.7) * 2;
  const tilt = Math.sin(t * 0.6) * 2.2 + (filler ? -3 : 0);
  // Blinks roughly every 3.4 s, 120 ms long.
  const bp = (t + 0.7) % 3.4;
  const blink = bp < 0.12 ? Math.sin((bp / 0.12) * Math.PI) : 0;
  const lookX = filler ? -6 : Math.sin(t * 0.37) * 2;
  const lookY = filler ? -7 : 0;
  const brow = talking ? open * 4 : 0;
  const mouthH = 3 + open * 30;
  const mouthW = 40 - open * 8;
  const g = smooth(gesture);
  const handX = 175 - g * 20;
  const handY = 80 - g * 400;
  return `
  <g transform="translate(${cx},${baseY}) scale(${scale})">
    <!-- torso -->
    <path d="M-290 0 C-290 -150 -250 -250 -130 -282 L-48 -300 L48 -300 L130 -282 C250 -250 290 -150 290 0 Z" fill="${shirt}"/>
    <path d="M-48 -300 L0 -220 L48 -300 Z" fill="#f0c4a2"/>
    <path d="M-60 -300 L0 -205 L-22 -300 Z M60 -300 L0 -205 L22 -300 Z" fill="${BRAND.ink}" opacity="0.35"/>
    <!-- neck -->
    <path d="M-44 -430 L44 -430 L48 -296 L0 -232 L-48 -296 Z" fill="#e9b48f"/>
    <!-- raised right hand (viewer's left) -->
    ${g > 0.01 ? `
    <path d="M-250 90 L${-handX} ${handY}" fill="none" stroke="${shirt}" stroke-width="66" stroke-linecap="round"/>
    <path d="M-250 90 L${-handX} ${handY}" fill="none" stroke="#000000" stroke-width="66" stroke-linecap="round" opacity="0.12"/>
    <g transform="translate(${-handX},${handY - 26}) rotate(${-12 + g * 12})">
      <rect x="-34" y="-30" width="68" height="64" rx="26" fill="#f0bb96"/>
      <rect x="-28" y="-74" width="17" height="52" rx="8.5" fill="#f0bb96"/>
      <rect x="-8" y="-82" width="17" height="58" rx="8.5" fill="#f0bb96" opacity="${g > 0.6 ? 1 : 0}"/>
      <rect x="20" y="-16" width="32" height="17" rx="8.5" fill="#f0bb96" transform="rotate(-30 20 -8)"/>
    </g>` : ''}
    <!-- head -->
    <g transform="translate(${sway},${-500 + nod}) rotate(${tilt})">
      <ellipse cx="-104" cy="10" rx="18" ry="30" fill="#e3a984"/>
      <ellipse cx="104" cy="10" rx="18" ry="30" fill="#e3a984"/>
      <path d="M-108 -30 C-112 -170 112 -170 108 -30 L104 70 C90 140 -90 140 -104 70 Z" fill="#f0bb96"/>
      <!-- hair: a bob with a side part -->
      <path d="M-126 60 C-150 -110 -80 -175 10 -172 C110 -168 156 -96 128 60 L110 70 C118 -10 100 -70 60 -92 C10 -60 -60 -60 -100 -84 C-118 -40 -112 10 -108 70 Z" fill="#3a2418"/>
      <!-- brows -->
      <path d="M-70 ${-46 - brow} Q-46 ${-58 - brow} -22 ${-48 - brow}" stroke="#3a2418" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M22 ${-48 - brow} Q46 ${-58 - brow} 70 ${-46 - brow}" stroke="#3a2418" stroke-width="9" fill="none" stroke-linecap="round"/>
      <!-- eyes -->
      <g transform="translate(0,-14)">
        <ellipse cx="-46" cy="0" rx="20" ry="${Math.max(1.5, 14 * (1 - blink))}" fill="#ffffff"/>
        <ellipse cx="46" cy="0" rx="20" ry="${Math.max(1.5, 14 * (1 - blink))}" fill="#ffffff"/>
        ${blink < 0.7 ? `<circle cx="${-46 + lookX}" cy="${lookY}" r="9" fill="#2b1d16"/><circle cx="${46 + lookX}" cy="${lookY}" r="9" fill="#2b1d16"/>` : ''}
      </g>
      <!-- nose -->
      <path d="M0 0 Q-12 34 -4 44 Q4 48 12 42" stroke="#d3946f" stroke-width="6" fill="none" stroke-linecap="round"/>
      <!-- mouth -->
      <g transform="translate(0,80)">
        <ellipse cx="0" cy="0" rx="${mouthW}" ry="${mouthH / 2 + 2}" fill="#7a2f2f"/>
        ${open > 0.3 ? `<rect x="${-mouthW * 0.6}" y="${-mouthH / 2}" width="${mouthW * 1.2}" height="${Math.min(8, mouthH * 0.25)}" rx="3" fill="#fff"/>` : ''}
        <path d="M${-mouthW - 2} 0 Q0 ${mouthH / 2 + 10} ${mouthW + 2} 0" stroke="#b95a54" stroke-width="5" fill="none" opacity="${open < 0.2 ? 1 : 0}"/>
      </g>
      <ellipse cx="-72" cy="48" rx="20" ry="11" fill="#ec9b86" opacity="0.45"/>
      <ellipse cx="72" cy="48" rx="20" ry="11" fill="#ec9b86" opacity="0.45"/>
    </g>
  </g>`;
}

/** Slow handheld-like camera drift: a translate + scale applied to the whole frame. */
export function cameraTransform(t, W, H, amount = 1) {
  const dx = (Math.sin(t * 0.31) * 7 + Math.sin(t * 0.83 + 1) * 3) * amount;
  const dy = (Math.sin(t * 0.27 + 2) * 5 + Math.sin(t * 0.71) * 2) * amount;
  const s = 1.03 + Math.sin(t * 0.13) * 0.008 * amount;
  return `translate(${W / 2 + dx},${H / 2 + dy}) scale(${s}) translate(${-W / 2},${-H / 2})`;
}
