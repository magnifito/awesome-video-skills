import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe } from './proc.js';

export interface ReverseOptions {
  outputPath?: string;
  /**
   * The reverse/areverse filters buffer the entire stream in memory. Inputs longer than this
   * are rejected to avoid running out of memory. Default 60 seconds.
   */
  maxDurationSeconds?: number;
}

export interface ReverseResult {
  sourceVideo: string;
  outputPath: string;
  durationSeconds: number;
  reversedAudio: boolean;
}

export class VideoReverseEngine {
  /**
   * Reverses video and audio playback for rewind transitions and boomerang effects.
   */
  static reverse(videoPath: string, options: ReverseOptions = {}): ReverseResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    const maxDuration = options.maxDurationSeconds ?? 60;
    if (info.durationSeconds > maxDuration) {
      throw new Error(
        `Clip is ${info.durationSeconds.toFixed(1)}s; reversing buffers the whole clip in memory, so the limit is ${maxDuration}s. Trim it first or raise maxDurationSeconds.`
      );
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-reversed.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const videoArgs = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p'];
    if (info.hasAudio) {
      runFfmpeg([
        '-i', videoPath,
        '-filter_complex', '[0:v]reverse[outv];[0:a]areverse[outa]',
        '-map', '[outv]', '-map', '[outa]',
        ...videoArgs,
        '-c:a', 'aac', '-b:a', '192k',
        outPath,
      ]);
    } else {
      runFfmpeg(['-i', videoPath, '-vf', 'reverse', '-an', ...videoArgs, outPath]);
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate reversed video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      durationSeconds: info.durationSeconds,
      reversedAudio: info.hasAudio
    };
  }
}
