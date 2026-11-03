import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, runTool, probe } from './proc.js';
import { probeImage } from './visual_diff.js';

export interface SanitizeOptions {
  outputPath?: string;
}

export interface SanitizeResult {
  sourceMedia: string;
  outputPath: string;
  /** True only when a post-run probe finds no identifying container or stream tags. */
  strippedMetadata: boolean;
  /** True only when a post-run probe finds no chapters. */
  strippedChapters: boolean;
  /** Tags that survived sanitization (empty when strippedMetadata is true). */
  remainingTags: string[];
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic']);

/** Technical tags written by muxers that carry no personal or location information. */
const TECHNICAL_TAGS = new Set([
  'major_brand', 'minor_version', 'compatible_brands', 'encoder', 'handler_name', 'vendor_id', 'language',
]);

export class MetadataSanitizer {
  /**
   * Cleans camera metadata, geolocation, author tags, and local paths from deliverable files.
   * All streams (every audio and subtitle track) are kept; data streams are dropped.
   * Images are re-encoded, because EXIF/GPS in JPEG APP segments survives a stream copy.
   */
  static sanitize(mediaPath: string, options: SanitizeOptions = {}): SanitizeResult {
    if (!fs.existsSync(mediaPath)) {
      throw new Error(`Media file not found: ${mediaPath}`);
    }

    const ext = path.extname(mediaPath).toLowerCase();
    const outPath = options.outputPath ?? path.join(
      path.dirname(mediaPath),
      `${path.basename(mediaPath, path.extname(mediaPath))}-sanitized${path.extname(mediaPath)}`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const common = ['-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact'];
    if (IMAGE_EXTENSIONS.has(ext)) {
      runFfmpeg(['-i', mediaPath, ...common, '-frames:v', '1', '-update', '1', outPath]);
    } else {
      runFfmpeg(['-i', mediaPath, '-map', '0', '-map', '-0:d?', ...common, '-c', 'copy', outPath]);
    }

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate sanitized media at: ${outPath}`);
    }

    // Verify the result instead of assuming success.
    const after = (IMAGE_EXTENSIONS.has(ext) ? probeImage(outPath).raw : probe(outPath).raw) as {
      format?: { tags?: Record<string, string> };
      streams?: Array<{ tags?: Record<string, string> }>;
    };
    const remainingTags: string[] = [];
    for (const k of Object.keys(after.format?.tags ?? {})) {
      if (!TECHNICAL_TAGS.has(k.toLowerCase())) remainingTags.push(`format:${k}`);
    }
    (after.streams ?? []).forEach((s, i) => {
      for (const k of Object.keys(s.tags ?? {})) {
        if (!TECHNICAL_TAGS.has(k.toLowerCase())) remainingTags.push(`stream${i}:${k}`);
      }
    });
    const chapterJson = JSON.parse(runTool('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_chapters', outPath])) as { chapters?: unknown[] };
    const chapters = (chapterJson.chapters ?? []).length;

    return {
      sourceMedia: mediaPath,
      outputPath: outPath,
      strippedMetadata: remainingTags.length === 0,
      strippedChapters: chapters === 0,
      remainingTags,
    };
  }
}
