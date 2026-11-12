import { spawnSync } from 'node:child_process';
import { assertOnline, helperNetworkEnv } from './offline.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe, runFfmpeg, runTool, type StreamProbe } from './proc.js';

/**
 * Object separation (SAM 2.1 via Hugging Face transformers) for `mgvideo separate`.
 *
 * The method is ported from the object-separation skill by Barty-Bart
 * (Barty-Bart/motion-graphics, MIT licence). Python runs in a managed venv in the user cache,
 * created by `mgvideo setup separate`; model weights land in the Hugging Face cache on first use.
 * Everything else (validation, frame extraction, preview and alpha composition) is TS + ffmpeg.
 */

/**
 * Pinned Python packages. Older stacks (torch 2.8 / transformers 4.57) return wrong SAM 2 masks
 * on Apple MPS (verified on a synthetic clip: the subject came back inverted or empty); torch 2.15
 * with transformers 5.22 matches the CPU result. torchvision is not in upstream's list but the
 * fast SAM 2 image processor imports it. numpy 2.5 and torch 2.15 set the Python floor at 3.12.
 */
export const SEPARATE_PINS = [
  'torch==2.15.0',
  'torchvision==0.29.2',
  'transformers==5.22.1',
  'opencv-python-headless==5.0.0.93',
  'pillow==13.0.0',
  'numpy==2.5.4',
] as const;

export const PYTHON_MIN: [number, number] = [3, 12];
export const PYTHON_MAX: [number, number] = [3, 15];

export const SEPARATE_MODELS = {
  tiny: 'facebook/sam2.1-hiera-tiny',
  'base-plus': 'facebook/sam2.1-hiera-base-plus',
  large: 'facebook/sam2.1-hiera-large',
} as const;
export type SeparateModelSize = keyof typeof SEPARATE_MODELS;

/** Rough seconds per frame by device, used only for the up-front time estimate. */
export const SECONDS_PER_FRAME: Record<string, number> = { cpu: 5, mps: 1, cuda: 0.25 };

export interface SeparatePoint {
  x: number;
  y: number;
  /** 1 = subject, 0 = exclude. */
  label: 0 | 1;
}

export interface SeparateMarker {
  createdAt: string;
  python: string;
  pythonVersion: string;
  pins: string[];
  scan: { device: string; model: string; model_size: string; gpu?: string; vram_gb?: number; torch?: string; transformers?: string };
}

// ---------------------------------------------------------------------------
// Managed environment
// ---------------------------------------------------------------------------

/** `$XDG_CACHE_HOME/mgvideo` or `~/.cache/mgvideo`. */
export function mgvideoCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CACHE_HOME && path.isAbsolute(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : path.join(os.homedir(), '.cache');
  return path.join(base, 'mgvideo');
}

export function separateVenvDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(mgvideoCacheDir(env), 'venvs', 'separate');
}

export function venvPython(venvDir: string): string {
  return process.platform === 'win32' ? path.join(venvDir, 'Scripts', 'python.exe') : path.join(venvDir, 'bin', 'python');
}

export function separateMarkerPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(separateVenvDir(env), 'mgvideo-setup.json');
}

/** Reads the marker written by a completed `mgvideo setup separate`; null when not set up. */
export function readSeparateMarker(env: NodeJS.ProcessEnv = process.env): SeparateMarker | null {
  const marker = separateMarkerPath(env);
  if (!fs.existsSync(marker) || !fs.existsSync(venvPython(separateVenvDir(env)))) return null;
  try {
    return JSON.parse(fs.readFileSync(marker, 'utf8')) as SeparateMarker;
  } catch {
    return null;
  }
}

function pythonVersion(bin: string): [number, number, number] | null {
  try {
    const out = runTool(bin, ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])']).trim();
    const [a, b, c] = out.split('.').map(Number);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b, c || 0] : null;
  } catch {
    return null;
  }
}

