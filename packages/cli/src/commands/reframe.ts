import path from 'node:path';
import fs from 'node:fs';
import { AspectReframeEngine, type ReframeResult, type ReframeOptions, type TargetAspectRatio } from '../../../media/src/reframe.js';

export async function runReframe(
  videoPath: string,
  options: {
    ratio: TargetAspectRatio;
    strategy?: 'fit' | 'crop';
    padColor?: string;
    out?: string;
  }
): Promise<ReframeResult> {
  const resolvedVideo = path.resolve(process.cwd(), videoPath);
  if (!fs.existsSync(resolvedVideo)) {
    throw new Error(`Video file not found at: ${resolvedVideo}`);
  }

  const outPath = options.out ? path.resolve(process.cwd(), options.out) : undefined;

  return AspectReframeEngine.reframe(resolvedVideo, {
    targetRatio: options.ratio,
    strategy: options.strategy,
    padColor: options.padColor,
    outputPath: outPath
  });
}

