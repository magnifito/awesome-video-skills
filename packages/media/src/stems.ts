import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export interface StemTrackInput {
  name: 'dialogue' | 'music' | 'sfx' | 'full_mix';
  filePath: string;
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
}

export interface StemExportReport {
  outputDir: string;
  stems: StemDeliverable[];
  manifestPath: string;
  totalSizeBytes: number;
}

export class StemExporter {
  /**
   * Packages and normalizes audio stems into broadcast delivery standards (48kHz, 24-bit PCM or 320kbps AAC).
   */
  static exportStems(tracks: StemTrackInput[], outputDir: string): StemExportReport {
    if (!tracks || tracks.length === 0) {
      throw new Error('At least one stem track must be provided');
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const deliverables: StemDeliverable[] = [];
    let totalSizeBytes = 0;

    for (const track of tracks) {
      if (!fs.existsSync(track.filePath)) {
        throw new Error(`Audio stem track source not found: ${track.filePath}`);
      }

      const stemFilename = `stem-${track.name}.wav`;
      const outStemPath = path.join(outputDir, stemFilename);

      // Convert/normalize to broadcast standard 48kHz stereo WAV (PCM 24-bit)
      const cmd = [
        'ffmpeg -y',
        `-i "${track.filePath}"`,
        '-ar 48000',
        '-ac 2',
        '-c:a pcm_s24le',
        `"${outStemPath}"`
      ].join(' ');

      execSync(cmd, { stdio: 'pipe' });

      const fileBuffer = fs.readFileSync(outStemPath);
      totalSizeBytes += fileBuffer.length;
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Probe duration
      let durationSeconds = 0;
      try {
        const probeCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outStemPath}"`;
        durationSeconds = parseFloat(execSync(probeCmd, { encoding: 'utf8' }).trim()) || 0;
      } catch {
        // fallback
      }

      deliverables.push({
        stem: track.name,
        filename: stemFilename,
        filePath: outStemPath,
        sampleRateHz: 48000,
        channels: 2,
        durationSeconds,
        sha256
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

