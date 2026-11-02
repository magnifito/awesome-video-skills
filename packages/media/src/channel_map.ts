import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export type ChannelLayoutMode = 'mono-to-stereo' | 'stereo-to-mono' | 'left-only-to-stereo' | 'right-only-to-stereo';

export interface ChannelMapOptions {
  mode?: ChannelLayoutMode;
  outputPath?: string;
}

export interface ChannelMapResult {
  sourceAudio: string;
  outputPath: string;
  mode: ChannelLayoutMode;
  panFilter: string;
}

export class AudioChannelMapper {
  private static readonly PAN_FILTERS: Record<ChannelLayoutMode, string> = {
    'mono-to-stereo': 'pan=stereo|c0=c0|c1=c0',
    'stereo-to-mono': 'pan=mono|c0=0.5*c0+0.5*c1',
    'left-only-to-stereo': 'pan=stereo|c0=c0|c1=c0',
    'right-only-to-stereo': 'pan=stereo|c0=c1|c1=c1'
  };

  /**
   * Remaps and normalizes audio channel layouts to broadcast delivery standards.
   */
  static remap(audioPath: string, options: ChannelMapOptions = {}): ChannelMapResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const mode = options.mode ?? 'mono-to-stereo';
    const panFilter = this.PAN_FILTERS[mode] || this.PAN_FILTERS['mono-to-stereo'];

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-${mode}.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${audioPath}"`,
      `-af "${panFilter}"`,
      '-ar 48000',
      '-c:a pcm_s16le',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate remapped audio at: ${outPath}`);
    }

    return {
      sourceAudio: audioPath,
      outputPath: outPath,
      mode,
      panFilter
    };
  }
}

