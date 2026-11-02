import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface GridGuideOptions {
  type?: 'rule_of_thirds' | 'golden_ratio' | 'center_crosshair';
  color?: string;
  outputPath?: string;
}

export class CompositionGridGenerator {
  /**
   * Generates a 1920x1080 or 1080x1920 SVG composition grid guide.
   */
  static generateGridSvg(width = 1920, height = 1080, options: GridGuideOptions = {}): string {
    const color = options.color ?? '#3B82F6';
    const x1 = (width / 3).toFixed(1);
    const x2 = ((2 * width) / 3).toFixed(1);
    const y1 = (height / 3).toFixed(1);
    const y2 = ((2 * height) / 3).toFixed(1);
    const cx = (width / 2).toFixed(1);
    const cy = (height / 2).toFixed(1);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Rule of Thirds Vertical Lines -->
  <line x1="${x1}" y1="0" x2="${x1}" y2="${height}" stroke="${color}" stroke-width="2" stroke-opacity="0.6" stroke-dasharray="6 4" />
  <line x1="${x2}" y1="0" x2="${x2}" y2="${height}" stroke="${color}" stroke-width="2" stroke-opacity="0.6" stroke-dasharray="6 4" />

  <!-- Rule of Thirds Horizontal Lines -->
  <line x1="0" y1="${y1}" x2="${width}" y2="${y1}" stroke="${color}" stroke-width="2" stroke-opacity="0.6" stroke-dasharray="6 4" />
  <line x1="0" y1="${y2}" x2="${width}" y2="${y2}" stroke="${color}" stroke-width="2" stroke-opacity="0.6" stroke-dasharray="6 4" />

  <!-- Center Crosshairs -->
  <circle cx="${cx}" cy="${cy}" r="16" fill="none" stroke="${color}" stroke-width="2" stroke-opacity="0.8" />
  <line x1="${Number(cx) - 30}" y1="${cy}" x2="${Number(cx) + 30}" y2="${cy}" stroke="${color}" stroke-width="2" stroke-opacity="0.8" />
  <line x1="${cx}" y1="${Number(cy) - 30}" x2="${cx}" y2="${Number(cy) + 30}" stroke="${color}" stroke-width="2" stroke-opacity="0.8" />
</svg>`;
  }

  /**
   * Overlays the composition grid onto a video file for creative framing review.
   */
  static applyGrid(videoPath: string, options: GridGuideOptions = {}): string {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-grid-guide.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    let w = 1920;
    let h = 1080;
    try {
      const probeOut = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`, {
        encoding: 'utf8'
      }).trim();
      const parts = probeOut.split('x').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        w = parts[0];
        h = parts[1];
      }
    } catch {
      // fallback
    }

    const svgContent = this.generateGridSvg(w, h, options);
    const svgPath = path.join(parentDir, `grid-${Date.now()}.svg`);
    const pngPath = path.join(parentDir, `grid-${Date.now()}.png`);
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
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
      if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate grid video at: ${outPath}`);
    }

    return outPath;
  }
}

