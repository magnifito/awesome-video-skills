import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe, safeColor } from './proc.js';

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

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.gif']);

export class ChromaKeyEngine {
  /**
   * Keys out a green or blue screen background and composites the foreground onto a background plate.
   */
  static composite(videoPath: string, options: ChromaKeyOptions = {}): ChromaKeyResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Foreground video not found: ${videoPath}`);
    }

    const keyColor = safeColor(options.keyColor ?? '0x00FF00');
    const similarity = options.similarity ?? 0.25;
    const blend = options.blend ?? 0.1;
    if (!(similarity >= 0.01 && similarity <= 1)) throw new Error(`similarity must be in [0.01, 1], got ${similarity}`);
    if (!(blend >= 0 && blend <= 1)) throw new Error(`blend must be in [0, 1], got ${blend}`);

    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`Foreground has no video stream: ${videoPath}`);
    const w = info.displayWidth;
    const h = info.displayHeight;
    const fps = info.fps > 0 ? info.fps : 30;

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-chromakeyed.mp4`
    );

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const key = `[0:v]colorkey=${keyColor}:${similarity.toFixed(2)}:${blend.toFixed(2)}[fg]`;
    const encode = [
      '-map', '[outv]',
      '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      // The output always runs exactly as long as the foreground clip.
      '-t', info.durationSeconds.toFixed(3),
      outPath
    ];

    if (options.backgroundPath) {
      if (!fs.existsSync(options.backgroundPath)) {
        throw new Error(`Background plate not found: ${options.backgroundPath}`);
      }
      const bg = options.backgroundPath;
      const isImage = IMAGE_EXTENSIONS.has(path.extname(bg).toLowerCase());
      // Fill the frame without distortion, match the foreground frame rate, and
      // keep the foreground (main timeline) driving the output length.
      const filter = [
        key,
        `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${fps},setsar=1[bg]`,
        '[bg][fg]overlay=0:0:eof_action=pass[outv]'
      ].join(';');
      runFfmpeg([
        '-i', videoPath,
        ...(isImage ? ['-loop', '1', '-framerate', String(fps)] : ['-stream_loop', '-1']),
        '-i', bg,
        '-filter_complex', filter,
        ...encode
      ]);
    } else {
      const bgColor = safeColor(options.backgroundColor ?? '0x1E293B');
      const filter = [
        key,
        `color=c=${bgColor}:s=${w}x${h}:r=${fps}:d=${info.durationSeconds.toFixed(3)}[bg]`,
        '[bg][fg]overlay=0:0:shortest=1[outv]'
      ].join(';');
      runFfmpeg(['-i', videoPath, '-filter_complex', filter, ...encode]);
    }

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
