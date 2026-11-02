import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface DeClickOptions {
  windowMs?: number; // default 55
  overlapPercent?: number; // default 75
  threshold?: number; // default 2
  outputPath?: string;
}

export interface DeClickResult {
  sourceAudio: string;
  outputPath: string;
  filterApplied: string;
}

export class DeClickerEngine {
  /**
   * Eliminates impulsive mouth clicks, microphone pops, and electrical static from dialogue.
   */
  static declick(audioPath: string, options: DeClickOptions = {}): DeClickResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const windowMs = options.windowMs ?? 55;
    const overlap = options.overlapPercent ?? 75;
    const threshold = options.threshold ?? 2;

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-declicked.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `adeclick=window=${windowMs}:overlap=${overlap}:threshold=${threshold}`;

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
      throw new Error(`Failed to generate declicked audio at: ${outPath}`);
    }

    return {
      sourceAudio: audioPath,
      outputPath: outPath,
      filterApplied: filter
    };
  }
}

