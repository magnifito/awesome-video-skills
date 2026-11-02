import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface FrameRateOptions {
  targetFps?: number;
  outputPath?: string;
}

export interface FrameRateResult {
  sourceVideo: string;
  outputPath: string;
  originalFps: number;
  targetFps: number;
  durationSeconds: number;
}

export class FrameRateConverter {
  /**
   * Transcodes video to target broadcast or social framerate (24, 25, 30, 60 fps).
   */
  static convertFps(videoPath: string, options: FrameRateOptions = {}): FrameRateResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const targetFps = options.targetFps ?? 30;

    let origFps = 30;
    let duration = 5.0;
    try {
      const probeFps = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      const [num, den] = probeFps.split('/').map(Number);
      if (num && den) origFps = Math.round(num / den);

      const probeDur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      duration = parseFloat(probeDur) || 5.0;
    } catch {
      // fallback
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-${targetFps}fps.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-filter_complex "[0:v]fps=fps=${targetFps}[outv]"`,
      '-map "[outv]"',
      '-map "0:a?"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to convert framerate at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      originalFps: origFps,
      targetFps,
      durationSeconds: duration
    };
  }
}

