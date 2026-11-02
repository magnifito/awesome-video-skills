import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface BitrateOptimizeOptions {
  targetSizeMb?: number;
  audioBitrateKbps?: number;
  outputPath?: string;
}

export interface BitrateOptimizeResult {
  sourceVideo: string;
  outputPath: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  targetSizeMb: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  durationSeconds: number;
}

export class BitrateOptimizer {
  /**
   * Encodes video to conform to strict platform file size constraints (e.g. Discord 25MB, WhatsApp 16MB).
   */
  static optimizeToSize(videoPath: string, options: BitrateOptimizeOptions = {}): BitrateOptimizeResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const targetMb = options.targetSizeMb ?? 10.0;
    const aBitrateKbps = options.audioBitrateKbps ?? 128;
    const originalSizeBytes = fs.statSync(videoPath).size;

    let duration = 5.0;
    try {
      const probeDur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      duration = parseFloat(probeDur) || 5.0;
    } catch {
      // fallback
    }

    // Target bits = MB * 8 * 1024 * 1024
    const totalTargetBits = targetMb * 8 * 1024 * 1024;
    const totalBitrateKbps = Math.floor(totalTargetBits / duration / 1000);
    const vBitrateKbps = Math.max(100, totalBitrateKbps - aBitrateKbps);

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-optimized-${targetMb}mb.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const maxRate = Math.round(vBitrateKbps * 1.35);
    const bufSize = Math.round(vBitrateKbps * 2.0);

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-b:v ${vBitrateKbps}k`,
      `-maxrate ${maxRate}k`,
      `-bufsize ${bufSize}k`,
      `-c:a aac -b:a ${aBitrateKbps}k`,
      '-c:v libx264 -preset fast -pix_fmt yuv420p',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate optimized video at: ${outPath}`);
    }

    const finalSizeBytes = fs.statSync(outPath).size;

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      originalSizeBytes,
      optimizedSizeBytes: finalSizeBytes,
      targetSizeMb: targetMb,
      videoBitrateKbps: vBitrateKbps,
      audioBitrateKbps: aBitrateKbps,
      durationSeconds: duration
    };
  }
}

