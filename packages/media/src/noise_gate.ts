import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface NoiseGateOptions {
  thresholdDb?: number; // default -40 dB
  ratio?: number; // default 4.0
  attackMs?: number; // default 20 ms
  releaseMs?: number; // default 250 ms
  outputPath?: string;
}

export interface NoiseGateResult {
  sourceAudio: string;
  outputPath: string;
  thresholdDb: number;
  ratio: number;
  filterApplied: string;
}

export class NoiseGateEngine {
  /**
   * Cleans background hum and ambient noise floor during pauses in dialogue via agate filter.
   */
  static applyGate(audioPath: string, options: NoiseGateOptions = {}): NoiseGateResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const thresholdDb = options.thresholdDb ?? -40;
    const ratio = options.ratio ?? 4.0;
    const attack = options.attackMs ?? 20;
    const release = options.releaseMs ?? 250;

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-noisegated.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const gateFilter = `agate=threshold=${thresholdDb}dB:ratio=${ratio.toFixed(1)}:attack=${attack}:release=${release}`;

    const cmd = [
      'ffmpeg -y',
      `-i "${audioPath}"`,
      `-af "${gateFilter}"`,
      '-ar 48000',
      '-c:a pcm_s16le',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate noise-gated audio at: ${outPath}`);
    }

    return {
      sourceAudio: audioPath,
      outputPath: outPath,
      thresholdDb,
      ratio,
      filterApplied: gateFilter
    };
  }
}

