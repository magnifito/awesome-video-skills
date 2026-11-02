import path from 'node:path';
import fs from 'node:fs';
import { ThumbnailGenerator, type ThumbnailResult, type ThumbnailOptions } from '../../../media/src/thumbnail.js';

export async function runThumbnail(
  mediaOrProjectPath: string,
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult> {
  let targetVideo = mediaOrProjectPath;
  if (fs.existsSync(mediaOrProjectPath) && fs.statSync(mediaOrProjectPath).isDirectory()) {
    // Look in delivery or runs for an output mp4
    const candidates = [
      path.join(mediaOrProjectPath, 'delivery', 'final-output.mp4'),
      path.join(mediaOrProjectPath, 'runs', 'latest', 'final-output.mp4')
    ];
    let found = '';
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        found = c;
        break;
      }
    }
    if (!found) {
      // Find any mp4 inside project
      const runsDir = path.join(mediaOrProjectPath, 'runs');
      if (fs.existsSync(runsDir)) {
        const sub = fs.readdirSync(runsDir);
        for (const s of sub) {
          const cand = path.join(runsDir, s, 'final-output.mp4');
          if (fs.existsSync(cand)) {
            found = cand;
            break;
          }
        }
      }
    }
    if (!found) {
      throw new Error(`Could not find a rendered video in project: ${mediaOrProjectPath}`);
    }
    targetVideo = found;
  }

  return ThumbnailGenerator.extractThumbnail(targetVideo, options);
}

