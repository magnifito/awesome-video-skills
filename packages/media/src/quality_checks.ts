import { spawnSync } from 'node:child_process';
import { ffmpegStderr } from './proc.js';

/**
 * Measured picture and sound checks on a finished video, using ffmpeg only, so they work for
 * every renderer. Thresholds follow the quality floor in
 * skills/magnifito-deliver/reference/render-qa.md (designs described in
 * docs/plans/raea-adoption.md, phase 3); no upstream code is used.
 */

/** A time span in seconds, half-open [start, end). */
export interface Span {
  start: number;
  end: number;
}

/** Spans where the picture does not change (`freezedetect`). */
export function detectFreezes(file: string, minSeconds = 3, noiseDb = -60): Span[] {
  const log = ffmpegStderr(['-i', file, '-map', '0:v:0', '-vf', `freezedetect=n=${noiseDb}dB:d=${minSeconds}`, '-f', 'null', '-']);
  return pairSpans(log, /freeze_start:\s*([\d.]+)/g, /freeze_end:\s*([\d.]+)/g, durationOf(log));
}

/** Spans of (near) black picture (`blackdetect`). */
export function detectBlack(file: string, minSeconds = 0.5): Span[] {
  const log = ffmpegStderr(['-i', file, '-map', '0:v:0', '-vf', `blackdetect=d=${minSeconds}:pic_th=0.98:pix_th=0.10`, '-f', 'null', '-']);
  const spans: Span[] = [];
  for (const m of log.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)) {
    spans.push({ start: parseFloat(m[1]), end: parseFloat(m[2]) });
  }
  return spans;
}

/** Pairs start/end markers; a span still open at the end of the file ends at the duration. */
function pairSpans(log: string, startRe: RegExp, endRe: RegExp, duration: number): Span[] {
  const starts = [...log.matchAll(startRe)].map(m => parseFloat(m[1]));
  const ends = [...log.matchAll(endRe)].map(m => parseFloat(m[1]));
  return starts.map((start, i) => ({ start, end: ends[i] ?? duration }));
}

/** Duration from the ffmpeg input header, 0 when not found. */
function durationOf(log: string): number {
  const m = log.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  return m ? parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]) : 0;
}

/** RMS level in dBFS per 10 ms window of the mixed-down audio; -Infinity for digital silence. */
export function rmsWindows(file: string, windowMs = 10): number[] {
  const rate = 48000;
  const samples = Math.round((rate * windowMs) / 1000);
  const log = ffmpegStderr([
    '-i', file, '-map', '0:a:0', '-af',
    `aresample=${rate},aformat=channel_layouts=mono,asetnsamples=n=${samples}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level`,
    '-f', 'null', '-'
  ]);
  const out: number[] = [];
  for (const m of log.matchAll(/lavfi\.astats\.Overall\.RMS_level=(-?inf|-?[\d.]+)/g)) {
    out.push(m[1].endsWith('inf') ? -Infinity : parseFloat(m[1]));
  }
  return out;
}

export interface DeadStopOptions {
  windowMs: number;
  /** Length of the steady stretch before the stop, in seconds. */
  steadySeconds: number;
  /** Largest spread of the smoothed level over the steady stretch, in dB. */
  steadySpreadDb: number;
  /** Quietest level that still counts as a bed, in dBFS. */
  floorDb: number;
  /** Drop in one window, in dB below the steady level. */
  dropDb: number;
  /** How far down the level must stay, in dB below the steady level. */
  stayDownDb: number;
  /** How long it must stay down, in seconds. */
  staySeconds: number;
}

export const DEAD_STOP_DEFAULTS: DeadStopOptions = {
  windowMs: 10, steadySeconds: 1, steadySpreadDb: 3, floorDb: -50, dropDb: 12, stayDownDb: 24, staySeconds: 0.3
};

/**
 * Finds places where a steady sound (a music bed, a drone) cuts out with no fade: after a steady
 * stretch, the level falls by `dropDb` within one window and stays `stayDownDb` down for
 * `staySeconds`. Returns the times of the stops in seconds. Works on the total level only.
 */
