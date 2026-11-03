import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, requirePositive } from './proc.js';

export type SfxType = 'whoosh' | 'thud' | 'pop' | 'chime';

export interface SfxOptions {
  durationSeconds?: number;
  sampleRate?: number;
  outputPath?: string;
}

export interface SfxResult {
  type: SfxType;
  outputPath: string;
  durationSeconds: number;
  sampleRate: number;
}

interface SfxRecipe {
  defaultDuration: number;
  /** Builds the lavfi source graph for a given duration (seconds) and sample rate. */
  build: (d: number, sr: number) => string;
}

const f = (n: number) => n.toFixed(3);

export class SfxSynthesizer {
  private static readonly SFX_RECIPES: Record<SfxType, SfxRecipe> = {
    whoosh: {
      defaultDuration: 0.8,
      build: (d, sr) =>
        `anoisesrc=d=${f(d)}:c=white:r=${sr},bandpass=f=800:width_type=h:w=500,afade=t=in:st=0:d=${f(d * 0.31)},afade=t=out:st=${f(d * 0.31)}:d=${f(d * 0.69)}`,
    },
    thud: {
      defaultDuration: 1.0,
      build: (d, sr) => `sine=frequency=55:duration=${f(d)}:sample_rate=${sr},afade=t=out:st=${f(d * 0.05)}:d=${f(d * 0.95)}`,
    },
    pop: {
      defaultDuration: 0.08,
      build: (d, sr) => `sine=frequency=1400:duration=${f(d)}:sample_rate=${sr},afade=t=out:st=${f(d * 0.125)}:d=${f(d * 0.875)}`,
    },
    chime: {
      defaultDuration: 1.5,
      build: (d, sr) => `sine=frequency=1046.5:duration=${f(d)}:sample_rate=${sr},afade=t=out:st=${f(d * 0.067)}:d=${f(d * 0.933)}`,
    },
  };

  /** Supported effect types. */
  static readonly TYPES = Object.keys(SfxSynthesizer.SFX_RECIPES) as SfxType[];

  /**
   * Procedurally synthesizes transition sound effects without external audio assets or spend.
   * The requested duration shapes both the source length and the fade envelope.
   */
  static synthesize(type: SfxType, options: SfxOptions = {}): SfxResult {
    const recipe = this.SFX_RECIPES[type];
    if (!recipe) {
      throw new Error(`Unknown SFX type "${String(type)}". Supported: ${this.TYPES.join(', ')}`);
    }
    const duration = requirePositive(options.durationSeconds ?? recipe.defaultDuration, 'durationSeconds');
    if (duration > 60) throw new Error(`durationSeconds must be <= 60, got ${duration}`);
    const sampleRate = Math.round(requirePositive(options.sampleRate ?? 48000, 'sampleRate'));

    const outPath = options.outputPath ?? path.join(
      process.cwd(),
      'dist',
      'sfx',
      `sfx-${type}-${Date.now()}.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    runFfmpeg([
      '-f', 'lavfi', '-i', recipe.build(duration, sampleRate),
      '-t', f(duration),
      '-ar', String(sampleRate),
      '-c:a', 'pcm_s16le',
      outPath,
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to synthesize sound effect at: ${outPath}`);
    }

    return {
      type,
      outputPath: outPath,
      durationSeconds: duration,
      sampleRate
    };
  }
}
