import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface ResampleOptions {
  sampleRate?: number;
  outputPath?: string;
}

export interface ResampleResult {
  sourceAudio: string;
  outputPath: string;
  originalSampleRate: number;
  targetSampleRate: number;
  durationSeconds: number;
}

export class AudioResampler {
  /**
   * Resamples audio to standard broadcast sample rate (48000 Hz) or specified rate.
   */
  static resample(audioPath: string, options: ResampleOptions = {}): ResampleResult {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const targetRate = options.sampleRate ?? 48000;

    let origRate = 44100;
    let duration = 5.0;
    try {
      const probeRate = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of csv=p=0 "${audioPath}"`, {
        encoding: 'utf8'
      }).trim();
      origRate = parseInt(probeRate, 10) || 44100;

      const probeDur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`, {
        encoding: 'utf8'
      }).trim();
      duration = parseFloat(probeDur) || 5.0;
    } catch {
      // fallback
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(audioPath),
      `${path.basename(audioPath, path.extname(audioPath))}-resampled-${targetRate}hz.wav`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${audioPath}"`,
      `-af "aresample=${targetRate}"`,
      '-c:a pcm_s16le',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to resample audio at: ${outPath}`);
    }

    return {
      sourceAudio: audioPath,
      outputPath: outPath,
      originalSampleRate: origRate,
      targetSampleRate: targetRate,
      durationSeconds: duration
    };
  }
}

