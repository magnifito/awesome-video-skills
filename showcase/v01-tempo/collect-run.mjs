// Copies the newest mgvideo render output in a runs directory to a fixed path, so the
// following ffmpeg steps can name it without globs (run ids change on every render).
// Only <runs-dir>/<run-id>/final_output_* is considered; nested batch folders are not searched.
// Usage: node collect-run.mjs <runs-dir> <destination>
import fs from 'node:fs';
import path from 'node:path';

const [runsDir, dest] = process.argv.slice(2);
if (!runsDir || !dest) {
  console.error('Usage: node collect-run.mjs <runs-dir> <destination>');
  process.exit(2);
}

const found = [];
for (const run of fs.readdirSync(runsDir, { withFileTypes: true })) {
  if (!run.isDirectory() || !run.name.startsWith('run-')) continue;
  const dir = path.join(runsDir, run.name);
  for (const name of fs.readdirSync(dir)) {
    if (/^final_output_.*\.(mp4|mov|webm)$/.test(name)) found.push(path.join(dir, name));
  }
}
if (!found.length) {
  console.error(`No <run-id>/final_output_* file in ${runsDir}`);
  process.exit(1);
}
found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(found[0], dest);
console.log(`${found[0]} -> ${dest}`);
