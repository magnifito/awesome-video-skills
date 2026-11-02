import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface LowerThirdOptions {
  speakerName: string;
  speakerTitle: string;
  startSeconds?: number;
  durationSeconds?: number;
  primaryColor?: string;
  backgroundColor?: string;
  outputPath?: string;
}

export interface LowerThirdResult {
  sourceVideo: string;
  outputPath: string;
  speakerName: string;
  speakerTitle: string;
  startSeconds: number;
  durationSeconds: number;
}

export class LowerThirdGenerator {
  /**
   * Generates and overlays a broadcast-quality lower-third banner onto a video clip.
   */
  static applyLowerThird(videoPath: string, options: LowerThirdOptions): LowerThirdResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const start = options.startSeconds ?? 1.5;
    const duration = options.durationSeconds ?? 5.0;
    const primary = options.primaryColor ?? '#3B82F6';
    const bg = options.backgroundColor ?? '#0F172A';

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-lowerthird.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Generate vector lower-third badge (680x120)
    const svgWidth = 680;
    const svgHeight = 120;
    const svgPath = path.join(parentDir, `lowerthird-${Date.now()}.svg`);
    const pngPath = path.join(parentDir, `lowerthird-${Date.now()}.png`);

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${bg}" stop-opacity="0.95" />
      <stop offset="100%" stop-color="${bg}" stop-opacity="0.75" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" rx="12" fill="url(#grad)" />
  <!-- Brand Accent Pillar -->
  <rect x="0" y="0" width="8" height="${svgHeight}" rx="4" fill="${primary}" />
  <!-- Speaker Name -->
  <text x="36" y="52" fill="#FFFFFF" font-family="sans-serif" font-size="28" font-weight="bold">
    ${options.speakerName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}
  </text>
  <!-- Speaker Title / Role -->
  <text x="36" y="90" fill="${primary}" font-family="sans-serif" font-size="18" font-weight="600" letter-spacing="0.5">
    ${options.speakerTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;')}
  </text>
</svg>`;

    fs.writeFileSync(svgPath, svgContent);
    execSync(`sips -s format png "${svgPath}" --out "${pngPath}"`, { stdio: 'pipe' });

    const end = start + duration;
    const overlayFilter = `overlay=80:H-h-120:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-i "${pngPath}"`,
      `-filter_complex "[0:v][1:v]${overlayFilter}"`,
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
      throw new Error(`Failed to generate lower third video at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      speakerName: options.speakerName,
      speakerTitle: options.speakerTitle,
      startSeconds: start,
      durationSeconds: duration
    };
  }
}

