import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export type FocalPoint = 'center' | 'top' | 'bottom' | 'left' | 'right';

export interface SmartCropOptions {
  targetAspectRatio?: '9:16' | '1:1' | '4:5' | '16:9';
  focus?: FocalPoint;
  outputPath?: string;
}

export interface SmartCropResult {
  sourceVideo: string;
  outputPath: string;
  targetAspectRatio: string;
  focus: FocalPoint;
  outputWidth: number;
  outputHeight: number;
}

export class SmartCropEngine {
  /**
   * Reframes video into target aspect ratios with focal point bias.
   */
  static crop(videoPath: string, options: SmartCropOptions = {}): SmartCropResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const targetRatio = options.targetAspectRatio ?? '9:16';
    const focus = options.focus ?? 'center';

    let origW = 1920;
    let origH = 1080;
    try {
      const probeDims = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      const parts = probeDims.split('x').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        origW = parts[0];
        origH = parts[1];
      }
    } catch {
      // fallback
    }

    let targetW = 1080;
    let targetH = 1920;
    let num = 9;
    let den = 16;

    if (targetRatio === '1:1') {
      targetW = 1080;
      targetH = 1080;
      num = 1;
      den = 1;
    } else if (targetRatio === '4:5') {
      targetW = 1080;
      targetH = 1350;
      num = 4;
      den = 5;
    } else if (targetRatio === '16:9') {
      targetW = 1920;
      targetH = 1080;
      num = 16;
      den = 9;
    }

    const targetAspect = num / den;
    let cropW = origW;
    let cropH = origH;

    if (origW / origH > targetAspect) {
      // Input is wider than target: crop width
      cropH = origH;
      cropW = Math.round(origH * targetAspect);
    } else {
      // Input is taller than target: crop height
      cropW = origW;
      cropH = Math.round(origW / targetAspect);
    }

    // Ensure even dimensions
    cropW = cropW - (cropW % 2);
    cropH = cropH - (cropH % 2);

    let x = Math.round((origW - cropW) / 2);
    let y = Math.round((origH - cropH) / 2);

    if (focus === 'left') x = Math.round((origW - cropW) * 0.15);
    if (focus === 'right') x = Math.round((origW - cropW) * 0.85);
    if (focus === 'top') y = Math.round((origH - cropH) * 0.1);
    if (focus === 'bottom') y = Math.round((origH - cropH) * 0.9);

    x = Math.max(0, Math.min(x, origW - cropW));
    y = Math.max(0, Math.min(y, origH - cropH));

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-smartcrop-${targetRatio.replace(':', '_')}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `crop=${cropW}:${cropH}:${x}:${y},scale=${targetW}:${targetH}`;

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-vf "${filter}"`,
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to smart-crop video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      targetAspectRatio: targetRatio,
      focus,
      outputWidth: targetW,
      outputHeight: targetH
    };
  }
}

