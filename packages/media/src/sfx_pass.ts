import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeXml, ffmpegStderr, probe, runFfmpeg, safeJoin } from './proc.js';
import { requireSfxPython, sfxEnvStatus } from './sfx_env.js';

/**
 * Measured sound pass (`mgvideo sfx <video> --cues cues.json`).
 *
 * Method: Vox (@Voxyz_ai, https://x.com/Voxyz_ai/status/2109358372873183564), ported from
 * Barty-Bart/motion-graphics skills/sound-effects/scripts/sound_pass.py and report.py (code MIT).
 * Orchestration lives here; only the librosa analysis (beat grid, sub-120 Hz kick check,
 * levels) runs in packages/media/python/sfx_analyze.py inside the managed venv.
 *
 * Licence rules: only CC0 files bundled in the vendored library are ever placed. Manifest
 * entries that point at runtime URLs (Mixkit) are rejected and never fetched.
 * Unrelated to the procedural generator in sfx.ts.
 */

// ---------------------------------------------------------------------------------------------
// Locations

/** Walks up from this module to the toolkit root (the directory holding registry/approved.lock.json). */
export function findToolkitRoot(start: string = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'registry', 'approved.lock.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not locate the toolkit root (registry/approved.lock.json) above ${start}`);
    dir = parent;
  }
}

/** The vendored sound-effects manifest, located through the approved lock (never a moving branch). */
export function vendoredSfxManifestPath(root: string = findToolkitRoot()): string {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'registry', 'approved.lock.json'), 'utf8')) as {
    approved_baselines?: Record<string, { vendored_path?: string }>;
  };
  const vendored = lock.approved_baselines?.['barty-motion-graphics']?.vendored_path;
  if (!vendored) throw new Error('approved.lock.json has no vendored_path for barty-motion-graphics');
  const p = safeJoin(root, vendored, 'skills', 'sound-effects', 'sfx', 'manifest.json');
  if (!fs.existsSync(p)) throw new Error(`Vendored sound-effects manifest missing: ${p}`);
  return p;
}

export function sfxAnalyzerScript(root: string = findToolkitRoot()): string {
  return path.join(root, 'packages', 'media', 'python', 'sfx_analyze.py');
}

// ---------------------------------------------------------------------------------------------
// Manifest

export interface SfxSound {
  /** Manifest `file`, relative to the manifest directory. Used as the stable id in swaps. */
  id: string;
  absPath: string;
  category: string;
  durationS?: number;
  length?: string;
  license: string;
  sourceUrl?: string;
  attribution?: string;
  title?: string;
  creator?: string;
  kit: boolean;
}

export interface SfxRejection {
  entry: string;
  reason: string;
}

export interface SfxLibrary {
  manifestPath: string;
  baseDir: string;
  categoryMap: Record<string, string>;
  altCategories: Record<string, string[]>;
  sounds: SfxSound[];
  /** Default kit, CC0 entries only, by category. */
  kit: Record<string, SfxSound>;
  rejected: SfxRejection[];
}

interface RawEntry {
  file?: string | null;
  category?: string;
  duration_s?: number;
  length?: string;
  license?: string;
  source_url?: string;
  source_page?: string;
  attribution?: string;
  title?: string;
  creator?: string;
  bundled?: boolean;
  runtime_url?: string;
}

const AUDIO_EXT = new Set(['.ogg', '.wav', '.flac', '.mp3', '.m4a', '.opus']);

/** Why an entry may not be used, or null when it is a usable bundled CC0 file. */
export function rejectReason(e: RawEntry, baseDir: string): string | null {
  if (e.runtime_url) return 'runtime URL (Mixkit or other non-redistributable source); never fetched';
  if (e.bundled === false) return 'not bundled';
  if (!e.file) return 'no bundled file';
  if (!/CC0/.test(e.license ?? '')) return `licence is not CC0 (${e.license ?? 'none'})`;
  if (!e.category) return 'no category';
  if (!AUDIO_EXT.has(path.extname(e.file).toLowerCase())) return 'not an audio file';
  let abs: string;
  try {
    abs = safeJoin(baseDir, e.file);
  } catch {
    return 'path escapes the manifest directory';
  }
  if (!fs.existsSync(abs)) return 'file missing on disk';
  return null;
}

export function loadSfxLibrary(manifestPath: string = vendoredSfxManifestPath()): SfxLibrary {
  const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    category_map?: Record<string, string>;
    alt_categories?: Record<string, string[]>;
    bundled?: RawEntry[];
    runtime?: RawEntry[];
    default_kit?: RawEntry[];
  };
  if (!man.category_map) throw new Error(`Manifest has no category_map: ${manifestPath}`);
  const baseDir = path.dirname(path.resolve(manifestPath));
  const rejected: SfxRejection[] = [];
  const toSound = (e: RawEntry, kit: boolean): SfxSound | null => {
    const why = rejectReason(e, baseDir);
    if (why) {
      rejected.push({ entry: `${kit ? 'default_kit' : 'library'}:${e.category ?? '?'}:${e.file ?? e.runtime_url ?? '?'}`, reason: why });
      return null;
    }
    return {
      id: e.file as string,
      absPath: safeJoin(baseDir, e.file as string),
      category: e.category as string,
      durationS: e.duration_s,
      length: e.length,
      license: e.license as string,
      sourceUrl: e.source_url ?? e.source_page,
      attribution: e.attribution,
      title: e.title,
      creator: e.creator,
      kit,
    };
  };
  const sounds: SfxSound[] = [];
  for (const e of man.bundled ?? []) {
    const s = toSound(e, false);
    if (s) sounds.push(s);
  }
  for (const e of man.runtime ?? []) toSound(e, false);
  const kit: Record<string, SfxSound> = {};
  for (const e of man.default_kit ?? []) {
    const s = toSound(e, true);
    if (s) kit[s.category] = s;
  }
  return { manifestPath, baseDir, categoryMap: man.category_map, altCategories: man.alt_categories ?? {}, sounds, kit, rejected };
}

