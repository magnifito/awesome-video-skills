/**
 * B-roll clip rendering: turns each clip of a resolved plan.json into a motion clip at the
 * source video's resolution and frame rate.
 *
 * - `full` clips render opaque to H.264 `.mp4` (a full-frame cutaway).
 * - `panel` clips render with `bg:null` to ProRes 4444 `.mov` with alpha; recipe panels are
 *   centred in and sized to the clip's safe area so they stay clear of the speaker.
 *
 * Recipe clips reuse the motion recipes; fragment clips are hand-written upstream-format
 * fragments built with the same engine (see skills/magnifito-promo/reference/motion-engine.md).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { BrandProfileSchema, type BrandProfile, type ScenePlanItem } from '../../contracts/src/index.js';
import type { ResolvedBrollClip, ResolvedBrollPlan } from '../../media/src/broll.js';
import { runFfmpeg, safeJoin } from '../../media/src/proc.js';
import { buildClipHtml, loadBrandFonts, type EmbeddedFont } from './engine.js';
import { launchBrowser, renderClip, tileSheet, type RenderClipResult } from './capture.js';
import { MOTION_RECIPES, buildFonts, buildPalette, isMotionRecipe, loadLogoFile, type RecipeContext } from './recipes/index.js';

/** Upstream motion-broll default look: warm grey canvas, black ink, white cards, orange accent. */
export const BROLL_DEFAULT_COLORS: BrandProfile['colors'] = {
  primary: '#ff5a1f',
  background: '#e9e7e2',
  text_primary: '#0b0b0b'
};

export interface BrollLook {
  brandName: string;
  colors: BrandProfile['colors'];
  fontsSource: Pick<BrandProfile, 'fonts'>;
  embedded: EmbeddedFont[];
}

/** Loads the plan's brand (or the upstream default look) and embeds its font files. */
export function loadBrollLook(r: ResolvedBrollPlan): BrollLook {
  if (!r.brand) {
    return { brandName: r.plan.title || 'B-roll', colors: BROLL_DEFAULT_COLORS, fontsSource: { fonts: [] }, embedded: [] };
  }
  const brand = BrandProfileSchema.parse(JSON.parse(fs.readFileSync(r.brand, 'utf8')));
  // Brand font files resolve inside the plan directory, like every other plan path.
  return { brandName: brand.name, colors: brand.colors, fontsSource: brand, embedded: loadBrandFonts(brand, r.planDir) };
}

/** The recipe scene for a clip: copy from `scene.copy`, duration from the slot. */
export function brollScene(c: ResolvedBrollClip, fps: number): ScenePlanItem {
  const d = c.clip.out - c.clip.in;
  return {
    scene_id: c.clip.id,
    factual_purpose: c.clip.title,
    duration_frames: Math.max(1, Math.round(d * fps)),
    duration_seconds: d,
    copy_text: c.clip.scene?.copy ?? '',
    claims_refs: [],
    asset_refs: [],
    visual_recipe: c.clip.recipe ?? '',
    audio_events: []
  };
}

/** Recipe context for a clip at the source resolution and fps. */
export function brollContext(r: ResolvedBrollPlan, c: ResolvedBrollClip, look: BrollLook): RecipeContext {
  return {
    width: r.source.width,
    height: r.source.height,
    fps: r.source.fps,
    duration: c.clip.out - c.clip.in,
    transparent: c.clip.kind === 'panel',
    // One clip per slot: it pops in and ends holding its last state (the composite holds it).
    sceneIndex: 0,
    sceneCount: 1,
    timelineOffset: c.clip.in,
    brandName: look.brandName,
    palette: buildPalette(look.colors),
    fonts: buildFonts(look.fontsSource, look.embedded),
    claims: [],
    logo: c.logo ? loadLogoFile(c.logo) : null,
    panel: c.area,
    hud: false
  };
}

/** Builds the self-contained clip page for one plan clip. */
export function brollClipHtml(r: ResolvedBrollPlan, c: ResolvedBrollClip, look: BrollLook): string {
  if (c.fragment) return buildClipHtml(fs.readFileSync(c.fragment, 'utf8'), { fonts: look.embedded, title: c.clip.title });
  const id = c.clip.recipe!;
  if (!isMotionRecipe(id)) throw new Error(`clip ${c.clip.id}: unknown motion recipe '${id}' (${Object.keys(MOTION_RECIPES).join(', ')})`);
  return buildClipHtml(MOTION_RECIPES[id](brollScene(c, r.source.fps), brollContext(r, c, look)), { fonts: look.embedded, title: c.clip.title });
}

