import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg } from './proc.js';

export interface PannerOptions {
  pan?: number; // -1.0 (full left) to +1.0 (full right), 0 = center
  stereoWidth?: number; // 0.0 (mono) to 2.0 (super-wide), 1.0 = normal
  outputPath?: string;
}

export interface PannerResult {
  sourceAudio: string;
  outputPath: string;
  pan: number;
  stereoWidth: number;
}

export class AudioPanner {
  /**
   * Adjusts stereo pan position and stereo field width for spatial audio mixing.
   */
  static pan(audioPath: string, options: PannerOptions = {}): PannerResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    if (options.pan !== undefined && !Number.isFinite(options.pan)) throw new Error('pan must be a finite number');
    if (options.stereoWidth !== undefined && !Number.isFinite(options.stereoWidth)) throw new Error('stereoWidth must be a finite number');
    const panVal = options.pan !== undefined ? Math.max(-1.0, Math.min(1.0, options.pan)) : 0.0;
    const widthVal = options.stereoWidth !== undefined ? Math.max(0.0, Math.min(3.0, options.stereoWidth)) : 1.0;

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-panned.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filters: string[] = [];
    if (panVal !== 0.0) {
      filters.push(`stereotools=mpan=${panVal.toFixed(2)}`);
    }
    if (widthVal !== 1.0) {
      filters.push(`extrastereo=m=${widthVal.toFixed(2)}`);
    }

    const filterArg = filters.length > 0 ? filters.join(',') : 'anull';

    runFfmpeg(['-i', audioPath, '-af', filterArg, '-ar', '48000', '-c:a', 'pcm_s16le', outPath]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate panned audio at: ${outPath}`);
    }

    return {
      sourceAudio: audioPath,
      outputPath: outPath,
      pan: panVal,
      stereoWidth: widthVal
    };
  }
}

