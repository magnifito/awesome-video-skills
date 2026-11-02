import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface SidechainOptions {
  threshold?: number; // 0.0 to 1.0 (default 0.08, ~ -22dB)
  ratio?: number;     // e.g. 4.0
  attackMs?: number;  // e.g. 20
  releaseMs?: number; // e.g. 350
  outputPath?: string;
}

export interface SidechainResult {
  voicePath: string;
  musicPath: string;
  outputPath: string;
  threshold: number;
  ratio: number;
}

export class SidechainDuckingEngine {
  /**
   * Applies real-time sidechain compression to automatically duck background music under voice dialogue.
   */
  static duckMusicUnderDialogue(
    voicePath: string,
    musicPath: string,
    options: SidechainOptions = {}
  ): SidechainResult {
    if (!fs.existsSync(voicePath)) {
      throw new Error(`Voiceover audio file not found: ${voicePath}`);
    }
    if (!fs.existsSync(musicPath)) {
      throw new Error(`Music audio file not found: ${musicPath}`);
    }

    const threshold = options.threshold ?? 0.08;
    const ratio = options.ratio ?? 4.0;
    const attack = options.attackMs ?? 20;
    const release = options.releaseMs ?? 350;

    const outPath = options.outputPath ?? path.join(
      path.dirname(voicePath),
      `ducked-mix-${Date.now()}.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Input 0: Voiceover (trigger), Input 1: Music (target to duck)
    // sidechaincompress: [main][sidechain]sidechaincompress=...
    const filter = `[1:a]volume=0.35[scaled_music];[scaled_music][0:a]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=${attack}:release=${release}[ducked_music];[0:a][ducked_music]amix=inputs=2:duration=first:dropout_transition=2[outa]`;

    const cmd = [
      'ffmpeg -y',
      `-i "${voicePath}"`,
      `-i "${musicPath}"`,
      `-filter_complex "${filter}"`,
      '-map "[outa]"',
      '-ar 48000',
      '-c:a pcm_s16le',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate sidechain ducked audio at: ${outPath}`);
    }

    return {
      voicePath,
      musicPath,
      outputPath: outPath,
      threshold,
      ratio
    };
  }
}

