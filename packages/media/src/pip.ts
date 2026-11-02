import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export type PipCorner = 'bottom_right' | 'top_right' | 'bottom_left' | 'top_left';

export interface PipOptions {
  corner?: PipCorner;
  pipWidth?: number; // default 480
  padding?: number; // default 40
  outputPath?: string;
}

export interface PipResult {
  mainVideo: string;
  overlayVideo: string;
  outputPath: string;
  corner: PipCorner;
  pipWidth: number;
}

export class PipEngine {
  /**
   * Overlays a picture-in-picture video in a designated screen corner.
   */
  static composePip(mainVideo: string, overlayVideo: string, options: PipOptions = {}): PipResult {
    if (!fs.existsSync(mainVideo)) {
      throw new Error(`Main video file not found: ${mainVideo}`);
    }
    if (!fs.existsSync(overlayVideo)) {
      throw new Error(`Overlay video file not found: ${overlayVideo}`);
    }

    const corner = options.corner ?? 'bottom_right';
    const pipW = options.pipWidth ?? 480;
    const pad = options.padding ?? 40;

    const outPath = options.outputPath ?? path.join(
      path.dirname(mainVideo),
      `${path.basename(mainVideo, path.extname(mainVideo))}-pip-${corner}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    let overlayCoords = 'W-w-40:H-h-40';
    if (corner === 'bottom_right') overlayCoords = `W-w-${pad}:H-h-${pad}`;
    if (corner === 'top_right') overlayCoords = `W-w-${pad}:${pad}`;
    if (corner === 'bottom_left') overlayCoords = `${pad}:H-h-${pad}`;
    if (corner === 'top_left') overlayCoords = `${pad}:${pad}`;

    const filter = `[1:v]scale=${pipW}:-2[pip];[0:v][pip]overlay=${overlayCoords}:shortest=1[outv]`;

    const cmd = [
      'ffmpeg -y',
      `-i "${mainVideo}"`,
      `-i "${overlayVideo}"`,
      `-filter_complex "${filter}"`,
      '-map "[outv]"',
      '-map "0:a?"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate PiP video at: ${outPath}`);
    }

    return {
      mainVideo,
      overlayVideo,
      outputPath: outPath,
      corner,
      pipWidth: pipW
    };
  }
}