/** Accepted sounds a category may use, primary category first (alt_categories order). */
export function categoryPool(lib: SfxLibrary, category: string): SfxSound[] {
  const cats = lib.altCategories[category] ?? [category];
  const out: SfxSound[] = [];
  for (const c of cats) out.push(...lib.sounds.filter(s => s.category === c));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Cues

export interface SfxCue {
  /** Cue time in seconds on the video timeline. */
  t: number;
  /** Intent (scene_cut, appear, reveal, ...), mapped through the manifest category_map. */
  type: string;
  /** Library category actually used (explicit `category`, or category_map[type]). */
  category: string;
  /** Length for typing (loop/trim) and build_up (riser ends at t + dur). */
  dur?: number;
  desc: string;
  /** Move this effect to the nearest beat when within the snap window (music only). */
  snap: boolean;
}

/**
 * Parses and validates a cue list. Accepts `[...]` or `{ "cues": [...] }`, each cue
 * `{ t, type | category, dur?, desc?, snap? }`. Throws with every problem listed.
 */
export function parseSfxCues(input: unknown, lib: Pick<SfxLibrary, 'categoryMap' | 'sounds'>, videoDuration?: number): SfxCue[] {
  const list = Array.isArray(input) ? input : (input as { cues?: unknown })?.cues;
  if (!Array.isArray(list)) throw new Error('Cues must be a JSON array or an object with a "cues" array');
  if (list.length === 0) throw new Error('Cue list is empty');
  const categories = new Set(lib.sounds.map(s => s.category));
  const errors: string[] = [];
  const cues: SfxCue[] = [];
  list.forEach((raw, i) => {
    const c = raw as Record<string, unknown>;
    const at = `cue ${i}`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      errors.push(`${at}: not an object`);
      return;
    }
    const t = c.t;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) errors.push(`${at}: "t" must be a number >= 0`);
    else if (videoDuration !== undefined && t >= videoDuration) errors.push(`${at}: t=${t}s is past the end of the video (${videoDuration.toFixed(3)}s)`);
    const type = typeof c.type === 'string' ? c.type : undefined;
    const explicit = typeof c.category === 'string' ? c.category : undefined;
    let category: string | undefined;
    if (explicit) {
      if (!categories.has(explicit)) errors.push(`${at}: unknown category "${explicit}" (known: ${[...categories].sort().join(', ')})`);
      category = explicit;
    } else if (type) {
      category = lib.categoryMap[type];
      if (!category) errors.push(`${at}: unknown type "${type}" (known: ${Object.keys(lib.categoryMap).join(', ')}); or pass "category"`);
    } else {
      errors.push(`${at}: needs "type" or "category"`);
    }
    let dur: number | undefined;
    if (c.dur !== undefined) {
      if (typeof c.dur !== 'number' || !Number.isFinite(c.dur) || c.dur <= 0 || c.dur > 30) errors.push(`${at}: "dur" must be a number in (0, 30]`);
      else dur = c.dur;
    }
    if (c.desc !== undefined && typeof c.desc !== 'string') errors.push(`${at}: "desc" must be a string`);
    if (c.snap !== undefined && typeof c.snap !== 'boolean') errors.push(`${at}: "snap" must be a boolean`);
    if (typeof t === 'number' && category) {
      cues.push({ t, type: type ?? category, category, dur, desc: (c.desc as string | undefined) ?? '', snap: c.snap === true });
    }
  });
  if (errors.length) throw new Error(`Invalid cues:\n  ${errors.join('\n  ')}`);
  return cues;
}

// ---------------------------------------------------------------------------------------------
// Selection

/** Small deterministic PRNG (mulberry32). Same seed, same sequence, on every platform. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SfxSelection {
  idx: number;
  cue: SfxCue;
  sound: SfxSound;
  /** How it was chosen: default kit, a seeded variation, or a swap. */
  via: 'kit' | 'seeded' | 'swap' | 'auto';
}

/** Swaps from report.html: cue index -> manifest file id or "auto". */
export type SfxSwaps = Record<string, string>;

const SHORT_TYPES = new Set(['movement', 'scene_cut']);

/**
 * One sound per cue. The first cue of a category gets the default kit sound; repeats vary
 * takes within the primary category with the seeded RNG (never the same file twice in a row);
 * categories without a usable kit sound (typing, whose kit entry is Mixkit) draw from the pool.
 */
