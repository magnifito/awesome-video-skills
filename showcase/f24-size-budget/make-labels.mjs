// Writes the split-screen labels for showcase f24 as an SVG, with the real file sizes of the
// original and the size-budgeted encode, so the labels cannot drift from the files.
// Rasterize the result with rasterize.mjs (Geist from fonts/).
// Usage: node make-labels.mjs <original.mp4> <budgeted.mp4> <budget-mb> <out.svg>
import fs from 'node:fs';
import path from 'node:path';

const [original, budgeted, budget, out] = process.argv.slice(2);
if (!original || !budgeted || !budget || !out) {
  console.error('Usage: node make-labels.mjs <original.mp4> <budgeted.mp4> <budget-mb> <out.svg>');
  process.exit(2);
}
// Same unit as mgvideo optimize: 1 MB = 1024 * 1024 bytes.
const mb = file => (fs.statSync(file).size / 1024 / 1024).toFixed(2);
const left = `Original  ${mb(original)} MB`;
const right = `Budget ${budget} MB  →  ${mb(budgeted)} MB`;
// Pill widths follow the text length (Geist 30 px semibold is about 16.5 px per character).
const lw = Math.round(left.length * 16.5 + 56);
const rw = Math.round(right.length * 16.5 + 78);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <g font-family="Geist" font-size="30" font-weight="600" letter-spacing="0.3">
    <rect x="${934 - lw}" y="40" width="${lw}" height="56" rx="28" fill="#2b1c17" fill-opacity="0.88"/>
    <text x="${934 - lw / 2}" y="78" fill="#f0eadf" text-anchor="middle" xml:space="preserve">${left}</text>
    <rect x="986" y="40" width="${rw}" height="56" rx="28" fill="#2b1c17" fill-opacity="0.88"/>
    <circle cx="1018" cy="68" r="7" fill="#8acf31"/>
    <text x="1040" y="78" fill="#f0eadf" xml:space="preserve">${right}</text>
  </g>
</svg>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg);
console.log(`${left} | ${right} -> ${out}`);
