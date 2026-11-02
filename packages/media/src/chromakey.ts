import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface ChromaKeyOptions {
  keyColor?: string; // hex or name, default "0x00FF00"
  similarity?: number; // 0.01 - 1.0, default 0.25
  blend?: number; // 0.0 - 1.0, default 0.1
  backgroundPath?: string;
  backgroundColor?: string; // fallback if no background video/image provided
  outputPath?: string;
}

export interface ChromaKeyResult {
  foregroundVideo: string;
  outputPath: string;
  keyColor: string;
  similarity: number;
  blend: number;
}

export class ChromaKeyEngine {
  /**
   * Keys out green or blue screen background and composites foreground onto a background plate.
   */
  static composite(videoPath: string, options: ChromaKeyOptions = {}): ChromaKeyResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Foreground video not found: ${videoPath}`);
    }

    const keyColor = options.keyColor ?? '0x00FF00';
    const similarity = options.similarity ?? 0.25;
    const blend = options.blend ?? 0.1;

    let w = 1920;
    let h = 1080;
    let duration = 5.0;
    try {
      const probeDims = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      const parts = probeDims.split('x').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        w = parts[0];
        h = parts[1];
      }

      const probeDur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      duration = parseFloat(probeDur) || 5.0;
    } catch {
      // fallback
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-chromakeyed.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    let cmd = '';
    if (options.backgroundPath && fs.existsSync(options.backgroundPath)) {
      const bg = options.backgroundPath;
      const filter = `[0:v]colorkey=${keyColor}:${similarity.toFixed(2)}:${blend.toFixed(2)}[fg];[1:v]scale=${w}:${h}[bg];[bg][fg]overlay=0:0:shortest=1[outv]`;
      cmd = [
        'ffmpeg -y',
        `-i "${videoPath}"`,
        `-i "${bg}"`,
        `-filter_complex "${filter}"`,
        '-map "[outv]"',
        '-map "0:a?"',
        '-shortest',
        '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
        '-c:a copy',
        `"${outPath}"`
      ].join(' ');
    } else {
      const bgColor = options.backgroundColor ?? '0x1E293B';
      const filter = `[0:v]colorkey=${keyColor}:${similarity.toFixed(2)}:${blend.toFixed(2)}[fg];color=c=${bgColor}:s=${w}x${h}:d=${duration.toFixed(2)}[bg];[bg][fg]overlay=0:0:shortest=1[outv]`;
      cmd = [
        'ffmpeg -y',
        `-i "${videoPath}"`,
        `-filter_complex "${filter}"`,
        '-map "[outv]"',
        '-map "0:a?"',
        '-shortest',
        '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
        '-c:a copy',
        `"${outPath}"`
      ].join(' ');
    }

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to composite chromakey video at: ${outPath}`);
    }

    return {
      foregroundVideo: videoPath,
      outputPath: outPath,
      keyColor,
      similarity,
      blend
    };
  }
}

