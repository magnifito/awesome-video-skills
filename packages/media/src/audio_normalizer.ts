import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { measureAudioLoudness } from './inspector.js';
import { ffmpegStderr, probe } from './proc.js';

const execFileAsync = promisify(execFile);

export interface NormalizationOptions {
  targetLufs?: number; // default -16.0 for online/social, -23.0 for broadcast EBU R128
  truePeakDb?: number; // default -1.0 dBTP
  loudnessRange?: number; // default 11.0 LU
  sampleRate?: number; // output sample rate, default 48000 (loudnorm upsamples internally to 192 kHz)
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

    // Two-pass EBU R128 normalization: pass 1 measures, pass 2 applies linear gain
    // using the measured values (loudnorm "measured_*" options).
    const pass1 = ffmpegStderr([
      '-i', inputAudioPath,
      '-af', `loudnorm=I=${targetLufs.toFixed(1)}:TP=${truePeakDb.toFixed(1)}:LRA=${loudnessRange.toFixed(1)}:print_format=json`,
      '-f', 'null', '-'
    ]);
    const jsonMatch = pass1.match(/\{[^{}]*"input_i"[^{}]*\}/s);
    if (!jsonMatch) {
      throw new Error('Failed to normalize audio: loudnorm measurement pass returned no data');
    }
    const m = JSON.parse(jsonMatch[0]) as Record<string, string>;

    // Digital silence measures as -inf; the measured_* options reject non-finite values,
    // so fall back to single-pass loudnorm (which leaves silence silent).
    const measuredFinite = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']
      .every(k => Number.isFinite(Number(m[k])));
    const filterString = !measuredFinite
      ? `loudnorm=I=${targetLufs.toFixed(1)}:TP=${truePeakDb.toFixed(1)}:LRA=${loudnessRange.toFixed(1)}:print_format=none`
      : [
      `loudnorm=I=${targetLufs.toFixed(1)}`,
      `TP=${truePeakDb.toFixed(1)}`,
      `LRA=${loudnessRange.toFixed(1)}`,
      `measured_I=${m.input_i}`,
      `measured_TP=${m.input_tp}`,
      `measured_LRA=${m.input_lra}`,
      `measured_thresh=${m.input_thresh}`,
      `offset=${m.target_offset}`,
      'linear=true',
      'print_format=none'
    ].join(':');

    const hasVideo = probe(inputAudioPath).hasVideo;
    const args = [
      '-y',
      '-i', inputAudioPath,
      '-af', filterString,
      '-ar', String(options.sampleRate ?? 48000),
      // Keep any video stream untouched instead of re-encoding it.
      ...(hasVideo ? ['-c:v', 'copy'] : ['-vn']),
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

