import path from 'node:path';
import fs from 'node:fs';
import { AudioWaveformVisualizer, type WaveformResult, type WaveformOptions } from '../../../media/src/waveform.js';

export async function runWaveform(
  mediaPath: string,
  options: {
    out?: string;
    width?: number;
    height?: number;
    color?: string;
    scale?: WaveformOptions['scale'];
    normalize?: boolean;
    splitChannels?: boolean;
  }
): Promise<WaveformResult> {
  const resolvedMedia = path.resolve(process.cwd(), mediaPath);
  if (!fs.existsSync(resolvedMedia)) {
    throw new Error(`Media file not found at: ${resolvedMedia}`);
  }

  const outPath = options.out ? path.resolve(process.cwd(), options.out) : undefined;

  return AudioWaveformVisualizer.generateWaveform(resolvedMedia, {
    outputPath: outPath,
    width: options.width,
    height: options.height,
    colorHex: options.color,
    scale: options.scale,
    normalize: options.normalize,
    splitChannels: options.splitChannels
  });
}

