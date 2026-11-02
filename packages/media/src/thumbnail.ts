import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

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
   * Extract a still thumbnail from a video file at a given time offset.
   */
  static extractThumbnail(videoPath: string, options: ThumbnailOptions = {}): ThumbnailResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found at: ${videoPath}`);
    }

    const timeOffset = options.timeOffsetSeconds ?? 1.0;
    const format = options.format ?? 'png';
    const ext = (format === 'jpg' || format === 'jpeg') ? 'jpg' : 'png';

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `thumbnail-${timeOffset}s.${ext}`
    );

    // Build scale filter if dimensions requested
    let filterClause = '';
    if (options.width && options.height) {
      filterClause = `-vf "scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2:color=black"`;
    } else if (options.width) {
      filterClause = `-vf "scale=${options.width}:-1"`;
    } else if (options.height) {
      filterClause = `-vf "scale=-1:${options.height}"`;
    }

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const codecArgs = (format === 'jpg' || format === 'jpeg') ? '-c:v mjpeg -q:v 2' : '-c:v png';

    // Fast seek before input, accurate frame grab
    const cmd = [
      'ffmpeg -y',
      `-ss ${timeOffset.toFixed(3)}`,
      `-i "${videoPath}"`,
      filterClause,
      '-vframes 1',
      codecArgs,
      `"${outPath}"`
    ].filter(Boolean).join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate thumbnail at: ${outPath}`);
    }

    const stat = fs.statSync(outPath);

    // Probe dimensions of generated thumbnail
    let width = options.width ?? 0;
    let height = options.height ?? 0;
    try {
      const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${outPath}"`;
      const probeOut = execSync(probeCmd, { encoding: 'utf8' }).trim();
      const parts = probeOut.split('x').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        width = parts[0];
        height = parts[1];
      }
    } catch {
      // fallback
    }

    return {
      outputPath: outPath,
      format,
      width,
      height,
      fileSizeBytes: stat.size,
      timeOffsetSeconds: timeOffset
    };
  }
}

