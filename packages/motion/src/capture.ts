/**
 * Frame capture for motion clips: TypeScript port of upstream Barty-Bart/motion-graphics
 * `engine/render.js` and `engine/beats.js` (MIT).
 *
 * playwright-core drives the system Chrome (findChrome), so no browser is downloaded.
 * Each output frame is captured at 4 sub-frames across a 180 degree shutter and blended
 * with ffmpeg `tmix` (motion blur). Opaque clips encode to H.264 yuv420p; clips built with
 * `bg:null` (html.alpha) encode to ProRes 4444 with alpha. ffmpeg is always spawned with an
 * argument array.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { findChrome, runFfmpeg, CHROME_CANDIDATES } from '../../media/src/proc.js';

/** Sub-frames per output frame (upstream K). */
export const SUBFRAMES = 4;

export interface MotionAvailability {
  ok: boolean;
  chromePath: string | null;
  playwrightVersion: string | null;
  errors: string[];
}

/** Reports whether system Chrome and playwright-core are present. Never throws. */
export function motionAvailability(): MotionAvailability {
  const errors: string[] = [];
  const chromePath = findChrome();
  if (!chromePath) {
    errors.push(`Chrome not found (checked: ${CHROME_CANDIDATES.join(', ')}). Install Google Chrome or set CHROME_PATH.`);
  }
  let playwrightVersion: string | null = null;
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('playwright-core/package.json') as { version?: string };
    playwrightVersion = pkg.version ?? 'unknown';
  } catch {
    errors.push('playwright-core is not installed. Run `npm install` in the toolkit root.');
  }
  return { ok: errors.length === 0, chromePath, playwrightVersion, errors };
}

/** Launches system Chrome headless through playwright-core. */
export async function launchBrowser(): Promise<Browser> {
  const avail = motionAvailability();
  if (!avail.ok) throw new Error(`Motion engine unavailable: ${avail.errors.join(' ')}`);
  const { chromium } = await import('playwright-core');
  return chromium.launch({
    executablePath: avail.chromePath!,
    headless: true,
    args: [
      '--allow-file-access-from-files',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-lcd-text',
      '--hide-scrollbars',
      '--mute-audio',
      // GPU raster of blur/filters differs by +-1 between runs; software raster makes
      // seek(t) -> pixels byte-identical (and behaves the same on GPU-less CI hosts).
      '--disable-gpu'
    ]
  });
}

/** Runs `fn` with a browser, reusing `browser` when given, otherwise launching and closing one. */
export async function withBrowser<T>(browser: Browser | undefined, fn: (b: Browser) => Promise<T>): Promise<T> {
  if (browser) return fn(browser);
  const b = await launchBrowser();
  try {
    return await fn(b);
  } finally {
    await b.close();
  }
}

export interface OpenedClip {
  page: Page;
  duration: number;
  width: number;
  height: number;
  alpha: boolean;
  errors: string[];
}

/** Opens a built clip page in render mode and waits until fonts and the scene are ready. */
export async function openClip(browser: Browser, htmlPath: string): Promise<OpenedClip> {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(htmlPath)).href + '?render');
  // Page-side code is passed as source strings: the toolkit compiles without the DOM lib.
  await page.waitForFunction("window.__motionReady === true || typeof window.__motionError === 'string'", undefined, { timeout: 30_000 });
  const info = (await page.evaluate(`(() => {
    const stage = document.getElementById('stage');
    return {
      err: window.__motionError ?? null,
      T: Number(window.DURATION ?? 0),
      W: stage ? stage.offsetWidth : 0,
      H: stage ? stage.offsetHeight : 0,
      alpha: document.documentElement.classList.contains('alpha')
    };
  })()`)) as { err: string | null; T: number; W: number; H: number; alpha: boolean };
  if (info.err) {
    await page.close();
    throw new Error(`Motion clip failed to load (${htmlPath}): ${info.err}`);
  }
  if (!(info.W > 0 && info.H > 0)) {
    await page.close();
    throw new Error(`Motion clip has no stage size (${htmlPath}).`);
  }
  await page.setViewportSize({ width: info.W, height: info.H });
  return { page, duration: info.T, width: info.W, height: info.H, alpha: info.alpha, errors };
}

async function seek(page: Page, t: number): Promise<void> {
  if (!Number.isFinite(t)) throw new Error(`seek: invalid time ${t}`);
  await page.evaluate(`window.seek(${t})`);
}

export type MotionCodec = 'h264' | 'prores' | 'vp9';

export interface RenderClipOptions {
  fps: number;
  /** Clip length in seconds. Defaults to the page's window.DURATION. */
  duration?: number;
  /** Output codec. Defaults to prores for alpha clips and h264 otherwise. */
  codec?: MotionCodec;
  browser?: Browser;
  /** Called after each output frame. */
  onFrame?: (frame: number, total: number) => void;
}

export interface RenderClipResult {
  outputPath: string;
  frames: number;
  width: number;
  height: number;
  alpha: boolean;
  codec: MotionCodec;
}

function encoderArgs(codec: MotionCodec, alpha: boolean): string[] {
  if (codec === 'prores') {
    return alpha
      ? ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0']
      : ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0'];
  }
  if (codec === 'vp9') {
    return ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-pix_fmt', alpha ? 'yuva420p' : 'yuv420p'];
  }
  return [
    '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart'
  ];
}

/**
 * Renders a clip page to video. Fails loudly on page errors, a short frame count or a
 * non-zero ffmpeg exit; a failed output file is removed.
 */