const cmpVer = (a: [number, number], b: [number, number]) => (a[0] - b[0]) || (a[1] - b[1]);

/** True when the pinned wheels support this interpreter (torchvision 0.29.2 excludes 3.14.1). */
export function pythonSupported(v: [number, number, number]): boolean {
  const mm: [number, number] = [v[0], v[1]];
  return cmpVer(mm, PYTHON_MIN) >= 0 && cmpVer(mm, PYTHON_MAX) <= 0 && v.join('.') !== '3.14.1';
}

/**
 * Finds a Python the pinned torch supports (3.10 to 3.13). `MGVIDEO_PYTHON` overrides the search.
 * Throws a message that names what was found when nothing fits.
 */
export function findSeparatePython(env: NodeJS.ProcessEnv = process.env): { bin: string; version: string } {
  const candidates = env.MGVIDEO_PYTHON
    ? [env.MGVIDEO_PYTHON]
    : ['python3.13', 'python3.12', 'python3.14', 'python3.15', 'python3', 'python'];
  const seen: string[] = [];
  for (const bin of candidates) {
    const v = pythonVersion(bin);
    if (!v) continue;
    seen.push(`${bin} ${v.join('.')}`);
    if (pythonSupported(v)) return { bin, version: v.join('.') };
  }
  const range = `${PYTHON_MIN.join('.')} to ${PYTHON_MAX.join('.')}`;
  throw new Error(
    seen.length === 0
      ? `python3 >= ${PYTHON_MIN.join('.')} is required for object separation and none was found on PATH. Install Python ${range} (or set MGVIDEO_PYTHON).`
      : `Object separation needs Python ${range} (the pinned torch has no wheels for other versions). Found: ${seen.join(', ')}. Install a supported Python or set MGVIDEO_PYTHON.`,
  );
}

/** Locates the Python helper both from source (tsx) and from the compiled dist tree. */
export function separateHelperPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../python/separate.py'),
    path.resolve(here, '../../../../packages/media/python/separate.py'),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error(`separate.py helper not found (looked in ${candidates.join(', ')})`);
  return found;
}

function helperEnv(): NodeJS.ProcessEnv {
  // Let ops that MPS does not implement fall back to the CPU instead of failing.
  return { ...helperNetworkEnv(), PYTORCH_ENABLE_MPS_FALLBACK: '1', TOKENIZERS_PARALLELISM: 'false', TRANSFORMERS_VERBOSITY: 'error' };
}

export interface SetupResult {
  status: 'created' | 'exists';
  venvDir: string;
  marker: SeparateMarker;
}

/**
 * Creates (or reuses) the managed venv with the pinned packages, then records a hardware scan in
 * a marker file so `doctor` and `separate` can report the device without importing torch.
 */
