import { runFfmpeg, probe } from './proc.js';
import path from 'node:path';
import fs from 'node:fs';

export interface DeinterlaceOptions {
  outputPath?: string;
}

export interface DeinterlaceResult {
  sourceVideo: string;
  outputPath: string;
  filterApplied: string;
  isProgressive: boolean;
  /** Field order reported by ffprobe for the source (e.g. "tt", "bb", "progressive", "unknown"). */
  sourceFieldOrder: string;
  /** Field order reported by ffprobe for the output. */
  outputFieldOrder: string;
}

export class DeinterlaceEngine {
  /**
   * Normalizes interlaced video streams into progressive scan frames using the yadif deinterlacer.
   */
  static deinterlace(videoPath: string, options: DeinterlaceOptions = {}): DeinterlaceResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-deinterlaced.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const sourceFieldOrder = probe(videoPath).fieldOrder ?? 'unknown';
    // deint=interlaced only processes frames flagged as interlaced, so progressive
    // frames pass through untouched instead of being softened.
    const yadifFilter = 'yadif=mode=send_frame:parity=auto:deint=interlaced';

    runFfmpeg([
      '-i',
      videoPath,
      '-vf',
      yadifFilter,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      outPath
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate deinterlaced video at: ${outPath}`);
    }

    const outputFieldOrder = probe(outPath).fieldOrder ?? 'unknown';

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      filterApplied: yadifFilter,
      isProgressive: outputFieldOrder === 'progressive',
      sourceFieldOrder,
      outputFieldOrder
    };
  }
}

