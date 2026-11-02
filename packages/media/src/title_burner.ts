import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface TitleOptions {
  titleText: string;
  subtitleText?: string;
  position?: 'top' | 'center' | 'bottom';
  fontFamily?: string;
  titleColor?: string;
  subtitleColor?: string;
  backgroundColor?: string; // e.g. "rgba(0, 0, 0, 0.7)"
  outputPath?: string;
}

export interface TitleResult {
  sourceVideo: string;
  outputPath: string;
  titleText: string;
  position: 'top' | 'center' | 'bottom';
  width: number;
  height: number;
}

export class TitleBurner {
  /**
   * Generates a title card SVG overlay.
   */
  static generateTitleSvg(width: number, height: number, options: TitleOptions): string {
    const position = options.position ?? 'center';
    const font = options.fontFamily ?? 'Inter, sans-serif';
    const titleColor = options.titleColor ?? '#FFFFFF';
    const subColor = options.subtitleColor ?? '#94A3B8';
    const bgColor = options.backgroundColor ?? 'rgba(15, 23, 42, 0.85)';

    let cardY = height / 2 - 80;
    if (position === 'top') cardY = 100;
    if (position === 'bottom') cardY = height - 260;

    const cardW = Math.min(width * 0.85, 1200);
    const cardH = options.subtitleText ? 160 : 110;
    const cardX = (width - cardW) / 2;

    const titleY = cardY + (options.subtitleText ? 65 : 68);
    const subY = cardY + 120;
    const textCenterX = width / 2;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.4" />
    </filter>
  </defs>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${bgColor}" filter="url(#shadow)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5" />
  <text x="${textCenterX}" y="${titleY}" text-anchor="middle" font-family="${font}" font-size="36" font-weight="700" fill="${titleColor}" letter-spacing="-0.5">${options.titleText}</text>
  ${options.subtitleText ? `<text x="${textCenterX}" y="${subY}" text-anchor="middle" font-family="${font}" font-size="20" font-weight="500" fill="${subColor}">${options.subtitleText}</text>` : ''}
</svg>`;
  }

  /**
   * Burns high-resolution typographic title card onto video frames.
   */
  static burnTitle(videoPath: string, options: TitleOptions): TitleResult {
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

    const position = options.position ?? 'center';
    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-title-${position}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const svgContent = this.generateTitleSvg(w, h, options);
    const svgPath = path.join(parentDir, `tmp-title-${Date.now()}.svg`);
    const pngPath = path.join(parentDir, `tmp-title-${Date.now()}.png`);

    fs.writeFileSync(svgPath, svgContent, 'utf8');
    execSync(`sips -s format png "${svgPath}" --out "${pngPath}"`, { stdio: 'pipe' });

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-i "${pngPath}"`,
      '-filter_complex "[0:v][1:v]overlay=0:0"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a copy',
      `"${outPath}"`
    ].join(' ');

    try {
      execSync(cmd, { stdio: 'pipe' });
    } finally {
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
      if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate title-burned video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      titleText: options.titleText,
      position,
      width: w,
      height: h
    };
  }
}

