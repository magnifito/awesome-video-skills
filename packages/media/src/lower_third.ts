import { probe, runFfmpeg, rasterizeSvg, safeCssColor, escapeXml, requirePositive } from './proc.js';
import path from 'node:path';
import fs from 'node:fs';

export interface LowerThirdOptions {
  speakerName: string;
  speakerTitle: string;
  startSeconds?: number;
  durationSeconds?: number;
  primaryColor?: string;
  backgroundColor?: string;
  /**
   * Gap between the bottom edge of the frame and the badge, in pixels. Default: 120 px at
   * 1080p, scaled with the frame and never inside the 5% title-safe margin.
   */
  bottomMargin?: number;
  outputPath?: string;
}

export interface LowerThirdResult {
  sourceVideo: string;
  outputPath: string;
  speakerName: string;
  speakerTitle: string;
  startSeconds: number;
  durationSeconds: number;
}

export class LowerThirdGenerator {
  /**
   * Generates and overlays a broadcast-quality lower-third banner onto a video clip.
   */
  static applyLowerThird(videoPath: string, options: LowerThirdOptions): LowerThirdResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const start = options.startSeconds ?? 1.5;
    const duration = options.durationSeconds ?? 5.0;
    const primary = safeCssColor(options.primaryColor ?? '#3B82F6');
    const bg = safeCssColor(options.backgroundColor ?? '#0F172A');
    if (!(start >= 0)) throw new Error(`startSeconds must be >= 0, got ${start}`);
    requirePositive(duration, 'durationSeconds');
    if (options.bottomMargin !== undefined && !(Number.isFinite(options.bottomMargin) && options.bottomMargin >= 0)) {
      throw new Error(`bottomMargin must be >= 0, got ${options.bottomMargin}`);
    }

    // The badge is designed at 1080p and scales with the short side of the frame. Its left
    // edge and default bottom gap stay outside the 5% title-safe margin at every size.
    const { width: frameW, height: frameH } = probe(videoPath);
    if (!frameW || !frameH) throw new Error(`No video stream in ${videoPath}`);
    const scale = Math.min(frameW, frameH) / 1080;
    const left = Math.max(Math.round(80 * scale), Math.ceil(frameW * 0.05));
    const bottom = options.bottomMargin ?? Math.max(Math.round(120 * scale), Math.ceil(frameH * 0.05));

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-lowerthird.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Vector lower-third badge, 680x120 at 1080p.
    const svgWidth = Math.round(680 * scale);
    const svgHeight = Math.round(120 * scale);
    const stamp = `${process.pid}-${Date.now()}`;
    const svgPath = path.join(parentDir, `lowerthird-${stamp}.svg`);
    const pngPath = path.join(parentDir, `lowerthird-${stamp}.png`);

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 680 120">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${bg}" stop-opacity="0.95" />
      <stop offset="100%" stop-color="${bg}" stop-opacity="0.75" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="680" height="120" rx="12" fill="url(#grad)" />
  <!-- Brand Accent Pillar -->
  <rect x="0" y="0" width="8" height="120" rx="4" fill="${primary}" />
  <!-- Speaker Name -->
  <text x="36" y="52" fill="#FFFFFF" font-family="sans-serif" font-size="28" font-weight="bold">
    ${escapeXml(options.speakerName)}
  </text>
  <!-- Speaker Title / Role -->
  <text x="36" y="90" fill="${primary}" font-family="sans-serif" font-size="18" font-weight="600" letter-spacing="0.5">
    ${escapeXml(options.speakerTitle)}
  </text>
</svg>`;

    const end = start + duration;
    const overlayFilter = `overlay=${left}:H-h-${Math.round(bottom)}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;

    try {
      fs.writeFileSync(svgPath, svgContent);
      rasterizeSvg(svgPath, pngPath, svgWidth, svgHeight);
      runFfmpeg([
        '-i', videoPath,
        '-i', pngPath,
        '-filter_complex', `[0:v][1:v]${overlayFilter}[outv]`,
        '-map', '[outv]',
        '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        outPath
      ]);
    } finally {
      fs.rmSync(svgPath, { force: true });
      fs.rmSync(pngPath, { force: true });
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate lower third video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      speakerName: options.speakerName,
      speakerTitle: options.speakerTitle,
      startSeconds: start,
      durationSeconds: duration
    };
  }
}