export interface BrollRenderOptions {
  /** Render only these clip ids. */
  only?: string[];
  /** Folder for the preview pages, relative to the plan folder and confined to it (default "dist"). */
  pagesDir?: string;
  browser?: Browser;
  log?: (msg: string) => void;
}

export interface BrollRenderedClip extends RenderClipResult {
  id: string;
  kind: 'full' | 'panel';
  page: string;
  seconds: number;
}

/**
 * Renders the plan's clips. Pages are written to `<plan dir>/<pagesDir, default dist>/<id>.html` (open one in a
 * browser to preview it); clips go to each clip's `file`. A clip whose size or alpha does not
 * match its kind is deleted and reported.
 */
export async function renderBroll(r: ResolvedBrollPlan, options: BrollRenderOptions = {}): Promise<BrollRenderedClip[]> {
  const only = options.only?.length ? new Set(options.only) : null;
  if (only) {
    const unknown = [...only].filter(id => !r.clips.some(c => c.clip.id === id));
    if (unknown.length) throw new Error(`Unknown clip id(s): ${unknown.join(', ')}`);
  }
  const todo = r.clips.filter(c => !only || only.has(c.clip.id));
  const look = loadBrollLook(r);
  const distDir = safeJoin(r.planDir, options.pagesDir ?? 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const results: BrollRenderedClip[] = [];
  const browser = options.browser ?? (await launchBrowser());
  try {
    for (const c of todo) {
      const page = path.join(distDir, `${c.clip.id}.html`);
      fs.writeFileSync(page, brollClipHtml(r, c, look), 'utf8');
      const t0 = Date.now();
      const res = await renderClip(page, c.file, {
        fps: r.source.fps,
        // Recipe clips fill their slot; fragments run their own DURATION (held if shorter).
        duration: c.fragment ? undefined : c.clip.out - c.clip.in,
        codec: c.clip.kind === 'panel' ? 'prores' : 'h264',
        browser
      });
      const bad: string[] = [];
      if (res.width !== r.source.width || res.height !== r.source.height) bad.push(`stage is ${res.width}x${res.height}, the source is ${r.source.width}x${r.source.height}`);
      if (c.clip.kind === 'panel' && !res.alpha) bad.push('panel clips must use bg:null (transparent)');
      if (c.clip.kind === 'full' && res.alpha) bad.push('full clips must be opaque (set bg to a colour)');
      if (bad.length) {
        fs.rmSync(c.file, { force: true });
        throw new Error(`clip ${c.clip.id}: ${bad.join('; ')}`);
      }
      const seconds = (Date.now() - t0) / 1000;
      options.log?.(`clip ${c.clip.id} (${c.clip.kind}, ${c.clip.recipe ?? path.relative(r.planDir, c.fragment!)}): ${res.frames} frames -> ${path.relative(r.planDir, c.file)} in ${seconds.toFixed(1)}s`);
      results.push({ ...res, id: c.clip.id, kind: c.clip.kind, page, seconds });
    }
  } finally {
    if (!options.browser) await browser.close();
  }
  return results;
}

/**
 * Review times for a composed video: just before and inside each clip window, and the
 * source after the last clip.
 */
export function brollSheetTimes(r: ResolvedBrollPlan, perClip = 2): number[] {
  const times = new Set<number>();
  const end = r.source.duration;
  const clamp = (t: number) => Math.min(Math.max(0, t), Math.max(0, end - 0.05));
  for (const c of [...r.clips].sort((a, b) => a.clip.in - b.clip.in)) {
    times.add(clamp(c.clip.in - 0.25));
    for (let k = 1; k <= perClip; k++) times.add(clamp(c.clip.in + ((c.clip.out - c.clip.in) * k) / (perClip + 1)));
  }
  const last = Math.max(...r.clips.map(c => c.clip.out));
  if (last < end - 0.3) times.add(clamp((last + end) / 2));
  return [...times].map(t => Math.round(t * 1000) / 1000).sort((a, b) => a - b);
}

/** Tiles frames of `video` at `times` into one contact sheet PNG. */
export function videoContactSheet(video: string, times: number[], sheetPath: string, columns = 4): string {
  if (!times.length) throw new Error('videoContactSheet: at least one time is required');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-broll-sheet-'));
  try {
    times.forEach((t, i) => {
      runFfmpeg(['-loglevel', 'error', '-ss', t.toFixed(3), '-i', video, '-frames:v', '1', '-update', '1', path.join(dir, `${String(i).padStart(3, '0')}.png`)]);
    });
    tileSheet(dir, times.length, sheetPath, { columns, tileWidth: 480 });
    return sheetPath;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
