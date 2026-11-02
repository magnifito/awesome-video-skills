import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface LoopOptions {
  loops?: number; // default 1 ping-pong cycle
  outputPath?: string;
}

export interface LoopResult {
  sourceVideo: string;
  outputPath: string;
  loopMode: 'ping-pong';
  originalDurationSeconds: number;
  loopDurationSeconds: number;
}

export class VideoLoopEngine {
  /**
   * Creates a seamless ping-pong loop (forward + reverse) ideal for social reels and hero web backgrounds.
   */
  static createPingPongLoop(videoPath: string, options: LoopOptions = {}): LoopResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    let origDuration = 3.0;
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      origDuration = parseFloat(probeOut) || 3.0;
    } catch {
      // fallback
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-loop-pingpong.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Split stream: forward and reverse, then concatenate
    const filter = `[0:v]split=2[fwd][rev_in];[rev_in]reverse[rev];[fwd][rev]concat=n=2:v=1:a=0[outv]`;

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-filter_complex "${filter}"`,
      '-map "[outv]"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate ping-pong loop at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      loopMode: 'ping-pong',
      originalDurationSeconds: origDuration,
      loopDurationSeconds: origDuration * 2
    };
  }
}

