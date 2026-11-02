import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface ConcatOptions {
  width?: number;
  height?: number;
  fps?: number;
  outputPath?: string;
}

export interface TrimOptions {
  startSeconds?: number;
  durationSeconds?: number;
  outputPath?: string;
}

export interface ConcatResult {
  outputPath: string;
  clipsCount: number;
  totalDurationSeconds: number;
  width: number;
  height: number;
}

export class VideoConcatEngine {
  /**
   * Concatenates multiple video clips, normalizing resolution, framerate, and audio sample rate.
   */
  static concatClips(clipPaths: string[], options: ConcatOptions = {}): ConcatResult {
    if (!clipPaths || clipPaths.length < 2) {
      throw new Error('At least two video clips are required for concatenation');
    }

    for (const c of clipPaths) {
      if (!fs.existsSync(c)) {
        throw new Error(`Video clip not found: ${c}`);
      }
    }

    const width = options.width ?? 1920;
    const height = options.height ?? 1080;
    const fps = options.fps ?? 30;

    const outPath = options.outputPath ?? path.join(
      path.dirname(clipPaths[0]),
      `concat-${Date.now()}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const inputArgs: string[] = [];
    const filterClauses: string[] = [];
    const concatStreams: string[] = [];

    clipPaths.forEach((clip, idx) => {
      inputArgs.push(`-i "${clip}"`);
      // Normalize dimensions and fps
      filterClauses.push(
        `[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setsar=1[v${idx}]`
      );
      filterClauses.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${idx}]`);
      concatStreams.push(`[v${idx}][a${idx}]`);
    });

    const filtergraph = `${filterClauses.join(';')};${concatStreams.join('')}concat=n=${clipPaths.length}:v=1:a=1[outv][outa]`;

    const cmd = [
      'ffmpeg -y',
      inputArgs.join(' '),
      `-filter_complex "${filtergraph}"`,
      '-map "[outv]"',
      '-map "[outa]"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a aac -b:a 192k',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate concatenated video at: ${outPath}`);
    }

    let totalDuration = 0;
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outPath}"`, {
        encoding: 'utf8'
      }).trim();
      totalDuration = parseFloat(probeOut) || 0;
    } catch {
      // fallback
    }

    return {
      outputPath: outPath,
      clipsCount: clipPaths.length,
      totalDurationSeconds: totalDuration,
      width,
      height
    };
  }

  /**
   * Trims a portion of a video file with frame accuracy.
   */
  static trimClip(videoPath: string, options: TrimOptions = {}): string {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const start = options.startSeconds ?? 0;
    const duration = options.durationSeconds ?? 5;
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-trimmed-${start}s-${duration}s.mp4`
    );

    const cmd = [
      'ffmpeg -y',
      `-ss ${start.toFixed(3)}`,
      `-i "${videoPath}"`,
      `-t ${duration.toFixed(3)}`,
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a aac -b:a 192k',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });
    return outPath;
  }
}

