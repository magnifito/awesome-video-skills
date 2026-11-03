import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe } from './proc.js';

export interface SilenceRemoveOptions {
  thresholdDb?: number;
  minSilenceDurationSeconds?: number;
  outputPath?: string;
}

export interface SilenceRemoveResult {
  sourceAudio: string;
  outputPath: string;
  originalDurationSeconds: number;
  trimmedDurationSeconds: number;
  timeSavedSeconds: number;
}

export class AudioSilenceRemover {
  /**
   * Trims dead air and pauses from dialogue voiceover using FFmpeg's silenceremove filter.
   */
  static removeSilence(audioPath: string, options: SilenceRemoveOptions = {}): SilenceRemoveResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const thresholdDb = options.thresholdDb ?? -38;
    const minSilence = options.minSilenceDurationSeconds ?? 0.4;
    if (!Number.isFinite(thresholdDb) || thresholdDb > 0) throw new Error(`thresholdDb must be <= 0, got ${thresholdDb}`);
    if (!Number.isFinite(minSilence) || minSilence <= 0) throw new Error(`minSilenceDurationSeconds must be > 0, got ${minSilence}`);

    const before = probe(audioPath);
    if (!before.hasAudio) throw new Error(`No audio stream in ${audioPath}`);
    const origDuration = before.durationSeconds;

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-desilenced.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `silenceremove=start_periods=1:start_duration=0.08:start_threshold=${thresholdDb}dB:stop_periods=-1:stop_duration=${minSilence.toFixed(2)}:stop_threshold=${thresholdDb}dB`;

    runFfmpeg(['-i', audioPath, '-vn', '-af', filter, '-ar', '48000', '-c:a', 'pcm_s16le', outPath]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate desilenced audio at: ${outPath}`);
    }

    const trimmedDuration = probe(outPath).durationSeconds;
    const timeSaved = Math.max(0, origDuration - trimmedDuration);

    return {
      sourceAudio: audioPath,
      outputPath: outPath,
      originalDurationSeconds: origDuration,
      trimmedDurationSeconds: trimmedDuration,
      timeSavedSeconds: parseFloat(timeSaved.toFixed(2))
    };
  }
}
