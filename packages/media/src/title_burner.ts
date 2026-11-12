import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import { runFfmpeg, probe, rasterizeSvg, escapeXml } from './proc.js';
import { fitFontSize, fontFileEnv } from './overlay_text.js';

export interface TitleOptions {
  titleText: string;
  subtitleText?: string;
  position?: 'top' | 'center' | 'bottom';
  /** CSS font family. Default: "Inter, sans-serif", or the family of `fontFile` when one is given. */
  fontFamily?: string;
  /** A .ttf/.otf file made visible to the rasterizer (rsvg-convert via fontconfig) for this render. */
  fontFile?: string;
  titleColor?: string;
  subtitleColor?: string;
  backgroundColor?: string; // e.g. "rgba(0, 0, 0, 0.7)"
  /** Optional accent stripe along the top edge of the card. No stripe when unset. */
  accentColor?: string;
  /** Title font size in px on a 1080p frame (scaled with the frame). Default 36. */
  titleSize?: number;
  /** Subtitle font size in px on a 1080p frame (scaled with the frame). Default 20. */
  subtitleSize?: number;
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
    const accent = options.accentColor ? svgColor(options.accentColor) : undefined;
    const baseTitle = options.titleSize ?? 36;
    const baseSub = options.subtitleSize ?? 20;
    if (!(Number.isFinite(baseTitle) && baseTitle > 0)) throw new Error(`titleSize must be a positive number, got ${baseTitle}`);
    if (!(Number.isFinite(baseSub) && baseSub > 0)) throw new Error(`subtitleSize must be a positive number, got ${baseSub}`);

    // The card is designed at 1080p and scales with the short side of the frame, like the
    // lower third. At 1080p with default sizes the geometry matches the original fixed card.
    const s = Math.min(width, height) / 1080;
    const hasSub = Boolean(options.subtitleText);
    const cardW = Math.min(width * 0.85, 1200 * s);
    const cardX = (width - cardW) / 2;
    // Shrink a line that would overrun the card (estimated width) instead of letting it clip.
    const textMaxW = cardW - 64 * s;
    const titleSize = fitFontSize(options.titleText, baseTitle * s, textMaxW, { bold: true });
    const subSize = hasSub ? fitFontSize(options.subtitleText ?? '', baseSub * s, textMaxW) : 0;

    // Vertical layout: fixed paddings (scaled) around the two baselines.
    const titleOff = hasSub ? 29 * s + titleSize : 32 * s + titleSize;
    const subOff = titleOff + 35 * s + subSize;
    const cardH = hasSub ? subOff + 40 * s : titleOff + 42 * s;
    const baseCardH = (hasSub ? 29 + 36 + 35 + 20 + 40 : 32 + 36 + 42) * s;
    const grow = cardH - baseCardH;

    let cardY = height / 2 - 80 * s - grow / 2;
    if (position === 'top') cardY = 100 * s;
    if (position === 'bottom') cardY = height - 260 * s - grow;

    const titleY = cardY + titleOff;
    const subY = cardY + subOff;
    const textCenterX = width / 2;
    const rx = 16 * s;
    const r = (n: number) => Math.round(n * 100) / 100;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${r(12 * s)}"/><feOffset dx="0" dy="${r(8 * s)}" result="o"/><feFlood flood-color="#000000" flood-opacity="0.4"/><feComposite in2="o" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="card"><rect x="${r(cardX)}" y="${r(cardY)}" width="${r(cardW)}" height="${r(cardH)}" rx="${r(rx)}" /></clipPath>
  </defs>
  <rect x="${r(cardX)}" y="${r(cardY)}" width="${r(cardW)}" height="${r(cardH)}" rx="${r(rx)}" fill="${bgColor}" filter="url(#shadow)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="${r(1.5 * s)}" />
  ${accent ? `<rect x="${r(cardX)}" y="${r(cardY)}" width="${r(cardW)}" height="${r(6 * s)}" fill="${accent}" clip-path="url(#card)" />` : ''}
  <text x="${r(textCenterX)}" y="${r(titleY)}" text-anchor="middle" font-family="${font}" font-size="${r(titleSize)}" font-weight="700" fill="${titleColor}" letter-spacing="${r(-0.5 * s)}">${escapeXml(options.titleText)}</text>
  ${hasSub ? `<text x="${r(textCenterX)}" y="${r(subY)}" text-anchor="middle" font-family="${font}" font-size="${r(subSize)}" font-weight="500" fill="${subColor}">${escapeXml(options.subtitleText ?? '')}</text>` : ''}
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

    // A font file is exposed to the rasterizer through a private fontconfig file.
    let fontEnv: NodeJS.ProcessEnv | undefined;
    let fontDir: string | undefined;
    let svgOptions = options;
    if (options.fontFile) {
      fontDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-title-font-'));
      try {
        const { env, family } = fontFileEnv(options.fontFile, fontDir);
        fontEnv = env;
        if (!options.fontFamily) {
          if (!family) throw new Error(`Could not read the family name of ${options.fontFile}; pass fontFamily as well`);
          svgOptions = { ...options, fontFamily: `${family}, sans-serif` };
        }
      } catch (err) {
        fs.rmSync(fontDir, { recursive: true, force: true });
        throw err;
      }
    }

    const svgContent = this.generateTitleSvg(w, h, svgOptions);
    const tag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const svgPath = path.join(parentDir, `tmp-title-${tag}.svg`);
    const pngPath = path.join(parentDir, `tmp-title-${tag}.png`);
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    try {
      rasterizeSvg(svgPath, pngPath, w, h, fontEnv);
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
      if (fontDir) fs.rmSync(fontDir, { recursive: true, force: true });
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
