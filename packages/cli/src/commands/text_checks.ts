import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  minTextSize,
  safeZoneFor,
  type SafeZonePlatform,
  type TextManifest,
  type TextManifestEntry
} from '../../../contracts/src/index.js';
import type { ValidationItem } from './validate.js';

const execFileAsync = promisify(execFile);

/** Opacity from which a text counts as visible (also the overlap rule's threshold). */
const VISIBLE = 0.3;
/** Opacity from which a text counts as readable for the reading-time rule. */
const READABLE = 0.5;
/** Overlap of two visible texts, as a share of the smaller box, that is reported. */
const OVERLAP_SHARE = 0.2;

type Sample = TextManifestEntry['samples'][0];

export interface TextCheckOptions {
  platform: SafeZonePlatform;
  /** Video to measure contrast on; omitted (or transparent output) skips the contrast rule. */
  videoPath?: string;
}

/** Checks over a text manifest: clipped, safe zone, size, reading time, overlap and contrast. */
export async function textChecks(manifest: TextManifest, options: TextCheckOptions): Promise<ValidationItem[]> {
  const { width: W, height: H } = manifest;
  const items: ValidationItem[] = [];
  const zone = safeZoneFor(W, H, options.platform);
  const floor = minTextSize(W, H);
  const visible = manifest.texts.filter(t => peak(t) >= VISIBLE);
  const label = (t: TextManifestEntry) => `"${t.text.length > 40 ? t.text.slice(0, 39) + '…' : t.text}" (${t.scene_id})`;

  // Clipped: settled text more than 1 px outside the frame.
  const clipped: ValidationItem[] = [];
  for (const t of visible) {
    const s = settled(t).find(s => s.x < -1 || s.y < -1 || s.x + s.w > W + 1 || s.y + s.h > H + 1);
    if (s) {
      clipped.push({
        rule: 'text-clipped', severity: 'P0', check: 'Text inside the frame', passed: false, at_s: s.t,
        fix: 'Shorten or wrap the line, or reduce its size, so every glyph rests inside the frame.',
        actual: box(s), expected: `inside ${W}x${H}`,
        details: `${label(t)} runs ${Math.round(outside(s, W, H))} px past the frame edge.`
      });
    }
  }
  items.push(...orPass(clipped, 'text-clipped', 'P0', 'Text inside the frame', `All ${visible.length} text elements rest inside the frame.`));

  // Safe zone: settled text inside the platform UI margins.
  const zoneName = zone.aspect === '9:16' ? `${options.platform} 9:16` : zone.aspect;
  const inZone: ValidationItem[] = [];
  for (const t of visible) {
    const s = settled(t).find(s => s.y < zone.top - 0.5 || s.y + s.h > H - zone.bottom + 0.5 || s.x < zone.left - 0.5 || s.x + s.w > W - zone.right + 0.5);
    if (s) {
      const sides = [
        s.y < zone.top - 0.5 && 'top', s.y + s.h > H - zone.bottom + 0.5 && 'bottom',
        s.x < zone.left - 0.5 && 'left', s.x + s.w > W - zone.right + 0.5 && 'right'
      ].filter(Boolean).join(', ');
      inZone.push({
        rule: 'text-safe-zone', severity: 'P1', check: `Text outside UI zones (${zoneName})`, passed: false, at_s: s.t,
        fix: 'Move the text toward the centre, or set "platform" in validate.json if the delivery platform is known.',
        actual: box(s),
        expected: `top ${Math.round(zone.top)}, bottom ${Math.round(zone.bottom)}, left ${Math.round(zone.left)}, right ${Math.round(zone.right)} px clear`,
        details: `${label(t)} is inside the ${sides} UI zone.`
      });
    }
  }
  items.push(...orPass(inZone, 'text-safe-zone', 'P1', `Text outside UI zones (${zoneName})`, `No text inside the ${zoneName} UI zones.`));

  // Size: copy below the floor is P1, labels P2.
  const small: ValidationItem[] = [];
  for (const t of visible) {
    if (t.font_size >= floor - 0.05) continue;
    small.push({
      rule: 'text-size', severity: t.is_copy ? 'P1' : 'P2', check: 'Text size', passed: false, at_s: firstVisible(t)?.t,
      fix: t.is_copy ? `Set the copy to at least ${Math.round(floor)} px.` : `Raise the label to ${Math.round(floor)} px or drop it.`,
      actual: `${t.font_size} px`, expected: `>= ${Math.round(floor)} px`,
      details: `${label(t)} is ${t.font_size} px; the floor at ${W}x${H} is ${Math.round(floor)} px${t.is_copy ? '' : ' (label, not scene copy)'}.`
    });
  }
  items.push(...orPass(small, 'text-size', 'P1', 'Text size', `All visible text is at least ${Math.round(floor)} px.`));

  // Reading time: scene copy that is not narrated stays readable for max(0.3 s per word, 1 s).
  const short: ValidationItem[] = [];
  for (const t of visible) {
    if (!t.is_copy || t.narrated || t.words === 0) continue;
    const run = longestRun(t.samples, READABLE, manifest.sample_step_s);
    const need = Math.max(0.3 * t.words, 1);
    if (run.seconds + 1e-6 < need) {
      short.push({
        rule: 'text-reading-time', severity: 'P2', check: 'Reading time', passed: false, at_s: run.start,
        fix: 'Hold the scene longer, cut words, or have the narration say them.',
        actual: `${run.seconds.toFixed(1)} s`, expected: `>= ${need.toFixed(1)} s`,
        details: `${label(t)} (${t.words} words) is readable for ${run.seconds.toFixed(1)} s; it needs ${need.toFixed(1)} s.`
      });
    }
  }
  items.push(...orPass(short, 'text-reading-time', 'P2', 'Reading time', 'Every unnarrated line of copy stays on screen long enough to read.'));

  // Overlap: two visible texts covering more than 20 % of the smaller one.
  const overlaps: ValidationItem[] = [];
  for (let a = 0; a < visible.length; a++) {
    for (let b = a + 1; b < visible.length; b++) {
      const A = visible[a], B = visible[b];
      // Texts of one scene share sample times; texts of different scenes are never on screen together.
      if (A.scene_id !== B.scene_id) continue;
      const hit = A.samples.find((sa, i) => {
        const sb = B.samples[i];
        if (!sb || sa.opacity < VISIBLE || sb.opacity < VISIBLE) return false;
        const smaller = Math.min(sa.w * sa.h, sb.w * sb.h);
        return smaller > 0 && intersect(sa, sb) > OVERLAP_SHARE * smaller;
      });
      if (hit) {
        overlaps.push({
          rule: 'text-overlap', severity: 'P2', check: 'Text overlap', passed: false, at_s: hit.t,
          fix: 'Separate the two texts, or fade one out before the other arrives.',
          details: `${label(A)} and ${label(B)} overlap by more than ${OVERLAP_SHARE * 100}% of the smaller box.`
        });
      }
    }
  }
  items.push(...orPass(overlaps, 'text-overlap', 'P2', 'Text overlap', 'No two visible texts overlap.'));

  // Contrast against the pixels actually behind the text.
  if (options.videoPath) {
    items.push(...await contrastChecks(visible, options.videoPath, W, H, label));
  }
  return items;
}

