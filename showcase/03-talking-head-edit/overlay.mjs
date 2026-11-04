/**
 * Renders the transparent overlay for the edited cut, one PNG per output frame in
 * work/overlay/: retimed captions with the current word highlighted (from
 * work/edit-transcript.json), and a strip that shows the raw take's timeline with every
 * removed range marked and labelled, the playhead jumping over each cut as it happens.
 *
 * Usage (from this folder, after apply-edl.mjs): node overlay.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND, clamp, esc, fontEnv, logoSvg, rasterize, smooth } from './presenter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const OUT = path.join(WORK, 'overlay');
const W = 1920;
const H = 1080;

const edl = JSON.parse(fs.readFileSync(path.join(HERE, 'edl.json'), 'utf8'));
const rawWords = JSON.parse(fs.readFileSync(path.join(HERE, 'transcript.json'), 'utf8')).words;
const words = JSON.parse(fs.readFileSync(path.join(WORK, 'edit-transcript.json'), 'utf8')).words;
const fps = edl.output_fps.numerator / edl.output_fps.denominator;
const srcDur = edl.source_duration_us / 1e6;
const outFrames = edl.cuts.at(-1).output_end_frame;
const cuts = edl.cuts.map(c => ({ ...c, a: c.source_start_us / 1e6, b: c.source_end_us / 1e6 }));

// Removed ranges between kept ranges, labelled with the words they held (or "pause").
const gaps = [];
for (let i = 1; i < cuts.length; i++) {
  const a = cuts[i - 1].b;
  const b = cuts[i].a;
  const said = rawWords.filter(w => w.start_ms / 1000 >= a && w.end_ms / 1000 <= b).map(w => w.word.replace(/,$/, ''));
  gaps.push({ a, b, label: said.length ? said.join(' ') : 'pause', filler: said.length > 0, at: cuts[i].output_start_frame });
}

// Caption cues: same breaks as apply-edl.mjs (sentence end, comma after 3+ words).
const cues = [];
let cur = [];
for (const w of words) {
  cur.push(w);
  if (/[.!?]$/.test(w.word) || (/,$/.test(w.word) && cur.length >= 3) || cur.length >= 8) { cues.push(cur); cur = []; }
}
if (cur.length) cues.push(cur);

const X0 = 120;
const X1 = W - 120;
const sx = s => X0 + ((X1 - X0) * s) / srcDur;
const FONT = "font-family=\"Geist\"";

function stripSvg(f) {
  const c = cuts.find(k => f >= k.output_start_frame && f < k.output_end_frame) ?? cuts.at(-1);
  const srcT = c.a + (f - c.output_start_frame) / fps;
  const y = 978;
  const parts = [];
  parts.push(`<rect x="60" y="${y - 74}" width="${W - 120}" height="150" rx="22" fill="${BRAND.ink}" fill-opacity="0.82"/>`);
  parts.push(`<text x="${X0}" y="${y - 38}" ${FONT} font-size="22" font-weight="600" fill="${BRAND.sand}" letter-spacing="2">RAW TAKE ${srcDur.toFixed(1)} s</text>`);
  parts.push(`<text x="${X1}" y="${y - 38}" ${FONT} font-size="22" font-weight="600" fill="${BRAND.sand}" letter-spacing="2" text-anchor="end">EDIT ${(outFrames / fps).toFixed(1)} s · ${gaps.length} CUTS</text>`);
  // Kept ranges: brown; the part already played is gold.
  for (const k of cuts) {
    parts.push(`<rect x="${sx(k.a)}" y="${y - 12}" width="${sx(k.b) - sx(k.a)}" height="24" rx="5" fill="${BRAND.brown}" fill-opacity="0.75"/>`);
    const played = clamp(srcT, k.a, k.b);
    if (played > k.a) parts.push(`<rect x="${sx(k.a)}" y="${y - 12}" width="${sx(played) - sx(k.a)}" height="24" rx="5" fill="${BRAND.gold}"/>`);
  }
  // Removed ranges: hatched, labelled; the cut that just happened lights up in the logo green.
  for (const g of gaps) {
    const x = sx(g.a);
    const w = sx(g.b) - x;
    const hot = f >= g.at && f < g.at + fps * 1.1;
    parts.push(`<rect x="${x + 2}" y="${y - 12}" width="${Math.max(2, w - 4)}" height="24" rx="5" fill="url(#hatch)" stroke="${hot ? BRAND.green : BRAND.tan}" stroke-width="${hot ? 4 : 2}"/>`);
    parts.push(`<text x="${x + w / 2}" y="${y + 46}" ${FONT} font-size="${hot ? 24 : 21}" font-weight="${hot ? 700 : 500}" fill="${hot ? BRAND.green : BRAND.sand}" text-anchor="middle">${esc(g.filler ? `“${g.label}”` : g.label)}</text>`);
  }
  // Playhead in source time: it jumps over every removed range.
  parts.push(`<rect x="${sx(srcT) - 3}" y="${y - 26}" width="6" height="52" rx="3" fill="#ffffff"/>`);
  return parts.join('\n');
}

function toastSvg(f) {
  const g = gaps.find(k => f >= k.at && f < k.at + fps * 1.1);
  if (!g) return '';
  const p = (f - g.at) / (fps * 1.1);
  const o = Math.min(smooth(p / 0.12), smooth((1 - p) / 0.2));
  const text = `CUT · ${g.filler ? `“${g.label}”` : `${(g.b - g.a).toFixed(1)} s pause`} removed`;
  const w = text.length * 14 + 48;
  const x = W / 2 - w / 2;
  return `<g opacity="${o.toFixed(3)}">
    <rect x="${x}" y="912" width="${w}" height="44" rx="22" fill="${BRAND.green}"/>
    <text x="${W / 2}" y="942" ${FONT} font-size="25" font-weight="700" fill="${BRAND.ink}" text-anchor="middle">${esc(text)}</text>
  </g>`;
}

function captionSvg(f) {
  const t = f / fps;
  const cue = cues.find(c => t >= c[0].start_ms / 1000 - 0.05 && t <= c.at(-1).end_ms / 1000 + 0.35);
  if (!cue) return '';
  const text = cue.map(w => w.word).join(' ');
  const size = 50;
  const w = text.length * size * 0.53 + 80;
  const spans = cue.map(wd => {
    const on = t >= wd.start_ms / 1000 && t < wd.end_ms / 1000 + 0.12;
    return `<tspan fill="${on ? BRAND.gold : '#ffffff'}">${esc(wd.word)}</tspan>`;
  }).join(' ');
  return `<rect x="${W / 2 - w / 2}" y="796" width="${w}" height="84" rx="20" fill="${BRAND.ink}" fill-opacity="0.8"/>
  <text x="${W / 2}" y="854" ${FONT} font-size="${size}" font-weight="600" text-anchor="middle" xml:space="preserve">${spans}</text>`;
}

const badge = `<g transform="translate(60,52)">
  <rect width="486" height="64" rx="32" fill="#fbf8f2" fill-opacity="0.94"/>
  ${logoSvg({ x: 18, y: 10, height: 44, part: 'mark' })}
  <text x="72" y="42" ${FONT} font-size="26" font-weight="600" fill="${BRAND.ink}">Magnifito · talking-head edit</text>
</g>`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const env = fontEnv(WORK);
const svgFile = path.join(OUT, 'frame.svg');
for (let f = 0; f < outFrames; f++) {
  fs.writeFileSync(svgFile, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="10" height="10" fill="${BRAND.tan}" fill-opacity="0.2"/><rect width="4" height="10" fill="${BRAND.tan}" fill-opacity="0.75"/>
  </pattern></defs>
  ${badge}${captionSvg(f)}${stripSvg(f)}${toastSvg(f)}</svg>`);
  rasterize(svgFile, path.join(OUT, `${String(f).padStart(5, '0')}.png`), env);
}
fs.rmSync(svgFile);
console.log(`overlay: ${outFrames} frames -> work/overlay/`);
