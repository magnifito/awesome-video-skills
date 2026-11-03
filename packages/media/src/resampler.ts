import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe, requirePositive } from './proc.js';

export interface ResampleOptions {
  sampleRate?: number;
  outputPath?: string;
}

export interface ResampleResult {
  sourceAudio: string;
  outputPath: string;
  originalSampleRate: number;
  targetSampleRate: number;
  durationSeconds: number;
}

export class AudioResampler {
  /**
   * Resamples audio to standard broadcast sample rate (48000 Hz) or specified rate.
   */
  static resample(audioPath: string, options: ResampleOptions = {}): ResampleResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const targetRate = Math.round(requirePositive(options.sampleRate ?? 48000, 'sampleRate'));

    const info = probe(audioPath);
    if (!info.hasAudio) throw new Error(`No audio stream in ${audioPath}`);
    const origRate = info.sampleRate;
    const duration = info.durationSeconds;

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-resampled-${targetRate}hz.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    runFfmpeg(['-i', audioPath, '-vn', '-af', `aresample=${targetRate}`, '-c:a', 'pcm_s16le', outPath]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to resample audio at: ${outPath}`);
    }

    return {
      sourceAudio: audioPath,
      outputPath: outPath,
      originalSampleRate: origRate,
      targetSampleRate: targetRate,
      durationSeconds: duration
    };
  }
}

