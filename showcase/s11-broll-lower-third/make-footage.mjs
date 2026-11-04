/**
 * Generates synthetic talking-head footage for the style-gallery overlay clips:
 * work/source.mp4 (1920x1080, 30 fps) with a voice-like tone track. The presenter, the room and
 * the voice come from presenter.mjs (the same file as showcase/07-broll/presenter.mjs); the
 * spoken line below only drives her mouth and the tone rhythm, nothing is said.
 *
 * Deterministic: the same arguments always produce the same frames and samples.
 *
 * Usage (from this folder): node make-footage.mjs <seconds> <presenter-centre-x> [center|left]
 *   presenter-centre-x  where she stands, in px of the 1920 wide frame, so the overlay has room
 *   center|left         room layout: `left` hides the shelf, `center` shows it
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cameraTransform, fontEnv, presenterSvg, rasterize, roomSvg, synthVoice, syllables, writeWav } from './presenter.mjs';

const [secondsArg, cxArg, layout = 'center'] = process.argv.slice(2);
const DURATION = Number(secondsArg);
const CX = Number(cxArg);
if (!(DURATION > 0) || !Number.isFinite(CX) || !['center', 'left'].includes(layout)) {
  console.error('Usage: node make-footage.mjs <seconds> <presenter-centre-x> [center|left]');
  process.exit(2);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const FRAMES = path.join(WORK, 'source-frames');
const W = 1920;
const H = 1080;
const FPS = 30;

// Word timings for a made-up line, spaced like relaxed speech: 0.11 s per letter plus a gap,
// a longer pause after each comma or full stop. Repeats until the clip is filled.
const LINE = 'We plan every post a month ahead, so the brand sounds like one voice. Then we look at what worked and do more of it.';
const words = [];
let ms = 400;
while (ms < DURATION * 1000 - 600) {
  for (const word of LINE.split(' ')) {
    const len = 140 + word.replace(/[^a-z]/gi, '').length * 55;
    if (ms + len > DURATION * 1000 - 400) break;
    words.push({ word, start_ms: ms, end_ms: ms + len });
    ms += len + (/[.,]$/.test(word) ? 380 : 70);
  }
  ms += 600;
}
const sylls = syllables(words, 5);

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const env = fontEnv(WORK);
const room = roomSvg(W, H, layout);
const svgFile = path.join(FRAMES, 'frame.svg');
const frames = Math.round(DURATION * FPS);
for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  fs.writeFileSync(svgFile, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="${cameraTransform(t, W, H)}">${room}
  ${presenterSvg({ t, cx: CX, baseY: H + 60, scale: 1.25, sylls })}
  </g></svg>`);
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
fs.rmSync(FRAMES, { recursive: true, force: true });
console.log(`source: ${frames} frames, ${DURATION} s, presenter at x=${CX} -> work/source.mp4`);
