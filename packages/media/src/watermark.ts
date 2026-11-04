import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runFfmpeg, probe, rasterizeSvg, escapeXml, safeCssColor } from './proc.js';
import { estimateTextWidth, fitFontSize } from './overlay_text.js';

export type WatermarkPosition = 'top_right' | 'center' | 'bottom_right';

export interface WatermarkOptions {
  text?: string;
  reviewer?: string;
  position?: WatermarkPosition;
  /** Opacity of the dark banner behind the text, 0..1. Default 0.45. The text stays opaque. */
  opacity?: number;
  /** Text colour (#hex or a CSS colour name). Default #F87171. */
  textColor?: string;
  /** Font size in px on a 1080p frame (scaled with the frame). Default 20. */
  fontSize?: number;
  outputPath?: string;
}

export interface WatermarkResult {
  sourceVideo: string;
  outputPath: string;
  text: string;
  position: WatermarkPosition;
  /** Banner size in output pixels. */
  bannerWidth: number;
  bannerHeight: number;
  /** Font size actually used, in output pixels (after scaling and fit-to-frame). */
  fontSize: number;
}

export class SecurityWatermarker {
  /**
   * Burns a semi-transparent security watermark banner into a video for confidential client review.
   */
  static applyWatermark(videoPath: string, options: WatermarkOptions = {}): WatermarkResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const text = options.text ?? 'CONFIDENTIAL - REVIEW ONLY';
    const reviewer = options.reviewer ? ` [Reviewer: ${options.reviewer}]` : '';
    const fullText = `${text}${reviewer}`;
    const position = options.position ?? 'top_right';
    const opacity = options.opacity ?? 0.45;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new Error(`opacity must be in [0, 1], got ${opacity}`);
    }
    if (!['top_right', 'center', 'bottom_right'].includes(position)) {
      throw new Error(`Unsupported watermark position: ${String(position)}`);
    }
    const textColor = safeCssColor(options.textColor ?? '#F87171');
    const baseFont = options.fontSize ?? 20;
    if (!(Number.isFinite(baseFont) && baseFont > 0)) throw new Error(`fontSize must be a positive number, got ${baseFont}`);
    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    const frameW = info.displayWidth;
    const frameH = info.displayHeight;
    const tag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-watermarked.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // The banner is designed at 1080p and scales with the short side of the frame. Its width
    // follows the (estimated) text width; text that would not fit inside the frame margins is
    // shrunk instead of clipped.
    const s = Math.min(frameW, frameH) / 1080;
    const margin = Math.round(40 * s);
    const padX = 24 * s;
    const letterSpacing = 1 * s;
    const maxBannerW = frameW - 2 * margin;
    const fontSize = fitFontSize(fullText, baseFont * s, maxBannerW - 2 * padX, { bold: true, letterSpacing });
    const svgWidth = Math.min(maxBannerW, Math.ceil(estimateTextWidth(fullText, fontSize, { bold: true, letterSpacing }) + 2 * padX));
    const svgHeight = Math.ceil(Math.max(60 * s, fontSize * 2.4));
    const svgPath = path.join(parentDir, `watermark-${tag}.svg`);
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="rgba(15, 23, 42, ${opacity.toFixed(2)})" rx="${(8 * s).toFixed(2)}" />
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle"
        fill="${textColor}" font-family="sans-serif" font-size="${fontSize.toFixed(2)}" font-weight="bold" letter-spacing="${letterSpacing.toFixed(2)}">${escapeXml(fullText)}</text>
</svg>`;

    fs.writeFileSync(svgPath, svgContent);

    // Rasterize SVG to PNG for native FFmpeg compatibility
    const pngPath = path.join(parentDir, `watermark-${tag}.png`);

    // Position overlay coords
    let overlayExpr = `W-w-${margin}:${margin}`;
    if (position === 'center') {
      overlayExpr = '(W-w)/2:(H-h)/2';
    } else if (position === 'bottom_right') {
      overlayExpr = `W-w-${margin}:H-h-${Math.round(120 * s)}`;
    }

    try {
      rasterizeSvg(svgPath, pngPath, svgWidth, svgHeight);
      runFfmpeg([
        '-i', videoPath,
        '-i', pngPath,
        '-filter_complex', `[0:v][1:v]overlay=${overlayExpr}[outv]`,
        '-map', '[outv]', '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        outPath,
      ]);
    } finally {
      if (fs.existsSync(svgPath)) {
        fs.unlinkSync(svgPath);
      }
      if (fs.existsSync(pngPath)) {
        fs.unlinkSync(pngPath);
      }
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate watermarked video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      text: fullText,
      position,
      bannerWidth: svgWidth,
      bannerHeight: svgHeight,
      fontSize,
    };
  }
}

