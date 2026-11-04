// Copies committed project inputs into a scratch folder under work/, so commands that write
// next to their inputs (mgvideo plan writes scene-plan.json, mgvideo storyboard writes
// storyboard/) never touch committed files.
// Usage: node stage.mjs <destination-dir> <file>...
import fs from 'node:fs';
import path from 'node:path';

const [dest, ...files] = process.argv.slice(2);
if (!dest || !files.length) {
  console.error('Usage: node stage.mjs <destination-dir> <file>...');
  process.exit(2);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const f of files) {
  fs.cpSync(f, path.join(dest, f), { recursive: true });
  console.log(`${f} -> ${path.join(dest, f)}`);
}
