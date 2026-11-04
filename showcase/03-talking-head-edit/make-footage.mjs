/**
 * Generates the synthetic raw take for showcase 03: work/raw.mp4 (1920x1080, 30 fps) with a
 * voice-like tone track. The presenter's mouth, the tone track and the fillers all follow
 * transcript.json, so the raw take has real "um"s and pauses for the EDL to cut.
 *
 * Usage (from this folder): node make-footage.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cameraTransform, fontEnv, presenterSvg, rasterize, roomSvg, smooth, synthVoice, syllables, writeWav,
} from './presenter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const FRAMES = path.join(WORK, 'raw-frames');
const W = 1920;
const H = 1080;
const FPS = 30;

const transcript = JSON.parse(fs.readFileSync(path.join(HERE, 'transcript.json'), 'utf8'));
const edl = JSON.parse(fs.readFileSync(path.join(HERE, 'edl.json'), 'utf8'));
const duration = edl.source_duration_us / 1e6;
const frames = Math.round(duration * FPS);
const words = transcript.words;
const sylls = syllables(words);

/** Gesture windows: the hand comes up while she lists services and on the closing line. */
const at = (w, from = 0) => words.findIndex((x, i) => i >= from && x.word.toLowerCase().startsWith(w));
const windows = [
  [at('websites'), at('ads')],
  [at('automate'), at('parts')],
  [at('campaign') - 4, at('campaign')],
].map(([a, b]) => [words[a].start_ms / 1000 - 0.2, words[b].end_ms / 1000 + 0.3]);
const gesture = t => Math.max(0, ...windows.map(([a, b]) => Math.min(smooth((t - a) / 0.35), smooth((b - t) / 0.4))));

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const env = fontEnv(WORK);
const room = roomSvg(W, H, 'center');
for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="${cameraTransform(t, W, H)}">${room}
  ${presenterSvg({ t, cx: W / 2, baseY: H + 70, scale: 1.3, sylls, gesture: gesture(t) })}
  </g></svg>`;
  const svgFile = path.join(FRAMES, 'frame.svg');
  fs.writeFileSync(svgFile, svg);
  rasterize(svgFile, path.join(FRAMES, `${String(f).padStart(5, '0')}.png`), env);
}
fs.rmSync(path.join(FRAMES, 'frame.svg'));

writeWav(path.join(WORK, 'raw-voice.wav'), synthVoice(sylls, duration));
execFileSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.png'),
  '-i', path.join(WORK, 'raw-voice.wav'),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
  '-t', duration.toFixed(3), path.join(WORK, 'raw.mp4'),
]);
console.log(`raw take: ${frames} frames, ${duration.toFixed(2)} s -> work/raw.mp4`);
