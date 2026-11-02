import { execSync } from 'node:child_process';
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

    const yadifFilter = 'yadif=mode=send_frame:parity=auto:deint=all';

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-vf "${yadifFilter}"`,
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate deinterlaced video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      filterApplied: yadifFilter,
      isProgressive: true
    };
  }
}