export function selectSfx(cues: SfxCue[], lib: SfxLibrary, seed: number, swaps: SfxSwaps = {}): SfxSelection[] {
  const rng = seededRng(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
  const last = new Map<string, string>();
  const out: SfxSelection[] = [];
  cues.forEach((cue, idx) => {
    const pool = categoryPool(lib, cue.category);
    if (pool.length === 0) throw new Error(`No bundled CC0 sound for category "${cue.category}" (cue ${idx})`);
    const want = SHORT_TYPES.has(cue.type) ? 'short' : undefined;
    const sized = pool.filter(s => !want || s.length === undefined || s.length === want);
    const sw = swaps[String(idx)];
    let sound: SfxSound | undefined;
    let via: SfxSelection['via'];
    if (sw && sw !== 'auto') {
      if (/^[a-z]+:\/\//i.test(sw)) throw new Error(`Swap for cue ${idx} is a URL (${sw}); runtime downloads are not allowed, pick a bundled file`);
      sound = [...pool, ...(lib.kit[cue.category] ? [lib.kit[cue.category]] : [])].find(s => s.id === sw);
      if (!sound) throw new Error(`Swap for cue ${idx}: "${sw}" is not a bundled CC0 sound in category "${cue.category}" or its alternatives`);
      via = 'swap';
    } else if (sw === 'auto') {
      const prev = last.get(cue.category);
      const c = sized.filter(s => s.id !== prev);
      sound = pick(c.length ? c : sized.length ? sized : pool);
      via = 'auto';
    } else {
      const kit = lib.kit[cue.category];
      const prev = last.get(cue.category);
      if (kit && prev === undefined) {
        sound = kit;
        via = 'kit';
      } else {
        const primary = [...(kit ? [kit] : []), ...sized.filter(s => s.category === cue.category)];
        const base = primary.length ? primary : sized.length ? sized : pool;
        const c = base.filter(s => s.id !== prev);
        sound = pick(c.length ? c : base);
        via = 'seeded';
      }
    }
    last.set(cue.category, sound.id);
    out.push({ idx, cue, sound, via });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Beat alignment (pure, ported from sound_pass.py step 2)

const HARD_TYPES = new Set(['scene_cut', 'reveal']);

export interface MusicAlignment {
  /** Seconds into the track where the music starts under the video. */
  startS: number;
  /** Per hard cut: time and distance to the nearest beat after alignment (seconds). */
  residuals: Array<{ t: number; errorS: number }>;
}

/** Searches music start offsets (5 ms steps, up to 8 beats) for the smallest cut-to-beat error. */
export function alignMusicToCuts(hardTimes: number[], grid: number[], periodS: number, musicDurS: number, videoDurS: number): MusicAlignment {
  const nearest = (s: number, t: number) => grid.reduce((m, b) => Math.min(m, Math.abs(b - s - t)), Infinity);
  const limit = Math.min(periodS * 8, musicDurS - videoDurS);
  let best = { e: Infinity, s: 0 };
  if (hardTimes.length && grid.length) {
    for (let i = 0; i * 0.005 < limit; i++) {
      const s = i * 0.005;
      const e = hardTimes.reduce((acc, t) => acc + nearest(s, t), 0);
      if (e < best.e) best = { e, s };
    }
  }
  return { startS: best.s, residuals: hardTimes.map(t => ({ t, errorS: grid.length ? nearest(best.s, t) : NaN })) };
}

// ---------------------------------------------------------------------------------------------
// Placement and mix

export interface SfxPlacement {
  idx: number;
  t: number;
  type: string;
  category: string;
  desc: string;
  sound: SfxSound;
  via: SfxSelection['via'];
  /** Where the effect starts on the video timeline (seconds). */
  startS: number;
  /** Seconds of the source file to skip (risers are trimmed from the front so they end on time). */
  trimStartS: number;
  /** Seconds to play; undefined plays the whole file. */
  playS?: number;
  loop: boolean;
  /** Upstream per-type gain plus level match to the -3 dBFS reference peak. */
  gainDb: number;
  levelMatchDb: number;
  snappedFromS?: number;
  beatErrorS?: number;
}

export interface SoundLevel {
  peakDbfs: number;
  durationS: number;
}

/** Bundled one-shots are peak-normalised to -3 dBFS; swapped originals are matched to that. */
const REFERENCE_PEAK_DBFS = -3;

/** Per-cue timing and gain rules ported from sound_pass.py step 3. */
export function placeSfx(
  selections: SfxSelection[],
  fps: number,
  levels: Map<string, SoundLevel>,
  beatGrid?: number[],
  snapWindowS = 0.12,
): SfxPlacement[] {
  return selections.map(({ idx, cue, sound, via }) => {
    const lvl = levels.get(sound.absPath);
    const srcDur = lvl?.durationS ?? sound.durationS ?? 0;
    let gain = 0;
    let pre = 0;
    let trimStartS = 0;
    let playS: number | undefined;
    let loop = false;
    let t = cue.t;
    let snappedFromS: number | undefined;
    let beatErrorS: number | undefined;
    if (beatGrid?.length) {
      const nearest = beatGrid.reduce((m, b) => (Math.abs(b - t) < Math.abs(m - t) ? b : m), beatGrid[0]);
      beatErrorS = Math.abs(nearest - t);
      if (cue.snap && beatErrorS <= snapWindowS && beatErrorS > 0) {
        snappedFromS = t;
        t = nearest;
        beatErrorS = 0;
      }
    }
    if (cue.type === 'movement' || cue.type === 'scene_cut') {
      pre = fps > 0 ? 2 / fps : 0;
      gain = -4;
    }
    let startS = t - pre;
    if (cue.type === 'typing') {
      playS = cue.dur ?? 1;
      loop = true;
      gain = -8;
    } else if (cue.type === 'build_up') {
      const need = cue.dur ?? 0.8;
      if (srcDur > need) {
        trimStartS = srcDur - need;
        playS = need;
      }
      gain = -6;
      startS = t + need - (playS ?? srcDur);
    }
    if (cue.type === 'appear' || cue.type === 'click' || cue.type === 'hover_or_small_ui') gain = -6;
    const levelMatchDb = lvl && Number.isFinite(lvl.peakDbfs) && lvl.peakDbfs > -60
      ? Math.max(-12, Math.min(12, REFERENCE_PEAK_DBFS - lvl.peakDbfs))
      : 0;
    return {
      idx, t, type: cue.type, category: cue.category, desc: cue.desc, sound, via,
      startS: Math.max(0, startS), trimStartS, playS, loop,
      gainDb: gain, levelMatchDb: Math.round(levelMatchDb * 100) / 100,
      snappedFromS, beatErrorS,
    };
  });
}

const r3 = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3);

export interface MixPlan {
  args: string[];
  filter: string;
}

/**
 * Builds the ffmpeg argument array that renders the raw (pre-loudness) mix to a float WAV.
 * Every path goes in as its own argument; the filter graph contains no file names.
 */
export function buildSfxMixArgs(opts: {
  video: string;
  videoHasAudio: boolean;
  durationS: number;
  placements: SfxPlacement[];
  music?: { path: string; startS: number; gainDb: number };
  outWav: string;
}): MixPlan {
  const { durationS: d } = opts;
  const args: string[] = ['-i', opts.video];
  const chains: string[] = [];
  const labels: string[] = [];
  const fmt = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
  let n = 1;
  if (opts.videoHasAudio) {
    chains.push(`[0:a]${fmt}[orig]`);
    labels.push('[orig]');
  }
  for (const p of opts.placements) {
    if (p.loop) args.push('-stream_loop', '-1');
    args.push('-i', p.sound.absPath);
    const parts = [fmt];
    if (p.trimStartS > 0 || p.playS !== undefined) {
      parts.push(`atrim=start=${r3(p.trimStartS)}${p.playS !== undefined ? `:duration=${r3(p.playS)}` : ''}`, 'asetpts=PTS-STARTPTS');
    }
    if (p.loop && p.playS !== undefined) {
      const f = Math.min(0.05, p.playS / 2);
      parts.push(`afade=t=out:st=${r3(p.playS - f)}:d=${r3(f)}`);
    }
    parts.push(`volume=${(p.gainDb + p.levelMatchDb).toFixed(2)}dB`);
    const ms = Math.round(p.startS * 1000);
    if (ms > 0) parts.push(`adelay=delays=${ms}:all=1`);
    chains.push(`[${n}:a]${parts.join(',')}[c${p.idx}]`);
    labels.push(`[c${p.idx}]`);
    n++;
  }
  if (opts.music) {
    args.push('-ss', r3(opts.music.startS), '-i', opts.music.path);
    const fade = Math.min(0.6, d / 2);
    chains.push(`[${n}:a]${fmt},atrim=duration=${r3(d)},asetpts=PTS-STARTPTS,volume=${opts.music.gainDb.toFixed(2)}dB,afade=t=out:st=${r3(Math.max(0, d - fade))}:d=${r3(fade)}[music]`);
    labels.push('[music]');
    n++;
  }
  if (labels.length === 0) throw new Error('Nothing to mix');
  chains.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest:dropout_transition=0,apad,atrim=duration=${r3(d)}[mix]`);
  const filter = chains.join(';');
  args.push('-filter_complex', filter, '-map', '[mix]', '-ar', '48000', '-c:a', 'pcm_f32le', opts.outWav);
  return { args, filter };
}

export interface LoudnessReading {
  lufs: number;
  truePeakDbfs: number;
}

/** EBU R128 integrated loudness and true peak of a file, from ffmpeg's ebur128 summary. */
export function measureLoudness(file: string, mono = false): LoudnessReading {
  const err = ffmpegStderr(['-nostats', '-i', file, ...(mono ? ['-ac', '1'] : []), '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const i = [...err.matchAll(/I:\s+(-?[\d.]+|-inf) LUFS/g)].pop();
  const p = [...err.matchAll(/Peak:\s+(-?[\d.]+|-inf) dBFS/g)].pop();
  if (!i || !p) throw new Error(`Could not read loudness of ${file}`);
  const num = (s: string) => (s === '-inf' ? -Infinity : parseFloat(s));
  return { lufs: num(i[1]), truePeakDbfs: num(p[1]) };
}

/** Peak level and duration via ffmpeg (used when the Python venv is not set up and no music is given). */
export function ffmpegSoundLevel(file: string): SoundLevel {
  const err = ffmpegStderr(['-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const m = /max_volume:\s+(-?[\d.]+|-inf) dB/.exec(err);
  const peak = m ? (m[1] === '-inf' ? -Infinity : parseFloat(m[1])) : NaN;
  return { peakDbfs: peak, durationS: probe(file).durationSeconds };
}

// ---------------------------------------------------------------------------------------------
// Python analysis

export interface MusicAnalysis {
  path: string;
  duration_s: number;
  tempo_bpm: number;
  beat_period_s: number;
  beats_s: number[];
  grid_s: number[];
  kicks_s: number[];
  kick_offset_median_s: number;
  grid_shifted: boolean;
  sub120_energy_ratio: number;
  levels: { peak_dbfs: number; rms_dbfs: number };
  envelope: { window_s: number; t: number[]; v: number[] };
}

export interface SfxAnalysis {
  librosa: string;
  music: MusicAnalysis | null;
  sounds: Array<{ path: string; duration_s: number; channels: number; peak_dbfs: number; rms_dbfs: number }>;
}

/** Runs the librosa helper in the managed venv (`python -I`, argument array) and parses its JSON. */
export function runSfxAnalyzer(python: string, music: string | undefined, sounds: string[], script: string = sfxAnalyzerScript()): SfxAnalysis {
  const args = ['-I', script, ...(music ? ['--music', music] : []), ...sounds.flatMap(s => ['--sound', s])];
  const res = spawnSync(python, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new Error(`sfx analyzer failed to start: ${res.error.message}`);
  let parsed: (SfxAnalysis & { error?: string }) | undefined;
  try {
    parsed = JSON.parse(res.stdout.trim().split('\n').pop() ?? '');
  } catch {
    // Fall through to the error below with stderr attached.
  }
  if (!parsed || res.status !== 0 || parsed.error) {
    throw new Error(`sfx analyzer failed (exit ${res.status}): ${parsed?.error ?? String(res.stderr).trim().slice(-1500)}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------------------------
// The pass

export interface SfxPassOptions {
  video: string;
  /** Path to cues JSON, or the already-parsed value. */
  cues: string | unknown;
  outDir: string;
  music?: string;
  musicDb?: number;
  musicSource?: string;
  musicLicense?: string;
  useCase?: string;
  seed?: number;
  swaps?: SfxSwaps;
  snapWindowS?: number;
  targetLufs?: number;
  maxTruePeakDbfs?: number;
  /** Write per-cue proof frames and waveforms (default true). */
  proof?: boolean;
  manifestPath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface SfxPassResult {
  outputVideo: string;
  mixWav: string;
  credits: string;
  reportJson: string;
  reportHtml: string;
  final: LoudnessReading;
  mono: LoudnessReading;
  placements: SfxPlacement[];
  log: string[];
  report: Record<string, unknown>;
}

const isFree = (lic: string) => /CC0/.test(lic);

/** Paste-ready credit line, ported from sound_pass.py credit_line(). */
export function creditLine(s: SfxSound): string {
  let name: string;
  let who: string;
  let src: string;
  if (s.title && s.creator) {
    name = s.title;
    who = s.creator;
    src = /kenney/i.test(s.sourceUrl ?? '') ? 'kenney.nl' : 'Freesound';
  } else {
    const b = path.basename(s.id).replace(/\.[^.]+$/, '');
    const kenney = b.startsWith('kenney-');
    const cleaned = b.replace(/^fs-?\d+-?/, '').replace(/^kenney-/, '').replace(/-/g, ' ').trim();
    name = cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : `Freesound ${(/\d+/.exec(b) ?? [''])[0]}`;
    const a = s.attribution ?? '';
    who = kenney ? 'Kenney' : (a.split(' via ')[0].trim() || 'unknown creator');
    src = kenney ? 'kenney.nl' : a.includes(' via ') ? a.split(' via ')[1].split(' (')[0].trim() : 'unknown source';
  }
  const ok = isFree(s.license);
  return `"${name}" by ${who} (${src}), ${s.license.split(' (')[0]}${ok ? '' : ' - LICENCE UNKNOWN, check before publishing'}${s.sourceUrl ? ` - ${s.sourceUrl}` : ''}`;
}

export function runSfxPass(opts: SfxPassOptions): SfxPassResult {
  const env = opts.env ?? process.env;
  const video = path.resolve(opts.video);
  const out = path.resolve(opts.outDir);
  const targetLufs = opts.targetLufs ?? -16;
  const maxTp = opts.maxTruePeakDbfs ?? -4;
  const seed = opts.seed ?? 7;
  const log: string[] = [];

  const vp = probe(video);
  if (!vp.hasVideo) throw new Error(`No video stream in ${video}`);
  const dur = vp.durationSeconds;
  const music = opts.music ? path.resolve(opts.music) : undefined;
  if (music && !fs.existsSync(music)) throw new Error(`Music track not found: ${music}`);
  // Fail closed before any work when music analysis is needed but the venv is missing.
  const python = music ? requireSfxPython(env) : sfxEnvStatus(env).ready ? sfxEnvStatus(env).python : undefined;

  const lib = loadSfxLibrary(opts.manifestPath ?? vendoredSfxManifestPath());
  const rawCues = typeof opts.cues === 'string' ? JSON.parse(fs.readFileSync(path.resolve(opts.cues), 'utf8')) : opts.cues;
  const cues = parseSfxCues(rawCues, lib, dur);
  const selections = selectSfx(cues, lib, seed, opts.swaps);
  fs.mkdirSync(out, { recursive: true });

  // Measure: beat grid + sub-120 Hz check + levels (librosa), or levels only via ffmpeg.
  const uniqueSounds = [...new Set(selections.map(s => s.sound.absPath))];
  const levels = new Map<string, SoundLevel>();
  let analysis: SfxAnalysis | undefined;
  if (python) {
    analysis = runSfxAnalyzer(python, music, uniqueSounds);
    for (const s of analysis.sounds) levels.set(s.path, { peakDbfs: s.peak_dbfs, durationS: s.duration_s });
  } else {
    for (const p of uniqueSounds) levels.set(p, ffmpegSoundLevel(p));
  }

  let alignment: MusicAlignment | undefined;
  let videoGrid: number[] | undefined;
  const m = analysis?.music ?? undefined;
  if (m) {
    log.push(`librosa tempo ${m.tempo_bpm.toFixed(1)} BPM, beat period ${m.beat_period_s.toFixed(3)}s. Kicks (<120 Hz) vs librosa grid: median offset ${(m.kick_offset_median_s * 1000).toFixed(0)} ms -> ${m.grid_shifted ? 'SHIFTED whole grid' : 'grid OK'}. Sub-120 Hz energy ${(m.sub120_energy_ratio * 100).toFixed(1)}%.`);
    if (m.kicks_s.length === 0) log.push('WARNING: no kick peaks below 120 Hz; the grid check had nothing to compare against.');
    const hard = cues.filter(c => HARD_TYPES.has(c.type)).map(c => c.t);
    alignment = alignMusicToCuts(hard, m.grid_s, m.beat_period_s, m.duration_s, dur);
    videoGrid = m.grid_s.map(b => b - alignment!.startS).filter(b => b >= 0 && b <= dur);
    log.push(`Music starts ${alignment.startS.toFixed(3)}s into the track. Cut-to-beat error: ${alignment.residuals.map(r => `${r.t.toFixed(2)}s=${(r.errorS * 1000).toFixed(0)}ms`).join(', ') || 'no hard cuts'}`);
    if (m.duration_s - alignment.startS < dur) log.push(`WARNING: music (${m.duration_s.toFixed(2)}s) ends before the video (${dur.toFixed(2)}s).`);
  }

  const placements = placeSfx(selections, vp.fps, levels, videoGrid, opts.snapWindowS);
  const mixWav = path.join(out, 'mix_raw.wav');
  const plan = buildSfxMixArgs({
    video, videoHasAudio: vp.hasAudio, durationS: dur, placements, outWav: mixWav,
    music: music && alignment ? { path: music, startS: alignment.startS, gainDb: opts.musicDb ?? -12 } : undefined,
  });
  runFfmpeg(plan.args);
  if (vp.hasAudio) log.push('The input video already has audio; it is kept at 0 dB under the effects (no ducking).');

  // Loudness: export, measure the exported MP4, adjust gain / add a limiter, repeat.
  const after = path.join(out, 'after.mp4');
  const exportMp4 = (gainDb: number, limit: number | false) => {
    const af = `volume=${gainDb.toFixed(2)}dB${limit ? `,alimiter=limit=${limit}:level=false` : ''}`;
    runFfmpeg(['-i', video, '-i', mixWav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '256k', '-t', r3(dur), '-movflags', '+faststart', after]);
  };
  const passes: Array<{ pass: number; gainDb: number; limiter: number | false } & LoudnessReading> = [];
  let g = 0;
  let lim: number | false = false;
  let reading: LoudnessReading = { lufs: -Infinity, truePeakDbfs: -Infinity };
  for (let it = 0; it < 10; it++) {
    exportMp4(g, lim);
    reading = measureLoudness(after);
    passes.push({ pass: it + 1, gainDb: g, limiter: lim, ...reading });
    log.push(`pass ${it + 1}: gain ${g >= 0 ? '+' : ''}${g.toFixed(1)} dB, limiter ${lim || 'off'} -> ${reading.lufs.toFixed(1)} LUFS, true peak ${reading.truePeakDbfs.toFixed(1)} dBFS`);
    if (!Number.isFinite(reading.lufs) || reading.lufs < -60) {
      log.push('WARNING: the mix is (near) silent; loudness targeting stopped.');
      break;
    }
    if (Math.abs(reading.lufs - targetLufs) <= 0.5 && reading.truePeakDbfs < maxTp) break;
    if (reading.truePeakDbfs >= maxTp) lim = Math.max(0.0625, Math.round(((lim || 0.6) * 0.9) * 1000) / 1000);
    if (Math.abs(reading.lufs - targetLufs) > 0.5) g = Math.max(-30, Math.min(30, g + (targetLufs - reading.lufs)));
  }
  const mono = measureLoudness(after, true);
  const onTarget = Math.abs(reading.lufs - targetLufs) <= 0.5 && reading.truePeakDbfs < maxTp;
  log.push(`FINAL after.mp4: ${reading.lufs.toFixed(1)} LUFS integrated, true peak ${reading.truePeakDbfs.toFixed(1)} dBFS${onTarget ? '' : ` - OFF TARGET (${targetLufs} LUFS, peak < ${maxTp} dBFS)`}. Mono downmix: ${mono.lufs.toFixed(1)} LUFS, peak ${mono.truePeakDbfs.toFixed(1)} dBFS.`);

  // Proof frames and waveforms around every cue, from the exported MP4.
  const checks: Array<{ idx: number; before?: string; after?: string; wave?: string }> = [];
  if (opts.proof !== false) {
    const dir = path.join(out, 'checks');
    fs.mkdirSync(dir, { recursive: true });
    for (const p of placements) {
      const k = String(p.idx).padStart(2, '0');
      const entry: (typeof checks)[number] = { idx: p.idx };
      for (const [tag, dt] of [['before', -0.1], ['after', 0.15]] as const) {
        const f = path.join(dir, `cue-${k}-${tag}.png`);
        try {
          runFfmpeg(['-v', 'error', '-ss', r3(Math.max(0, Math.min(dur - 0.05, p.t + dt))), '-i', after, '-frames:v', '1', '-vf', 'scale=320:-2', f]);
          entry[tag] = path.relative(out, f);
        } catch {
          // A frame grab at the very end can fail; the report shows the gap.
        }
      }
      const s0 = Math.max(0, p.t - 0.5);
      const s1 = Math.min(dur, p.t + 0.8);
      const wave = path.join(dir, `cue-${k}-wave.png`);
      try {
        runFfmpeg(['-v', 'error', '-ss', r3(s0), '-t', r3(Math.max(0.05, s1 - s0)), '-i', after, '-filter_complex', 'aformat=channel_layouts=mono,showwavespic=s=640x120:colors=0x9cc8ff', '-frames:v', '1', wave]);
        entry.wave = path.relative(out, wave);
      } catch {
        // Waveform is optional proof; keep going.
      }
      checks.push(entry);
    }
  }

  // Credits and licences.
  const usedSounds = [...new Map(placements.map(p => [p.sound.id, p.sound])).values()];
  const unknown = usedSounds.filter(s => !isFree(s.license));
  const musicLine = music
    ? opts.musicLicense
      ? `${opts.musicSource ?? path.basename(music)}, ${opts.musicLicense}`
      : `${opts.musicSource ?? path.basename(music)} - LICENCE NOT CONFIRMED, add the track, artist and licence before publishing`
    : 'No music.';
  const credits = path.join(out, 'CREDITS.txt');
  fs.writeFileSync(credits, `Sound effects\n${usedSounds.map(creditLine).join('\n')}\n\nMusic\n${musicLine}\n`);
  const licences: string[] = unknown.length
    ? ['UNKNOWN LICENCES, do not publish until checked:', ...unknown.map(s => `  ${s.id}: "${s.license}" (${s.sourceUrl ?? 'no source link'})`)]
    : ['All sound effects are bundled CC0 files (Kenney, Freesound). Sources can change their terms; check the source pages now and then.'];
  if (music) licences.push(opts.musicLicense ? `Music licence: ${opts.musicLicense}` : 'Music licence: NOT CONFIRMED. Ask where the track is from and what licence it has.');
  if (opts.useCase) {
    const uc = opts.useCase.toLowerCase();
    const conflict = /mixkit/i.test(`${opts.musicLicense ?? ''}${opts.musicSource ?? ''}`) && /(tv|television|broadcast|radio|game|cd|dvd)/.test(uc);
    licences.push(`Use case: ${opts.useCase}${conflict ? ' - CONFLICT: Mixkit music is not allowed for TV/radio broadcast, video games or CDs/DVDs; pick another track.' : ' - no conflict with the known licence limits; still check each source page today.'}`);
  } else {
    licences.push('Use case: NOT GIVEN. Ask where the video will be published.');
  }

  // Five riskiest timestamps for a human with headphones.
  const residualAt = new Map((alignment?.residuals ?? []).map(r => [r.t, r.errorS]));
  const riskBonus: Record<string, number> = { typing: 0.5, build_up: 0.4, reveal: 0.3, scene_cut: 0.2 };
  const risky = [...placements]
    .sort((a, b) => ((residualAt.get(b.t) ?? 0) * 10 + (riskBonus[b.type] ?? 0)) - ((residualAt.get(a.t) ?? 0) * 10 + (riskBonus[a.type] ?? 0)))
    .slice(0, 5)
    .sort((a, b) => a.t - b.t)
    .map(p => `${p.t.toFixed(2)}s (${p.type}${p.desc ? `: ${p.desc}` : ''}) - check ${residualAt.has(p.t) ? 'beat sync' : 'level/feel'}`);

  const reportJson = path.join(out, 'report.json');
  const reportHtml = path.join(out, 'report.html');
  const report: Record<string, unknown> = {
    tool: 'mgvideo sfx',
    method: 'Measured sound pass by Vox (@Voxyz_ai); ported from Barty-Bart/motion-graphics sound_pass.py (MIT)',
    created: new Date().toISOString(),
    video, output: after, duration_s: dur, fps: vp.fps, seed,
    manifest: lib.manifestPath,
    rejected_manifest_entries: lib.rejected,
    analyzer: analysis ? { kind: 'librosa', librosa: analysis.librosa } : { kind: 'ffmpeg-volumedetect' },
    music: m ? {
      path: music, db: opts.musicDb ?? -12, source: opts.musicSource ?? null, license: opts.musicLicense ?? null,
      tempo_bpm: m.tempo_bpm, beat_period_s: m.beat_period_s, kick_offset_median_s: m.kick_offset_median_s,
      grid_shifted: m.grid_shifted, sub120_energy_ratio: m.sub120_energy_ratio, levels: m.levels,
      start_s: alignment?.startS, cut_to_beat_errors: alignment?.residuals, grid_on_video_s: videoGrid,
      envelope: m.envelope, beats_s: m.beats_s, grid_s: m.grid_s,
    } : null,
    cues: placements.map(p => ({
      idx: p.idx, t: p.t, type: p.type, category: p.category, desc: p.desc, via: p.via,
      sfx: p.sound.id, start_s: Math.round(p.startS * 1000) / 1000, gain_db: p.gainDb, level_match_db: p.levelMatchDb,
      play_s: p.playS ?? null, trim_start_s: p.trimStartS, loop: p.loop, license: p.sound.license, source_url: p.sound.sourceUrl ?? null,
      credit: creditLine(p.sound), snapped_from_s: p.snappedFromS ?? null, beat_error_s: p.beatErrorS ?? null,
      alternatives: categoryPool(lib, p.category).slice(0, 12).map(a => ({ id: a.id, license: a.license, source_url: a.sourceUrl ?? null })),
      checks: checks.find(c => c.idx === p.idx) ?? null,
    })),
    loudness: { target_lufs: targetLufs, max_true_peak_dbfs: maxTp, passes, final: reading, mono, on_target: onTarget },
    licences, credits: path.relative(out, credits), check_with_headphones: risky, log,
  };
  fs.writeFileSync(reportJson, JSON.stringify(report, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 2));
  fs.writeFileSync(reportHtml, renderSfxReportHtml(report, placements, lib, out, checks));
  return { outputVideo: after, mixWav, credits, reportJson, reportHtml, final: reading, mono, placements, log, report };
}

// ---------------------------------------------------------------------------------------------
// HTML report (port of report.py: play every cue, pick alternatives, download swaps.json)

function envelopeSvg(music: Record<string, unknown> | null): string {
  if (!music) return '';
  const env = music.envelope as MusicAnalysis['envelope'];
  const beats = (music.beats_s as number[]) ?? [];
  const grid = (music.grid_s as number[]) ?? [];
  const w = env.window_s || 1;
  const W = 900;
  const H = 90;
  const x = (t: number) => ((t / w) * W).toFixed(1);
  const line = env.t.map((t, i) => `${x(t)},${(H - env.v[i] * (H - 6)).toFixed(1)}`).join(' ');
  const rows = [['librosa grid', beats], ['checked grid', grid]] as const;
  return rows.map(([label, g]) => `<figure><figcaption>${escapeXml(label)}: waveform below 120 Hz vs beat lines (first 4 bars)</figcaption>
<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeXml(label)}"><polyline fill="none" stroke="#9cc8ff" stroke-width="1" points="${line}"/>${g.filter(b => b < w).map(b => `<line x1="${x(b)}" x2="${x(b)}" y1="0" y2="${H}" stroke="#d97757" stroke-width="1"/>`).join('')}</svg></figure>`).join('\n');
}

export function renderSfxReportHtml(
  report: Record<string, unknown>,
  placements: SfxPlacement[],
  lib: SfxLibrary,
  outDir: string,
  checks: Array<{ idx: number; before?: string; after?: string; wave?: string }>,
): string {
  const e = escapeXml;
  const rel = (p: string) => path.relative(outDir, p).split(path.sep).join('/');
  const loud = report.loudness as { final: LoudnessReading; mono: LoudnessReading; on_target: boolean };
  const rows = placements.map(p => {
    const alts = categoryPool(lib, p.category).filter(a => a.id !== p.sound.id).slice(0, 12);
    const opts = [
      `<label class=o><input type=radio name="c${p.idx}" value="" checked> keep</label>`,
      `<label class=o><input type=radio name="c${p.idx}" value="auto"> let model decide</label>`,
      ...alts.map(a => `<div class=o><label><input type=radio name="c${p.idx}" value="${e(a.id)}"> ${e(path.basename(a.id).slice(0, 40))}</label> <audio controls preload=none src="${e(rel(a.absPath))}"></audio> ${a.sourceUrl ? `<a href="${e(a.sourceUrl)}" target=_blank rel=noopener>source</a>` : ''} <span class=m>${e(a.license)}</span></div>`),
    ];
    const ck = checks.find(c => c.idx === p.idx);
    const proof = ck ? [ck.before, ck.after, ck.wave].filter(Boolean).map(s => `<img src="${e(String(s))}" alt="" loading=lazy>`).join('') : '';
    return `<tr><td><button onclick="seek(${p.t})">${p.t.toFixed(2)}s</button>${p.snappedFromS !== undefined ? `<br><span class=m>snapped from ${p.snappedFromS.toFixed(3)}s</span>` : ''}${p.beatErrorS !== undefined ? `<br><span class=m>beat err ${(p.beatErrorS * 1000).toFixed(0)} ms</span>` : ''}</td>
<td>${e(p.type)}<br><span class=m>${e(p.desc)}</span></td><td><b>${e(p.category)}</b><br><span class=m>${e(p.via)}, ${(p.gainDb + p.levelMatchDb).toFixed(1)} dB</span></td>
<td>${e(path.basename(p.sound.id))}<br><audio controls preload=none src="${e(rel(p.sound.absPath))}"></audio><br>${p.sound.sourceUrl ? `<a href="${e(p.sound.sourceUrl)}" target=_blank rel=noopener>source page</a> · ` : ''}<span class=m>${e(p.sound.license)}</span><br><span class=m>${e(creditLine(p.sound))}</span></td>
<td><details><summary>alternatives (${alts.length})</summary>${opts.join('')}</details></td><td class=pf>${proof}</td></tr>`;
  }).join('\n');
  const list = (xs: unknown) => ((xs as string[]) ?? []).map(x => `<li>${e(x)}</li>`).join('');
  return `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Sound pass report</title>
<style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:20px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #333;padding:8px;vertical-align:top;text-align:left}.m{color:#999;font-size:12px}a{color:#9cc8ff}.o{margin:4px 0}audio{height:28px;vertical-align:middle;max-width:100%}button{background:#d97757;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer}video{max-height:420px;max-width:100%}.pf img{display:block;max-width:220px;margin-bottom:4px}figure{margin:8px 0}figcaption{color:#999;font-size:12px}.bad{color:#ff8a80}</style>
<h1>Sound pass report</h1>
<p>Final mix: <b class="${loud.on_target ? '' : 'bad'}">${loud.final.lufs.toFixed(1)} LUFS</b>, true peak <b>${loud.final.truePeakDbfs.toFixed(1)} dBFS</b>; mono ${loud.mono.lufs.toFixed(1)} LUFS / ${loud.mono.truePeakDbfs.toFixed(1)} dBFS (measured on the exported MP4). Approach: Vox (@Voxyz_ai). Not claiming it sounds good: listen.</p>
<video id=v controls src="after.mp4"></video>
<h2>Check these with headphones</h2><ul>${list(report.check_with_headphones)}</ul>
<h2>Licences</h2><ul>${list(report.licences)}</ul><p class=m>${(report.rejected_manifest_entries as SfxRejection[]).length} manifest entries were rejected (runtime URLs or non-CC0) and never used. CREDITS.txt lists what was placed.</p>
${envelopeSvg(report.music as Record<string, unknown> | null)}
<h2>Cues</h2>
<p>Click a timestamp to jump there. To swap a sound pick an alternative or "let model decide", then <button onclick="dl()">Download swaps.json</button> and re-run <code>mgvideo sfx ... --swaps swaps.json</code>. Keep cue indices stable between runs.</p>
<table><tr><th>time</th><th>cue</th><th>category</th><th>sound used</th><th>swap</th><th>proof</th></tr>${rows}</table>
<h2>Log</h2><ul>${list(report.log)}</ul>
<script>function seek(t){const v=document.getElementById('v');v.currentTime=Math.max(0,t-0.5);v.play()}
function dl(){const s={};document.querySelectorAll('input[type=radio]:checked').forEach(i=>{if(i.value)s[i.name.slice(1)]=i.value});
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(s,null,1)],{type:'application/json'}));a.download='swaps.json';a.click()}</script></html>
`;
}
