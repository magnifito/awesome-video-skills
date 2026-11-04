import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, ffmpegStderr, hasAudio, safeColor } from './proc.js';

export type WaveformScale = 'lin' | 'sqrt' | 'cbrt' | 'log';
export const WAVEFORM_SCALES: readonly WaveformScale[] = ['lin', 'sqrt', 'cbrt', 'log'];

export interface WaveformOptions {
  width?: number;
  height?: number;
  colorHex?: string; // e.g. "#10B981" or "0x2563EB"
  outputPath?: string;
  /** Amplitude scale passed to showwavespic (default 'lin'). */
  scale?: WaveformScale;
  /** Peak-normalise the audio so the loudest sample reaches the full height (default true). */
  normalize?: boolean;
  /** Draw each channel in its own band instead of downmixing to mono (default false). */
  splitChannels?: boolean;
}

export interface WaveformResult {
  sourcePath: string;
  outputPath: string;
  width: number;
  height: number;
  /** Gain in dB applied before drawing (0 when normalisation is off or the input is silent). */
  gainDb: number;
  fileSizeBytes: number;
}

/** Headroom left below full scale after normalisation, so peaks do not touch the frame edge. */
const NORMALIZE_TARGET_DB = -0.5;
/** Inputs quieter than this are treated as silence and never boosted (avoids drawing pure noise). */
const SILENCE_FLOOR_DB = -70;

/** Peak level of the file in dBFS (via volumedetect), or null for digital silence. */
function measurePeakDb(mediaPath: string, splitChannels: boolean): number | null {
  const pre = splitChannels ? '' : 'aformat=channel_layouts=mono,';
  const err = ffmpegStderr(['-nostats', '-i', mediaPath, '-vn', '-af', `${pre}volumedetect`, '-f', 'null', '-']);
  const m = /max_volume:\s+(-?[\d.]+|-inf) dB/.exec(err);
  if (!m || m[1] === '-inf') return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
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
    const scale = options.scale ?? 'lin';
    if (!WAVEFORM_SCALES.includes(scale)) throw new Error(`scale must be one of ${WAVEFORM_SCALES.join(', ')}, got ${scale}`);
    const splitChannels = options.splitChannels ?? false;
    if (!hasAudio(mediaPath)) throw new Error(`No audio stream in ${mediaPath}`);

    // showwavespic draws amplitude relative to full scale, so ordinary program audio
    // (peaks well below 0 dBFS) only fills a fraction of the height. Lift the peak to
    // just below full scale first.
    let gainDb = 0;
    if (options.normalize ?? true) {
      const peak = measurePeakDb(mediaPath, splitChannels);
      if (peak !== null && peak > SILENCE_FLOOR_DB) gainDb = Math.max(0, NORMALIZE_TARGET_DB - peak);
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(mediaPath),
      `${path.basename(mediaPath, path.extname(mediaPath))}-waveform.png`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // One colour per channel; showwavespic would otherwise give channels 2+ its default palette.
    const colors = splitChannels ? Array(8).fill(colorFormatted).join('|') : colorFormatted;
    const chain = [
      ...(splitChannels ? [] : ['aformat=channel_layouts=mono']),
      ...(gainDb > 0 ? [`volume=${gainDb.toFixed(2)}dB`] : []),
      // filter=peak draws each column's peak instead of its average (the average of a
      // signed waveform is a fraction of its envelope); draw=full gives solid columns.
      `showwavespic=s=${width}x${height}:colors=${colors}:scale=${scale}:filter=peak:draw=full:split_channels=${splitChannels ? 1 : 0}`
    ];
    const filter = chain.join(',');

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
      gainDb: Number(gainDb.toFixed(2)),
      fileSizeBytes: stat.size
    };
  }
}

