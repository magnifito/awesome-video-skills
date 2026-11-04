import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runFfmpeg, probe, rasterizeSvg, safeCssColor, escapeXml } from './proc.js';
import { estimateTextWidth, fitFontSize } from './overlay_text.js';

export type SafeZonePlatform = 'tiktok' | 'reels' | 'shorts' | 'generic';

export interface SafeZoneOverlayOptions {
  platform?: SafeZonePlatform;
  strokeColor?: string;
  outputPath?: string;
}

/** Unsafe margins in pixels on a 1080x1920 vertical canvas. */
export interface SafeZoneMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Approximate per-platform UI overlay margins for 1080x1920 vertical video.
 * These are planning guides, not official platform specifications.
 */
export const SAFE_ZONE_MARGINS: Record<SafeZonePlatform, SafeZoneMargins> = {
  tiktok: { top: 120, bottom: 320, left: 60, right: 160 },
  reels: { top: 220, bottom: 420, left: 60, right: 120 },
  shorts: { top: 120, bottom: 380, left: 60, right: 140 },
  generic: { top: 96, bottom: 96, left: 96, right: 96 },
};

const CANVAS_W = 1080;
const CANVAS_H = 1920;

export class SafeZoneOverlayGenerator {
  /**
   * Generates the platform's mobile safe-margin overlay as SVG. Margins are defined on a
   * 1080x1920 canvas and stretched to `width` x `height`; labels are sized from the short side
   * of the frame (min(w, h) / 1080) so they never distort, and sit on dark backings so they read
   * on any footage.
   */
  static generateSvgOverlay(options: SafeZoneOverlayOptions = {}, width = CANVAS_W, height = CANVAS_H): string {
    const stroke = safeCssColor(options.strokeColor ?? '#EF4444');
    const platform = options.platform ?? 'tiktok';
    const base = SAFE_ZONE_MARGINS[platform];
    if (!base) throw new Error(`Unknown safe-zone platform: ${String(platform)}`);
    if (!(width > 0 && height > 0)) throw new Error(`Invalid overlay size ${width}x${height}`);

    const sx = width / CANVAS_W;
    const sy = height / CANVAS_H;
    const s = Math.min(width, height) / 1080;
    const m = { top: base.top * sy, bottom: base.bottom * sy, left: base.left * sx, right: base.right * sx };
    const safeW = width - m.left - m.right;
    const safeH = height - m.top - m.bottom;
    const railX = width - m.right;
    const railCx = railX + m.right / 2;
    const midY = m.top + safeH / 2;
    const r = (n: number) => Math.round(n * 100) / 100;

    /**
     * A label: white bold text on a dark rounded backing, centred on (cx, cy). The font shrinks
     * to fit `maxW` along the text and `maxH` across it. `rotate` turns it 90 degrees.
     */
    const label = (text: string, cx: number, cy: number, preferred: number, maxW: number, maxH: number, opts: { rotate?: boolean; border?: string; anchorLeft?: boolean } = {}): string => {
      const padX = 14 * s;
      const fs1 = fitFontSize(text, preferred * s, maxW - 2 * padX, { bold: true });
      const fontSize = Math.min(fs1, maxH / 1.7);
      const boxW = estimateTextWidth(text, fontSize, { bold: true }) + 2 * padX;
      const boxH = fontSize * 1.6;
      const left = opts.anchorLeft ? cx : cx - boxW / 2;
      const tx = left + boxW / 2;
      const transform = opts.rotate ? ` transform="rotate(90, ${r(cx)}, ${r(cy)})"` : '';
      const border = opts.border ? ` stroke="${opts.border}" stroke-width="${r(2 * s)}"` : '';
      return `<g${transform}>
    <rect x="${r(left)}" y="${r(cy - boxH / 2)}" width="${r(boxW)}" height="${r(boxH)}" rx="${r(boxH / 4)}" fill="rgba(0, 0, 0, 0.72)"${border} />
    <text x="${r(tx)}" y="${r(cy)}" text-anchor="middle" dominant-baseline="central" fill="#FFFFFF" font-family="sans-serif" font-size="${r(fontSize)}" font-weight="bold">${escapeXml(text)}</text>
  </g>`;
    };

    const edge = 16 * s;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Top Unsafe Ticker / Camera Header -->
  <rect x="0" y="0" width="${r(width)}" height="${r(m.top)}" fill="rgba(239, 68, 68, 0.18)" />
  ${label('TOP SAFE MARGIN (Camera Notch & Search Header)', width / 2, m.top / 2, 26, width - 2 * edge, m.top - edge)}

  <!-- Bottom Unsafe Area (Captions & Audio Marquee) -->
  <rect x="0" y="${r(height - m.bottom)}" width="${r(width)}" height="${r(m.bottom)}" fill="rgba(239, 68, 68, 0.18)" />
  ${label('BOTTOM SAFE MARGIN (Captions, Tags & Audio Disc)', width / 2, height - m.bottom / 2, 26, width - 2 * edge, m.bottom - edge)}

  <!-- Left Edge Margin -->
  <rect x="0" y="${r(m.top)}" width="${r(m.left)}" height="${r(safeH)}" fill="rgba(239, 68, 68, 0.08)" />

  <!-- Right Side Interaction Rail -->
  <rect x="${r(railX)}" y="${r(m.top)}" width="${r(m.right)}" height="${r(safeH)}" fill="rgba(239, 68, 68, 0.12)" />
  ${label('RIGHT INTERACTION RAIL', railCx, midY, 22, safeH - 2 * edge, m.right - edge / 2, { rotate: true })}

  <!-- Active Creative Safe Rectangle -->
  <rect x="${r(m.left)}" y="${r(m.top)}" width="${r(safeW)}" height="${r(safeH)}" fill="none" stroke="${stroke}" stroke-width="${r(3 * s)}" stroke-dasharray="${r(10 * s)} ${r(8 * s)}" />
  ${label(`SAFE CONTENT AREA (${Math.round(safeW)} x ${Math.round(safeH)})`, m.left + 24 * s, m.top + 40 * s, 24, safeW - 48 * s, 60 * s, { border: stroke, anchorLeft: true })}
</svg>`;
  }

  /**
   * Overlays safe margin guides onto an input video for QA review.
   * The 1080x1920 guide is scaled to the video's frame size before overlaying.
   */
  static applySafeZoneGuide(videoPath: string, options: SafeZoneOverlayOptions = {}): string {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-safezone-qa.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const tag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const svgPath = path.join(parentDir, `safezone-guide-${tag}.svg`);
    const pngPath = path.join(parentDir, `safezone-guide-${tag}.png`);
    // Draw the guide at the displayed frame size (autorotation is applied to the input by
    // ffmpeg), so labels keep their proportions on any aspect ratio.
    const w = info.displayWidth;
    const h = info.displayHeight;
    fs.writeFileSync(svgPath, this.generateSvgOverlay(options, w, h));

    try {
      rasterizeSvg(svgPath, pngPath, w, h);
      const filter = `[1:v]scale=${w}:${h},format=rgba[g];[0:v][g]overlay=0:0:format=auto[outv]`;
      runFfmpeg([
        '-i', videoPath,
        '-i', pngPath,
        '-filter_complex', filter,
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
      throw new Error(`Failed to generate safezone guide video at: ${outPath}`);
    }

    return outPath;
  }
}
