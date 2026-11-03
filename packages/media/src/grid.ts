import { runFfmpeg, probe, rasterizeSvg, safeCssColor } from './proc.js';
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
    const color = safeCssColor(options.color ?? '#3B82F6');
    const type = options.type ?? 'rule_of_thirds';
    const line = (x1: number, y1: number, x2: number, y2: number, opacity = 0.6, dash = true): string =>
      `  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-opacity="${opacity}"${dash ? ' stroke-dasharray="6 4"' : ''} />`;
    const cx = width / 2;
    const cy = height / 2;
    const parts: string[] = [];

    if (type === 'rule_of_thirds') {
      parts.push('  <!-- Rule of Thirds -->');
      for (const f of [1 / 3, 2 / 3]) {
        parts.push(line(width * f, 0, width * f, height));
        parts.push(line(0, height * f, width, height * f));
      }
    } else if (type === 'golden_ratio') {
      // Phi grid: lines at 1/phi^2 (0.382) and 1/phi (0.618) of each axis.
      const phiInv = 2 / (1 + Math.sqrt(5));
      parts.push('  <!-- Golden Ratio (Phi Grid) -->');
      for (const f of [1 - phiInv, phiInv]) {
        parts.push(line(width * f, 0, width * f, height));
        parts.push(line(0, height * f, width, height * f));
      }
    } else if (type === 'center_crosshair') {
      parts.push('  <!-- Center Crosshair -->');
      parts.push(`  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="16" fill="none" stroke="${color}" stroke-width="2" stroke-opacity="0.8" />`);
      parts.push(line(cx - 30, cy, cx + 30, cy, 0.8, false));
      parts.push(line(cx, cy - 30, cx, cy + 30, 0.8, false));
    } else {
      throw new Error(`Unknown grid type: ${JSON.stringify(type)}`);
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${parts.join('\n')}
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

    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    const w = info.displayWidth;
    const h = info.displayHeight;

    const svgContent = this.generateGridSvg(w, h, options);
    const stamp = `${process.pid}-${Date.now()}`;
    const svgPath = path.join(parentDir, `grid-${stamp}.svg`);
    const pngPath = path.join(parentDir, `grid-${stamp}.png`);

    try {
      fs.writeFileSync(svgPath, svgContent);
      rasterizeSvg(svgPath, pngPath, w, h);
      runFfmpeg([
        '-i', videoPath,
        '-i', pngPath,
        '-filter_complex', `[1:v]scale=${w}:${h}[g];[0:v][g]overlay=0:0[outv]`,
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
      throw new Error(`Failed to generate grid video at: ${outPath}`);
    }

    return outPath;
  }
}

