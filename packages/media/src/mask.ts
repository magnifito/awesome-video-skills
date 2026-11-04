import { runFfmpeg, probe, safeColor } from './proc.js';
import path from 'node:path';
import fs from 'node:fs';

export interface MaskBox {
  x: number;
  y: number;
  width: number;
  height: number;
  mode?: 'blur' | 'solid';
  color?: string; // for solid mode
  /** Seconds from the start of the clip at which this box turns on (default: from the start). */
  start?: number;
  /** Seconds at which this box turns off (default: until the end). */
  end?: number;
}

export interface MaskOptions {
  outputPath?: string;
}

export interface MaskResult {
  sourceVideo: string;
  outputPath: string;
  /** The first box (kept for single-box callers). */
  box: MaskBox;
  boxes: MaskBox[];
  mode: 'blur' | 'solid';
}

/**
 * Parses a CLI box spec: "x,y,width,height" or "x,y,width,height,start,end" (start/end in seconds;
 * either may be left empty, e.g. "10,10,200,40,,3.5").
 */
export function parseMaskBox(spec: string): MaskBox {
  const parts = spec.split(',').map(s => s.trim());
  if (parts.length !== 4 && parts.length !== 6) {
    throw new Error(`Box must be "x,y,width,height" or "x,y,width,height,start,end", got ${JSON.stringify(spec)}`);
  }
  const num = (s: string, label: string) => {
    const n = Number(s);
    if (s === '' || !Number.isFinite(n)) throw new Error(`Box ${label} must be a number in ${JSON.stringify(spec)}`);
    return n;
  };
  const box: MaskBox = { x: num(parts[0], 'x'), y: num(parts[1], 'y'), width: num(parts[2], 'width'), height: num(parts[3], 'height') };
  if (parts.length === 6) {
    if (parts[4] !== '') box.start = num(parts[4], 'start');
    if (parts[5] !== '') box.end = num(parts[5], 'end');
  }
  return box;
}

/** Timeline expression for a box's window, or '' when it is on for the whole clip. */
function enableExpr(box: MaskBox): string {
  const { start, end } = box;
  if (start !== undefined && !(Number.isFinite(start) && start >= 0)) throw new Error(`Box start must be >= 0 seconds, got ${start}`);
  if (end !== undefined && !(Number.isFinite(end) && end > 0)) throw new Error(`Box end must be > 0 seconds, got ${end}`);
  if (start !== undefined && end !== undefined && !(end > start)) throw new Error(`Box end (${end}) must be after its start (${start})`);
  if (start === undefined && end === undefined) return '';
  // Half-open window [start, end) so consecutive boxes (a,b) and (b,c) never overlap on a frame.
  const cond = start === undefined ? `lt(t,${end})` : end === undefined ? `gte(t,${start})` : `gte(t,${start})*lt(t,${end})`;
  return `:enable='${cond}'`;
}

export class MaskEngine {
  /**
   * Redacts sensitive on-screen client credentials, API keys, or PII using blur or solid matte.
   */
  static applyRedaction(videoPath: string, box: MaskBox, options: MaskOptions = {}): MaskResult {
    return MaskEngine.applyRedactions(videoPath, [box], options);
  }

  /**
   * Redacts several regions in one pass. Each box can carry its own time window, so a moving
   * field can be covered by consecutive boxes (box A for 0-2 s, box B for 2-4 s, ...).
   * The output name and the reported mode follow the first box.
   */
  static applyRedactions(videoPath: string, boxes: MaskBox[], options: MaskOptions = {}): MaskResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (boxes.length === 0) throw new Error('At least one redaction box is required');

    const mode = boxes[0].mode ?? 'blur';
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-redacted-${mode}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);

    const blurBoxes = boxes.filter(b => (b.mode ?? 'blur') === 'blur').length;
    const graph: string[] = [];
    // Split once: one copy is the base, one feeds each blurred crop.
    const cropLabels = Array.from({ length: blurBoxes }, (_, i) => `c${i}`);
    let current = '[0:v]';
    if (blurBoxes > 0) {
      graph.push(`[0:v]split=${blurBoxes + 1}[base]${cropLabels.map(l => `[${l}]`).join('')}`);
      current = '[base]';
    }
    let blurIndex = 0;
    boxes.forEach((box, i) => {
      // Clamp the box to the frame so crop/drawbox never reference pixels outside it.
      const x = Math.max(0, Math.floor(box.x));
      const y = Math.max(0, Math.floor(box.y));
      const bw = Math.min(Math.floor(box.width), info.width - x);
      const bh = Math.min(Math.floor(box.height), info.height - y);
      if (!(bw > 0 && bh > 0)) {
        throw new Error(`Redaction box ${JSON.stringify(box)} does not overlap the ${info.width}x${info.height} frame`);
      }
      const enable = enableExpr(box);
      const out = i === boxes.length - 1 ? '[outv]' : `[v${i}]`;
      if ((box.mode ?? 'blur') === 'blur') {
        // Pixelate (downscale to at most 8x8 blocks, then nearest-neighbour upscale) and blur on top.
        // Pixelation destroys detail irreversibly for any box size, unlike a blur whose radius
        // is limited by the plane size (boxblur requires radius < half the smallest plane).
        const blocksW = Math.max(1, Math.min(8, Math.floor(bw / 4)));
        const blocksH = Math.max(1, Math.min(8, Math.floor(bh / 4)));
        const chromaLimit = Math.floor(Math.min(bw, bh) / 4) - 1;
        const blur = chromaLimit >= 1
          ? `,boxblur=luma_radius=${Math.min(15, chromaLimit)}:luma_power=2:chroma_radius=${Math.min(15, chromaLimit)}:chroma_power=2`
          : '';
        const label = cropLabels[blurIndex++];
        graph.push(`[${label}]crop=${bw}:${bh}:${x}:${y},scale=${blocksW}:${blocksH}:flags=area,scale=${bw}:${bh}:flags=neighbor${blur}[b${i}]`);
        graph.push(`${current}[b${i}]overlay=${x}:${y}${enable}${out}`);
      } else {
        // Fully opaque by default: any transparency would leave the redacted pixels recoverable.
        const color = safeColor(box.color ?? 'black');
        graph.push(`${current}drawbox=x=${x}:y=${y}:w=${bw}:h=${bh}:color=${color}:t=fill${enable}${out}`);
      }
      current = out;
    });

    runFfmpeg([
      '-i',
      videoPath,
      '-filter_complex',
      graph.join(';'),
      '-map',
      '[outv]',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      outPath
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate redacted video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      box: boxes[0],
      boxes,
      mode
    };
  }
}
