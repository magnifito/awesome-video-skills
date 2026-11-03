import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runFfmpeg, probe } from './proc.js';

export interface StemTrackInput {
  name: 'dialogue' | 'music' | 'sfx' | 'full_mix';
  filePath: string;
  /** When set, the stem is loudness-normalized to this integrated LUFS target (EBU R128 loudnorm). */
  targetLufs?: number;
}

export interface StemDeliverable {
  stem: string;
  filename: string;
  filePath: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
  sha256: string;
  /** Integrated LUFS target applied, or null when the stem was not normalized. */
  normalizedToLufs: number | null;
}

export interface StemExportReport {
  outputDir: string;
  stems: StemDeliverable[];
  manifestPath: string;
  totalSizeBytes: number;
}

const STEM_NAMES = new Set(['dialogue', 'music', 'sfx', 'full_mix']);

/** Streams a file through SHA-256 without loading it fully into memory. */
function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let n: number;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

export class StemExporter {
  /**
   * Packages audio stems as broadcast delivery WAVs (48 kHz, stereo, 24-bit PCM), optionally
   * loudness-normalized per stem via targetLufs.
   */
  static exportStems(tracks: StemTrackInput[], outputDir: string): StemExportReport {
    if (!tracks || tracks.length === 0) {
      throw new Error('At least one stem track must be provided');
    }

    const seen = new Set<string>();
    for (const track of tracks) {
      if (!STEM_NAMES.has(track.name)) throw new Error(`Unknown stem name: ${String(track.name)}`);
      if (seen.has(track.name)) {
        throw new Error(`Duplicate stem name "${track.name}": each stem must be unique, or files overwrite each other`);
      }
      seen.add(track.name);
      if (!fs.existsSync(track.filePath)) {
        throw new Error(`Audio stem track source not found: ${track.filePath}`);
      }
      if (track.targetLufs !== undefined && (!Number.isFinite(track.targetLufs) || track.targetLufs < -70 || track.targetLufs > -5)) {
        throw new Error(`targetLufs for "${track.name}" must be in [-70, -5], got ${track.targetLufs}`);
      }
      if (!probe(track.filePath).hasAudio) throw new Error(`Stem source has no audio stream: ${track.filePath}`);
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const deliverables: StemDeliverable[] = [];
    let totalSizeBytes = 0;

    for (const track of tracks) {
      const stemFilename = `stem-${track.name}.wav`;
      const outStemPath = path.join(outputDir, stemFilename);

      const args = ['-i', track.filePath, '-vn'];
      if (track.targetLufs !== undefined) {
        args.push('-af', `loudnorm=I=${track.targetLufs}:TP=-1.0:LRA=11`);
      }
      // -ar after loudnorm also undoes its internal 192 kHz upsampling.
      args.push('-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', outStemPath);
      runFfmpeg(args);

      totalSizeBytes += fs.statSync(outStemPath).size;
      const sha256 = sha256File(outStemPath);
      const info = probe(outStemPath);

      deliverables.push({
        stem: track.name,
        filename: stemFilename,
        filePath: outStemPath,
        sampleRateHz: info.sampleRate,
        channels: info.audioChannels,
        durationSeconds: info.durationSeconds,
        sha256,
        normalizedToLufs: track.targetLufs ?? null,
      });
    }

    const manifestPath = path.join(outputDir, 'stems-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      stems: deliverables
    }, null, 2));

    return {
      outputDir,
      stems: deliverables,
      manifestPath,
      totalSizeBytes
    };
  }
}