export function setupSeparate(opts: { force?: boolean; log?: (msg: string) => void } = {}): SetupResult {
  const log = opts.log ?? (() => {});
  const venvDir = separateVenvDir();
  const existing = readSeparateMarker();
  if (!opts.force && existing && JSON.stringify(existing.pins) === JSON.stringify(SEPARATE_PINS)) {
    return { status: 'exists', venvDir, marker: existing };
  }

  const py = findSeparatePython();
  const vpy = venvPython(venvDir);
  // Recreate on --force, or when an older venv was built with an interpreter the pins no longer support.
  const existingVer = fs.existsSync(vpy) ? pythonVersion(vpy) : null;
  if ((opts.force || (existingVer && !pythonSupported(existingVer))) && fs.existsSync(venvDir)) {
    fs.rmSync(venvDir, { recursive: true, force: true });
  }
  // Drop a stale marker first so an interrupted install is never reported as ready.
  fs.rmSync(separateMarkerPath(), { force: true });
  if (!fs.existsSync(vpy)) {
    log(`Creating venv at ${venvDir} with ${py.bin} ${py.version}`);
    fs.mkdirSync(path.dirname(venvDir), { recursive: true });
    runTool(py.bin, ['-m', 'venv', venvDir]);
  }
  log(`Installing ${SEPARATE_PINS.join(' ')} (torch is large; this can take several minutes)`);
  assertOnline('pip install for mgvideo setup separate');
  const pip = spawnSync(vpy, ['-m', 'pip', 'install', '--disable-pip-version-check', '--progress-bar', 'off', ...SEPARATE_PINS], { stdio: 'inherit' });
  if (pip.error) throw new Error(`pip failed to start: ${pip.error.message}`);
  if (pip.status !== 0) throw new Error(`pip install failed with exit code ${pip.status}`);

  const scanOut = runTool(vpy, [separateHelperPath(), 'scan'], { env: helperEnv() });
  const scan = JSON.parse(scanOut.trim().split('\n').pop() ?? '{}') as SeparateMarker['scan'] & { ok?: boolean; error?: string };
  if (scan.ok === false) throw new Error(`hardware scan failed: ${scan.error}`);
  const marker: SeparateMarker = {
    createdAt: new Date().toISOString(),
    python: py.bin,
    pythonVersion: pythonVersion(vpy)?.join('.') ?? py.version,
    pins: [...SEPARATE_PINS],
    scan,
  };
  fs.writeFileSync(separateMarkerPath(), JSON.stringify(marker, null, 2) + '\n');
  return { status: 'created', venvDir, marker };
}

// ---------------------------------------------------------------------------
// Pure validation
// ---------------------------------------------------------------------------

/** Parses `x,y[,label]` (label 1 = subject, 0 = exclude; default 1). */
export function parsePoint(text: string): SeparatePoint {
  const parts = String(text).trim().split(',').map(s => s.trim());
  if (parts.length < 2 || parts.length > 3) throw new Error(`Invalid point ${JSON.stringify(text)}: expected x,y[,label]`);
  const num = /^\d+(?:\.\d+)?$/;
  if (!num.test(parts[0]) || !num.test(parts[1])) throw new Error(`Invalid point ${JSON.stringify(text)}: x and y must be non-negative numbers`);
  let label: 0 | 1 = 1;
  if (parts.length === 3) {
    if (parts[2] !== '0' && parts[2] !== '1') throw new Error(`Invalid point ${JSON.stringify(text)}: label must be 1 (subject) or 0 (exclude)`);
    label = parts[2] === '1' ? 1 : 0;
  }
  return { x: Number(parts[0]), y: Number(parts[1]), label };
}

/** Points must lie inside the frame, and at least one must mark the subject. */
export function validatePoints(points: SeparatePoint[], width: number, height: number): SeparatePoint[] {
  if (points.length === 0) throw new Error('At least one --point is required');
  for (const p of points) {
    if (!(p.x >= 0 && p.x < width && p.y >= 0 && p.y < height)) {
      throw new Error(`Point ${p.x},${p.y} is outside the ${width}x${height} frame`);
    }
  }
  if (!points.some(p => p.label === 1)) throw new Error('At least one point must have label 1 (the subject)');
  return points;
}

/** Resolves and checks the inclusive frame range against the clip's frame count. */
export function validateFrameRange(start: number | undefined, end: number | undefined, totalFrames: number): { start: number; end: number } {
  const s = start ?? 0;
  const e = end ?? totalFrames - 1;
  if (!Number.isInteger(s) || s < 0) throw new Error(`--start must be a non-negative integer, got ${start}`);
  if (!Number.isInteger(e) || e < 0) throw new Error(`--end must be a non-negative integer, got ${end}`);
  if (s > e) throw new Error(`--start (${s}) must not be after --end (${e})`);
  if (e >= totalFrames) throw new Error(`--end (${e}) is past the last frame (${totalFrames - 1})`);
  return { start: s, end: e };
}

/** Parses a strict non-negative integer CLI value. */
export function parseFrameNumber(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(String(value).trim())) throw new Error(`${label} must be a non-negative integer frame number, got ${JSON.stringify(value)}`);
  return Number(value);
}

