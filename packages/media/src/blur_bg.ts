import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

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
   * Adapts vertical 9:16 footage for landscape 16:9 screens with an aesthetic blurred backdrop.
   */
  static adaptToLandscape(videoPath: string, options: BlurBgOptions = {}): BlurBgResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const tw = options.targetWidth ?? 1920;
    const th = options.targetHeight ?? 1080;
    const blurRadius = options.blurRadius ?? 25;

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-blur-bg-16x9.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Filter: Split video, scale background to fill and blur, scale foreground to fit height, overlay centered
    const filter = `[0:v]split=2[fg][bg];[bg]scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},boxblur=luma_radius=${blurRadius}:luma_power=3[blurred_bg];[fg]scale=-1:${th}[scaled_fg];[blurred_bg][scaled_fg]overlay=(W-w)/2:0[outv]`;

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-filter_complex "${filter}"`,
      '-map "[outv]"',
      '-map "0:a?"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate blurred background video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      width: tw,
      height: th
    };
  }
}

