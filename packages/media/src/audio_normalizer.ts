import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { measureAudioLoudness } from './inspector.js';

const execFileAsync = promisify(execFile);

export interface NormalizationOptions {
  targetLufs?: number; // default -16.0 for online/social, -23.0 for broadcast EBU R128
  truePeakDb?: number; // default -1.0 dBTP
  loudnessRange?: number; // default 11.0 LU
}

export interface NormalizationResult {
  outputPath: string;
  measuredBefore: { lufs: number; true_peak_db: number };
  measuredAfter: { lufs: number; true_peak_db: number };
  appliedTargetLufs: number;
  appliedTruePeakDb: number;
}

export class AudioNormalizer {
  /**
   * Normalizes audio track to ITU-R BS.1770-4 / EBU R128 loudness standards.
   */
  static async normalize(
    inputAudioPath: string,
    outputPath: string,
    options: NormalizationOptions = {}
  ): Promise<NormalizationResult> {
    const targetLufs = options.targetLufs ?? -16.0;
    const truePeakDb = options.truePeakDb ?? -1.0;
    const loudnessRange = options.loudnessRange ?? 11.0;

    const measuredBefore = await measureAudioLoudness(inputAudioPath);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Single-pass loudnorm filter with standard broadcast/streaming targets
    const filterString = `loudnorm=I=${targetLufs.toFixed(1)}:TP=${truePeakDb.toFixed(1)}:LRA=${loudnessRange.toFixed(1)}:print_format=none`;

    const args = [
      '-y',
      '-i', inputAudioPath,
      '-af', filterString,
      '-c:a', 'aac',
      '-b:a', '192k',
      outputPath
    ];

    try {
      await execFileAsync('ffmpeg', args);
    } catch (error) {
      throw new Error(`Failed to normalize audio: ${(error as Error).message}`);
    }

    const measuredAfter = await measureAudioLoudness(outputPath);

    return {
      outputPath,
      measuredBefore,
      measuredAfter,
      appliedTargetLufs: targetLufs,
      appliedTruePeakDb: truePeakDb
    };
  }
}

