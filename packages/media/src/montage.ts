import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface MontageOptions {
  secondsPerSlide?: number;
  width?: number;
  height?: number;
  fps?: number;
  outputPath?: string;
}

export interface MontageResult {
  imageCount: number;
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
}

export class MontageGenerator {
  /**
   * Stitches an array of styleframe images into an animated review animatic video.
   */
  static createAnimatic(imagePaths: string[], options: MontageOptions = {}): MontageResult {
    if (!imagePaths || imagePaths.length === 0) {
      throw new Error('At least one image is required to build a montage');
    }

    for (const img of imagePaths) {
      if (!fs.existsSync(img)) {
        throw new Error(`Storyboard image file not found: ${img}`);
      }
    }

    const secondsPerSlide = options.secondsPerSlide ?? 2.0;
    const width = options.width ?? 1920;
    const height = options.height ?? 1080;
    const fps = options.fps ?? 30;

    const outPath = options.outputPath ?? path.join(
      path.dirname(imagePaths[0]),
      `animatic-montage-${Date.now()}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const tempClips: string[] = [];
    try {
      imagePaths.forEach((img, idx) => {
        const clipPath = path.join(parentDir, `tmp-montage-clip-${idx}-${Date.now()}.mp4`);
        const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
        
        const cmd = [
          'ffmpeg -y',
          `-loop 1 -t ${secondsPerSlide.toFixed(2)}`,
          `-i "${img}"`,
          `-f lavfi -t ${secondsPerSlide.toFixed(2)} -i anullsrc=r=48000:cl=stereo`,
          `-vf "${scaleFilter}"`,
          `-r ${fps}`,
          '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
          '-c:a aac -b:a 128k',
          `"${clipPath}"`
        ].join(' ');

        execSync(cmd, { stdio: 'pipe' });
        tempClips.push(clipPath);
      });

      const concatListPath = path.join(parentDir, `tmp-concat-${Date.now()}.txt`);
      const listContent = tempClips.map(c => `file '${path.resolve(c)}'`).join('\n');
      fs.writeFileSync(concatListPath, listContent);

      const concatCmd = [
        'ffmpeg -y',
        `-f concat -safe 0 -i "${concatListPath}"`,
        '-c copy',
        `"${outPath}"`
      ].join(' ');

      try {
        execSync(concatCmd, { stdio: 'pipe' });
      } finally {
        if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
      }
    } finally {
      for (const tc of tempClips) {
        if (fs.existsSync(tc)) {
          fs.unlinkSync(tc);
        }
      }
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate animatic montage at: ${outPath}`);
    }

    const totalDuration = imagePaths.length * secondsPerSlide;

    return {
      imageCount: imagePaths.length,
      outputPath: outPath,
      durationSeconds: totalDuration,
      width,
      height
    };
  }
}

