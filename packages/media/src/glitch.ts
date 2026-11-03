import { runFfmpeg } from './proc.js';
import path from 'node:path';
import fs from 'node:fs';

export interface GlitchOptions {
  intensity?: number; // 0.1 to 1.0, default 0.5
  chromaticShiftPixels?: number; // default 6
  noiseAmount?: number; // 1 to 50, default 15
  outputPath?: string;
}

export interface GlitchResult {
  sourceVideo: string;
  outputPath: string;
  intensity: number;
  chromaticShift: number;
  noiseAmount: number;
}

export class GlitchEngine {
  /**
   * Applies stylized chromatic aberration, analog noise, and digital glitch artifacts.
   */
  static applyGlitch(videoPath: string, options: GlitchOptions = {}): GlitchResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const intensity = options.intensity ?? 0.5;
    const shift = options.chromaticShiftPixels ?? Math.round(intensity * 12);
    const noise = options.noiseAmount ?? Math.round(intensity * 30);
    // rgbashift accepts -255..255 px; noise strength is 0..100.
    if (!Number.isInteger(shift) || shift < 0 || shift > 255) {
      throw new Error(`chromaticShiftPixels must be an integer in [0, 255], got ${shift}`);
    }
    if (!Number.isFinite(noise) || noise < 0 || noise > 100) {
      throw new Error(`noiseAmount must be in [0, 100], got ${noise}`);
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-glitch.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `rgbashift=rh=${shift}:bv=-${shift},noise=alls=${noise}:allf=t`;

    runFfmpeg([
      '-i',
      videoPath,
      '-vf',
      filter,
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
      throw new Error(`Failed to apply glitch effect at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      intensity,
      chromaticShift: shift,
      noiseAmount: noise
    };
  }
}

