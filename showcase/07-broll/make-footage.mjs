/**
 * Generates the synthetic talking-head source for showcase 07: work/source.mp4
 * (1920x1080, 30 fps, 15 s). The presenter stands on the left third of a warm studio so the
 * right side is free for B-roll panels, with burned-in captions under her.
 *
 * Mouth, voice-like tone track and captions all follow work/transcript.json, which
 * `mgvideo broll words captions.srt` writes first, so the B-roll plan and the footage share
 * one set of word times.
 *
 * Usage (from this folder, after broll words): node make-footage.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND, cameraTransform, esc, fontEnv, presenterSvg, rasterize, roomSvg, smooth, synthVoice, syllables, writeWav,
} from './presenter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const FRAMES = path.join(WORK, 'source-frames');
const W = 1920;
const H = 1080;
const FPS = 30;
const DURATION = 15;
const CX = 520;

const words = JSON.parse(fs.readFileSync(path.join(WORK, 'transcript.json'), 'utf8')).words;
const sylls = syllables(words, 21);

// Caption chunks: at most 26 characters, never across a cue boundary (a gap of 0.25 s or more).
const chunks = [];
let cur = [];
for (const w of words) {
  const len = [...cur, w].map(x => x.word).join(' ').length;
  const gap = cur.length && w.start_ms - cur.at(-1).end_ms >= 250;
  if (cur.length && (len > 26 || gap)) { chunks.push(cur); cur = []; }
  cur.push(w);
}
if (cur.length) chunks.push(cur);

function captionSvg(t) {
  const c = chunks.find((k, i) => t >= k[0].start_ms / 1000 - 0.05 && t < (chunks[i + 1] ? Math.min(chunks[i + 1][0].start_ms / 1000 - 0.05, k.at(-1).end_ms / 1000 + 0.4) : k.at(-1).end_ms / 1000 + 0.4));
  if (!c) return '';
  const text = c.map(w => w.word).join(' ');
  const w = text.length * 46 * 0.6 + 70;
  return `<rect x="${CX - w / 2}" y="912" width="${w}" height="78" rx="18" fill="${BRAND.ink}" fill-opacity="0.82"/>
  <text x="${CX}" y="966" font-family="Geist" font-size="46" font-weight="600" fill="#ffffff" text-anchor="middle">${esc(text)}</text>`;
}

// Hand gestures on "whole funnel" and "every new lead", kept on her side of the frame.
const at = w => words.findIndex(x => x.word.toLowerCase().startsWith(w));
const windows = [[at('whole'), at('funnel')], [at('every'), at('lead')]]
  .map(([a, b]) => [words[a].start_ms / 1000 - 0.2, words[b].end_ms / 1000 + 0.4]);
const gesture = t => Math.max(0, ...windows.map(([a, b]) => Math.min(smooth((t - a) / 0.35), smooth((b - t) / 0.4))));

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const env = fontEnv(WORK);
const room = roomSvg(W, H, 'left');
const svgFile = path.join(FRAMES, 'frame.svg');
const frames = DURATION * FPS;
for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  fs.writeFileSync(svgFile, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="${cameraTransform(t, W, H)}">${room}
  ${presenterSvg({ t, cx: CX, baseY: H + 60, scale: 1.25, sylls, gesture: gesture(t), shirt: BRAND.brown })}
  </g>${captionSvg(t)}</svg>`);
  rasterize(svgFile, path.join(FRAMES, `${String(f).padStart(5, '0')}.png`), env);
}
fs.rmSync(svgFile);

writeWav(path.join(WORK, 'voice.wav'), synthVoice(sylls, DURATION));
execFileSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.png'),
  '-i', path.join(WORK, 'voice.wav'),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
  '-t', String(DURATION), path.join(WORK, 'source.mp4'),
]);
console.log(`source: ${frames} frames, ${DURATION} s -> work/source.mp4 (${chunks.length} caption chunks)`);
