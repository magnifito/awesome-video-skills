import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export interface VisualDiffResult {
  frameA: string;
  frameB: string;
  identical_hashes: boolean;
  hashA: string;
  hashB: string;
  size_delta_bytes: number;
  perceptual_similarity: number; // 0.0 to 1.0 (1.0 = identical)
  drift_detected: boolean;
}

export class VisualDiffComparator {
  /**
   * Compares two rendered keyframe images for pixel/structural drift.
   */
  static async compareFrames(frameAPath: string, frameBPath: string): Promise<VisualDiffResult> {
    const bufA = await fs.readFile(frameAPath);
    const bufB = await fs.readFile(frameBPath);

    const hashA = crypto.createHash('sha256').update(bufA).digest('hex');
    const hashB = crypto.createHash('sha256').update(bufB).digest('hex');

    const identical = hashA === hashB;
    const sizeDelta = Math.abs(bufA.length - bufB.length);

    // Sample byte divergence ratio
    let byteMatches = 0;
    const minLength = Math.min(bufA.length, bufB.length);
    const sampleStep = Math.max(1, Math.floor(minLength / 1000));
    let sampledCount = 0;

    for (let i = 0; i < minLength; i += sampleStep) {
      if (bufA[i] === bufB[i]) {
        byteMatches++;
      }
      sampledCount++;
    }

    const similarity = identical ? 1.0 : Math.round((byteMatches / sampledCount) * 100) / 100;

    return {
      frameA: frameAPath,
      frameB: frameBPath,
      identical_hashes: identical,
      hashA,
      hashB,
      size_delta_bytes: sizeDelta,
      perceptual_similarity: similarity,
      drift_detected: !identical && similarity < 0.85
    };
  }
}
