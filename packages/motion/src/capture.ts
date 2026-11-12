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
  /** Problems that do not stop the render: console errors, failed loads, font fallback. */
  warnings: string[];
}

/** Fixed wall clock the page sees at t = 0 (2024-01-01T00:00:00Z). */
export const CLOCK_EPOCH_MS = 1_704_067_200_000;
/** Default seed for the page's Math.random. */
export const RANDOM_SEED = 0x6d677669; // "mgvi"

/**
 * Installed before any page script: the page's clock and random numbers depend only on the
 * seek time, so the same seek always draws the same pixels. `window.__mgClock(t)` sets the time
 * (Date.now, new Date(), performance.now) and reseeds Math.random from (seed, t in microseconds).
 */
function determinismScript(seed: number): string {
  return `(() => {
  const EPOCH = ${CLOCK_EPOCH_MS};
  const SEED = ${seed >>> 0};
  let nowMs = 0;
  let state = SEED;
  const rand = () => {
    state = (state + 0x6D2B79F5) | 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const reseed = t => {
    const us = Math.round(t * 1e6);
    state = (SEED ^ Math.imul(us | 0, 0x9E3779B1) ^ Math.floor(us / 4294967296)) | 0;
  };
  Math.random = rand;
  const RealDate = Date;
  function FixedDate(...args) {
    if (!new.target) return new RealDate(EPOCH + nowMs).toString();
    return args.length === 0 ? new RealDate(EPOCH + nowMs) : new RealDate(...args);
  }
  FixedDate.prototype = RealDate.prototype;
  FixedDate.now = () => EPOCH + nowMs;
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;
  globalThis.Date = FixedDate;
  if (globalThis.performance) performance.now = () => nowMs;
  window.__mgClock = t => { nowMs = t * 1000; reseed(t); };
  window.__mgClock(0);
})();`;
}

/**
 * Opens a built clip page in render mode and waits until fonts and the scene are ready.
 * The page's clock and Math.random are pinned to the seek time (see determinismScript).
 */
export async function openClip(browser: Browser, htmlPath: string, seed = RANDOM_SEED): Promise<OpenedClip> {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') warnings.push(`console error: ${m.text()}`); });
  page.on('requestfailed', r => warnings.push(`failed to load ${r.url().slice(0, 200)}: ${r.failure()?.errorText ?? 'unknown error'}`));
  await page.addInitScript(determinismScript(seed));
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
  // The first screenshot after the resize can show a frame painted before it (measured: about
  // half of fresh pages); take one and discard it so frame 0 of every clip is the seeked frame.
  await page.screenshot();
  return { page, duration: info.T, width: info.W, height: info.H, alpha: info.alpha, errors, warnings };
}

async function seek(page: Page, t: number): Promise<void> {
  if (!Number.isFinite(t)) throw new Error(`seek: invalid time ${t}`);
  await page.evaluate(`window.__mgClock(${t}); window.seek(${t})`);
}

/**
 * Text drawn with a font the page did not embed: Chrome fell back to a system font, which
 * differs between machines (and may lack Cyrillic). Checked at a quarter, half and three
 * quarters of the clip, through the DevTools protocol (CSS.getPlatformFontsForNode).
 */
export async function fontFallbacks(clip: OpenedClip): Promise<string[]> {
  const cdp = await clip.page.context().newCDPSession(clip.page);
  const found = new Map<string, Set<string>>();
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    for (const f of [0.25, 0.5, 0.75]) {
      await seek(clip.page, clip.duration * f);
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
      const nodes: { nodeId: number; text: string }[] = [];
      const walk = (n: { nodeId: number; nodeType: number; nodeValue?: string; children?: unknown[]; nodeName?: string }) => {
        if (n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE') return;
        for (const c of (n.children ?? []) as typeof n[]) {
          if (c.nodeType === 3 && c.nodeValue?.trim()) nodes.push({ nodeId: n.nodeId, text: c.nodeValue.trim() });
          else walk(c);
        }
      };
      walk(root as Parameters<typeof walk>[0]);
      for (const { nodeId, text } of nodes) {
        let fonts: { familyName: string; isCustomFont: boolean; glyphCount: number }[] = [];
        try {
          ({ fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }) as { fonts: typeof fonts });
        } catch {
          continue; // not laid out at this time
        }
        for (const font of fonts) {
          if (font.isCustomFont || font.glyphCount === 0) continue;
          const key = font.familyName;
          if (!found.has(key)) found.set(key, new Set());
          found.get(key)!.add(text.length > 30 ? `${text.slice(0, 29)}…` : text);
        }
      }
    }
  } finally {
    await cdp.detach().catch(() => {});
  }
  return [...found].map(([family, texts]) =>
    `font fallback: system font "${family}" drew ${[...texts].slice(0, 3).map(t => `"${t}"`).join(', ')}${texts.size > 3 ? ` and ${texts.size - 3} more` : ''} (embed a font that covers these glyphs)`);
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
  /** Seed for the page's Math.random (default RANDOM_SEED). */
  seed?: number;
}

export interface RenderClipResult {
  outputPath: string;
  frames: number;
  width: number;
  height: number;
  alpha: boolean;
  codec: MotionCodec;
  /** Console errors, failed loads and font fallbacks seen while rendering. */
  warnings: string[];
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
    const clip = await openClip(browser, htmlPath, options.seed);
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
      const warnings = [...new Set([...clip.warnings, ...await fontFallbacks({ ...clip, duration: T })])];
      return { outputPath, frames: N, width: clip.width, height: clip.height, alpha: clip.alpha, codec, warnings };
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