export async function renderClip(htmlPath: string, outputPath: string, options: RenderClipOptions): Promise<RenderClipResult> {
  const fps = options.fps;
  if (!(fps > 0)) throw new Error('renderClip: fps must be positive');
  return withBrowser(options.browser, async browser => {
    const clip = await openClip(browser, htmlPath);
    try {
      const T = options.duration ?? clip.duration;
      if (!(T > 0)) throw new Error(`renderClip: clip duration is not positive (${htmlPath})`);
      const codec: MotionCodec = options.codec ?? (clip.alpha ? 'prores' : 'h264');
      if (clip.alpha && codec === 'h264') throw new Error('renderClip: H.264 cannot carry alpha; use prores or vp9 for bg:null clips.');
      const N = Math.round(T * fps);
      const K = SUBFRAMES;
      const sub = 1 / (fps * 2 * K);
      const color = clip.alpha || codec !== 'h264'
        ? ''
        : ',scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
      const vf = `format=gbrap,tmix=frames=${K}:weights='1 1 1 1',select='eq(mod(n\\,${K})\\,${K - 1})',setpts=N/(${fps})/TB${color}`;
      await fs.promises.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
      const args = [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'image2pipe', '-framerate', String(fps * K), '-c:v', 'png', '-i', '-',
        '-vf', vf, '-r', String(fps), '-frames:v', String(N),
        ...encoderArgs(codec, clip.alpha),
        outputPath
      ];
      const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';
      ff.stderr.on('data', d => { stderr += String(d); });
      // Mutable holder so TypeScript does not narrow values written from event callbacks.
      const st: { code: number | null; spawnError: Error | null } = { code: null, spawnError: null };
      const closed = new Promise<void>(resolve => {
        ff.on('error', e => { st.spawnError = e; st.code = -1; resolve(); });
        ff.on('close', c => { st.code = c ?? -1; resolve(); });
      });
      // If ffmpeg dies, stop feeding it instead of waiting forever for 'drain'.
      ff.stdin.on('error', () => {});
      try {
        for (let f = 0; f < N && st.code === null; f++) {
          for (let k = 0; k < K && st.code === null; k++) {
            const t = Math.max(0, f / fps + (k - 1.5) * sub);
            await seek(clip.page, t);
            const buf = await clip.page.screenshot({ type: 'png', omitBackground: clip.alpha });
            if (!ff.stdin.write(buf)) await Promise.race([new Promise(r => ff.stdin.once('drain', r)), closed]);
          }
          options.onFrame?.(f + 1, N);
          if (clip.errors.length) break;
        }
      } finally {
        ff.stdin.end();
        await closed;
      }
      const fail = (msg: string): never => {
        fs.rmSync(outputPath, { force: true });
        throw new Error(msg);
      };
      if (st.spawnError) fail(`ffmpeg failed to start: ${st.spawnError.message}`);
      if (clip.errors.length) fail(`page errors while rendering ${htmlPath}:\n${clip.errors.join('\n')}`);
      if (st.code !== 0) fail(`ffmpeg failed (exit ${st.code}), ${outputPath} is incomplete: ${stderr.trim().slice(-2000)}`);
      return { outputPath, frames: N, width: clip.width, height: clip.height, alpha: clip.alpha, codec };
    } finally {
      await clip.page.close();
    }
  });
}

/** Captures one frame (no motion blur) at time `t` to a PNG. Alpha clips keep transparency. */
export async function renderFrame(htmlPath: string, t: number, pngPath: string, browser?: Browser): Promise<string> {
  return withBrowser(browser, async b => {
    const clip = await openClip(b, htmlPath);
    try {
      await seek(clip.page, t);
      await fs.promises.mkdir(path.dirname(path.resolve(pngPath)), { recursive: true });
      await clip.page.screenshot({ path: pngPath, type: 'png', omitBackground: clip.alpha });
      if (clip.errors.length) throw new Error(`page errors while rendering ${htmlPath}:\n${clip.errors.join('\n')}`);
      return pngPath;
    } finally {
      await clip.page.close();
    }
  });
}

export interface StillsOptions {
  browser?: Browser;
  /** Tile width per still in the sheet (upstream 640). */
  tileWidth?: number;
  columns?: number;
}

/**
 * Port of beats.js: renders stills at the given times and tiles them into one contact
 * sheet PNG. Alpha clips are shown on black.
 */
export async function stills(htmlPath: string, times: number[], sheetPath: string, options: StillsOptions = {}): Promise<string> {
  if (!times.length) throw new Error('stills: at least one time is required');
  return withBrowser(options.browser, async b => {
    const clip = await openClip(b, htmlPath);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-stills-'));
    try {
      if (clip.alpha) {
        await clip.page.evaluate("document.documentElement.style.background = '#000'; document.body.style.background = '#000';");
      }
      for (let i = 0; i < times.length; i++) {
        await seek(clip.page, times[i]);
        await clip.page.screenshot({ path: path.join(dir, `${String(i).padStart(3, '0')}.png`), type: 'png' });
      }
      if (clip.errors.length) throw new Error(`page errors while rendering ${htmlPath}:\n${clip.errors.join('\n')}`);
      tileSheet(dir, times.length, sheetPath, options);
      return sheetPath;
    } finally {
      await clip.page.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

/** Tiles numbered PNGs (000.png, 001.png, ...) in `dir` into one sheet. */
export function tileSheet(dir: string, count: number, sheetPath: string, options: Pick<StillsOptions, 'tileWidth' | 'columns'> = {}): void {
  const cols = Math.min(options.columns ?? 4, count);
  const rows = Math.ceil(count / cols);
  fs.mkdirSync(path.dirname(path.resolve(sheetPath)), { recursive: true });
  runFfmpeg([
    '-loglevel', 'error',
    '-i', path.join(dir, '%03d.png'),
    '-vf', `scale=${options.tileWidth ?? 640}:-1,tile=${cols}x${rows}:padding=4:color=white`,
    '-frames:v', '1', '-update', '1',
    sheetPath
  ]);
}
