import fs from 'node:fs';
import path from 'node:path';
import { VisualDiffComparator, type VisualDiffResult } from '../../../media/src/visual_diff.js';
import { measureVideoQuality, type VideoQualityMetrics } from '../../../media/src/inspector.js';

export interface DiffReport {
  targetA: string;
  targetB: string;
  type: 'video' | 'image';
  video_metrics?: VideoQualityMetrics;
  image_metrics?: VisualDiffResult;
  passed: boolean;
  summary: string;
}

export async function compareRenderOutputs(
  targetA: string,
  targetB: string
): Promise<DiffReport> {
  if (!fs.existsSync(targetA)) {
    throw new Error(`Target A not found: ${targetA}`);
  }
  if (!fs.existsSync(targetB)) {
    throw new Error(`Target B not found: ${targetB}`);
  }

  const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);
  const aIsVideo = VIDEO_EXTS.has(path.extname(targetA).toLowerCase());
  const bIsVideo = VIDEO_EXTS.has(path.extname(targetB).toLowerCase());
  if (aIsVideo !== bIsVideo) {
    throw new Error('Cannot compare a video with an image: both targets must be the same media type.');
  }
  const isVideo = aIsVideo;

  if (isVideo) {
    const videoMetrics = await measureVideoQuality(targetA, targetB);
    const passed = videoMetrics.ssim_all >= 0.95;
    const summary = passed
      ? `Visual quality comparison PASSED: SSIM ${videoMetrics.ssim_all} (PSNR: ${videoMetrics.psnr_average})`
      : `Visual quality regression DETECTED: SSIM ${videoMetrics.ssim_all} is below threshold 0.95`;

    return {
      targetA,
      targetB,
      type: 'video',
      video_metrics: videoMetrics,
      passed,
      summary
    };
  } else {
    const imageMetrics = await VisualDiffComparator.compareFrames(targetA, targetB);
    const passed = !imageMetrics.drift_detected;
    const summary = passed
      ? `Frame visual diff PASSED: similarity ${imageMetrics.perceptual_similarity * 100}%`
      : `Frame visual diff FAILED: drift detected, similarity ${imageMetrics.perceptual_similarity * 100}%`;

    return {
      targetA,
      targetB,
      type: 'image',
      image_metrics: imageMetrics,
      passed,
      summary
    };
  }
}

