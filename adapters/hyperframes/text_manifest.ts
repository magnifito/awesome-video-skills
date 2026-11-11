/**
 * Text manifest for HyperFrames renders.
 *
 * Each scene card is one SVG; animate.ts moves its top-level elements. To know where every text
 * element lands, each <text> is rasterized alone (everything else hidden by CSS) at rest on a
 * canvas with a margin around the frame, so ink outside the frame is still measured. The ink box
 * is then carried through the same animation state the frames use (rise, camera scale, fade),
 * sampled every `SAMPLE_STEP_S` seconds.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TextManifest, TextManifestEntry } from '../../packages/contracts/src/index.js';
import { rasterizeSvgAsync } from '../../packages/media/src/proc.js';
import type { ProjectContext } from '../interface.js';
import { frameState, motionProfile, splitSvg } from './animate.js';

const execFileAsync = promisify(execFile);

export const SAMPLE_STEP_S = 0.1;
const PARALLEL = 8;
/** Alpha (0-255) above which a pixel counts as ink. */
const INK_ALPHA = 16;

interface Probe {
  sceneIndex: number;
  element: number;
  id: string;
  text: string;
  fontSize: number;
  bold: boolean;
  svg: string;
}

interface Ink {
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  color: string;
}

export async function buildTextManifest(
  context: ProjectContext,
  sceneSvg: (index: number) => string,
  width: number,
  height: number,
  workDir: string,
  env: NodeJS.ProcessEnv | undefined
): Promise<TextManifest> {
  const margin = Math.round(Math.max(width, height) * 0.25);
  const scenes = context.scenePlan.scenes;
  const probes: Probe[] = [];
  const partsByScene = scenes.map((_, i) => splitSvg(sceneSvg(i), width, height));

  partsByScene.forEach((parts, sceneIndex) => {
    let animated = -1;
    let n = 0;
    parts.elements.forEach((el, ei) => {
      if (el.static) return;
      animated++;
      const tagRe = /<text\b/g;
      let m: RegExpExecArray | null;
      while ((m = tagRe.exec(el.markup))) {
        const end = el.markup.indexOf('</text>', m.index);
        if (end < 0) break;
        const node = el.markup.slice(m.index, end + 7);
        const text = textContent(node);
        if (!text) continue;
        const tagged = el.markup.slice(0, m.index) + '<text data-mgprobe="1"' + el.markup.slice(m.index + 5);
        const body = parts.elements.map((e, j) => (j === ei ? tagged : e.markup)).join('\n');
        probes.push({
          sceneIndex,
          element: animated,
          id: `${scenes[sceneIndex].scene_id}#${n++}`,
          text,
          fontSize: Number.parseFloat(attr(node, 'font-size') ?? '16') || 16,
          bold: /^(bold|bolder|[6-9]00)$/.test(attr(node, 'font-weight') ?? ''),
          svg: probeSvg(parts.open, body, width, height, margin),
        });
      }
    });
  });

  await fs.mkdir(workDir, { recursive: true });
  const inks: (Ink | null)[] = new Array(probes.length).fill(null);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const j = next++;
      if (j >= probes.length) return;
      const svgPath = path.join(workDir, `text_${j}.svg`);
      const pngPath = path.join(workDir, `text_${j}.png`);
      await fs.writeFile(svgPath, probes[j].svg, 'utf-8');
      await rasterizeSvgAsync(svgPath, pngPath, width + 2 * margin, height + 2 * margin, env);
      inks[j] = await measureInk(pngPath, width + 2 * margin, height + 2 * margin, margin);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, probes.length) }, worker));
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }

  const offsets: number[] = [];
  scenes.reduce((acc, s) => (offsets.push(acc), acc + s.duration_seconds), 0);
  const texts: TextManifestEntry[] = [];
  probes.forEach((p, j) => {
    const ink = inks[j];
    if (!ink) return;
    const scene = scenes[p.sceneIndex];
    const parts = partsByScene[p.sceneIndex];
    const profile = motionProfile(scene, context.brand, p.sceneIndex === scenes.length - 1);
    const samples: TextManifestEntry['samples'] = [];
    const steps = Math.max(1, Math.round(scene.duration_seconds / SAMPLE_STEP_S));
    for (let i = 0; i < steps; i++) {
      const t = i * SAMPLE_STEP_S;
      const state = frameState(parts, profile, t, scene.duration_seconds, height);
      const [elOpacity, dy] = state.elements[p.element];
      const s = state.scale;
      const cx = width / 2;
      const cy = height / 2;
      samples.push({
        t: round(offsets[p.sceneIndex] + t, 3),
        x: round(cx + (ink.x - cx) * s, 1),
        y: round(cy + (ink.y + dy - cy) * s, 1),
        w: round(ink.w * s, 1),
        h: round(ink.h * s, 1),
        opacity: round(elOpacity * state.fade * ink.opacity, 3),
      });
    }
    texts.push({
      id: p.id,
      scene_id: scene.scene_id,
      text: p.text,
      words: p.text.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length,
      font_size: round(p.fontSize, 1),
      bold: p.bold,
      color: ink.color,
      is_copy: isCopy(p.text, scene.copy_text),
      narrated: scene.audio_events.some(e => e.type === 'voiceover'),
      samples,
    });
  });

  return { schema_version: '1.0.0', width, height, sample_step_s: SAMPLE_STEP_S, texts };
}

/** Root tag widened by `margin` on every side, plus a style that shows only the probed text. */
function probeSvg(open: string, body: string, width: number, height: number, margin: number): string {
  const W = width + 2 * margin;
  const H = height + 2 * margin;
  let tag = open
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '')
    .replace(/\sviewBox="[^"]*"/, '');
  tag = tag.replace(/^<svg\b/, `<svg width="${W}" height="${H}" viewBox="${-margin} ${-margin} ${W} ${H}"`);
  const style = '<style>*{visibility:hidden !important}[data-mgprobe],[data-mgprobe] *{visibility:visible !important}</style>';
  return `${tag}\n${style}\n${body}\n</svg>`;
}

/** Ink box in frame coordinates, peak opacity and dominant colour of a probe raster. */
async function measureInk(pngPath: string, W: number, H: number, margin: number): Promise<Ink | null> {
  const { stdout } = await execFileAsync('ffmpeg', ['-v', 'error', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {
    encoding: 'buffer',
    maxBuffer: W * H * 4 + 1024,
  });
  const d = stdout as Buffer;
  let x0 = W, y0 = H, x1 = -1, y1 = -1, peak = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a <= INK_ALPHA) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (a > peak) peak = a;
    }
  }
  if (x1 < 0) return null;
  // Dominant colour among the most opaque pixels (glyph cores, not antialiased edges).
  const counts = new Map<number, number>();
  const floor = peak * 0.9;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < floor) continue;
      const key = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best = 0, bestN = -1;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  const ch = (v: number) => ((v << 2) | (v >> 4)).toString(16).padStart(2, '0');
  return {
    x: x0 - margin,
    y: y0 - margin,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    opacity: round(peak / 255, 3),
    color: `#${ch((best >> 12) & 63)}${ch((best >> 6) & 63)}${ch(best & 63)}`,
  };
}

function attr(node: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(/^<text\b[^>]*>/.exec(node)?.[0] ?? '')?.[1];
}

function textContent(node: string): string {
  return node
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Text taken from the scene copy: its words appear in order in `copy_text`. */
function isCopy(text: string, copy: string): boolean {
  const t = norm(text);
  return t.length > 0 && ` ${norm(copy)} `.includes(` ${t} `);
}

const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;
