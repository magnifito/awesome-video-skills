import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, requirePositive } from './proc.js';

export interface BlurBgOptions {
  targetWidth?: number;
  targetHeight?: number;
  blurRadius?: number;
  outputPath?: string;
}

export interface BlurBgResult {
  sourceVideo: string;
  outputPath: string;
  width: number;
  height: number;
}

export class BlurBackgroundEngine {
  /**
   * Adapts vertical 9:16 footage to landscape 16:9 screens with an aesthetic blurred backdrop.
   */
  static adaptToLandscape(videoPath: string, options: BlurBgOptions = {}): BlurBgResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    // libx264 with yuv420p requires even dimensions.
    const tw = Math.round(requirePositive(options.targetWidth ?? 1920, 'targetWidth') / 2) * 2;
    const th = Math.round(requirePositive(options.targetHeight ?? 1080, 'targetHeight') / 2) * 2;
    // boxblur radius must be smaller than half the smallest plane (chroma planes are half size).
    const maxRadius = Math.max(1, Math.floor(Math.min(tw, th) / 4) - 1);
    const blurRadius = Math.min(maxRadius, Math.max(1, Math.round(options.blurRadius ?? 25)));

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-blur-bg-16x9.mp4`
    );

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // Background: fill and blur. Foreground: fit inside the frame (both axes), centered.
    const filter = [
      '[0:v]split=2[fg][bg]',
      `[bg]scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},boxblur=luma_radius=${blurRadius}:luma_power=3[blurred_bg]`,
      `[fg]scale=${tw}:${th}:force_original_aspect_ratio=decrease:force_divisible_by=2[scaled_fg]`,
      '[blurred_bg][scaled_fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[outv]'
    ].join(';');

    runFfmpeg([
      '-i', videoPath,
      '-filter_complex', filter,
      '-map', '[outv]',
      '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      outPath
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to render blurred background video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      width: tw,
      height: th
    };
  }
}
