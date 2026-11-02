import { execSync } from 'node:child_process';
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
    const filters: string[] = [...(this.PRESET_FILTERS[preset] || this.PRESET_FILTERS['voice-presence'])];

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

    const cmd = [
      'ffmpeg -y',
      `-i "${audioPath}"`,
      `-af "${filterStr}"`,
      '-ar 48000',
      '-c:a pcm_s16le',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

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

