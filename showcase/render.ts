/**
 * Renders every showcase project (or those whose id contains the filter): runs the recipe
 * commands from showcase.json, then writes the committed deliverables
 * `showcase/videos/<id>.mp4` (H.264, faststart, web-sized) and `<id>.jpg`, and regenerates
 * the project README.
 *
 * Usage: npm run showcase [-- <id-filter>]      (builds mgvideo first)
 *        tsx showcase/render.ts --readme-only   (regenerate READMEs, render nothing)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  ARTIFACTS_DIR, MGVIDEO_BIN, SHOWCASE_DIR, VIDEOS_DIR, listProjects, loadMeta, renderReadme, resolveOutput, runCommand,
} from './lib.js';

const readmeOnly = process.argv.includes('--readme-only');
const filter = process.argv.slice(2).find(a => !a.startsWith('--'));
const ids = listProjects().filter(id => !filter || id.includes(filter));
if (!ids.length) {
  console.error(`No showcase project matches "${filter ?? ''}"`);
  process.exit(1);
}
if (!readmeOnly && !fs.existsSync(MGVIDEO_BIN)) {
  console.error(`mgvideo is not built (${MGVIDEO_BIN}). Run: npm run build`);
  process.exit(1);
}
fs.mkdirSync(VIDEOS_DIR, { recursive: true });

let failed = 0;
for (const id of ids) {
  const started = Date.now();
  const dir = path.join(SHOWCASE_DIR, id);
  console.log(`\n▶ ${id}`);
  try {
    const meta = loadMeta(id);
    fs.writeFileSync(path.join(dir, 'README.md'), renderReadme(meta));
    if (readmeOnly) continue;

    fs.rmSync(path.join(dir, 'work'), { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
    for (const cmd of meta.commands) {
      console.log(`    $ ${cmd}`);
      runCommand(cmd, dir);
    }
    const raw = resolveOutput(dir, meta.output);

    const mp4 = path.join(VIDEOS_DIR, `${id}.mp4`);
    const jpg = path.join(VIDEOS_DIR, `${id}.jpg`);
    const { width, height, audio } = meta.expect;
    const audioArgs = audio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000'] : ['-an'];
    execFileSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', raw,
      '-vf', `scale=${width}:${height}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'high',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      ...audioArgs, '-movflags', '+faststart', mp4,
    ]);
    execFileSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-ss', String(meta.poster_at), '-i', mp4,
      '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '4', jpg,
    ]);
    const artifactDir = path.join(ARTIFACTS_DIR, id);
    fs.rmSync(artifactDir, { recursive: true, force: true });
    if (meta.artifacts.length) fs.mkdirSync(artifactDir, { recursive: true });
    for (const a of meta.artifacts) {
      const src = resolveOutput(dir, a.path);
      fs.copyFileSync(src, path.join(artifactDir, path.basename(a.path)));
    }
    const kb = Math.round(fs.statSync(mp4).size / 1024);
    console.log(` ✅ ${id}: ${kb} KiB in ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (err) {
    failed++;
    console.error(` ❌ ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\nSHOWCASE: ${ids.length - failed} ${readmeOnly ? 'READMEs written' : 'rendered'}, ${failed} failed`);
process.exit(failed ? 1 : 0);
