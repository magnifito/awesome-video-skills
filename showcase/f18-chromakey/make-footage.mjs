/**
 * Generates the inputs for showcase f18 (all under work/):
 *   - greenscreen.mp4  1920x1080, 30 fps, 8 s: the synthetic presenter (presenter.mjs) in front
 *                      of a green screen with soft, uneven studio lighting, plus a voice-like
 *                      tone track. Nothing is said; the line below only drives mouth and rhythm.
 *   - set.png          the Magnifito-branded background plate she is keyed onto: a cream set
 *                      wall with a dot grid, the real Magnifito logo and a wooden floor strip.
 *
 * Deterministic: the same run always produces the same frames and samples.
 *
 * Usage (from this folder): node make-footage.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND, cameraTransform, fontEnv, logoSvg, presenterSvg, rasterize, synthVoice, syllables, writeWav,
} from './presenter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const FRAMES = path.join(WORK, 'greenscreen-frames');
const W = 1920;
const H = 1080;
const FPS = 30;
const DURATION = 8;

// Word timings for a made-up line, spaced like relaxed speech.
const LINE = 'Hi, I am Mira. Today we shot this in front of a green screen, and the set behind me was added afterwards.';
const words = [];
let ms = 400;
for (const word of LINE.split(' ')) {
  const len = 140 + word.replace(/[^a-z]/gi, '').length * 55;
  if (ms + len > DURATION * 1000 - 400) break;
  words.push({ word, start_ms: ms, end_ms: ms + len });
  ms += len + (/[.,]$/.test(word) ? 380 : 70);
}
const sylls = syllables(words, 9);

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const env = fontEnv(WORK);

// Green screen: a flat chroma green with a soft hot spot and darker corners, like a lit cloth.
// Its average is about 0x22B33A; mgvideo chromakey keys it with the default 0x00FF00 key.
const screen = `
  <defs>
    <radialGradient id="cloth" cx="0.5" cy="0.4" r="0.75">
      <stop offset="0" stop-color="#29bd41"/><stop offset="1" stop-color="#1ea834"/>
    </radialGradient>
  </defs>
  <rect x="-200" y="-200" width="${W + 400}" height="${H + 400}" fill="url(#cloth)"/>`;

const svgFile = path.join(FRAMES, 'frame.svg');
const frames = DURATION * FPS;
for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  fs.writeFileSync(svgFile, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="${cameraTransform(t, W, H)}">${screen}
  ${presenterSvg({ t, cx: W / 2, baseY: H + 60, scale: 1.25, sylls })}
  </g></svg>`);
  rasterize(svgFile, path.join(FRAMES, `${String(f).padStart(5, '0')}.png`), env);
}

// The branded set: cream wall, dot grid, logo on the right, a wooden floor strip.
const dots = [];
for (let y = 30; y < 860; y += 44) for (let x = 30; x < W; x += 44) dots.push(`<circle cx="${x}" cy="${y}" r="2.2"/>`);
fs.writeFileSync(svgFile, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6f1e8"/><stop offset="1" stop-color="${BRAND.sand}"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2d3c0"/><stop offset="1" stop-color="${BRAND.sand}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <g fill="${BRAND.tan}" opacity="0.35">${dots.join('')}</g>
  <rect x="1240" y="150" width="600" height="250" rx="24" fill="${BRAND.cream}" stroke="${BRAND.sand}" stroke-width="4"/>
  ${logoSvg({ x: 1290, y: 225, height: 100 })}
  <rect x="80" y="170" width="300" height="12" rx="6" fill="${BRAND.green}"/>
  <rect x="80" y="200" width="220" height="12" rx="6" fill="${BRAND.tan}" opacity="0.6"/>
  <rect y="860" width="${W}" height="${H - 860}" fill="url(#floor)"/>
  <rect y="860" width="${W}" height="8" fill="${BRAND.ink}" opacity="0.25"/>
</svg>`);
rasterize(svgFile, path.join(WORK, 'set.png'), env);
fs.rmSync(svgFile);

writeWav(path.join(WORK, 'voice.wav'), synthVoice(sylls, DURATION));
execFileSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.png'),
  '-i', path.join(WORK, 'voice.wav'),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
  '-t', String(DURATION), path.join(WORK, 'greenscreen.mp4'),
]);
fs.rmSync(FRAMES, { recursive: true, force: true });
console.log(`green screen: ${frames} frames, ${DURATION} s -> work/greenscreen.mp4, set -> work/set.png`);