export function findDeadStops(levels: number[], opts: Partial<DeadStopOptions> = {}): number[] {
  const o = { ...DEAD_STOP_DEFAULTS, ...opts };
  const win = o.windowMs / 1000;
  const steadyN = Math.round(o.steadySeconds / win);
  const stayN = Math.round(o.staySeconds / win);
  const smoothN = Math.max(1, Math.round(0.1 / win));
  const finite = (v: number) => (Number.isFinite(v) ? v : -120);
  // 100 ms moving average in dB, so single-window ripple in music does not break "steady".
  const smooth = levels.map((_, i) => {
    const from = Math.max(0, i - smoothN + 1);
    let sum = 0;
    for (let j = from; j <= i; j++) sum += finite(levels[j]);
    return sum / (i - from + 1);
  });
  const stops: number[] = [];
  let i = steadyN;
  while (i < levels.length - stayN) {
    const steady = smooth.slice(i - steadyN + smoothN - 1, i);
    const lo = Math.min(...steady);
    const hi = Math.max(...steady);
    const level = steady.reduce((a, b) => a + b, 0) / steady.length;
    const isSteady = steady.length > 0 && hi - lo < o.steadySpreadDb && level > o.floorDb;
    if (isSteady && finite(levels[i]) <= level - o.dropDb) {
      const after = levels.slice(i, i + stayN).map(finite);
      if (after.every(v => v <= level - o.stayDownDb)) {
        stops.push(Number((i * win).toFixed(2)));
        i += steadyN; // one report per stop
        continue;
      }
    }
    i++;
  }
  return stops;
}

export interface FlashOptions {
  /** Width the picture is scaled to before analysis. */
  width: number;
  /** Grid of analysis windows per side (3 = thirds of the frame). */
  grid: number;
  /** Smallest change in relative luminance that counts. */
  minDelta: number;
  /** The darker state must be below this relative luminance (WCAG general flash). */
  darkerBelow: number;
  /** Share of a window's pixels that must change. */
  minArea: number;
  /** More swings than this in any one second fails (two swings make one flash). */
  maxSwingsPerSecond: number;
}

export const FLASH_DEFAULTS: FlashOptions = {
  width: 96, grid: 3, minDelta: 0.1, darkerBelow: 0.8, minArea: 0.25, maxSwingsPerSecond: 6
};

export interface FlashFinding {
  /** Start of the worst one-second window, in seconds. */
  at_s: number;
  /** Swings counted in that window. */
  swings: number;
}

/**
 * General-flash check after WCAG 2.3.1: more than three flashes (six opposing luminance swings)
 * in any one second over a quarter of a third-of-frame window. Red flashes are not checked.
 * Returns the worst window when the limit is passed, else null.
 */
export function detectFlashes(file: string, fps: number, opts: Partial<FlashOptions> = {}): FlashFinding | null {
  const o = { ...FLASH_DEFAULTS, ...opts };
  const w = o.width - (o.width % 2);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [srcW, srcH] = String(probe.stdout).trim().split(',').map(Number);
  if (!srcW || !srcH) throw new Error(`cannot read the frame size of ${file}`);
  const h = Math.max(2, Math.round((w * srcH) / srcW / 2) * 2);
  const res = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-map', '0:v:0', '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'],
    { maxBuffer: 1024 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${String(res.stderr).slice(-500)}`);
  const buf = res.stdout as Buffer;
  const frameSize = w * h;
  const frames = Math.floor(buf.length / frameSize);
  // Gamma-encoded luma to approximate relative luminance.
  const lut = Array.from({ length: 256 }, (_, v) => Math.pow(v / 255, 2.2));

  // Per window, the signed swings per frame: +1 brighter, -1 darker, 0 none.
  const cells = o.grid * o.grid;
  const lastSign = new Array<number>(cells).fill(0);
  const swingFrames: number[] = [];
  for (let f = 1; f < frames; f++) {
    const cur = f * frameSize;
    const prev = (f - 1) * frameSize;
    let swung = false;
    for (let c = 0; c < cells && !swung; c++) {
      const cx = c % o.grid;
      const cy = Math.floor(c / o.grid);
      const x0 = Math.floor((cx * w) / o.grid), x1 = Math.floor(((cx + 1) * w) / o.grid);
      const y0 = Math.floor((cy * h) / o.grid), y1 = Math.floor(((cy + 1) * h) / o.grid);
      let up = 0, down = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const a = lut[buf[prev + y * w + x]];
          const b = lut[buf[cur + y * w + x]];
          n++;
          if (Math.abs(b - a) >= o.minDelta && Math.min(a, b) < o.darkerBelow) {
            if (b > a) up++; else down++;
          }
        }
      }
      const sign = up >= o.minArea * n ? 1 : down >= o.minArea * n ? -1 : 0;
      if (sign !== 0 && sign !== lastSign[c]) {
        lastSign[c] = sign;
        swung = true;
      }
    }
    if (swung) swingFrames.push(f);
  }

  // Sliding one-second window over the swing frames.
  const perSecond = Math.max(1, Math.round(fps));
  let worst: FlashFinding | null = null;
  let lo = 0;
  for (let hi = 0; hi < swingFrames.length; hi++) {
    while (swingFrames[hi] - swingFrames[lo] >= perSecond) lo++;
    const count = hi - lo + 1;
    if (count > o.maxSwingsPerSecond && (!worst || count > worst.swings)) {
      worst = { at_s: Number((swingFrames[lo] / fps).toFixed(2)), swings: count };
    }
  }
  return worst;
}
