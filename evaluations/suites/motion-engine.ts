import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SuiteContext } from '../run-suites.js';
import { getRenderAdapter } from '../../adapters/registry.js';
import { MotionAdapter } from '../../adapters/motion/index.js';
import type { ProjectContext } from '../../adapters/interface.js';
import {
  AssetManifestSchema, BrandProfileSchema, ClaimsRegisterSchema, ProjectBriefSchema, ScenePlanSchema,
  type ScenePlan,
} from '../../packages/contracts/src/index.js';
import { runTool } from '../../packages/media/src/proc.js';
import { buildClipHtml, jsonForScript, loadBrandFonts } from '../../packages/motion/src/engine.js';
import { launchBrowser, motionAvailability, openClip, renderClip, renderFrame, stills } from '../../packages/motion/src/capture.js';
import { MOTION_RECIPES, sceneFragment, type SceneBindingInput } from '../../packages/motion/src/recipes/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'fixtures', 'motion-demo');
const readJson = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURE, name), 'utf-8'));

function loadFixture(): ProjectContext {
  return {
    projectDir: FIXTURE,
    brief: ProjectBriefSchema.parse(readJson('brief.json')),
    brand: BrandProfileSchema.parse(readJson('brand.json')),
    claims: ClaimsRegisterSchema.parse(readJson('claims.json')),
    assets: AssetManifestSchema.parse(readJson('assets.json')),
    scenePlan: ScenePlanSchema.parse(readJson('scene-plan.json')),
  };
}

function bindingInput(ctx: ProjectContext, overrides: Partial<SceneBindingInput> = {}): SceneBindingInput {
  return {
    projectDir: ctx.projectDir,
    brand: ctx.brand,
    claims: ctx.claims,
    assets: ctx.assets,
    scenePlan: ctx.scenePlan,
    width: 1920,
    height: 1080,
    fps: 30,
    transparent: false,
    fonts: loadBrandFonts(ctx.brand, ctx.projectDir),
    ...overrides,
  };
}

/** A one-scene plan derived from the fixture with a different duration, copy or recipe. */
function singleScene(plan: ScenePlan, index: number, patch: Partial<ScenePlan['scenes'][number]>): ScenePlan {
  const scene = { ...plan.scenes[index], ...patch };
  return { ...plan, scenes: [scene] };
}

function streamInfo(file: string): Record<string, string> {
  const out = runTool('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-count_packets',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt,nb_read_packets:format=duration',
    '-of', 'default=noprint_wrappers=1', file,
  ]);
  const info: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) info[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return info;
}

