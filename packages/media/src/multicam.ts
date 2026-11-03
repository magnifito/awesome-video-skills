import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, requirePositive } from './proc.js';

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

const LAYOUT_INPUTS: Record<SplitLayout, number> = {
  'side-by-side': 2,
  'top-bottom': 2,
  'quad-2x2': 4,
};

export class MultiCamEngine {
  /**
   * Tiles multiple synchronized camera angles into a split-screen layout.
   * Each angle is letterboxed into its cell (aspect ratio preserved, never stretched).
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
    const required = LAYOUT_INPUTS[layout];
    if (!required) throw new Error(`Unknown multicam layout: ${String(layout)}`);
    if (videoPaths.length !== required) {
      throw new Error(`Layout "${layout}" requires exactly ${required} input videos, got ${videoPaths.length}`);
    }

    const width = requirePositive(options.outputWidth ?? 1920, 'outputWidth');
    const height = requirePositive(options.outputHeight ?? 1080, 'outputHeight');

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPaths[0]),
      `multicam-${layout}-${Date.now()}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Cell sizes must be even for yuv420p.
    const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
    const cellW = even(layout === 'top-bottom' ? width : width / 2);
    const cellH = even(layout === 'side-by-side' ? height : height / 2);
    const fit = (i: number) =>
      `[${i}:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease,pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v${i}]`;

    const cells = videoPaths.map((_, i) => fit(i));
    let stack: string;
    if (layout === 'side-by-side') stack = '[v0][v1]hstack=inputs=2[outv]';
    else if (layout === 'top-bottom') stack = '[v0][v1]vstack=inputs=2[outv]';
    else stack = '[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[outv]';
    const filterComplex = [...cells, stack].join(';');

    runFfmpeg([
      ...videoPaths.flatMap(v => ['-i', v]),
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '0:a?',
      '-shortest',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      outPath,
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate multicam split-screen at: ${outPath}`);
    }

    return {
      inputVideos: videoPaths,
      outputPath: outPath,
      layout,
      width: layout === 'top-bottom' ? cellW : cellW * 2,
      height: layout === 'side-by-side' ? cellH : cellH * 2,
    };
  }
}