function rate(r: unknown): number {
  if (typeof r !== 'string' || r === '0/0') return NaN;
  const [n, d] = r.split('/').map(Number);
  return d ? n / d : Number(r);
}

/** Throws unless the video is constant frame rate (frame numbers must map to fixed timestamps). */
export function assertConstantFrameRate(info: StreamProbe, file: string): number {
  const v = ((info.raw.streams as Record<string, unknown>[] | undefined) ?? []).find(s => s.codec_type === 'video');
  if (!v) throw new Error(`${file} has no video stream`);
  const r = rate(v.r_frame_rate);
  const avg = rate(v.avg_frame_rate);
  if (!Number.isFinite(r) || r <= 0) throw new Error(`Could not read the frame rate of ${file}`);
  if (Number.isFinite(avg) && Math.abs(avg - r) / r > 0.01) {
    throw new Error(`${file} looks variable frame rate (r=${r.toFixed(3)}, avg=${avg.toFixed(3)} fps). Convert it first: ffmpeg -i in.mp4 -fps_mode cfr -r 30 out.mp4`);
  }
  return r;
}

/** Frame count from the container, or by counting packets when the header lacks it. */
export function countFrames(file: string, info: StreamProbe): number {
  const v = ((info.raw.streams as Record<string, unknown>[] | undefined) ?? []).find(s => s.codec_type === 'video');
  const nb = Number(v?.nb_frames);
  if (Number.isInteger(nb) && nb > 0) return nb;
  const out = runTool('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]).trim();
  const n = parseInt(out, 10);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Could not count frames in ${file}`);
  return n;
}

export function estimateSeconds(device: string, frames: number): number {
  return Math.round((SECONDS_PER_FRAME[device] ?? SECONDS_PER_FRAME.cpu) * frames);
}

// ---------------------------------------------------------------------------
// ffmpeg composition (works on any mask sequence, no Python needed)
// ---------------------------------------------------------------------------

export interface ComposeInput {
  video: string;
  /** Directory with `%05d.png` masks numbered by absolute frame (white = subject). */
  masksDir: string;
  start: number;
  end: number;
  fps: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

function trimArgs(c: ComposeInput) {
  const count = c.end - c.start + 1;
  const video = `[0:v]trim=start_frame=${c.start}:end_frame=${c.end + 1},setpts=PTS-STARTPTS,fps=${c.fps}`;
  const mask = `[1:v]scale=${c.width}:${c.height}:flags=bilinear,format=gray,setpts=PTS-STARTPTS`;
  const audio = `[0:a]atrim=start=${(c.start / c.fps).toFixed(6)}:duration=${(count / c.fps).toFixed(6)},asetpts=PTS-STARTPTS[aout]`;
  const inputs = ['-i', c.video, '-framerate', String(c.fps), '-start_number', String(c.start), '-i', path.join(c.masksDir, '%05d.png')];
  return { count, video, mask, audio, inputs };
}

/** Video with the subject tinted green, a soft glow and a bright edge (upstream's preview look). */
export function buildGreenPreview(c: ComposeInput, outPath: string, fill = 0.35): string {
  const t = trimArgs(c);
  const graph = [
    `${t.video},format=rgb24,split=2[base][paint]`,
    `[paint]drawbox=x=0:y=0:w=iw:h=ih:color=0x39FF14:t=fill,split=2[green][glowc]`,
    `${t.mask},split=3[m1][md][me]`,
    // Morphological gradient (dilate minus erode), like upstream's cv2.MORPH_GRADIENT rim.
    `[md]dilation,dilation,dilation[dil]`,
    `[me]erosion,erosion,erosion[ero]`,
    `[m1]lut=y=val*${fill}[fillA]`,
    `[dil][ero]blend=all_mode=difference,split=2[edge][edge2]`,
    `[edge2]gblur=sigma=10,lut=y=val*2.5[glowA]`,
    `[green][fillA]alphamerge[tint]`,
    `[glowc][glowA]alphamerge[glow]`,
    `color=c=0xC8FFDC:s=${c.width}x${c.height}:r=${c.fps}[edgec]`,
    `[edgec][edge]alphamerge[rim]`,
    `[base][tint]overlay=format=auto[t1]`,
    `[t1][glow]overlay=format=auto[t2]`,
    `[t2][rim]overlay=format=auto:shortest=1,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[vout]`,
    ...(c.hasAudio ? [t.audio] : []),
  ].join(';');
  runFfmpeg([
    ...t.inputs,
    '-filter_complex', graph,
    '-map', '[vout]', ...(c.hasAudio ? ['-map', '[aout]', '-c:a', 'aac'] : []),
    '-frames:v', String(t.count),
    '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast',
    outPath,
  ]);
  return outPath;
}

export type CutoutFormat = 'mov' | 'webm';

/** Subject on a transparent background: ProRes 4444 (.mov) or VP9 with alpha (.webm). */
export function buildAlphaCutout(c: ComposeInput, outPath: string, format: CutoutFormat, featherSigma = 1): string {
  const t = trimArgs(c);
  const soften = featherSigma > 0 ? `,gblur=sigma=${featherSigma}` : '';
  const graph = [
    `${t.video},format=rgba[fg]`,
    `${t.mask}${soften}[alpha]`,
    `[fg][alpha]alphamerge${format === 'mov' ? ',format=yuva444p10le' : ',format=yuva420p'}[vout]`,
    ...(c.hasAudio ? [t.audio] : []),
  ].join(';');
  const codec = format === 'mov'
    ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-alpha_bits', '16', '-vendor', 'apl0', ...(c.hasAudio ? ['-c:a', 'pcm_s16le'] : [])]
    : ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-row-mt', '1', '-auto-alt-ref', '0', ...(c.hasAudio ? ['-c:a', 'libopus'] : [])];
  runFfmpeg([
    ...t.inputs,
    '-filter_complex', graph,
    '-map', '[vout]', ...(c.hasAudio ? ['-map', '[aout]'] : []),
    '-frames:v', String(t.count),
    ...codec,
    outPath,
  ]);
  return outPath;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Working width for SAM input frames. SAM resizes to 1024 itself, so wider is not better. */
export const WORK_WIDTH = 960;

export interface SeparateOptions {
  video: string;
  points: SeparatePoint[];
  start?: number;
  end?: number;
  model?: SeparateModelSize;
  outDir: string;
  formats?: CutoutFormat[];
  keepFrames?: boolean;
  chunk?: number;
  log?: (msg: string) => void;
  /** Called after validation, before any heavy work (used to print the time estimate). */
  onPlan?: (plan: SeparatePlan) => void;
}

export interface SeparatePlan {
  video: string;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  start: number;
  end: number;
  frames: number;
  points: SeparatePoint[];
  hasAudio: boolean;
}

/** Validates the clip, points and range without touching Python. */
export function planSeparation(video: string, points: SeparatePoint[], start?: number, end?: number): SeparatePlan {
  const info = probe(video);
  if (!info.hasVideo) throw new Error(`${video} has no video stream`);
  const fps = assertConstantFrameRate(info, video);
  const totalFrames = countFrames(video, info);
  const range = validateFrameRange(start, end, totalFrames);
  const width = info.displayWidth;
  const height = info.displayHeight;
  validatePoints(points, width, height);
  return { video, fps, width, height, totalFrames, ...range, frames: range.end - range.start + 1, points, hasAudio: info.hasAudio };
}

/** Extracts frames START..END as `%05d.jpg` (absolute numbering), scaled to the working width. */
export function extractFrames(plan: SeparatePlan, dir: string): { workWidth: number; workHeight: number } {
  fs.mkdirSync(dir, { recursive: true });
  const workWidth = Math.min(WORK_WIDTH, plan.width);
  const workHeight = Math.round((plan.height * workWidth) / plan.width);
  runFfmpeg([
    '-i', plan.video,
    '-vf', `trim=start_frame=${plan.start}:end_frame=${plan.end + 1},scale=${workWidth}:${workHeight}`,
    '-fps_mode', 'passthrough',
    '-frames:v', String(plan.frames),
    '-start_number', String(plan.start),
    '-q:v', '2',
    path.join(dir, '%05d.jpg'),
  ]);
  return { workWidth, workHeight };
}

export interface SeparateResult {
  plan: SeparatePlan;
  helper: Record<string, unknown>;
  masksDir: string;
  preview: string;
  cutouts: string[];
  summaryPath: string;
}

/** Full pipeline: validate, extract, run SAM in the managed venv, compose preview and cut-outs. */
export function separateVideo(opts: SeparateOptions): SeparateResult {
  const log = opts.log ?? (() => {});
  const marker = readSeparateMarker();
  if (!marker) throw new Error('Object separation is not set up. Run `mgvideo setup separate` first.');
  const video = path.resolve(opts.video);
  const plan = planSeparation(video, opts.points, opts.start, opts.end);
  opts.onPlan?.(plan);

  const outDir = path.resolve(opts.outDir);
  const framesDir = path.join(outDir, 'frames');
  const masksDir = path.join(outDir, 'masks');
  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(masksDir, { recursive: true, force: true });
  fs.rmSync(framesDir, { recursive: true, force: true });

  log(`Extracting frames ${plan.start}..${plan.end} (${plan.frames} frames)`);
  const work = extractFrames(plan, framesDir);
  const sx = work.workWidth / plan.width;
  const sy = work.workHeight / plan.height;

  const args = [separateHelperPath(), 'run', '--frames', framesDir, '--masks', masksDir, '--start', String(plan.start), '--end', String(plan.end)];
  for (const p of plan.points) args.push('--point', `${(p.x * sx).toFixed(2)},${(p.y * sy).toFixed(2)},${p.label}`);
  if (opts.model) args.push('--model', SEPARATE_MODELS[opts.model]);
  if (opts.chunk) args.push('--chunk', String(opts.chunk));

  // stderr streams progress to the terminal; stdout carries the JSON summary.
  const res = spawnSync(venvPython(separateVenvDir()), args, { env: helperEnv(), stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new Error(`separation helper failed to start: ${res.error.message}`);
  const lastLine = String(res.stdout).trim().split('\n').pop() ?? '';
  let helper: Record<string, unknown>;
  try {
    helper = JSON.parse(lastLine) as Record<string, unknown>;
  } catch {
    throw new Error(`separation helper exited ${res.status} without a JSON summary: ${String(res.stdout).slice(-500)}`);
  }
  if (res.status !== 0 || helper.ok !== true) throw new Error(`separation failed: ${String(helper.error ?? `exit ${res.status}`)}`);

  const compose: ComposeInput = { video, masksDir, start: plan.start, end: plan.end, fps: plan.fps, width: plan.width, height: plan.height, hasAudio: plan.hasAudio };
  log('Composing green-highlight preview');
  const preview = buildGreenPreview(compose, path.join(outDir, 'preview.mp4'));
  const cutouts: string[] = [];
  for (const f of opts.formats ?? ['mov']) {
    log(`Composing alpha cut-out (${f})`);
    cutouts.push(buildAlphaCutout(compose, path.join(outDir, `cutout.${f}`), f));
  }
  if (!opts.keepFrames) fs.rmSync(framesDir, { recursive: true, force: true });

  const summaryPath = path.join(outDir, 'separate.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ plan, helper, masksDir, preview, cutouts, attribution: 'Method ported from Barty-Bart/motion-graphics object-separation (MIT)' }, null, 2) + '\n');
  return { plan, helper, masksDir, preview, cutouts, summaryPath };
}
