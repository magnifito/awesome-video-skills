import { runFfmpeg, probe, requirePositive } from './proc.js';
import path from 'node:path';
import fs from 'node:fs';

export interface FreezeOptions {
  position?: 'end' | 'start';
  holdDurationSeconds?: number;
  outputPath?: string;
}

export interface FreezeResult {
  sourceVideo: string;
  outputPath: string;
  position: 'end' | 'start';
  originalDurationSeconds: number;
  holdDurationSeconds: number;
  totalDurationSeconds: number;
}

export class FreezeFrameEngine {
  /**
   * Holds the start or final frame of a video using FFmpeg's native tpad filter.
   */
  static applyHoldFrame(videoPath: string, options: FreezeOptions = {}): FreezeResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const position = options.position ?? 'end';
    const holdSec = options.holdDurationSeconds ?? 2.0;

    requirePositive(holdSec, 'holdDurationSeconds');
    if (position !== 'end' && position !== 'start') {
      throw new Error(`position must be "start" or "end", got ${JSON.stringify(position)}`);
    }
    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    const origDuration = info.durationSeconds;

    const totalDuration = origDuration + holdSec;
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-freeze-${position}-${holdSec}s.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Video filter: tpad clone
    let videoFilter = `tpad=stop_mode=clone:stop_duration=${holdSec.toFixed(2)}`;
    let audioFilter = `apad=pad_dur=${holdSec.toFixed(2)}`;

    if (position === 'start') {
      videoFilter = `tpad=start_mode=clone:start_duration=${holdSec.toFixed(2)}`;
      // all=1 delays every channel (a "X|X" list only covers the first two, desyncing 5.1).
      audioFilter = `adelay=delays=${Math.round(holdSec * 1000)}:all=1`;
    }

    // Clips without audio get a silent track covering the full output duration.
    const audioGraph = info.hasAudio
      ? `[0:a]${audioFilter}[outa]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${totalDuration.toFixed(3)}[outa]`;

    runFfmpeg([
      '-i',
      videoPath,
      '-filter_complex',
      `[0:v]${videoFilter}[outv];${audioGraph}`,
      '-map',
      '[outv]',
      '-map',
      '[outa]',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outPath
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate freeze frame video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      position,
      originalDurationSeconds: origDuration,
      holdDurationSeconds: holdSec,
      totalDurationSeconds: totalDuration
    };
  }
}

