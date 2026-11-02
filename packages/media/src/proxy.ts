import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export type ProxyResolution = '540p' | '720p' | '360p';

export interface ProxyOptions {
  resolution?: ProxyResolution;
  outputPath?: string;
}

export interface ProxyResult {
  masterPath: string;
  proxyPath: string;
  resolution: ProxyResolution;
  masterSizeBytes: number;
  proxySizeBytes: number;
  compressionRatio: number;
}

export class ProxyGenerator {
  /**
   * Transcodes a master video into a lightweight proxy for fast playback and low-latency editing.
   */
  static generateProxy(videoPath: string, options: ProxyOptions = {}): ProxyResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Master video file not found: ${videoPath}`);
    }

    const resolution = options.resolution ?? '540p';
    const scaleFilter = resolution === '360p'
      ? 'scale=w=640:h=360:force_original_aspect_ratio=decrease'
      : resolution === '720p'
      ? 'scale=w=1280:h=720:force_original_aspect_ratio=decrease'
      : 'scale=w=960:h=540:force_original_aspect_ratio=decrease';

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-proxy-${resolution}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-vf "${scaleFilter}"`,
      '-c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p',
      '-c:a aac -b:a 96k',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate proxy video at: ${outPath}`);
    }

    const masterStat = fs.statSync(videoPath);
    const proxyStat = fs.statSync(outPath);
    const compressionRatio = parseFloat((proxyStat.size / masterStat.size).toFixed(3));

    // Update or create proxy manifest in parent directory
    const manifestPath = path.join(parentDir, 'proxy-manifest.json');
    let manifestData: Record<string, unknown> = {};
    if (fs.existsSync(manifestPath)) {
      try {
        manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        manifestData = {};
      }
    }

    manifestData[path.basename(videoPath)] = {
      master_file: path.basename(videoPath),
      proxy_file: path.basename(outPath),
      resolution,
      compression_ratio: compressionRatio,
      generated_at: new Date().toISOString()
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

    return {
      masterPath: videoPath,
      proxyPath: outPath,
      resolution,
      masterSizeBytes: masterStat.size,
      proxySizeBytes: proxyStat.size,
      compressionRatio
    };
  }
}

