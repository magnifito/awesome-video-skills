import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface MaskBox {
  x: number;
  y: number;
  width: number;
  height: number;
  mode?: 'blur' | 'solid';
  color?: string; // for solid mode
}

export interface MaskOptions {
  outputPath?: string;
}

export interface MaskResult {
  sourceVideo: string;
  outputPath: string;
  box: MaskBox;
  mode: 'blur' | 'solid';
}

export class MaskEngine {
  /**
   * Redacts sensitive on-screen client credentials, API keys, or PII using blur or solid matte.
   */
  static applyRedaction(videoPath: string, box: MaskBox, options: MaskOptions = {}): MaskResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const mode = box.mode ?? 'blur';
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-redacted-${mode}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    let filterComplex = '';
    if (mode === 'blur') {
      filterComplex = `[0:v]split=2[base][cropin];[cropin]crop=${box.width}:${box.height}:${box.x}:${box.y},boxblur=luma_radius=15:luma_power=3[blurred];[base][blurred]overlay=${box.x}:${box.y}[outv]`;
    } else {
      const color = box.color ?? 'black@0.95';
      filterComplex = `[0:v]drawbox=x=${box.x}:y=${box.y}:w=${box.width}:h=${box.height}:color=${color}:t=fill[outv]`;
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-filter_complex "${filterComplex}"`,
      '-map "[outv]"',
      '-map "0:a?"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate redacted video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      box,
      mode
    };
  }
}

