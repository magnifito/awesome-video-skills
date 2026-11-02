import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export type TargetAspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
export type ReframeStrategy = 'fit' | 'crop';

export interface ReframeOptions {
  targetRatio: TargetAspectRatio;
  strategy?: ReframeStrategy;
  padColor?: string; // e.g. "black" or "0x0F172A"
  outputPath?: string;
}

export interface ReframeResult {
  inputPath: string;
  outputPath: string;
  targetRatio: TargetAspectRatio;
  strategy: ReframeStrategy;
  width: number;
  height: number;
}

const RESOLUTION_MAP: Record<TargetAspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 }
};

export class AspectReframeEngine {
  /**
   * Re-frames a video to a target aspect ratio using fit (letterbox/pillarbox) or crop (center crop).
   */
  static reframe(inputPath: string, options: ReframeOptions): ReframeResult {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input video not found: ${inputPath}`);
    }

    const { targetRatio, strategy = 'fit', padColor = 'black' } = options;
    const targetDim = RESOLUTION_MAP[targetRatio];
    if (!targetDim) {
      throw new Error(`Unsupported target aspect ratio: ${targetRatio}`);
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}-${targetRatio.replace(':', 'x')}-${strategy}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    let vf = '';
    const { width: tw, height: th } = targetDim;

    if (strategy === 'fit') {
      // Scale to fit within target bounding box, then pad
      vf = `scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`;
    } else {
      // Scale to completely fill target box, then crop center
      vf = `scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th}`;
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${inputPath}"`,
      `-vf "${vf}"`,
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a aac -b:a 192k',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate reframed video at: ${outPath}`);
    }

    return {
      inputPath,
      outputPath: outPath,
      targetRatio,
      strategy,
      width: tw,
      height: th
    };
  }
}

