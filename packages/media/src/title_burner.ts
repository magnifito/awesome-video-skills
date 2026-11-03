import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runFfmpeg, probe, rasterizeSvg, escapeXml } from './proc.js';

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

/** Accepts #hex, rgb()/rgba() and plain named colors; rejects anything that could break out of an SVG attribute. */
function svgColor(input: string): string {
  const c = input.trim();
  if (
    /^#[0-9a-fA-F]{3,8}$/.test(c) ||
    /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(c) ||
    /^[a-zA-Z]{3,20}$/.test(c)
  ) {
    return c;
  }
  throw new Error(`Invalid color value: ${JSON.stringify(input)}`);
}

export class TitleBurner {
  /**
   * Generates a title card SVG overlay. All user text is XML-escaped.
   */
  static generateTitleSvg(width: number, height: number, options: TitleOptions): string {
    const position = options.position ?? 'center';
    if (!['top', 'center', 'bottom'].includes(position)) throw new Error(`Unsupported title position: ${String(position)}`);
    const font = escapeXml(options.fontFamily ?? 'Inter, sans-serif');
    const titleColor = svgColor(options.titleColor ?? '#FFFFFF');
    const subColor = svgColor(options.subtitleColor ?? '#94A3B8');
    const bgColor = svgColor(options.backgroundColor ?? 'rgba(15, 23, 42, 0.85)');

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
  <text x="${textCenterX}" y="${titleY}" text-anchor="middle" font-family="${font}" font-size="36" font-weight="700" fill="${titleColor}" letter-spacing="-0.5">${escapeXml(options.titleText)}</text>
  ${options.subtitleText ? `<text x="${textCenterX}" y="${subY}" text-anchor="middle" font-family="${font}" font-size="20" font-weight="500" fill="${subColor}">${escapeXml(options.subtitleText)}</text>` : ''}
</svg>`;
  }

  /**
   * Burns a high-resolution typographic title card onto video frames.
   */
  static burnTitle(videoPath: string, options: TitleOptions): TitleResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (!options.titleText || !options.titleText.trim()) {
      throw new Error('titleText must not be empty');
    }

    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    // Use the displayed (rotation-corrected) size: that is the frame the overlay lands on.
    const w = info.displayWidth;
    const h = info.displayHeight;

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
    const tag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const svgPath = path.join(parentDir, `tmp-title-${tag}.svg`);
    const pngPath = path.join(parentDir, `tmp-title-${tag}.png`);
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    try {
      rasterizeSvg(svgPath, pngPath, w, h);
      runFfmpeg([
        '-i', videoPath,
        '-i', pngPath,
        '-filter_complex', `[1:v]scale=${w}:${h},format=rgba[t];[0:v][t]overlay=0:0:format=auto[outv]`,
        '-map', '[outv]', '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        outPath,
      ]);
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
