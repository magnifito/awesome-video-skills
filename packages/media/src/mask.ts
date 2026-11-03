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
}

export interface MaskOptions {
  outputPath?: string;
}

export interface MaskResult {
  sourceVideo: string;
  outputPath: string;
  box: MaskBox;
  mode: 'blur' | 'solid';
}

export class MaskEngine {
  /**
   * Redacts sensitive on-screen client credentials, API keys, or PII using blur or solid matte.
   */
  static applyRedaction(videoPath: string, box: MaskBox, options: MaskOptions = {}): MaskResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const mode = box.mode ?? 'blur';
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
    // Clamp the box to the frame so crop/drawbox never reference pixels outside it.
    const x = Math.max(0, Math.floor(box.x));
    const y = Math.max(0, Math.floor(box.y));
    const bw = Math.min(Math.floor(box.width), info.width - x);
    const bh = Math.min(Math.floor(box.height), info.height - y);
    if (!(bw > 0 && bh > 0)) {
      throw new Error(`Redaction box ${JSON.stringify(box)} does not overlap the ${info.width}x${info.height} frame`);
    }

    let filterComplex: string;
    if (mode === 'blur') {
      // Pixelate (downscale to at most 8x8 blocks, then nearest-neighbour upscale) and blur on top.
      // Pixelation destroys detail irreversibly for any box size, unlike a blur whose radius
      // is limited by the plane size (boxblur requires radius < half the smallest plane).
      const blocksW = Math.max(1, Math.min(8, Math.floor(bw / 4)));
      const blocksH = Math.max(1, Math.min(8, Math.floor(bh / 4)));
      const chromaLimit = Math.floor(Math.min(bw, bh) / 4) - 1;
      const blur = chromaLimit >= 1
        ? `,boxblur=luma_radius=${Math.min(15, chromaLimit)}:luma_power=2:chroma_radius=${Math.min(15, chromaLimit)}:chroma_power=2`
        : '';
      filterComplex = `[0:v]split=2[base][cropin];[cropin]crop=${bw}:${bh}:${x}:${y},scale=${blocksW}:${blocksH}:flags=area,scale=${bw}:${bh}:flags=neighbor${blur}[blurred];[base][blurred]overlay=${x}:${y}[outv]`;
    } else {
      // Fully opaque by default: any transparency would leave the redacted pixels recoverable.
      const color = safeColor(box.color ?? 'black');
      filterComplex = `[0:v]drawbox=x=${x}:y=${y}:w=${bw}:h=${bh}:color=${color}:t=fill[outv]`;
    }

    runFfmpeg([
      '-i',
      videoPath,
      '-filter_complex',
      filterComplex,
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
      box,
      mode
    };
  }
}

