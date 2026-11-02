import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface SafeZoneOverlayOptions {
  platform?: 'tiktok' | 'reels' | 'shorts' | 'generic';
  strokeColor?: string;
  outputPath?: string;
}

export class SafeZoneOverlayGenerator {
  /**
   * Generates a 1080x1920 SVG overlay representing mobile safe margins.
   */
  static generateSvgOverlay(options: SafeZoneOverlayOptions = {}): string {
    const stroke = options.strokeColor ?? '#EF4444';
    // Platform safe boundary rect: x=60, y=120, w=1080-60-160=860, h=1920-120-320=1480
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <!-- Top Unsafe Ticker / Camera Header -->
  <rect x="0" y="0" width="1080" height="120" fill="rgba(239, 68, 68, 0.18)" />
  <text x="540" y="70" text-anchor="middle" fill="#FCA5A5" font-family="sans-serif" font-size="20">
    TOP SAFE MARGIN (Camera Notch &amp; Search Header)
  </text>

  <!-- Bottom Unsafe Area (Captions & Audio Marquee) -->
  <rect x="0" y="1600" width="1080" height="320" fill="rgba(239, 68, 68, 0.18)" />
  <text x="540" y="1760" text-anchor="middle" fill="#FCA5A5" font-family="sans-serif" font-size="20">
    BOTTOM SAFE MARGIN (Captions, Tags &amp; Audio Disc)
  </text>

  <!-- Right Side Interaction Rail -->
  <rect x="920" y="120" width="160" height="1480" fill="rgba(239, 68, 68, 0.12)" />
  <text x="1000" y="800" text-anchor="middle" fill="#FCA5A5" font-family="sans-serif" font-size="16" transform="rotate(90, 1000, 800)">
    RIGHT INTERACTION RAIL
  </text>

  <!-- Active Creative Safe Rectangle -->
  <rect x="60" y="120" width="860" height="1480" fill="none" stroke="${stroke}" stroke-width="3" stroke-dasharray="10 8" />
  <text x="100" y="160" fill="${stroke}" font-family="sans-serif" font-size="22" font-weight="bold">
    SAFE CONTENT AREA (860 x 1480)
  </text>
</svg>`;
  }

  /**
   * Overlays the safe margin guides onto an input video for QA review.
   */
  static applySafeZoneGuide(videoPath: string, options: SafeZoneOverlayOptions = {}): string {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-safezone-qa.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const svgContent = this.generateSvgOverlay(options);
    const svgPath = path.join(parentDir, `safezone-guide-${Date.now()}.svg`);
    const pngPath = path.join(parentDir, `safezone-guide-${Date.now()}.png`);
    fs.writeFileSync(svgPath, svgContent);
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
      if (fs.existsSync(svgPath)) {
        fs.unlinkSync(svgPath);
      }
      if (fs.existsSync(pngPath)) {
        fs.unlinkSync(pngPath);
      }
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate safezone guide video at: ${outPath}`);
    }

    return outPath;
  }
}