async function contrastChecks(
  texts: TextManifestEntry[],
  videoPath: string,
  W: number,
  H: number,
  label: (t: TextManifestEntry) => string
): Promise<ValidationItem[]> {
  const out: ValidationItem[] = [];
  const frames = new Map<number, Buffer>();
  const large = 24 * Math.min(W, H) / 1080;
  const largeBold = 18.66 * Math.min(W, H) / 1080;
  let measured = 0;
  for (const t of texts) {
    const run = settled(t);
    if (run.length === 0) continue;
    const s = run[Math.floor(run.length / 2)];
    const x0 = Math.max(0, Math.floor(s.x)), y0 = Math.max(0, Math.floor(s.y));
    const x1 = Math.min(W, Math.ceil(s.x + s.w)), y1 = Math.min(H, Math.ceil(s.y + s.h));
    if (x1 - x0 < 2 || y1 - y0 < 2) continue;
    let frame = frames.get(s.t);
    if (!frame) {
      try {
        frame = await grabFrame(videoPath, s.t, W, H);
      } catch (err) {
        out.push({
          rule: 'text-contrast', severity: 'P1', check: 'Text contrast', passed: false, at_s: s.t,
          fix: 'Check that ffmpeg can decode the output, then validate again.',
          details: `Could not measure: ${(err as Error).message.split('\n')[0]}`
        });
        return out;
      }
      frames.set(s.t, frame);
    }
    const ratio = contrastBehind(frame, W, x0, y0, x1, y1, t.color);
    measured++;
    const isLarge = t.font_size >= large || (t.bold && t.font_size >= largeBold);
    const severity = ratio < 3 ? 'P1' : !isLarge && ratio < 4.5 ? 'P2' : null;
    if (severity) {
      out.push({
        rule: 'text-contrast', severity, check: 'Text contrast', passed: false, at_s: s.t,
        fix: 'Darken or lighten the text, or add a scrim behind it.',
        actual: `${ratio.toFixed(2)}:1`, expected: isLarge ? '>= 3:1' : '>= 4.5:1 (body text)',
        details: `${label(t)} (${t.color}) has ${ratio.toFixed(2)}:1 against the pixels behind it.`
      });
    }
  }
  return orPass(out, 'text-contrast', 'P1', 'Text contrast', `${measured} text elements measured: at least 3:1, body text at least 4.5:1.`);
}

