// Rasterizes a committed SVG (the mock UI "screen captures") to PNG with the toolkit's own
// rasterizer, using a fontconfig file that adds this project's fonts/ folder so the UI text
// renders in Geist, the same way the HyperFrames adapter renders brand fonts.
// Usage: node rasterize.mjs <input.svg> <output.png> <width> <height>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { rasterizeSvg } = await import(pathToFileURL(path.resolve(here, '../../dist/packages/media/src/proc.js')).href);

const [input, output, width, height] = process.argv.slice(2);
if (!input || !output || !width || !height) {
  console.error('Usage: node rasterize.mjs <input.svg> <output.png> <width> <height>');
  process.exit(2);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
// Absolute path: fontconfig resolves a relative FONTCONFIG_FILE against its own config dir,
// not the working directory, and would silently fall back to the default fonts.
const conf = path.resolve(path.dirname(output), 'fonts.conf');
const includes = ['/opt/homebrew/etc/fonts/fonts.conf', '/usr/local/etc/fonts/fonts.conf', '/etc/fonts/fonts.conf']
  .map(p => `  <include ignore_missing="yes">${p}</include>`)
  .join('\n');
fs.writeFileSync(
  conf,
  `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${includes}\n  <dir>${path.join(here, 'fonts')}</dir>\n  <cachedir>${path.join(os.tmpdir(), 'mgvideo-fontcache')}</cachedir>\n</fontconfig>\n`,
);
// Pango on macOS defaults to CoreText and ignores fontconfig; force the fontconfig backend.
rasterizeSvg(input, output, Number(width), Number(height), { ...process.env, FONTCONFIG_FILE: conf, PANGOCAIRO_BACKEND: 'fc' });
console.log(`${input} -> ${output}`);
