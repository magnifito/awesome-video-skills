import { ffmpegStderr, runFfmpeg } from './proc.js';
import path from 'node:path';
import fs from 'node:fs';

export type CompressorPreset = 'broadcast-master' | 'vocal-leveler' | 'punchy-bass';

export interface CompressorOptions {
  preset?: CompressorPreset;
  thresholdDb?: number;
  ratio?: number;
  attackMs?: number;
  releaseMs?: number;
  /**
   * Fixed makeup gain in dB. When omitted, makeup is loudness-matched: the input and the
   * compressed signal are measured (EBU R128 integrated) and the difference is added back,
   * so the output keeps the input's integrated loudness with less dynamic range.
   */
  makeupGainDb?: number;
  outputPath?: string;
}

export interface CompressorResult {
  sourceAudio: string;
  outputPath: string;
  preset: string;
  thresholdDb: number;
  ratio: number;
  /** Makeup gain actually applied in dB (measured when loudness-matched). */
  makeupGainDb: number;
  /** True when makeup was derived from measured loudness rather than given. */
  makeupAuto: boolean;
  /** Integrated loudness of the input and output, in LUFS (only measured when loudness-matched). */
  inputLufs?: number;
  outputLufs?: number;
  filterApplied: string;
}

/** EBU R128 integrated loudness (LUFS) of a file after an optional filter chain; -Infinity for silence. */
function integratedLufs(file: string, filter?: string): number {
  const err = ffmpegStderr(['-nostats', '-i', file, '-af', `${filter ? `${filter},` : ''}ebur128`, '-f', 'null', '-']);
  const summary = err.slice(err.lastIndexOf('Summary:'));
  const m = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary);
  if (!m) throw new Error(`Could not measure loudness of ${file}`);
  return m[1] === '-inf' ? -Infinity : parseFloat(m[1]);
}

export class AudioCompressor {
  // Presets carry no fixed makeup: the gain reduction depends on the input level, so a fixed
  // value left speech up to ~6 dB quieter (vocal-leveler) or louder. Makeup is measured instead.
  private static readonly PRESETS: Record<CompressorPreset, { threshold: number; ratio: number; attack: number; release: number }> = {
    'broadcast-master': { threshold: -18, ratio: 3.5, attack: 15, release: 180 },
    'vocal-leveler': { threshold: -22, ratio: 4.0, attack: 8, release: 120 },
    'punchy-bass': { threshold: -14, ratio: 2.5, attack: 30, release: 250 }
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
    const fixedMakeup = options.makeupGainDb;

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
    if (fixedMakeup !== undefined && !(fixedMakeup >= 0 && fixedMakeup <= 36)) throw new Error(`makeupGainDb must be in [0, 36], got ${fixedMakeup}`);
    const compressor = `acompressor=threshold=${threshold}dB:ratio=${ratio.toFixed(1)}:attack=${attack}:release=${release}:knee=2.5`;

    let makeup = fixedMakeup ?? 0;
    let inputLufs: number | undefined;
    let outputLufs: number | undefined;
    if (fixedMakeup === undefined) {
      // Loudness-matched makeup: measure input and the compressed signal, add the difference.
      inputLufs = integratedLufs(audioPath);
      const compressedLufs = integratedLufs(audioPath, compressor);
      if (Number.isFinite(inputLufs) && Number.isFinite(compressedLufs)) {
        makeup = Math.round((inputLufs - compressedLufs) * 100) / 100;
      }
    }
    // volume (not acompressor's makeup) so a negative correction is possible; alimiter catches
    // the few transients that slip past the attack time once the makeup is added.
    const filter = `${compressor},volume=${makeup.toFixed(2)}dB,alimiter=limit=0.966:level=false:latency=true`;

    runFfmpeg([
      '-i', audioPath,
      '-af', filter,
      '-ar', '48000',
      '-c:a', 'pcm_s16le',
      outPath
    ]);
    if (fixedMakeup === undefined) outputLufs = integratedLufs(outPath);

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
      makeupAuto: fixedMakeup === undefined,
      inputLufs,
      outputLufs,
      filterApplied: filter
    };
  }
}

