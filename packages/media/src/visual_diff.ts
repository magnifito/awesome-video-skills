import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { ffmpegStderr, runTool } from './proc.js';

export interface VisualDiffResult {
  frameA: string;
  frameB: string;
  identical_hashes: boolean;
  hashA: string;
  hashB: string;
  size_delta_bytes: number;
  /** SSIM over decoded pixels (0.0 to 1.0, 1.0 = identical). */
  perceptual_similarity: number;
  /** PSNR in dB over decoded pixels; null when the images are pixel-identical (infinite PSNR). */
  psnr_db: number | null;
  drift_detected: boolean;
}

/** SSIM below this value is reported as visual drift. */
export const DRIFT_SSIM_THRESHOLD = 0.95;

/**
 * Reads pixel dimensions and stream tags of a still image. Separate from probe() because still
 * images have no duration, which probe() rightly treats as an error for timed media.
 */
export function probeImage(imagePath: string): { width: number; height: number; raw: Record<string, unknown> } {
  const out = runTool('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', imagePath]);
  const json = JSON.parse(out) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }> };
  const v = (json.streams ?? []).find(s => s.codec_type === 'video');
  if (!v || !v.width || !v.height) throw new Error(`Not a decodable image: ${imagePath}`);
  return { width: v.width, height: v.height, raw: json as Record<string, unknown> };
}

export class VisualDiffComparator {
  /**
   * Compares two rendered keyframe images for pixel/structural drift.
   * Both images are decoded by ffmpeg and compared with the ssim and psnr filters, so the score
   * reflects pixels, not compressed file bytes. Frame B is scaled to frame A's size if they differ.
   */
  static async compareFrames(frameAPath: string, frameBPath: string): Promise<VisualDiffResult> {
    const bufA = await fs.readFile(frameAPath);
    const bufB = await fs.readFile(frameBPath);
    const hashA = crypto.createHash('sha256').update(bufA).digest('hex');
    const hashB = crypto.createHash('sha256').update(bufB).digest('hex');
    const identical = hashA === hashB;
    const sizeDelta = Math.abs(bufA.length - bufB.length);

    let ssim = 1.0;
    let psnr: number | null = null;
    if (!identical) {
      const a = probeImage(frameAPath);
      const graph =
        `[0:v]format=yuv444p,split[a1][a2];` +
        `[1:v]scale=${a.width}:${a.height},format=yuv444p,split[b1][b2];` +
        `[a1][b1]ssim[s];[a2][b2]psnr[p]`;
      const stderr = ffmpegStderr([
        '-i', frameAPath, '-i', frameBPath,
        '-filter_complex', graph,
        '-map', '[s]', '-f', 'null', '-',
        '-map', '[p]', '-f', 'null', '-',
      ]);
      const ssimMatch = /SSIM [^\n]*All:([0-9.]+)/.exec(stderr);
      if (!ssimMatch) throw new Error('Could not parse SSIM from ffmpeg output');
      ssim = parseFloat(ssimMatch[1]);
      const psnrMatch = /PSNR [^\n]*average:([0-9.]+|inf)/.exec(stderr);
      if (!psnrMatch) throw new Error('Could not parse PSNR from ffmpeg output');
      psnr = psnrMatch[1] === 'inf' ? null : parseFloat(psnrMatch[1]);
    }

    const similarity = Math.round(ssim * 10000) / 10000;

    return {
      frameA: frameAPath,
      frameB: frameBPath,
      identical_hashes: identical,
      hashA,
      hashB,
      size_delta_bytes: sizeDelta,
      perceptual_similarity: similarity,
      psnr_db: psnr,
      drift_detected: !identical && similarity < DRIFT_SSIM_THRESHOLD
    };
  }
}
