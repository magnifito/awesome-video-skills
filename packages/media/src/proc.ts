import { execFileSync, spawnSync, type ExecFileSyncOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Shared process, probing and escaping helpers for every media engine.
 *
 * All external tools are invoked with argument arrays (execFileSync), never via a
 * shell string, so file names and user-supplied option values cannot inject commands.
 */

const DEFAULT_OPTS: ExecFileSyncOptions = { stdio: 'pipe', maxBuffer: 256 * 1024 * 1024 };

/** Runs ffmpeg with the given argument array. `-y` and `-hide_banner` are prepended. */
export function runFfmpeg(args: string[], opts: ExecFileSyncOptions = {}): string {
  try {
    const out = execFileSync('ffmpeg', ['-y', '-hide_banner', ...args], { ...DEFAULT_OPTS, ...opts });
    return out ? out.toString() : '';
  } catch (err) {
    throw new Error(`ffmpeg failed: ${extractStderr(err)}`);
  }
}

/** Runs ffmpeg and returns its stderr (analysis filters log there). Throws on non-zero exit. */
export function ffmpegStderr(args: string[]): string {
  const res = spawnSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (res.error) throw new Error(`ffmpeg failed to start: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${String(res.stderr).slice(-2000)}`);
  return String(res.stderr);
}

/** Runs an arbitrary tool with an argument array. */
export function runTool(bin: string, args: string[], opts: ExecFileSyncOptions = {}): string {
  try {
    const out = execFileSync(bin, args, { ...DEFAULT_OPTS, ...opts });
    return out ? out.toString() : '';
  } catch (err) {
    throw new Error(`${bin} failed: ${extractStderr(err)}`);
  }
}

function extractStderr(err: unknown): string {
  const e = err as { stderr?: Buffer | string; message?: string };
  const s = e.stderr ? e.stderr.toString() : e.message ?? String(err);
  return s.trim().slice(-2000);
}

export interface StreamProbe {
  width: number;
  height: number;
  /** Display width/height after applying rotation side data. */
  displayWidth: number;
  displayHeight: number;
  rotation: number;
  durationSeconds: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  audioChannels: number;
  sampleRate: number;
  fieldOrder?: string;
  pixFmt?: string;
  raw: Record<string, unknown>;
}

/**
 * Probes a media file. Throws when ffprobe fails or the file has no usable streams.
 * Never invents fallback values.
 */
export function probe(filePath: string): StreamProbe {
  if (!fs.existsSync(filePath)) throw new Error(`Media file not found: ${filePath}`);
  let json: { streams?: Record<string, unknown>[]; format?: Record<string, unknown> };
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath], DEFAULT_OPTS);
    json = JSON.parse(out.toString());
  } catch (err) {
    throw new Error(`ffprobe failed for ${filePath}: ${extractStderr(err)}`);
  }
  const streams = json.streams ?? [];
  const v = streams.find(s => s.codec_type === 'video');
  const a = streams.find(s => s.codec_type === 'audio');
  if (!v && !a) throw new Error(`No audio or video streams in ${filePath}`);

  let fps = 0;
  const rate = (v?.avg_frame_rate && v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v?.r_frame_rate) as string | undefined;
  if (rate) {
    const [n, d] = rate.split('/').map(Number);
    fps = d ? n / d : Number(rate);
  }

  const durationStr = (json.format?.duration ?? v?.duration ?? a?.duration) as string | undefined;
  const durationSeconds = durationStr !== undefined ? parseFloat(durationStr) : NaN;
  if (!Number.isFinite(durationSeconds)) throw new Error(`Could not determine duration of ${filePath}`);

  const width = Number(v?.width ?? 0);
  const height = Number(v?.height ?? 0);
  let rotation = 0;
  const sideData = (v?.side_data_list as Array<Record<string, unknown>> | undefined) ?? [];
  for (const sd of sideData) {
    if (typeof sd.rotation === 'number') rotation = sd.rotation;
  }
  const tags = (v?.tags as Record<string, string> | undefined) ?? {};
  if (!rotation && tags.rotate) rotation = Number(tags.rotate) || 0;
  const swap = Math.abs(rotation) % 180 === 90;

  return {
    width,
    height,
    displayWidth: swap ? height : width,
    displayHeight: swap ? width : height,
    rotation,
    durationSeconds,
    fps,
    hasVideo: !!v,
    hasAudio: !!a,
    audioChannels: Number(a?.channels ?? 0),
    sampleRate: Number(a?.sample_rate ?? 0),
    fieldOrder: v?.field_order as string | undefined,
    pixFmt: v?.pix_fmt as string | undefined,
    raw: json as Record<string, unknown>,
  };
}

