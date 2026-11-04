/**
 * Generates the synthetic raw dialogue for showcase f22: work/noisy.wav (48 kHz mono, 6 s).
 *
 * There is no speech. The "voice" is a pitched harmonic tone per syllable shaped like speech
 * rhythm (the same idea as showcase/03-talking-head-edit/presenter.mjs). On top of it sit the
 * three problems the cleanup chain removes:
 *   - mains hum: 50 Hz plus its 100 and 150 Hz harmonics, always on
 *   - hiss: broadband noise, audible in the pauses
 *   - clicks: short sharp pops, like mouth clicks and cable crackle
 *
 * Deterministic: a seeded PRNG makes every run produce the same samples.
 *
 * Usage (from this folder): node make-audio.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const RATE = 48000;
const DURATION = 6;

/** Small seeded PRNG (mulberry32) so every run draws the same noise. */
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
const rand = rng(22);

// Three short phrases with pauses between them; each word is split into syllables.
const PHRASES = [
  { start: 0.35, words: ['thanks', 'for', 'joining', 'us', 'today'] },
  { start: 2.35, words: ['let', 'me', 'show', 'you', 'the', 'new', 'plan'] },
  { start: 4.45, words: ['it', 'starts', 'next', 'week'] },
];
const sylls = [];
for (const p of PHRASES) {
  let t = p.start;
  for (const w of p.words) {
    const n = Math.max(1, (w.match(/[aeiouy]+/g) ?? []).length);
    const len = 0.09 + w.length * 0.03;
    for (let i = 0; i < n; i++) {
      sylls.push({
        start: t + (len * i) / n,
        end: t + (len * (i + 1)) / n,
        f0: 190 + rand() * 40,
        formant: 550 + rand() * 650,
      });
    }
    t += len + 0.05;
  }
  // The last syllable of a phrase falls in pitch, like the end of a sentence.
  sylls[sylls.length - 1].f0 -= 30;
}

const n = DURATION * RATE;
const voice = new Float32Array(n);
for (const s of sylls) {
  const i0 = Math.floor(s.start * RATE);
  const i1 = Math.min(n, Math.ceil(s.end * RATE));
  let phase = 0;
  for (let i = i0; i < i1; i++) {
    const p = (i - i0) / (i1 - i0);
    const t = (i - i0) / RATE;
    const env = Math.min(1, t / 0.018) * Math.min(1, (i1 - i) / RATE / 0.05);
    const f0 = s.f0 * (1 + 0.04 * Math.sin(Math.PI * p) - 0.03 * p);
    phase += (2 * Math.PI * f0) / RATE;
    let v = 0;
    for (let k = 1; k <= 14; k++) {
      const fk = f0 * k;
      v += Math.sin(phase * k) * (1 / (1 + Math.pow((fk - s.formant) / 260, 2)) + 0.35 / k);
    }
    voice[i] += v * 0.07 * env;
  }
}
let peak = 0;
for (const v of voice) peak = Math.max(peak, Math.abs(v));
for (let i = 0; i < n; i++) voice[i] *= 0.32 / peak;

// Noise: hum with harmonics, hiss, and about two clicks per second at random places.
const out = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const t = i / RATE;
  const hum = 0.06 * Math.sin(2 * Math.PI * 50 * t) + 0.025 * Math.sin(2 * Math.PI * 100 * t) + 0.01 * Math.sin(2 * Math.PI * 150 * t);
  const hiss = (rand() * 2 - 1) * 0.03;
  out[i] = voice[i] + hum + hiss;
}
for (let c = 0; c < DURATION * 2; c++) {
  const at = Math.floor((0.2 + rand() * (DURATION - 0.4)) * RATE);
  const amp = (rand() < 0.5 ? -1 : 1) * (0.55 + rand() * 0.35);
  // A click: a fast attack and a ringing decay over about 1.5 ms (one-sided, like a pop).
  for (let k = 0; k < 72; k++) out[at + k] += amp * Math.exp(-k / 10);
}

/** Writes 16-bit mono PCM WAV. */
function writeWav(file, samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

fs.mkdirSync(WORK, { recursive: true });
writeWav(path.join(WORK, 'noisy.wav'), out);
console.log(`noisy dialogue: ${sylls.length} syllables, ${DURATION} s -> work/noisy.wav`);
