import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

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

export class SfxSynthesizer {
  private static readonly SFX_FILTERS: Record<SfxType, { filter: string; defaultDuration: number }> = {
    whoosh: {
      filter: 'anoisesrc=d=0.8:c=white:r=48000,bandpass=f=800:width_type=h:w=500,afade=t=in:st=0:d=0.25,afade=t=out:st=0.25:d=0.55',
      defaultDuration: 0.8
    },
    thud: {
      filter: 'sine=frequency=55:duration=1.0,afade=t=out:st=0.05:d=0.95',
      defaultDuration: 1.0
    },
    pop: {
      filter: 'sine=frequency=1400:duration=0.08,afade=t=out:st=0.01:d=0.07',
      defaultDuration: 0.08
    },
    chime: {
      filter: 'sine=frequency=1046.5:duration=1.5,afade=t=out:st=0.1:d=1.4',
      defaultDuration: 1.5
    }
  };

  /**
   * Procedurally synthesizes transition sound effects without external audio assets or spend.
   */
  static synthesize(type: SfxType, options: SfxOptions = {}): SfxResult {
    const config = this.SFX_FILTERS[type] || this.SFX_FILTERS.whoosh;
    const duration = options.durationSeconds ?? config.defaultDuration;
    const sampleRate = options.sampleRate ?? 48000;

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

    const cmd = [
      'ffmpeg -y',
      `-f lavfi -i "${config.filter}"`,
      `-t ${duration.toFixed(2)}`,
      `-ar ${sampleRate}`,
      '-c:a pcm_s16le',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

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

