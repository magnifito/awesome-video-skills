import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runFfmpeg, probe, rasterizeSvg, safeCssColor } from './proc.js';

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
   * Generates a 1080x1920 SVG overlay representing the platform's mobile safe margins.
   */
  static generateSvgOverlay(options: SafeZoneOverlayOptions = {}): string {
    const stroke = safeCssColor(options.strokeColor ?? '#EF4444');
    const platform = options.platform ?? 'tiktok';
    const m = SAFE_ZONE_MARGINS[platform];
    if (!m) throw new Error(`Unknown safe-zone platform: ${String(platform)}`);

    const safeW = CANVAS_W - m.left - m.right;
    const safeH = CANVAS_H - m.top - m.bottom;
    const railX = CANVAS_W - m.right;
    const railCx = railX + m.right / 2;
    const midY = m.top + safeH / 2;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  <!-- Top Unsafe Ticker / Camera Header -->
  <rect x="0" y="0" width="${CANVAS_W}" height="${m.top}" fill="rgba(239, 68, 68, 0.18)" />
  <text x="${CANVAS_W / 2}" y="${Math.max(30, m.top / 2 + 10)}" text-anchor="middle" fill="#FCA5A5" font-family="sans-serif" font-size="20">
    TOP SAFE MARGIN (Camera Notch &amp; Search Header)
  </text>

  <!-- Bottom Unsafe Area (Captions & Audio Marquee) -->
  <rect x="0" y="${CANVAS_H - m.bottom}" width="${CANVAS_W}" height="${m.bottom}" fill="rgba(239, 68, 68, 0.18)" />
  <text x="${CANVAS_W / 2}" y="${CANVAS_H - m.bottom / 2}" text-anchor="middle" fill="#FCA5A5" font-family="sans-serif" font-size="20">
    BOTTOM SAFE MARGIN (Captions, Tags &amp; Audio Disc)
  </text>

  <!-- Left Edge Margin -->
  <rect x="0" y="${m.top}" width="${m.left}" height="${safeH}" fill="rgba(239, 68, 68, 0.08)" />

  <!-- Right Side Interaction Rail -->
  <rect x="${railX}" y="${m.top}" width="${m.right}" height="${safeH}" fill="rgba(239, 68, 68, 0.12)" />
  <text x="${railCx}" y="${midY}" text-anchor="middle" fill="#FCA5A5" font-family="sans-serif" font-size="16" transform="rotate(90, ${railCx}, ${midY})">
    RIGHT INTERACTION RAIL
  </text>

  <!-- Active Creative Safe Rectangle -->
  <rect x="${m.left}" y="${m.top}" width="${safeW}" height="${safeH}" fill="none" stroke="${stroke}" stroke-width="3" stroke-dasharray="10 8" />
  <text x="${m.left + 40}" y="${m.top + 40}" fill="${stroke}" font-family="sans-serif" font-size="22" font-weight="bold">
    SAFE CONTENT AREA (${safeW} x ${safeH})
  </text>
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
    fs.writeFileSync(svgPath, this.generateSvgOverlay(options));

    try {
      rasterizeSvg(svgPath, pngPath, CANVAS_W, CANVAS_H);
      // Scale the guide to the displayed frame size (autorotation is applied to the input by ffmpeg).
      const filter = `[1:v]scale=${info.displayWidth}:${info.displayHeight},format=rgba[g];[0:v][g]overlay=0:0:format=auto[outv]`;
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
