/**
 * Synthetic presenter (copied from showcase/s10-interview-speaker-card/presenter.mjs, kept here so
 * this project stays self-contained): Mira, a stylised speaker in a small studio room, drawn as
 * SVG frames. Her voice is committed audio (voice/mira.wav, AI-generated with Qwen3-TTS
 * VoiceDesign, a designed voice not based on a real person) and her lips follow that audio:
 * voice/mira.json carries an open/wide mouth track per video frame computed from the waveform.
 * Everything here is deterministic: the same voice files always produce the same frames.
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
 * voice/mira.json (word times, and a mouth track per video frame computed from the audio).
 * Both are written by tools/voice/generate_mira.py; recipes never need the TTS model.
 */
export function loadVoice(dir = HERE) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'mira.json'), 'utf8'));
  return { ...meta, wav: path.join(dir, 'voice', 'mira.wav') };
}

/** Lip shape at time t, from the audio: `open` 0..1 (jaw) and `wide` 0..1 (ee wide, oo rounded). */
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

/**
 * The presenter at time t. `cx` is the body centre, `scale` the figure size.
 * `voice` comes from loadVoice(); `gesture` 0..1 raises the right hand into view (counting on
 * fingers, pointing).
 */
export function presenterSvg({ t, cx, baseY = 1080, scale = 1, voice, gesture = 0, shirt = BRAND.brown }) {
  const { open, wide } = mouthAt(t, voice);
  const filler = inFiller(t, voice);
  const talking = voice.words.some(w => t >= w.start - 0.2 && t <= w.end + 0.2);
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
  // Wide vowels (ee) stretch the lips, rounded ones (oo) pull them in.
  const mouthW = 40 - open * 8 + (wide - 0.5) * 16;
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
