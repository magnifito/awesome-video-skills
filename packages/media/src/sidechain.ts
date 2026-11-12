import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runFfmpeg, hasAudio } from './proc.js';

export interface SidechainOptions {
  threshold?: number; // linear 0.000976563..1.0 (default 0.08, ~ -22 dB)
  ratio?: number; // 1..20, e.g. 4.0
  attackMs?: number; // 0.01..2000, e.g. 20
  releaseMs?: number; // 0.01..9000, e.g. 350
  outputPath?: string;
}

export interface SidechainResult {
  voicePath: string;
  musicPath: string;
  outputPath: string;
  threshold: number;
  ratio: number;
}

function inRange(v: number, lo: number, hi: number, label: string): number {
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${label} must be in [${lo}, ${hi}], got ${v}`);
  return v;
}

export class SidechainDuckingEngine {
  /**
   * Applies sidechain compression to automatically duck background music under voice dialogue.
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
    if (!hasAudio(voicePath)) throw new Error(`Voiceover has no audio stream: ${voicePath}`);
    if (!hasAudio(musicPath)) throw new Error(`Music has no audio stream: ${musicPath}`);

    // Ranges follow ffmpeg's sidechaincompress option limits.
    const threshold = inRange(options.threshold ?? 0.08, 0.000976563, 1, 'threshold');
    const ratio = inRange(options.ratio ?? 4.0, 1, 20, 'ratio');
    const attack = inRange(options.attackMs ?? 40, 0.01, 2000, 'attackMs');
    const release = inRange(options.releaseMs ?? 350, 0.01, 9000, 'releaseMs');

    const outPath = options.outputPath ?? path.join(
      path.dirname(voicePath),
      `ducked-mix-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Input 0: voiceover (trigger), input 1: music (ducked target).
    // The voice is split because it feeds both the sidechain and the final mix.
    // amix normalize=0 keeps the voice at unity gain (the default would halve each input).
    const filter = [
      '[0:a]asplit=2[voice_mix][voice_sc]',
      '[1:a]volume=0.35[scaled_music]',
      `[scaled_music][voice_sc]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=${attack}:release=${release}[ducked_music]`,
      '[voice_mix][ducked_music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[outa]',
    ].join(';');

    runFfmpeg([
      '-i', voicePath,
      '-i', musicPath,
      '-filter_complex', filter,
      '-map', '[outa]',
      '-ar', '48000',
      '-c:a', 'pcm_s16le',
      outPath,
    ]);

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