/**
 * WCAG contrast of `color` against the background inside a box: the half of the pixels least
 * like the text colour stand for the background, and their median luminance is used.
 */
export function contrastBehind(rgb: Buffer, W: number, x0: number, y0: number, x1: number, y1: number, color: string): number {
  const [tr, tg, tb] = hexRgb(color);
  const px: { d: number; l: number }[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3;
      const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
      px.push({ d: (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2, l: luminance(r, g, b) });
    }
  }
  px.sort((a, b) => b.d - a.d);
  const bg = px.slice(0, Math.max(1, Math.floor(px.length / 2))).map(p => p.l).sort((a, b) => a - b);
  const lb = bg[Math.floor(bg.length / 2)];
  const lt = luminance(tr, tg, tb);
  return (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05);
}

async function grabFrame(file: string, t: number, W: number, H: number): Promise<Buffer> {
  const { stdout } = await execFileAsync('ffmpeg', [
    '-v', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
  ], { encoding: 'buffer', maxBuffer: W * H * 3 + 1024 });
  const buf = stdout as Buffer;
  if (buf.length < W * H * 3) throw new Error(`no frame at ${t.toFixed(2)} s`);
  return buf;
}

function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

const peak = (t: TextManifestEntry) => t.samples.reduce((m, s) => Math.max(m, s.opacity), 0);

/** Samples where the text has finished entering: at least 95 % of its peak opacity. */
function settled(t: TextManifestEntry): Sample[] {
  const p = peak(t);
  return t.samples.filter(s => s.opacity >= p * 0.95 && s.opacity >= VISIBLE);
}

const firstVisible = (t: TextManifestEntry) => t.samples.find(s => s.opacity >= VISIBLE);

function longestRun(samples: Sample[], min: number, step: number): { seconds: number; start: number } {
  let best = { seconds: 0, start: samples[0]?.t ?? 0 };
  let start = -1, n = 0;
  for (const s of samples) {
    if (s.opacity >= min) {
      if (n === 0) start = s.t;
      n++;
      if (n * step > best.seconds) best = { seconds: n * step, start };
    } else {
      n = 0;
    }
  }
  return best;
}

function intersect(a: Sample, b: Sample): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function outside(s: Sample, W: number, H: number): number {
  return Math.max(-s.x, -s.y, s.x + s.w - W, s.y + s.h - H);
}

const box = (s: Sample) => `x ${Math.round(s.x)}, y ${Math.round(s.y)}, ${Math.round(s.w)}x${Math.round(s.h)}`;

function orPass(found: ValidationItem[], rule: string, severity: ValidationItem['severity'], check: string, details: string): ValidationItem[] {
  return found.length ? found : [{ rule, severity, check, passed: true, details }];
}
