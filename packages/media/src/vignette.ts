import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface VignetteOptions {
  angleRadians?: number; // default 0.5 (subtle edge shading)
  outputPath?: string;
}

export interface VignetteResult {
  sourceVideo: string;
  outputPath: string;
  angleRadians: number;
}

export class VignetteEngine {
  /**
   * Applies subtle cinematic lens edge darkening using FFmpeg's vignette filter.
   */
  static applyVignette(videoPath: string, options: VignetteOptions = {}): VignetteResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const angle = options.angleRadians ?? 0.5;

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-vignette.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `vignette=angle=${angle.toFixed(2)}`;

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-vf "${filter}"`,
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate vignette video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      angleRadians: angle
    };
  }
}

