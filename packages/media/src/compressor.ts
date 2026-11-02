import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export type CompressorPreset = 'broadcast-master' | 'vocal-leveler' | 'punchy-bass';

export interface CompressorOptions {
  preset?: CompressorPreset;
  thresholdDb?: number;
  ratio?: number;
  attackMs?: number;
  releaseMs?: number;
  makeupGainDb?: number;
  outputPath?: string;
}

export interface CompressorResult {
  sourceAudio: string;
  outputPath: string;
  preset: string;
  thresholdDb: number;
  ratio: number;
  makeupGainDb: number;
  filterApplied: string;
}

export class AudioCompressor {
  private static readonly PRESETS: Record<CompressorPreset, { threshold: number; ratio: number; attack: number; release: number; makeup: number }> = {
    'broadcast-master': { threshold: -18, ratio: 3.5, attack: 15, release: 180, makeup: 2.5 },
    'vocal-leveler': { threshold: -22, ratio: 4.0, attack: 8, release: 120, makeup: 3.5 },
    'punchy-bass': { threshold: -14, ratio: 2.5, attack: 30, release: 250, makeup: 1.5 }
  };

  /**
   * Applies dynamic audio range compression to level speech and maximize loudness punch.
   */
  static compress(audioPath: string, options: CompressorOptions = {}): CompressorResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const presetName = options.preset ?? 'broadcast-master';
    const cfg = this.PRESETS[presetName] || this.PRESETS['broadcast-master'];

    const threshold = options.thresholdDb ?? cfg.threshold;
    const ratio = options.ratio ?? cfg.ratio;
    const attack = options.attackMs ?? cfg.attack;
    const release = options.releaseMs ?? cfg.release;
    const makeup = options.makeupGainDb ?? cfg.makeup;

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-compressed.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `acompressor=threshold=${threshold}dB:ratio=${ratio.toFixed(1)}:attack=${attack}:release=${release}:makeup=${makeup}dB:knee=2.5`;

    const cmd = [
      'ffmpeg -y',
      `-i "${audioPath}"`,
      `-af "${filter}"`,
      '-ar 48000',
      '-c:a pcm_s16le',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to compress audio at: ${outPath}`);
    }

    return {
      sourceAudio: audioPath,
      outputPath: outPath,
      preset: presetName,
      thresholdDb: threshold,
      ratio,
      makeupGainDb: makeup,
      filterApplied: filter
    };
  }
}

