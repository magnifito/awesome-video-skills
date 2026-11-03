import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe } from './proc.js';
import { probeImage } from './visual_diff.js';

export interface ThumbnailOptions {
  timeOffsetSeconds?: number;
  format?: 'png' | 'jpg' | 'jpeg';
  width?: number;
  height?: number;
  outputPath?: string;
}

export interface ThumbnailResult {
  outputPath: string;
  format: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  timeOffsetSeconds: number;
}

export class ThumbnailGenerator {
  /**
   * Extracts a still thumbnail from a video file at a time offset.
   */
  static extractThumbnail(videoPath: string, options: ThumbnailOptions = {}): ThumbnailResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found at: ${videoPath}`);
    }

    const timeOffset = options.timeOffsetSeconds ?? 1.0;
    if (!Number.isFinite(timeOffset) || timeOffset < 0) {
      throw new Error(`timeOffsetSeconds must be >= 0, got ${timeOffset}`);
    }
    for (const [k, v] of [['width', options.width], ['height', options.height]] as const) {
      if (v !== undefined && (!Number.isInteger(v) || v <= 0)) throw new Error(`${k} must be a positive integer, got ${v}`);
    }
    const format = options.format ?? 'png';
    if (!['png', 'jpg', 'jpeg'].includes(format)) throw new Error(`Unsupported thumbnail format: ${String(format)}`);
    const isJpeg = format === 'jpg' || format === 'jpeg';
    const ext = isJpeg ? 'jpg' : 'png';

    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    if (timeOffset >= info.durationSeconds) {
      throw new Error(`timeOffsetSeconds ${timeOffset} is beyond the video duration ${info.durationSeconds.toFixed(3)}s`);
    }

    // Include the source basename so thumbnails of different videos in one folder do not collide.
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-thumbnail-${timeOffset}s.${ext}`
    );

    let vf: string | null = null;
    if (options.width && options.height) {
      vf = `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2:color=black`;
    } else if (options.width) {
      vf = `scale=${options.width}:-1`;
    } else if (options.height) {
      vf = `scale=-1:${options.height}`;
    }

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Fast seek before input, then grab one frame.
    runFfmpeg([
      '-ss', timeOffset.toFixed(3),
      '-i', videoPath,
      ...(vf ? ['-vf', vf] : []),
      '-frames:v', '1',
      ...(isJpeg ? ['-c:v', 'mjpeg', '-q:v', '2'] : ['-c:v', 'png']),
      '-update', '1',
      outPath,
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate thumbnail at: ${outPath}`);
    }

    const stat = fs.statSync(outPath);
    const out = probeImage(outPath);

    return {
      outputPath: outPath,
      format,
      width: out.width,
      height: out.height,
      fileSizeBytes: stat.size,
      timeOffsetSeconds: timeOffset
    };
  }
}
