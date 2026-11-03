import { runFfmpeg, probe, requirePositive } from './proc.js';
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

    requirePositive(width, 'width');
    requirePositive(height, 'height');
    requirePositive(fps, 'fps');

    const inputArgs: string[] = [];
    const filterClauses: string[] = [];
    const concatStreams: string[] = [];

    clipPaths.forEach((clip, idx) => {
      const info = probe(clip);
      if (!info.hasVideo) throw new Error(`Clip has no video stream: ${clip}`);
      inputArgs.push('-i', clip);
      // Normalize dimensions, fps and timebase
      filterClauses.push(
        `[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setsar=1,format=yuv420p[v${idx}]`
      );
      if (info.hasAudio) {
        filterClauses.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${idx}]`);
      } else {
        // Clips without audio (screen recordings, generated clips) get matching silence.
        filterClauses.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${info.durationSeconds.toFixed(3)}[a${idx}]`);
      }
      concatStreams.push(`[v${idx}][a${idx}]`);
    });

    const filtergraph = `${filterClauses.join(';')};${concatStreams.join('')}concat=n=${clipPaths.length}:v=1:a=1[outv][outa]`;

    runFfmpeg([
      ...inputArgs,
      '-filter_complex', filtergraph,
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      outPath
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate concatenated video at: ${outPath}`);
    }

    const totalDuration = probe(outPath).durationSeconds;

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

    if (!(start >= 0) || !Number.isFinite(start)) throw new Error(`startSeconds must be >= 0, got ${start}`);
    requirePositive(duration, 'durationSeconds');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    runFfmpeg([
      '-ss', start.toFixed(3),
      '-i', videoPath,
      '-t', duration.toFixed(3),
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      outPath
    ]);
    return outPath;
  }
}