const sha = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Motion engine: registry and contract wiring, fragment escaping, and Chrome capture. */
export async function run(t: SuiteContext): Promise<void> {
  // --- registry and contracts (no browser needed) -----------------------------------------
  const adapter = getRenderAdapter('motion');
  t.assert(adapter instanceof MotionAdapter && adapter.id === 'motion', 'registry returns the motion adapter for engine "motion"');
  t.assert(adapter.capabilities.transparency && adapter.capabilities.formats.includes('mov_prores'), 'motion adapter advertises alpha via ProRes');

  const ctx = loadFixture();
  t.assert(ctx.brief.engine === 'motion', 'ProjectBrief contract accepts engine: motion');
  t.assert(ctx.scenePlan.renderer === 'motion', 'ScenePlan contract accepts renderer: motion');
  t.assert(ctx.scenePlan.scenes.every(s => s.visual_recipe in MOTION_RECIPES)
    && new Set(ctx.scenePlan.scenes.map(s => s.visual_recipe)).size === Object.keys(MOTION_RECIPES).length,
    'demo fixture uses all four motion recipes');

  // --- escaping ---------------------------------------------------------------------------
  t.assert(!jsonForScript({ s: '</script><!--\u2028' }).match(/<\/script|<!--|\u2028/), 'jsonForScript neutralises </script, <!-- and U+2028');
  const evil = 'Pwn </script><img src=x onerror="window.__pwned=1"> & <b>bold</b>';
  const evilPlan = singleScene(ctx.scenePlan, 0, { copy_text: evil, duration_seconds: 2 });
  const evilHtml = buildClipHtml(sceneFragment(0, bindingInput(ctx, { scenePlan: evilPlan })), { title: '<title>x</title>' });
  t.assert(!evilHtml.includes('<img src=x') && !evilHtml.includes('</script><img'), 'fragment build leaves no raw user markup in the page');
  t.assert(!evilHtml.includes('<title><title>'), 'page title is escaped');

  const wrongPlan = singleScene(ctx.scenePlan, 0, { visual_recipe: 'kinetic-captions' });
  let threw = false;
  try { sceneFragment(0, bindingInput(ctx, { scenePlan: wrongPlan })); } catch { threw = true; }
  t.assert(threw, 'sceneFragment rejects a non-motion recipe');

  const avail = motionAvailability();
  const v = await adapter.validate({ ...ctx, scenePlan: wrongPlan });
  t.assert(!v.valid && v.errors.some(e => e.includes("'kinetic-captions'") && e.includes('not a motion recipe')),
    'validate() names the non-motion recipe', v.errors.join('; '));

  if (!avail.ok) {
    t.skip(`Chrome capture tests: ${avail.errors.join('; ')}`);
    return;
  }
  const ok = await adapter.validate(ctx);
  t.assert(ok.valid, 'validate() accepts the demo fixture', ok.errors.join('; '));

  // --- capture ----------------------------------------------------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-motion-suite-'));
  const browser = await launchBrowser();
  try {
    // User text arrives as text, not markup.
    const evilPage = path.join(tmp, 'evil.html');
    fs.writeFileSync(evilPage, evilHtml, 'utf-8');
    const clip = await openClip(browser, evilPage);
    try {
      await clip.page.evaluate('window.seek(1.9)');
      const state = (await clip.page.evaluate(`(() => ({
        imgs: document.querySelectorAll('img[src="x"], b').length,
        pwned: window.__pwned === 1,
        text: document.getElementById('stage').textContent
      }))()`)) as { imgs: number; pwned: boolean; text: string };
      t.assert(state.imgs === 0 && !state.pwned, 'injected markup is not parsed or executed in the page');
      t.assert(state.text.includes('</script><img') && state.text.includes('<b>bold</b>'), 'injected markup is rendered as literal text');
      t.assert(clip.errors.length === 0, 'malicious copy causes no page errors', clip.errors.join('; '));
    } finally {
      await clip.page.close();
    }

    // Determinism: seek(t) is a pure function of time.
    const page0 = path.join(tmp, 'scene1.html');
    const twoSec = singleScene(ctx.scenePlan, 0, { duration_seconds: 2 });
    fs.writeFileSync(page0, buildClipHtml(sceneFragment(0, bindingInput(ctx, { scenePlan: twoSec }))), 'utf-8');
    const a = await renderFrame(page0, 1.1, path.join(tmp, 'a.png'), browser);
    const b = await renderFrame(page0, 1.1, path.join(tmp, 'b.png'), browser);
    t.assert(sha(a) === sha(b), 'same frame rendered twice gives byte-identical PNGs');

    // Every recipe renders a contact sheet without page errors.
    for (let i = 0; i < ctx.scenePlan.scenes.length; i++) {
      const s = ctx.scenePlan.scenes[i];
      const p = path.join(tmp, `sheet_${i}.html`);
      fs.writeFileSync(p, buildClipHtml(sceneFragment(i, bindingInput(ctx))), 'utf-8');
      const sheet = await stills(p, [0.3, s.duration_seconds * 0.5, s.duration_seconds - 0.05], path.join(tmp, `sheet_${i}.png`), { browser, tileWidth: 320 });
      t.assert(fs.statSync(sheet).size > 1000, `${s.visual_recipe} renders a contact sheet`);
    }

    // A 2 s clip renders at the right size and duration.
    const mp4 = path.join(tmp, 'two.mp4');
    const res = await renderClip(page0, mp4, { fps: 30, browser });
    const info = streamInfo(mp4);
    t.assert(res.frames === 60 && info.nb_read_packets === '60', '2 s clip at 30 fps has 60 frames', `packets=${info.nb_read_packets}`);
    t.assert(info.width === '1920' && info.height === '1080' && info.codec_name === 'h264' && info.pix_fmt === 'yuv420p',
      '2 s clip is 1920x1080 H.264 yuv420p', JSON.stringify(info));
    t.assert(Math.abs(Number(info.duration) - 2) < 0.05, '2 s clip lasts 2 s', info.duration);

    // Alpha clip (transparent background) comes out as ProRes 4444 with alpha.
    const alphaPage = path.join(tmp, 'alpha.html');
    const oneSec = singleScene(ctx.scenePlan, 3, { duration_seconds: 1 });
    fs.writeFileSync(alphaPage, buildClipHtml(sceneFragment(0, bindingInput(ctx, { scenePlan: oneSec, transparent: true, width: 640, height: 360 }))), 'utf-8');
    const mov = path.join(tmp, 'alpha.mov');
    const alphaRes = await renderClip(alphaPage, mov, { fps: 24, browser });
    const ai = streamInfo(mov);
    t.assert(alphaRes.alpha && ai.codec_name === 'prores' && /^yuva444p1[02]le$/.test(ai.pix_fmt), 'alpha clip is ProRes 4444 with alpha (yuva444p, 10-bit encode)', JSON.stringify(ai));
    t.assert(ai.width === '640' && ai.height === '360' && ai.nb_read_packets === '24', 'alpha clip has the requested size and frame count', JSON.stringify(ai));
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
