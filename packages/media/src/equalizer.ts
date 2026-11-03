import { runFfmpeg } from './proc.js';
import path from 'node:path';
import fs from 'node:fs';

export type EqPreset = 'voice-presence' | 'rumble-reduction' | 'warm-broadcast' | 'de-ess';

export interface EqOptions {
  preset?: EqPreset;
  highpassHz?: number;
  lowpassHz?: number;
  outputPath?: string;
}

export interface EqResult {
  sourceAudio: string;
  outputPath: string;
  preset: string;
  filters: string[];
}

export class AudioEqualizerEngine {
  private static readonly PRESET_FILTERS: Record<EqPreset, string[]> = {
    'voice-presence': [
      'highpass=f=80',
      'equalizer=f=2500:t=q:w=1.5:g=3.0',
      'treble=g=2.0:f=10000'
    ],
    'rumble-reduction': [
      'highpass=f=100'
    ],
    'warm-broadcast': [
      'highpass=f=75',
      'bass=g=2.5:f=200',
      'equalizer=f=3000:t=q:w=1.2:g=2.0'
    ],
    'de-ess': [
      'equalizer=f=7200:t=q:w=2.0:g=-4.5'
    ]
  };

  /**
   * Applies audio equalization and vocal frequency sweetening.
   */
  static applyEq(audioPath: string, options: EqOptions = {}): EqResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const preset = options.preset ?? 'voice-presence';
    const presetFilters = this.PRESET_FILTERS[preset];
    if (!presetFilters) {
      throw new Error(`Unknown EQ preset: ${JSON.stringify(preset)}`);
    }
    const filters: string[] = [...presetFilters];
    for (const [label, hz] of [['highpassHz', options.highpassHz], ['lowpassHz', options.lowpassHz]] as const) {
      if (hz !== undefined && !(Number.isFinite(hz) && hz > 0 && hz < 24000)) {
        throw new Error(`${label} must be between 0 and 24000 Hz, got ${hz}`);
      }
    }

    if (options.highpassHz) {
      filters.unshift(`highpass=f=${options.highpassHz}`);
    }
    if (options.lowpassHz) {
      filters.push(`lowpass=f=${options.lowpassHz}`);
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-eq-${preset}.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filterStr = filters.join(',');

    runFfmpeg([
      '-i',
      audioPath,
      '-af',
      filterStr,
      '-ar',
      '48000',
      '-c:a',
      'pcm_s16le',
      outPath
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate equalized audio at: ${outPath}`);
    }

    return {
      sourceAudio: audioPath,
      outputPath: outPath,
      preset,
      filters
    };
  }
}

