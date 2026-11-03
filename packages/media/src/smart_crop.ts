import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe } from './proc.js';

export type FocalPoint = 'center' | 'top' | 'bottom' | 'left' | 'right';

export interface SmartCropOptions {
  targetAspectRatio?: '9:16' | '1:1' | '4:5' | '16:9';
  focus?: FocalPoint;
  outputPath?: string;
}

export interface SmartCropResult {
  sourceVideo: string;
  outputPath: string;
  targetAspectRatio: string;
  focus: FocalPoint;
  outputWidth: number;
  outputHeight: number;
}

const TARGETS: Record<NonNullable<SmartCropOptions['targetAspectRatio']>, { w: number; h: number; num: number; den: number }> = {
  '9:16': { w: 1080, h: 1920, num: 9, den: 16 },
  '1:1': { w: 1080, h: 1080, num: 1, den: 1 },
  '4:5': { w: 1080, h: 1350, num: 4, den: 5 },
  '16:9': { w: 1920, h: 1080, num: 16, den: 9 },
};

export class SmartCropEngine {
  /**
   * Reframes video into a target aspect ratio with a fixed focal-point bias (center, or 15%/85%
   * offsets toward an edge). This is not content-aware: no subject detection is performed.
   * Crop geometry is computed on the displayed (rotation-corrected) frame, which is what ffmpeg
   * feeds the filter graph after autorotation.
   */
  static crop(videoPath: string, options: SmartCropOptions = {}): SmartCropResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const targetRatio = options.targetAspectRatio ?? '9:16';
    const focus = options.focus ?? 'center';
    const target = TARGETS[targetRatio];
    if (!target) throw new Error(`Unsupported target aspect ratio: ${String(targetRatio)}`);
    if (!['center', 'top', 'bottom', 'left', 'right'].includes(focus)) {
      throw new Error(`Unsupported focal point: ${String(focus)}`);
    }

    const info = probe(videoPath);
    if (!info.hasVideo || info.displayWidth <= 0 || info.displayHeight <= 0) {
      throw new Error(`No usable video stream in ${videoPath}`);
    }
    const origW = info.displayWidth;
    const origH = info.displayHeight;

    const targetAspect = target.num / target.den;
    let cropW: number;
    let cropH: number;
    if (origW / origH > targetAspect) {
      // Input is wider than the target: crop width.
      cropH = origH;
      cropW = Math.round(origH * targetAspect);
    } else {
      // Input is taller than the target: crop height.
      cropW = origW;
      cropH = Math.round(origW / targetAspect);
    }

    // Even dimensions, never larger than the source.
    cropW = Math.min(origW, cropW) - (Math.min(origW, cropW) % 2);
    cropH = Math.min(origH, cropH) - (Math.min(origH, cropH) % 2);

    let x = Math.round((origW - cropW) / 2);
    let y = Math.round((origH - cropH) / 2);
    if (focus === 'left') x = Math.round((origW - cropW) * 0.15);
    if (focus === 'right') x = Math.round((origW - cropW) * 0.85);
    if (focus === 'top') y = Math.round((origH - cropH) * 0.1);
    if (focus === 'bottom') y = Math.round((origH - cropH) * 0.9);

    x = Math.max(0, Math.min(x, origW - cropW));
    y = Math.max(0, Math.min(y, origH - cropH));

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-smartcrop-${targetRatio.replace(':', '_')}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `crop=${cropW}:${cropH}:${x}:${y},scale=${target.w}:${target.h},setsar=1`;

    runFfmpeg([
      '-i', videoPath,
      '-vf', filter,
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      outPath,
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to smart-crop video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      targetAspectRatio: targetRatio,
      focus,
      outputWidth: target.w,
      outputHeight: target.h
    };
  }
}
