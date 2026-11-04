/**
 * Generates the music bed for the 08-sound-pass showcase: a 20 second, 100 BPM warm pop groove
 * (kick, off-beat hats, bass, pad chords and a delayed pluck arpeggio) in D major.
 *
 * Every sample is synthesised here from sine, triangle and seeded noise, so the bed has no
 * third-party source and no licence to clear. The output is deterministic: the same script
 * always writes the same WAV.
 *
 * 100 BPM (0.6 s per beat) is chosen because the scene cuts in 06-motion-graphics fall at
 * 3.2 s, 6.8 s and 9.8 s: 3.6 s and 3.0 s apart, both whole numbers of beats, so the sound
 * pass can shift the bed until every cut lands on a beat.
 *
 * Usage: node make-bed.mjs <out.wav>
 */
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node make-bed.mjs <out.wav>');
  process.exit(1);
}

const SR = 48000;
const DUR = 20;
const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const N = Math.round(SR * DUR);
const L = new Float32Array(N);
const R = new Float32Array(N);

// Seeded PRNG (mulberry32) so the noise in hats is reproducible.
let seed = 0x5eed;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const midiHz = m => 440 * 2 ** ((m - 69) / 12);
const tri = ph => 1 - 4 * Math.abs(((ph / (2 * Math.PI)) % 1) - 0.5);

/** Adds `fn(tLocal)` (mono) into the buffers from `t0` for `len` seconds with a pan of -1..1. */
function add(t0, len, pan, fn) {
  const s0 = Math.max(0, Math.round(t0 * SR));
  const s1 = Math.min(N, Math.round((t0 + len) * SR));
  const gl = Math.cos((pan + 1) * Math.PI / 4);
  const gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = s0; i < s1; i++) {
    const v = fn((i - s0) / SR);
    L[i] += v * gl;
    R[i] += v * gr;
  }
}

// D major, I - vi - IV - V voicings (MIDI note numbers) and bass roots.
const CHORDS = [
  { pad: [62, 66, 69, 73], bass: 38 }, // Dmaj7
  { pad: [59, 62, 66, 69], bass: 35 }, // Bm7
  { pad: [55, 59, 62, 66], bass: 43 }, // Gmaj7
  { pad: [57, 61, 64, 66], bass: 45 }, // A6
];

const bars = Math.ceil(DUR / BAR);
for (let b = 0; b < bars; b++) {
  const chord = CHORDS[b % CHORDS.length];
  const tb = b * BAR;

  // Pad: detuned sine pairs with a soft second harmonic, slow attack and release.
  for (const note of chord.pad) {
    const f = midiHz(note);
    for (const [det, pan] of [[-0.0025, -0.6], [0.0025, 0.6]]) {
      const fd = f * (1 + det);
      add(tb, BAR + 0.8, pan, t => {
        const env = Math.min(1, t / 0.35) * (t > BAR ? Math.max(0, 1 - (t - BAR) / 0.8) : 1);
        const ph = 2 * Math.PI * fd * t;
        return env * 0.028 * (Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph));
      });
    }
  }

  for (let k = 0; k < 4; k++) {
    const tk = tb + k * BEAT;

    // Kick: pitch sweep 110 -> 45 Hz with a short click, on every beat.
    add(tk, 0.32, 0, t => {
      // Phase is the integral of f(t) = 45 + 65 * exp(-28 t).
      const ph = 2 * Math.PI * (45 * t + (65 / 28) * (1 - Math.exp(-t * 28)));
      const click = t < 0.004 ? (rand() - 0.5) * 0.15 : 0;
      return Math.sin(ph) * Math.exp(-t * 11) * 0.55 + click;
    });

    // Hats: high-passed noise on the off-beats, alternating left and right.
    let prev = 0;
    add(tk + BEAT / 2, 0.06, k % 2 ? 0.35 : -0.35, t => {
      const n = rand() * 2 - 1;
      const hp = n - prev;
      prev = n;
      return hp * Math.exp(-t * 70) * 0.06;
    });

    // Bass: root on the beat, octave bounce on the "and" of beats 2 and 4.
    const bf = midiHz(chord.bass);
    add(tk, BEAT * 0.9, 0, t => {
      const env = Math.min(1, t / 0.008) * Math.exp(-t * 3.2);
      const ph = 2 * Math.PI * bf * t;
      return env * 0.16 * Math.tanh(1.6 * (Math.sin(ph) + 0.3 * Math.sin(2 * ph)));
    });
    if (k % 2 === 1) {
      add(tk + BEAT / 2, BEAT * 0.45, 0, t => {
        const env = Math.min(1, t / 0.008) * Math.exp(-t * 6);
        return env * 0.1 * Math.sin(2 * Math.PI * bf * 2 * t);
      });
    }

    // Pluck arpeggio in eighths, an octave above the pad.
    for (let e = 0; e < 2; e++) {
      const note = chord.pad[(k * 2 + e) % chord.pad.length] + 12;
      const f = midiHz(note);
      add(tk + e * BEAT / 2, 0.5, e ? 0.25 : -0.25, t => {
        const env = Math.min(1, t / 0.004) * Math.exp(-t * 9);
        return env * 0.05 * tri(2 * Math.PI * f * t);
      });
    }
  }
}

// Stereo ping-pong delay at a dotted eighth for space.
const D = Math.round(SR * BEAT * 0.75);
for (let i = D; i < N; i++) {
  L[i] += R[i - D] * 0.22;
  R[i] += L[i - D] * 0.22;
}

// Gentle fade in, fade out, then normalise the peak to -3 dBFS.
const fadeIn = Math.round(SR * 0.05);
const fadeOut = Math.round(SR * 1.5);
let peak = 0;
for (let i = 0; i < N; i++) {
  let g = 1;
  if (i < fadeIn) g = i / fadeIn;
  if (i > N - fadeOut) g = Math.min(g, (N - i) / fadeOut);
  L[i] *= g;
  R[i] *= g;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = peak > 0 ? 10 ** (-3 / 20) / peak : 1;

// 16-bit PCM stereo WAV.
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, data]));
console.log(`Wrote ${out}: ${DUR} s, ${BPM} BPM, ${SR} Hz stereo`);
