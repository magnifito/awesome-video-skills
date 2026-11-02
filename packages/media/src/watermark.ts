import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export type WatermarkPosition = 'top_right' | 'center' | 'bottom_right';

export interface WatermarkOptions {
  text?: string;
  reviewer?: string;
  position?: WatermarkPosition;
  opacity?: number;
  outputPath?: string;
}

export interface WatermarkResult {
  sourceVideo: string;
  outputPath: string;
  text: string;
  position: WatermarkPosition;
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

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-watermarked.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Generate SVG watermark banner
    const svgWidth = 480;
    const svgHeight = 60;
    const svgPath = path.join(parentDir, `watermark-${Date.now()}.svg`);
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="rgba(15, 23, 42, ${opacity.toFixed(2)})" rx="8" />
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle"
        fill="#F87171" font-family="sans-serif" font-size="14" font-weight="bold" letter-spacing="1">
    ${fullText.replace(/&/g, '&amp;').replace(/</g, '&lt;')}
  </text>
</svg>`;

    fs.writeFileSync(svgPath, svgContent);

    // Rasterize SVG to PNG for native FFmpeg compatibility
    const pngPath = path.join(parentDir, `watermark-${Date.now()}.png`);
    execSync(`sips -s format png "${svgPath}" --out "${pngPath}"`, { stdio: 'pipe' });

    // Position overlay coords
    let overlayExpr = 'W-w-40:40';
    if (position === 'center') {
      overlayExpr = '(W-w)/2:(H-h)/2';
    } else if (position === 'bottom_right') {
      overlayExpr = 'W-w-40:H-h-120';
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-i "${pngPath}"`,
      `-filter_complex "[0:v][1:v]overlay=${overlayExpr}"`,
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    try {
      execSync(cmd, { stdio: 'pipe' });
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
      position
    };
  }
}

