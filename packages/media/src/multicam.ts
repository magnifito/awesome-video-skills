import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export type SplitLayout = 'side-by-side' | 'top-bottom' | 'quad-2x2';

export interface MultiCamOptions {
  layout?: SplitLayout;
  outputWidth?: number;
  outputHeight?: number;
  outputPath?: string;
}

export interface MultiCamResult {
  inputVideos: string[];
  outputPath: string;
  layout: SplitLayout;
  width: number;
  height: number;
}

export class MultiCamEngine {
  /**
   * Tiles multiple synchronized camera angles into a split-screen layout.
   */
  static composeSplitScreen(videoPaths: string[], options: MultiCamOptions = {}): MultiCamResult {
    if (!videoPaths || videoPaths.length < 2) {
      throw new Error('MultiCam layout requires at least 2 video streams');
    }

    for (const v of videoPaths) {
      if (!fs.existsSync(v)) {
        throw new Error(`Input video not found: ${v}`);
      }
    }

    const layout = options.layout ?? (videoPaths.length >= 4 ? 'quad-2x2' : 'side-by-side');
    const width = options.outputWidth ?? 1920;
    const height = options.outputHeight ?? 1080;

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPaths[0]),
      `multicam-${layout}-${Date.now()}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const inputArgs = videoPaths.map(v => `-i "${v}"`).join(' ');
    let filterComplex = '';

    if (layout === 'side-by-side') {
      const cellW = Math.floor(width / 2);
      const cellH = height;
      filterComplex = `[0:v]scale=${cellW}:${cellH}[v0];[1:v]scale=${cellW}:${cellH}[v1];[v0][v1]hstack=inputs=2[outv]`;
    } else if (layout === 'top-bottom') {
      const cellW = width;
      const cellH = Math.floor(height / 2);
      filterComplex = `[0:v]scale=${cellW}:${cellH}[v0];[1:v]scale=${cellW}:${cellH}[v1];[v0][v1]vstack=inputs=2[outv]`;
    } else {
      // quad-2x2
      const cellW = Math.floor(width / 2);
      const cellH = Math.floor(height / 2);
      filterComplex = `[0:v]scale=${cellW}:${cellH}[v0];[1:v]scale=${cellW}:${cellH}[v1];[2:v]scale=${cellW}:${cellH}[v2];[3:v]scale=${cellW}:${cellH}[v3];[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[outv]`;
    }

    const cmd = [
      'ffmpeg -y',
      inputArgs,
      `-filter_complex "${filterComplex}"`,
      '-map "[outv]"',
      '-map "0:a?"',
      '-shortest',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate multicam split-screen at: ${outPath}`);
    }

    return {
      inputVideos: videoPaths,
      outputPath: outPath,
      layout,
      width,
      height
    };
  }
}

