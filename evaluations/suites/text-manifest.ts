import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SuiteContext } from '../run-suites.js';
import type { TextManifest, TextManifestEntry } from '../../packages/contracts/src/index.js';
import { minTextSize, safeZoneFor } from '../../packages/contracts/src/index.js';
import { contrastBehind, textChecks } from '../../packages/cli/src/commands/text_checks.js';
import { runRender } from '../../packages/cli/src/commands/render.js';
import { runValidate } from '../../packages/cli/src/commands/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROMO = path.join(ROOT, 'fixtures', 'promo-bulgarian-15s');

/** A text held still for `seconds` at a box, sampled every 0.1 s. */
function entry(id: string, box: { x: number; y: number; w: number; h: number }, extra: Partial<TextManifestEntry> = {}, seconds = 3): TextManifestEntry {
  return {
    id, scene_id: extra.scene_id ?? 's1', text: extra.text ?? 'Hello there friend', words: extra.words ?? 3,
    font_size: extra.font_size ?? 72, bold: false, color: '#ffffff', is_copy: extra.is_copy ?? true, narrated: extra.narrated ?? false,
    samples: Array.from({ length: Math.round(seconds * 10) }, (_, i) => ({ t: i / 10, ...box, opacity: 1 })),
  };
}

const manifest = (texts: TextManifestEntry[]): TextManifest => ({ schema_version: '1.0.0', width: 1080, height: 1920, sample_step_s: 0.1, texts });

