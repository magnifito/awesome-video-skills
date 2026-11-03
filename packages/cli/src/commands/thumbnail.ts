import fs from 'node:fs';
import { findLatestMaster } from './_shared.js';
import { ThumbnailGenerator, type ThumbnailResult, type ThumbnailOptions } from '../../../media/src/thumbnail.js';

export async function runThumbnail(
  mediaOrProjectPath: string,
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult> {
  let targetVideo = mediaOrProjectPath;
  if (fs.existsSync(mediaOrProjectPath) && fs.statSync(mediaOrProjectPath).isDirectory()) {
    // Rendered masters are written as runs/<runId>/final_output_<runId>.<ext>
    const found = findLatestMaster(mediaOrProjectPath);
    if (!found) {
      throw new Error(`Could not find a rendered video in project: ${mediaOrProjectPath}`);
    }
    targetVideo = found;
  }

  return ThumbnailGenerator.extractThumbnail(targetVideo, options);
}

