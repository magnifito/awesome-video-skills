import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

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

export class VideoSpeedEngine {
  /**
   * Adjusts the playback speed of a video while preserving pitch and audio synchrony.
   */
  static changeSpeed(videoPath: string, speedFactor: number, options: SpeedOptions = {}): SpeedResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (speedFactor <= 0 || speedFactor > 8.0) {
      throw new Error(`Speed factor must be between 0.1 and 8.0 (received ${speedFactor})`);
    }

    let origDuration = 10.0;
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      origDuration = parseFloat(probeOut) || 10.0;
    } catch {
      // fallback
    }

    const newDuration = origDuration / speedFactor;
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-speed-${speedFactor}x.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Video PTS multiplier
    const ptsMultiplier = (1 / speedFactor).toFixed(4);
    const videoFilter = `setpts=${ptsMultiplier}*PTS`;

    // atempo audio filter supports 0.5 to 2.0 per instance. Chain if needed:
    let audioFilter = `atempo=${speedFactor.toFixed(2)}`;
    if (speedFactor > 2.0) {
      const f1 = 2.0;
      const f2 = (speedFactor / 2.0).toFixed(2);
      audioFilter = `atempo=${f1},atempo=${f2}`;
    } else if (speedFactor < 0.5) {
      audioFilter = `atempo=0.5,atempo=${(speedFactor / 0.5).toFixed(2)}`;
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-filter_complex "[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]"`,
      '-map "[v]"',
      '-map "[a]"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a aac -b:a 192k',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

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

