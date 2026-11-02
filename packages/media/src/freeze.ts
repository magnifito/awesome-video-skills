import { execSync } from 'node:child_process';
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

    let origDuration = 5.0;
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      origDuration = parseFloat(probeOut) || 5.0;
    } catch {
      // fallback
    }

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
      audioFilter = `adelay=${Math.round(holdSec * 1000)}|${Math.round(holdSec * 1000)}`;
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-filter_complex "[0:v]${videoFilter}[outv];[0:a]${audioFilter}[outa]"`,
      '-map "[outv]"',
      '-map "[outa]"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a aac -b:a 192k',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

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

