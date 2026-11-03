import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe } from './proc.js';

export interface SpeedOptions {
  outputPath?: string;
}

export interface SpeedResult {
  sourceVideo: string;
  outputPath: string;
  speedFactor: number;
  originalDurationSeconds: number;
  newDurationSeconds: number;
}

/**
 * Builds an atempo chain for any positive factor. A single atempo instance accepts [0.5, 100],
 * so factors below 0.5 are decomposed into repeated 0.5 stages plus a remainder in [0.5, 1).
 */
export function buildAtempoChain(factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) throw new Error(`Invalid tempo factor: ${factor}`);
  const stages: number[] = [];
  let remaining = factor;
  while (remaining < 0.5) {
    stages.push(0.5);
    remaining /= 0.5;
  }
  while (remaining > 100) {
    stages.push(100);
    remaining /= 100;
  }
  stages.push(remaining);
  return stages.map(s => `atempo=${s.toFixed(6)}`).join(',');
}

export class VideoSpeedEngine {
  /**
   * Adjusts playback speed of video while preserving pitch and audio synchrony.
   * Inputs without audio are supported (video-only output).
   */
  static changeSpeed(videoPath: string, speedFactor: number, options: SpeedOptions = {}): SpeedResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    if (!Number.isFinite(speedFactor) || speedFactor < 0.05 || speedFactor > 8.0) {
      throw new Error(`Speed factor must be between 0.05 and 8.0 (received ${speedFactor})`);
    }

    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    const origDuration = info.durationSeconds;
    const newDuration = origDuration / speedFactor;

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-speed-${speedFactor}x.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Use the exact reciprocal so video and audio durations stay in sync.
    const videoFilter = `setpts=PTS/${speedFactor}`;
    const videoArgs = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p'];

    if (info.hasAudio) {
      runFfmpeg([
        '-i', videoPath,
        '-filter_complex', `[0:v]${videoFilter}[v];[0:a]${buildAtempoChain(speedFactor)}[a]`,
        '-map', '[v]', '-map', '[a]',
        ...videoArgs,
        '-c:a', 'aac', '-b:a', '192k',
        outPath,
      ]);
    } else {
      runFfmpeg(['-i', videoPath, '-vf', videoFilter, '-an', ...videoArgs, outPath]);
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate speed-adjusted video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      speedFactor,
      originalDurationSeconds: origDuration,
      newDurationSeconds: newDuration
    };
  }
}
