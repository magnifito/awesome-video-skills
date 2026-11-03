import { runFfmpeg, probe } from './proc.js';
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
  /** True when the encoded file fits within targetSizeMb. */
  withinTarget: boolean;
  /** Warnings, e.g. when the 100 kbps video floor exceeds the size budget. */
  warnings: string[];
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

    const duration = probe(videoPath).durationSeconds;
    if (!(duration > 0)) {
      throw new Error(`Cannot optimize bitrate: source duration is ${duration}s`);
    }

    const warnings: string[] = [];
    // Target bits = MB * 8 * 1024 * 1024, minus ~3% for container overhead.
    const totalTargetBits = targetMb * 8 * 1024 * 1024 * 0.97;
    const totalBitrateKbps = Math.floor(totalTargetBits / duration / 1000);
    let vBitrateKbps = totalBitrateKbps - aBitrateKbps;
    if (vBitrateKbps < 100) {
      warnings.push(`Size budget allows only ${vBitrateKbps} kbps for video; using the 100 kbps floor, so the output may exceed ${targetMb} MB.`);
      vBitrateKbps = 100;
    }

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

    // Two-pass ABR hits the average bitrate far more accurately than single pass.
    const passLog = path.join(parentDir, `.bitrate-pass-${process.pid}-${Date.now()}`);
    const videoArgs = [
      '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-b:v', `${vBitrateKbps}k`, '-maxrate', `${maxRate}k`, '-bufsize', `${bufSize}k`,
      '-passlogfile', passLog
    ];
    try {
      runFfmpeg(['-i', videoPath, ...videoArgs, '-pass', '1', '-an', '-f', 'null', '-']);
      runFfmpeg(['-i', videoPath, ...videoArgs, '-pass', '2', '-c:a', 'aac', '-b:a', `${aBitrateKbps}k`, outPath]);
    } finally {
      for (const f of fs.readdirSync(parentDir)) {
        if (f.startsWith(path.basename(passLog))) fs.rmSync(path.join(parentDir, f), { force: true });
      }
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate optimized video at: ${outPath}`);
    }

    const finalSizeBytes = fs.statSync(outPath).size;
    if (finalSizeBytes > targetMb * 1024 * 1024) {
      warnings.push(`Output is ${(finalSizeBytes / 1024 / 1024).toFixed(2)} MB, above the ${targetMb} MB target.`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      originalSizeBytes,
      optimizedSizeBytes: finalSizeBytes,
      targetSizeMb: targetMb,
      videoBitrateKbps: vBitrateKbps,
      audioBitrateKbps: aBitrateKbps,
      durationSeconds: duration,
      withinTarget: finalSizeBytes <= targetMb * 1024 * 1024,
      warnings
    };
  }
}

