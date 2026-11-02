import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface SanitizeOptions {
  outputPath?: string;
}

export interface SanitizeResult {
  sourceMedia: string;
  outputPath: string;
  strippedMetadata: boolean;
  strippedChapters: boolean;
}

export class MetadataSanitizer {
  /**
   * Cleans sensitive camera metadata, geolocation, author tags, and local paths from deliverable files.
   */
  static sanitize(mediaPath: string, options: SanitizeOptions = {}): SanitizeResult {
    if (!fs.existsSync(mediaPath)) {
      throw new Error(`Media file not found: ${mediaPath}`);
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(mediaPath),
      `${path.basename(mediaPath, path.extname(mediaPath))}-sanitized${path.extname(mediaPath)}`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const cmd = [
      'ffmpeg -y',
      `-i "${mediaPath}"`,
      '-map_metadata -1',
      '-map_chapters -1',
      '-c copy',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate sanitized media at: ${outPath}`);
    }

    return {
      sourceMedia: mediaPath,
      outputPath: outPath,
      strippedMetadata: true,
      strippedChapters: true
    };
  }
}