/** True if the file has at least one audio stream. */
export function hasAudio(filePath: string): boolean {
  return probe(filePath).hasAudio;
}

const NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'gray', 'grey', 'orange',
  'purple', 'pink', 'brown', 'navy', 'teal', 'lime', 'silver', 'gold', 'transparent',
]);

/**
 * Validates a color for use inside an ffmpeg filter graph. Accepts #RRGGBB, #RRGGBBAA, 0xRRGGBB[AA]
 * and a small set of named colors, each optionally followed by @alpha (0..1). Throws otherwise.
 */
export function safeColor(input: string): string {
  const c = input.trim();
  const m = /^((?:#|0x)[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|[a-zA-Z]+)(@(?:0(?:\.\d+)?|1(?:\.0+)?))?$/.exec(c);
  if (!m) throw new Error(`Invalid color value: ${JSON.stringify(input)}`);
  if (/^[a-zA-Z]+$/.test(m[1]) && !NAMED_COLORS.has(m[1].toLowerCase())) {
    throw new Error(`Unknown named color: ${JSON.stringify(input)}`);
  }
  return c;
}

/** Validates a color for SVG/CSS (#hex or named). */
export function safeCssColor(input: string): string {
  const c = input.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(c) || NAMED_COLORS.has(c.toLowerCase())) return c;
  throw new Error(`Invalid color value: ${JSON.stringify(input)}`);
}

/** Escapes text for XML/HTML/SVG content and attributes. */
export function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Escapes a path for an ffmpeg concat demuxer list line: file '<path>'. */
export function concatListLine(filePath: string): string {
  return `file '${path.resolve(filePath).replace(/'/g, "'\\''")}'`;
}

/** Escapes a value for use inside an ffmpeg filter option (e.g. a file path in subtitles=). */
export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/([[\],;])/g, '\\$1');
}

/**
 * Joins `segment` onto `baseDir` and throws if the result escapes `baseDir`.
 */
export function safeJoin(baseDir: string, ...segments: string[]): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...segments);
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes base directory: ${segments.join('/')}`);
  }
  return target;
}

/** Validates a simple identifier (SKU, stem name, etc). */
export function safeId(id: string, label = 'identifier'): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id) || id === '.' || id === '..') {
    throw new Error(`Invalid ${label}: ${JSON.stringify(id)}`);
  }
  return id;
}

/** Candidate headless Chrome/Chromium binaries across macOS and Linux. */
export const CHROME_CANDIDATES = [
  process.env.CHROME_PATH ?? '',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findChrome(): string | null {
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function onPath(bin: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rasterizes an SVG file to PNG using the first available backend:
 * rsvg-convert, resvg, ImageMagick (magick/convert), macOS sips, or headless Chrome.
 * Throws a clear error when none is installed.
 */
export function rasterizeSvg(svgPath: string, pngPath: string, width?: number, height?: number): void {
  const attempts: string[] = [];
  const tryRun = (bin: string, args: string[]): boolean => {
    if (!onPath(bin) && !path.isAbsolute(bin)) return false;
    try {
      execFileSync(bin, args, DEFAULT_OPTS);
      if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) return true;
      attempts.push(`${bin}: produced no output`);
    } catch (err) {
      attempts.push(`${bin}: ${extractStderr(err).slice(0, 200)}`);
    }
    return false;
  };

  const sizeArgs = width && height ? ['-w', String(width), '-h', String(height)] : [];
  if (tryRun('rsvg-convert', [...sizeArgs, '-o', pngPath, svgPath])) return;
  if (tryRun('resvg', [...(width ? ['-w', String(width)] : []), svgPath, pngPath])) return;
  if (tryRun('magick', ['-background', 'none', svgPath, pngPath])) return;
  if (tryRun('convert', ['-background', 'none', svgPath, pngPath])) return;
  if (process.platform === 'darwin' && tryRun('sips', ['-s', 'format', 'png', svgPath, '--out', pngPath])) return;

  const chrome = findChrome();
  if (chrome) {
    const size = width && height ? `${width},${height}` : '1920,1080';
    if (tryRun(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--default-background-color=00000000', `--window-size=${size}`,
      `--screenshot=${pngPath}`, `file://${path.resolve(svgPath)}`,
    ])) return;
  }

  throw new Error(
    `No SVG rasterizer available (install librsvg "rsvg-convert", resvg, ImageMagick, or Chrome). Attempts: ${attempts.join('; ') || 'none found'}`,
  );
}

/** Fails fast on non-finite or non-positive numbers. */
export function requirePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number, got ${value}`);
  return value;
}

/** Parses an ISO-8601 date string; throws on invalid input. */
export function parseDateStrict(value: string, label: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for ${label}: ${JSON.stringify(value)}`);
  return d;
}
