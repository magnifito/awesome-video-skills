import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe, safeColor } from './proc.js';

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
  /** Height of each letterbox bar, or width of each pillar for the 4:3 preset. 0 means no matte was needed. */
  barHeight: number;
  width: number;
  height: number;
}

const ENCODE_ARGS = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy'];

export class MatteEngine {
  /**
   * Overlays cinematic letterbox or pillarbox matte bars.
   */
  static applyMatte(videoPath: string, options: MatteOptions = {}): MatteResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    const w = info.displayWidth;
    const h = info.displayHeight;

    const preset = options.preset ?? '2.39:1';
    const color = safeColor(options.barColor ?? 'black');

    if (preset === '4:3') {
      const activeW = Math.round(h * (4 / 3));
      const pillarW = Math.max(0, Math.round((w - activeW) / 2));
      return this.applyPillarbox(videoPath, pillarW, color, options, w, h);
    }

    let barH: number;
    if (preset === '2.39:1') {
      barH = Math.max(0, Math.round((h - Math.round(w / 2.39)) / 2));
    } else if (preset === '1.85:1') {
      barH = Math.max(0, Math.round((h - Math.round(w / 1.85)) / 2));
    } else if (preset === 'custom') {
      // Custom preset without an explicit height falls back to the 2.39:1 bar for 1080p.
      barH = Math.round(options.barHeightPixels ?? 138);
    } else {
      throw new Error(`Unknown matte preset: ${JSON.stringify(preset)}`);
    }
    if (!(barH >= 0) || barH * 2 >= h) {
      throw new Error(`Bar height ${barH}px is invalid for a ${h}px tall frame`);
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-matte-${preset.replace(':', '_')}.mp4`
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // drawbox treats w=0/h=0 as "full input size", so a zero-size bar must skip the filter entirely.
    const filter = barH > 0
      ? `drawbox=x=0:y=0:w=iw:h=${barH}:color=${color}:t=fill,drawbox=x=0:y=ih-${barH}:w=iw:h=${barH}:color=${color}:t=fill`
      : 'null';

    runFfmpeg(['-i', videoPath, '-vf', filter, ...ENCODE_ARGS, outPath]);

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

  private static applyPillarbox(videoPath: string, pillarWidth: number, color: string, options: MatteOptions, w: number, h: number): MatteResult {
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-matte-4_3.mp4`
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // Source already 4:3 or narrower: no pillars (drawbox w=0 would fill the whole frame).
    const filter = pillarWidth > 0
      ? `drawbox=x=0:y=0:w=${pillarWidth}:h=ih:color=${color}:t=fill,drawbox=x=iw-${pillarWidth}:y=0:w=${pillarWidth}:h=ih:color=${color}:t=fill`
      : 'null';

    runFfmpeg(['-i', videoPath, '-vf', filter, ...ENCODE_ARGS, outPath]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate pillarbox matte at: ${outPath}`);
    }

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
