import path from 'node:path';
import fs from 'node:fs';
import { ColorPresetEngine, type ColorPresetName, type ApplyGradeResult } from '../../../media/src/color_presets.js';

export async function runGrade(
  videoPath: string,
  options: {
    preset: ColorPresetName;
    out?: string;
  }
): Promise<ApplyGradeResult> {
  const resolvedVideo = path.resolve(process.cwd(), videoPath);
  if (!fs.existsSync(resolvedVideo)) {
    throw new Error(`Video file not found at: ${resolvedVideo}`);
  }

  const outPath = options.out ? path.resolve(process.cwd(), options.out) : undefined;

  return ColorPresetEngine.applyGrade(resolvedVideo, options.preset, {
    outputPath: outPath
  });
}

