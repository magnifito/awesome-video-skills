import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

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

    let origDuration = 5.0;
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`, {
        encoding: 'utf8'
      }).trim();
      origDuration = parseFloat(probeOut) || 5.0;
    } catch {
      // fallback
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-desilenced.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // silenceremove filter
    const filter = `silenceremove=start_periods=1:start_duration=0.08:start_threshold=${thresholdDb}dB:stop_periods=-1:stop_duration=${minSilence.toFixed(2)}:stop_threshold=${thresholdDb}dB`;

    const cmd = [
      'ffmpeg -y',
      `-i "${audioPath}"`,
      `-af "${filter}"`,
      '-ar 48000',
      '-c:a pcm_s16le',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate desilenced audio at: ${outPath}`);
    }

    let trimmedDuration = origDuration;
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outPath}"`, {
        encoding: 'utf8'
      }).trim();
      trimmedDuration = parseFloat(probeOut) || origDuration;
    } catch {
      // fallback
    }

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

