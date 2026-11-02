import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface ReverseOptions {
  outputPath?: string;
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

    let hasAudio = false;
    let duration = 5.0;
    try {
      const probeAudio = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      hasAudio = probeAudio.length > 0;

      const probeDur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      duration = parseFloat(probeDur) || 5.0;
    } catch {
      // fallback
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-reversed.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    let cmd = '';
    if (hasAudio) {
      cmd = [
        'ffmpeg -y',
        `-i "${videoPath}"`,
        '-filter_complex "[0:v]reverse[outv];[0:a]areverse[outa]"',
        '-map "[outv]"',
        '-map "[outa]"',
        '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
        '-c:a aac -b:a 192k',
        `"${outPath}"`
      ].join(' ');
    } else {
      cmd = [
        'ffmpeg -y',
        `-i "${videoPath}"`,
        '-vf "reverse"',
        '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
        `"${outPath}"`
      ].join(' ');
    }

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate reversed video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      durationSeconds: duration,
      reversedAudio: hasAudio
    };
  }
}