/** Text manifest from HyperFrames renders and the text checks of `mgvideo validate`. */
export async function run(t: SuiteContext): Promise<void> {
  // --- floor numbers ----------------------------------------------------------------------
  const z = safeZoneFor(1080, 1920);
  t.assert(z.aspect === '9:16' && z.top === 220 && z.bottom === 420 && z.right === 140, '9:16 generic UI zones come from the floor table');
  const z169 = safeZoneFor(3840, 2160);
  t.assert(z169.aspect === '16:9' && z169.top === 240 && z169.left === 120, '16:9 zones scale with the short side (4K doubles them)');
  t.assert(minTextSize(1080, 1920) === 60 && minTextSize(1920, 1080) === 18, 'size floor: 60 px for 9:16 at 1080 wide, height / 60 otherwise');

  // --- rules on synthetic manifests ---------------------------------------------------------
  const centre = { x: 200, y: 900, w: 600, h: 80 };
  const clean = await textChecks(manifest([entry('a', centre)]), { platform: 'generic' });
  t.assert(clean.every(i => i.passed), 'a centred, large, long-held text passes every text rule', clean.filter(i => !i.passed).map(i => i.details).join('; '));

  const clipped = await textChecks(manifest([entry('a', { x: 900, y: 900, w: 400, h: 80 })]), { platform: 'generic' });
  t.assert(clipped.some(i => i.rule === 'text-clipped' && !i.passed && i.severity === 'P0'), 'text resting past the frame edge is P0 text-clipped');

  const inZone = await textChecks(manifest([entry('a', { x: 200, y: 1600, w: 600, h: 80 })]), { platform: 'generic' });
  t.assert(inZone.some(i => i.rule === 'text-safe-zone' && !i.passed && i.details.includes('bottom')), 'text in the bottom 420 px is P1 text-safe-zone (generic)');
  const tiktok = await textChecks(manifest([entry('a', { x: 200, y: 1560, w: 600, h: 30 })]), { platform: 'tiktok' });
  t.assert(tiktok.find(i => i.rule === 'text-safe-zone')?.passed === true, 'the same height clears TikTok, whose bottom zone is 320 px');

  const small = await textChecks(manifest([
    entry('copy', centre, { font_size: 40 }),
    entry('label', { x: 200, y: 1100, w: 300, h: 30 }, { font_size: 20, is_copy: false }),
  ]), { platform: 'generic' });
  const sizes = small.filter(i => i.rule === 'text-size' && !i.passed);
  t.assert(sizes.length === 2 && sizes.some(i => i.severity === 'P1') && sizes.some(i => i.severity === 'P2'), 'small copy is P1 text-size, a small label P2');

  const quick = await textChecks(manifest([entry('a', centre, { words: 10 }, 2)]), { platform: 'generic' });
  t.assert(quick.some(i => i.rule === 'text-reading-time' && !i.passed && i.severity === 'P2'), '10 words on screen for 2 s is P2 text-reading-time (needs 3 s)');
  const spoken = await textChecks(manifest([entry('a', centre, { words: 10, narrated: true }, 2)]), { platform: 'generic' });
  t.assert(spoken.find(i => i.rule === 'text-reading-time')?.passed === true, 'narrated copy has no reading-time rule');

  const overlap = await textChecks(manifest([entry('a', centre), entry('b', { x: 300, y: 910, w: 600, h: 80 })]), { platform: 'generic' });
  t.assert(overlap.some(i => i.rule === 'text-overlap' && !i.passed), 'two texts overlapping most of a box are P2 text-overlap');
  const otherScene = await textChecks(manifest([entry('a', centre), entry('b', centre, { scene_id: 's2' })]), { platform: 'generic' });
  t.assert(otherScene.find(i => i.rule === 'text-overlap')?.passed === true, 'texts of different scenes never overlap');

  // --- contrast against pixels ----------------------------------------------------------------
  const W = 20, H = 10;
  const frame = (bg: number) => {
    const b = Buffer.alloc(W * H * 3, bg);
    for (let x = 4; x < 8; x++) for (let y = 0; y < H; y++) b.fill(255, (y * W + x) * 3, (y * W + x) * 3 + 3);
    return b;
  };
  const onBlack = contrastBehind(frame(0), W, 0, 0, W, H, '#ffffff');
  const onGrey = contrastBehind(frame(150), W, 0, 0, W, H, '#ffffff');
  t.assert(Math.abs(onBlack - 21) < 0.01, 'white glyphs on black measure 21:1', onBlack.toFixed(2));
  t.assert(onGrey > 2.8 && onGrey < 3.2, 'white glyphs on mid grey measure about 3:1', onGrey.toFixed(2));

  // --- HyperFrames writes the manifest; validate reads it --------------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-text-manifest-'));
  try {
    const project = path.join(tmp, 'promo');
    fs.cpSync(PROMO, project, { recursive: true, filter: src => !src.includes(`${path.sep}runs`) });
    const result = await runRender(project, { force: true });
    const ref = result.text_manifest;
    t.assert(!!ref && fs.existsSync(ref.path), 'render records text-manifest.json in render-result.json');
    const m: TextManifest = JSON.parse(fs.readFileSync(ref!.path, 'utf8'));
    const scenes = new Set(m.texts.map(x => x.scene_id));
    t.assert(m.width === 1080 && m.height === 1920 && scenes.size === 3, 'the manifest covers all three promo scenes at 1080x1920', [...scenes].join(','));
    t.assert(m.texts.every(x => x.is_copy && x.font_size >= 60), 'every promo text is scene copy at or above the 60 px floor', m.texts.map(x => `${x.text}:${x.font_size}`).join('; '));
    const first = m.texts.find(x => x.scene_id === 'scene-01-hook')!;
    t.assert(first.samples[0].opacity < 0.5 && first.samples[20].opacity === 1, 'samples follow the entrance: faint at 0 s, settled by 2 s');

    const report = await runValidate('latest', project);
    const textIssues = report.issues.filter(i => i.rule.startsWith('text-'));
    t.assert(textIssues.length === 0, 'the promo fixture has no text issues', textIssues.map(i => `${i.rule}: ${i.says}`).join('; '));

    fs.appendFileSync(ref!.path, ' ');
    const tampered = await runValidate('latest', project);
    t.assert(tampered.issues.some(i => i.rule === 'text-manifest' && i.severity === 'P0'), 'an edited text manifest is P0 text-manifest');

    // A word too long to wrap runs off the frame: the render shows it, validate catches it.
    const plan = JSON.parse(fs.readFileSync(path.join(project, 'scene-plan.json'), 'utf8'));
    plan.scenes[0].copy_text = 'Свръхдългадумакоятонеможедасепренесеинаистинанеможе';
    fs.writeFileSync(path.join(project, 'scene-plan.json'), JSON.stringify(plan, null, 2));
    await runRender(project, { force: true });
    const broken = await runValidate('latest', project);
    t.assert(broken.issues.some(i => i.rule === 'text-clipped' && i.severity === 'P0' && i.at_s !== undefined && i.at_s < 5),
      'an unbreakable word wider than the frame is P0 text-clipped in scene 1', broken.issues.map(i => i.rule).join(','));
    t.assert(!broken.passed, 'a run with clipped text fails validate');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
