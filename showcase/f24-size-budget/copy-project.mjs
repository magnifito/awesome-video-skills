// Copies the render inputs of a showcase project (brief, brand, claims, scene plan, assets,
// fonts) into a scratch folder, so `mgvideo render` can write its runs/ there instead of into
// the other project. Recipe files (showcase.json, README.md, *.mjs) and scratch output
// (work/, runs/) are left behind.
// Usage: node copy-project.mjs <project-dir> <destination>
import fs from 'node:fs';
import path from 'node:path';

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error('Usage: node copy-project.mjs <project-dir> <destination>');
  process.exit(2);
}
const SKIP = new Set(['work', 'runs', 'README.md', 'showcase.json']);
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
  if (SKIP.has(entry.name) || entry.name.endsWith('.mjs')) continue;
  fs.cpSync(path.join(from, entry.name), path.join(to, entry.name), { recursive: true });
  console.log(`${path.join(from, entry.name)} -> ${path.join(to, entry.name)}`);
}
