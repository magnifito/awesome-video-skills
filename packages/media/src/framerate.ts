import { runFfmpeg, probe, requirePositive } from './proc.js';
import path from 'node:path';
import fs from 'node:fs';

export interface FrameRateOptions {
  targetFps?: number;
  outputPath?: string;
}

export interface FrameRateResult {
  sourceVideo: string;
  outputPath: string;
  originalFps: number;
  targetFps: number;
  durationSeconds: number;
}

export class FrameRateConverter {
  /**
   * Transcodes video to target broadcast or social framerate (24, 25, 30, 60 fps).
   */
  static convertFps(videoPath: string, options: FrameRateOptions = {}): FrameRateResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const targetFps = options.targetFps ?? 30;

    requirePositive(targetFps, 'targetFps');
    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    // Keep fractional rates such as 29.97 instead of rounding them.
    const origFps = Math.round(info.fps * 1000) / 1000;
    const duration = info.durationSeconds;

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-${targetFps}fps.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    runFfmpeg([
      '-i',
      videoPath,
      '-filter_complex',
      `[0:v]fps=fps=${targetFps}[outv]`,
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
      throw new Error(`Failed to convert framerate at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      originalFps: origFps,
      targetFps,
      durationSeconds: duration
    };
  }
}

