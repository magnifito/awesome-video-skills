/**
 * Showcase suite: every showcase project must be reproducible and its committed video must
 * meet the spec in its recipe.
 *
 * Always checks: recipe schema and commands, generated README in sync, inputs referenced by
 * the commands exist, committed MP4 + poster exist and ffprobe matches `expect`.
 * Coverage (docs/plans/showcase-videos.md): one style clip per recipe, every shown mgvideo
 * command used, every skill except the router owns a clip, review artifacts committed.
 * With MGVIDEO_TEST_SHOWCASE=1 it also re-renders every project.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { SuiteContext } from '../run-suites.js';
import {
  ARTIFACTS_DIR, REPO_ROOT, SHOWCASE_DIR, VIDEOS_DIR, listProjects, loadMeta, renderReadme, sectionOf, splitCommand,
} from '../../showcase/lib.js';
import { probe } from '../../packages/media/src/proc.js';

const EXPECTED_TYPES = 11;
/** mgvideo commands that change what a viewer sees or hears; each must appear in a recipe. */
const SHOWN_COMMANDS = [
  'render', 'sfx', 'concat', 'batch', 'broll', 'separate', 'plan', 'storyboard', 'montage',
  'reframe', 'blur-bg', 'smart-crop', 'matte', 'grade', 'vignette', 'glitch', 'title', 'lower-third',
  'loop', 'speed', 'reverse', 'freeze', 'pip', 'multicam', 'chromakey', 'watermark', 'safezone',
  'mask', 'declick', 'noise-gate', 'eq', 'compress-audio', 'waveform', 'optimize', 'validate', 'chapters',
];
/** The router takes every prompt first and has no clip of its own. */
const ROUTER_SKILL = 'magnifito-video';
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
/** Allowed difference between the recipe duration and the committed file, in seconds. */
const DURATION_TOLERANCE = 0.25;
const MAX_BYTES = 6 * 1024 * 1024;

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

