import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe, safeColor } from './proc.js';

export interface ChromaKeyOptions {
  keyColor?: string; // hex or name, default "0x00FF00"
  similarity?: number; // 0.01 - 1.0, default 0.65 (fraction of the key-to-neutral chroma distance, see keyFilter)
  blend?: number; // 0.0 - 1.0, default 0.15 (same scale as similarity)
  despill?: boolean; // remove green/blue spill from the kept foreground, default true
  backgroundPath?: string;
  backgroundColor?: string; // fallback if no background video/image provided
  outputPath?: string;
}

export interface ChromaKeyResult {
  foregroundVideo: string;
  outputPath: string;
  keyColor: string;
  similarity: number;
  blend: number;
  despill: boolean;
}

export const CHROMAKEY_DEFAULTS = { similarity: 0.65, blend: 0.15 } as const;

// Named colours as ffmpeg defines them (only those that make sense as a screen colour).
const NAMED_KEYS: Record<string, string> = {
  green: '008000', lime: '00FF00', blue: '0000FF', navy: '000080', teal: '008080', cyan: '00FFFF',
};

/** RRGGBB of a key colour given as #hex, 0xhex or a supported name; null otherwise. */
function keyHex(keyColor: string): string | null {
  const name = keyColor.replace(/@.*$/, '').toLowerCase();
  return /^(?:#|0x)([0-9a-f]{6})/.exec(name)?.[1] ?? NAMED_KEYS[name] ?? null;
}

/**
 * Builds the key filter. ffmpeg `chromakey` measures distance in the UV (chroma) plane only, so
 * brightness does not matter: dark browns, hair and shadowed skin stay as far from a green key as
 * their light versions, unlike an RGB `colorkey` where every dark colour is close to a dark key.
 *
 * Every neutral colour (black, grey, white, and near enough dark brown hair) sits at the UV centre,
 * so its distance to the key equals the key's own chroma. `similarity` and `blend` are therefore
 * taken as fractions of that distance: pixels closer to the key than `similarity` of the way to
 * neutral are fully transparent, and they fade back to opaque over the next `blend`. This keeps
 * the same meaning for a pure 0x00FF00 key and for a duller colour sampled off the wall
 * (0x22B33A), whose raw chroma distances are about half as large. At the defaults (0.65 + 0.15)
 * anything at least 80% of the way to neutral stays fully opaque.
 */
export function keyFilter(keyColor: string, similarity: number, blend: number): string {
  const hex = keyHex(keyColor);
  if (!hex) {
    return `format=yuva444p,chromakey=color=${keyColor}:similarity=${similarity.toFixed(4)}:blend=${blend.toFixed(4)}`;
  }
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  // Convert the key ourselves with BT.601 limited-range coefficients, which is how ordinary
  // yuv420p footage is coded; chromakey's own RGB conversion uses full-range values and would
  // place the key further out than the screen pixels it is compared with.
  const yy = 16 + 0.257 * r + 0.504 * g + 0.098 * b;
  const u = -0.148 * r - 0.291 * g + 0.439 * b;
  const v = 0.439 * r - 0.368 * g - 0.071 * b;
  // chromakey's distance metric: sqrt((du^2 + dv^2) / (2 * 255^2)), averaged over a 3x3 window.
  const chroma = Math.hypot(u, v) / (255 * Math.SQRT2);
  if (chroma < 0.03) throw new Error(`Key colour ${keyColor} has almost no chroma; key a green or blue screen colour`);
  const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const yuv = `0x${byte(yy)}${byte(128 + u)}${byte(128 + v)}`;
  const sim = Math.max(similarity * chroma, 1e-5);
  const bl = blend * chroma;
  // format=yuva444p: chromakey only writes alpha on formats that carry it, and full-resolution
  // chroma keeps the matte edge as sharp as the luma.
  return `format=yuva444p,chromakey=color=${yuv}:similarity=${sim.toFixed(4)}:blend=${bl.toFixed(4)}:yuv=1`;
}

/** Spill type for despill: blue when the key leans blue, green otherwise. */
function spillType(keyColor: string): 'green' | 'blue' {
  const hex = keyHex(keyColor);
  if (!hex) return 'green';
  return parseInt(hex.slice(4, 6), 16) > parseInt(hex.slice(2, 4), 16) ? 'blue' : 'green';
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.gif']);

export class ChromaKeyEngine {
  /**
   * Keys out a green or blue screen background and composites the foreground onto a background plate.
   */
  static composite(videoPath: string, options: ChromaKeyOptions = {}): ChromaKeyResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Foreground video not found: ${videoPath}`);
    }

    const keyColor = safeColor(options.keyColor ?? '0x00FF00');
    const similarity = options.similarity ?? CHROMAKEY_DEFAULTS.similarity;
    const blend = options.blend ?? CHROMAKEY_DEFAULTS.blend;
    const despill = options.despill ?? true;
    if (!(similarity >= 0.01 && similarity <= 1)) throw new Error(`similarity must be in [0.01, 1], got ${similarity}`);
    if (!(blend >= 0 && blend <= 1)) throw new Error(`blend must be in [0, 1], got ${blend}`);

    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`Foreground has no video stream: ${videoPath}`);
    const w = info.displayWidth;
    const h = info.displayHeight;
    const fps = info.fps > 0 ? info.fps : 30;

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-chromakeyed.mp4`
    );

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // despill pulls the screen colour out of the kept edges and reflections; alpha is left as keyed.
    const spill = despill ? `,format=rgba,despill=type=${spillType(keyColor)}` : '';
    const key = `[0:v]${keyFilter(keyColor, similarity, blend)}${spill}[fg]`;
    const encode = [
      '-map', '[outv]',
      '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      // The output always runs exactly as long as the foreground clip.
      '-t', info.durationSeconds.toFixed(3),
      outPath
    ];

    if (options.backgroundPath) {
      if (!fs.existsSync(options.backgroundPath)) {
        throw new Error(`Background plate not found: ${options.backgroundPath}`);
      }
      const bg = options.backgroundPath;
      const isImage = IMAGE_EXTENSIONS.has(path.extname(bg).toLowerCase());
      // Fill the frame without distortion, match the foreground frame rate, and
      // keep the foreground (main timeline) driving the output length.
      const filter = [
        key,
        `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${fps},setsar=1[bg]`,
        '[bg][fg]overlay=0:0:eof_action=pass[outv]'
      ].join(';');
      runFfmpeg([
        '-i', videoPath,
        ...(isImage ? ['-loop', '1', '-framerate', String(fps)] : ['-stream_loop', '-1']),
        '-i', bg,
        '-filter_complex', filter,
        ...encode
      ]);
    } else {
      const bgColor = safeColor(options.backgroundColor ?? '0x1E293B');
      const filter = [
        key,
        `color=c=${bgColor}:s=${w}x${h}:r=${fps}:d=${info.durationSeconds.toFixed(3)}[bg]`,
        '[bg][fg]overlay=0:0:shortest=1[outv]'
      ].join(';');
      runFfmpeg(['-i', videoPath, '-filter_complex', filter, ...encode]);
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to composite chromakey video at: ${outPath}`);
    }

    return {
      foregroundVideo: videoPath,
      outputPath: outPath,
      keyColor,
      similarity,
      blend,
      despill
    };
  }
}
