import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export type MattePreset = '2.39:1' | '1.85:1' | '4:3' | 'custom';

export interface MatteOptions {
  preset?: MattePreset;
  barHeightPixels?: number;
  barColor?: string;
  outputPath?: string;
}

export interface MatteResult {
  sourceVideo: string;
  outputPath: string;
  preset: string;
  barHeight: number;
  width: number;
  height: number;
}

export class MatteEngine {
  /**
   * Overlays cinematic letterbox or pillarbox matte bars.
   */
  static applyMatte(videoPath: string, options: MatteOptions = {}): MatteResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    let w = 1920;
    let h = 1080;
    try {
      const probeDims = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      const parts = probeDims.split('x').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        w = parts[0];
        h = parts[1];
      }
    } catch {
      // fallback
    }

    const preset = options.preset ?? '2.39:1';
    let barH = options.barHeightPixels ?? 0;

    if (preset === '2.39:1') {
      const activeH = Math.round(w / 2.39);
      barH = Math.max(0, Math.round((h - activeH) / 2));
    } else if (preset === '1.85:1') {
      const activeH = Math.round(w / 1.85);
      barH = Math.max(0, Math.round((h - activeH) / 2));
    } else if (preset === '4:3') {
      const activeW = Math.round(h * (4 / 3));
      const pillarW = Math.max(0, Math.round((w - activeW) / 2));
      // For 4:3 on landscape, pillarbox left & right
      return this.applyPillarbox(videoPath, pillarW, options, w, h);
    }

    if (barH === 0 && !options.barHeightPixels) {
      barH = 138; // Default 2.39:1 on 1080p
    }

    const color = options.barColor ?? 'black';
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-matte-${preset.replace(':', '_')}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `drawbox=x=0:y=0:w=iw:h=${barH}:color=${color}:t=fill,drawbox=x=0:y=ih-${barH}:w=iw:h=${barH}:color=${color}:t=fill`;

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
      throw new Error(`Failed to generate letterbox matte at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      preset,
      barHeight: barH,
      width: w,
      height: h
    };
  }

  private static applyPillarbox(videoPath: string, pillarWidth: number, options: MatteOptions, w: number, h: number): MatteResult {
    const color = options.barColor ?? 'black';
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-matte-4_3.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const filter = `drawbox=x=0:y=0:w=${pillarWidth}:h=ih:color=${color}:t=fill,drawbox=x=iw-${pillarWidth}:y=0:w=${pillarWidth}:h=ih:color=${color}:t=fill`;

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-vf "${filter}"`,
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      preset: '4:3',
      barHeight: pillarWidth,
      width: w,
      height: h
    };
  }
}