export async function run(t: SuiteContext): Promise<void> {
  // The command splitter is the reproducibility boundary: it must reject every shell feature.
  t.assert(
    JSON.stringify(splitCommand(`mgvideo render . --format "16:9"`)) === JSON.stringify(['mgvideo', 'render', '.', '--format', '16:9']),
    'splitCommand: quoted argument',
  );
  t.assert(
    JSON.stringify(splitCommand(`ffmpeg -filter_complex "[0][1]hstack=inputs=2;[v]null"`))
      === JSON.stringify(['ffmpeg', '-filter_complex', '[0][1]hstack=inputs=2;[v]null']),
    'splitCommand: shell characters allowed inside quotes',
  );
  for (const bad of ['mgvideo render . | tee x', 'mgvideo render $DIR', 'ffmpeg -i a.mp4 > b', 'rm -rf work', 'mgvideo "open']) {
    t.assert(throws(() => splitCommand(bad)), `splitCommand rejects: ${bad}`);
  }

  const ids = listProjects();
  const mainIds = ids.filter(id => sectionOf(id) === 'main');
  t.assert(mainIds.length === EXPECTED_TYPES, `showcase has ${EXPECTED_TYPES} main video types`, `found ${mainIds.length}: ${mainIds.join(', ')}`);

  const types = new Set<string>();
  const usedCommands = new Set<string>();
  const usedSkills = new Set<string>();
  const styleRecipes = new Map<string, string[]>();
  for (const id of ids) {
    const dir = path.join(SHOWCASE_DIR, id);
    let meta;
    try {
      meta = loadMeta(id);
      t.assert(true, `${id}: recipe is valid`);
    } catch (err) {
      t.assert(false, `${id}: recipe is valid`, err instanceof Error ? err.message : String(err));
      continue;
    }
    if (sectionOf(id) === 'main') types.add(meta.type);
    usedSkills.add(meta.skill);
    for (const cmd of meta.commands) {
      const argv = splitCommand(cmd);
      if (argv[0] === 'mgvideo' && argv[1]) usedCommands.add(argv[1]);
    }
    if (sectionOf(id) === 'styles') {
      const planFile = path.join(dir, 'scene-plan.json');
      const recipes = fs.existsSync(planFile)
        ? [...new Set((JSON.parse(fs.readFileSync(planFile, 'utf8')).scenes as { visual_recipe: string }[]).map(sc => sc.visual_recipe))]
        : [];
      t.assert(recipes.length === 1, `${id}: style clip uses exactly one recipe`, recipes.join(', ') || 'no scene-plan.json');
      if (recipes.length === 1) styleRecipes.set(recipes[0], [...(styleRecipes.get(recipes[0]) ?? []), id]);
    }
    for (const a of meta.artifacts) {
      const file = path.join(ARTIFACTS_DIR, id, path.basename(a.path));
      const ok = fs.existsSync(file) && fs.statSync(file).size > 0;
      t.assert(ok, `${id}: artifact committed: ${path.basename(a.path)}`);
      if (ok) t.assert(fs.statSync(file).size <= MAX_ARTIFACT_BYTES, `${id}: artifact ${path.basename(a.path)} is at most 2 MiB`);
    }

    const readme = path.join(dir, 'README.md');
    t.assert(
      fs.existsSync(readme) && fs.readFileSync(readme, 'utf8') === renderReadme(meta),
      `${id}: README.md matches showcase.json`,
      'run: npx tsx showcase/render.ts --readme-only',
    );

    // Generated files live under work/ or runs/, so every other file a command names is an
    // input and must be committed. Absolute paths are not allowed: they break on a fresh clone.
    const missing: string[] = [];
    const absolute: string[] = [];
    for (const cmd of meta.commands) {
      for (const arg of splitCommand(cmd).slice(1)) {
        for (const tok of arg.split(/[=,:]/)) {
          if (!/^[\w./-]+\.[a-z][a-z0-9]{1,4}$/i.test(tok)) continue;
          if (tok.startsWith('/')) {
            absolute.push(tok);
            continue;
          }
          if (/^(\.\/)?(work|runs)\//.test(tok)) continue;
          if (!fs.existsSync(path.resolve(dir, tok))) missing.push(tok);
        }
      }
    }
    t.assert(absolute.length === 0, `${id}: commands use relative paths only`, absolute.join(', '));
    t.assert(missing.length === 0, `${id}: inputs named by the commands are committed`, missing.join(', '));

    const mp4 = path.join(VIDEOS_DIR, `${id}.mp4`);
    const jpg = path.join(VIDEOS_DIR, `${id}.jpg`);
    t.assert(fs.existsSync(jpg) && fs.statSync(jpg).size > 0, `${id}: poster is committed`);
    if (!fs.existsSync(mp4)) {
      t.assert(false, `${id}: video is committed`, `missing ${path.relative(REPO_ROOT, mp4)}`);
      continue;
    }
    const size = fs.statSync(mp4).size;
    t.assert(size <= MAX_BYTES, `${id}: video is at most ${MAX_BYTES / 1024 / 1024} MiB`, `${(size / 1024 / 1024).toFixed(2)} MiB`);
    const p = probe(mp4);
    const { width, height, duration_seconds, audio } = meta.expect;
    t.assert(p.width === width && p.height === height, `${id}: ${width}x${height}`, `got ${p.width}x${p.height}`);
    t.assert(
      Math.abs(p.durationSeconds - duration_seconds) <= DURATION_TOLERANCE,
      `${id}: duration ${duration_seconds} s`,
      `got ${p.durationSeconds.toFixed(3)} s`,
    );
    t.assert(p.hasAudio === audio, `${id}: ${audio ? 'has' : 'has no'} audio`);
    t.assert(p.pixFmt === 'yuv420p', `${id}: yuv420p for browser playback`, `got ${p.pixFmt}`);
    const header = fs.readFileSync(mp4).subarray(0, 64 * 1024);
    const moov = header.indexOf('moov');
    const mdat = header.indexOf('mdat');
    t.assert(moov !== -1 && (mdat === -1 || moov < mdat), `${id}: faststart (moov before mdat)`);
  }
  t.assert(types.size === mainIds.length, 'every main project shows a different video type', [...types].join(', '));

  // Coverage rules from docs/plans/showcase-videos.md.
  const recipeIds = fs.readdirSync(path.join(REPO_ROOT, 'styles/recipes')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  for (const r of recipeIds) {
    const clips = styleRecipes.get(r) ?? [];
    t.assert(clips.length === 1, `style gallery has one clip for recipe ${r}`, clips.length ? clips.join(', ') : 'none');
  }
  const missingCommands = SHOWN_COMMANDS.filter(c => !usedCommands.has(c));
  t.assert(missingCommands.length === 0, 'every shown mgvideo command appears in a recipe', missingCommands.join(', '));
  const skills = fs.readdirSync(path.join(REPO_ROOT, 'skills')).filter(s => s !== ROUTER_SKILL);
  const missingSkills = skills.filter(s => !usedSkills.has(s));
  t.assert(missingSkills.length === 0, 'every skill except the router owns a clip', missingSkills.join(', '));

  if (process.env.MGVIDEO_TEST_SHOWCASE !== '1') {
    t.skip('full showcase re-render (set MGVIDEO_TEST_SHOWCASE=1, about 10 minutes)');
    return;
  }
  try {
    execFileSync(process.execPath, ['--import', 'tsx', path.join(SHOWCASE_DIR, 'render.ts')], {
      cwd: REPO_ROOT, stdio: 'inherit',
    });
    t.assert(true, 'full showcase re-render succeeds');
  } catch {
    t.assert(false, 'full showcase re-render succeeds');
  }
}
