// Copies the newest render run in a runs directory to a fixed name (runs/<name>), so the
// following `mgvideo validate <name> -p <project>` can name it without globs (run ids change
// on every render). The copy keeps render-request.json and render-result.json, whose output
// paths still point at the original run, so validate checks the real rendered file.
// Usage: node pin-run.mjs <runs-dir> <name>
import fs from 'node:fs';
import path from 'node:path';

const [runsDir, name] = process.argv.slice(2);
if (!runsDir || !name) {
  console.error('Usage: node pin-run.mjs <runs-dir> <name>');
  process.exit(2);
}
const runs = fs.readdirSync(runsDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name.startsWith('run-'))
  .map(d => path.join(runsDir, d.name))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
if (!runs.length) {
  console.error(`No run-* folder in ${runsDir}; render the project first`);
  process.exit(1);
}
const dest = path.join(runsDir, name);
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(runs[0], dest, { recursive: true });
console.log(`${runs[0]} -> ${dest}`);
