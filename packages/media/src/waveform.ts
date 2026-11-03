import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, hasAudio, safeColor } from './proc.js';

export interface WaveformOptions {
  width?: number;
  height?: number;
  colorHex?: string; // e.g. "#10B981" or "0x2563EB"
  outputPath?: string;
}

export interface WaveformResult {
  sourcePath: string;
  outputPath: string;
  width: number;
  height: number;
  fileSizeBytes: number;
}

export class AudioWaveformVisualizer {
  /**
   * Generates a high-resolution waveform PNG image from an audio or video file.
   */
  static generateWaveform(mediaPath: string, options: WaveformOptions = {}): WaveformResult {
    if (!fs.existsSync(mediaPath)) {
      throw new Error(`Media file not found: ${mediaPath}`);
    }

    const width = options.width ?? 1200;
    const height = options.height ?? 240;
    const rawColor = options.colorHex ?? '#2563EB';
    for (const [k, v] of [['width', width], ['height', height]] as const) {
      if (!Number.isInteger(v) || v <= 0 || v > 8192) throw new Error(`${k} must be an integer in [1, 8192], got ${v}`);
    }
    // Validate before it reaches the filter graph; bare hex like "2563EB" is accepted as 0x-prefixed.
    const normalized = /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(rawColor) ? `0x${rawColor}` : rawColor;
    const checked = safeColor(normalized);
    const colorFormatted = checked.startsWith('#') ? `0x${checked.slice(1)}` : checked;
    if (!hasAudio(mediaPath)) throw new Error(`No audio stream in ${mediaPath}`);

    const outPath = options.outputPath ?? path.join(
      path.dirname(mediaPath),
      `${path.basename(mediaPath, path.extname(mediaPath))}-waveform.png`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=${colorFormatted}`;

    runFfmpeg(['-i', mediaPath, '-filter_complex', filter, '-frames:v', '1', '-update', '1', outPath]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate waveform image at: ${outPath}`);
    }

    const stat = fs.statSync(outPath);

    return {
      sourcePath: mediaPath,
      outputPath: outPath,
      width,
      height,
      fileSizeBytes: stat.size
    };
  }
}

