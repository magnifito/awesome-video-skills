import { runFfmpeg } from './proc.js';
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
    const cfg = this.PRESETS[presetName];
    if (!cfg) {
      throw new Error(`Unknown compressor preset: ${JSON.stringify(presetName)}`);
    }

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

    // acompressor limits: threshold 0.000976563..1 (-60..0 dB), ratio 1..20, attack 0.01..2000 ms,
    // release 0.01..9000 ms, makeup 1..64 (0..36 dB).
    if (!(threshold >= -60 && threshold <= 0)) throw new Error(`thresholdDb must be in [-60, 0], got ${threshold}`);
    if (!(ratio >= 1 && ratio <= 20)) throw new Error(`ratio must be in [1, 20], got ${ratio}`);
    if (!(attack >= 0.01 && attack <= 2000)) throw new Error(`attackMs must be in [0.01, 2000], got ${attack}`);
    if (!(release >= 0.01 && release <= 9000)) throw new Error(`releaseMs must be in [0.01, 9000], got ${release}`);
    if (!(makeup >= 0 && makeup <= 36)) throw new Error(`makeupGainDb must be in [0, 36], got ${makeup}`);
    const filter = `acompressor=threshold=${threshold}dB:ratio=${ratio.toFixed(1)}:attack=${attack}:release=${release}:makeup=${makeup}dB:knee=2.5`;

    runFfmpeg([
      '-i', audioPath,
      '-af', filter,
      '-ar', '48000',
      '-c:a', 'pcm_s16le',
      outPath
    ]);

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

