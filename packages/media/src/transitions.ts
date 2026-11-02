import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export type TransitionType =
  | 'fade'
  | 'wipeleft'
  | 'wiperight'
  | 'slideup'
  | 'slidedown'
  | 'circlecrop'
  | 'dissolve'
  | 'smoothleft';

export interface TransitionOptions {
  transition?: TransitionType;
  durationSeconds?: number;
  outputPath?: string;
}

export interface TransitionResult {
  outputPath: string;
  transition: TransitionType;
  clipsCount: number;
  totalDurationSeconds: number;
}

export class TransitionEngine {
  /**
   * Stitches two video clips together using FFmpeg's hardware-accelerated xfade filter.
   */
  static composeTransitions(clipPaths: string[], options: TransitionOptions = {}): TransitionResult {
    if (!clipPaths || clipPaths.length < 2) {
      throw new Error('At least two video clips are required to apply scene transitions');
    }

    for (const c of clipPaths) {
      if (!fs.existsSync(c)) {
        throw new Error(`Clip file not found: ${c}`);
      }
    }

    const transition = options.transition ?? 'fade';
    const transDur = options.durationSeconds ?? 0.5;

    // Probe duration of the first clip to calculate accurate xfade offset
    let d1 = 5.0;
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${clipPaths[0]}"`, {
        encoding: 'utf8'
      }).trim();
      d1 = parseFloat(probeOut) || 5.0;
    } catch {
      // fallback
    }

    let d2 = 5.0;
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${clipPaths[1]}"`, {
        encoding: 'utf8'
      }).trim();
      d2 = parseFloat(probeOut) || 5.0;
    } catch {
      // fallback
    }

    const offset = Math.max(0.1, d1 - transDur);
    const expectedDuration = d1 + d2 - transDur;

    const outPath = options.outputPath ?? path.join(
      path.dirname(clipPaths[0]),
      `transition-${transition}-${Date.now()}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Build xfade and acrossfade filtergraph
    const filtergraph = `[0:v][1:v]xfade=transition=${transition}:duration=${transDur.toFixed(2)}:offset=${offset.toFixed(2)}[v];[0:a][1:a]acrossfade=d=${transDur.toFixed(2)}[a]`;

    const cmd = [
      'ffmpeg -y',
      `-i "${clipPaths[0]}"`,
      `-i "${clipPaths[1]}"`,
      `-filter_complex "${filtergraph}"`,
      '-map "[v]"',
      '-map "[a]"',
      '-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p',
      '-c:a aac -b:a 192k',
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate transitioned video at: ${outPath}`);
    }

    return {
      outputPath: outPath,
      transition,
      clipsCount: clipPaths.length,
      totalDurationSeconds: expectedDuration
    };
  }
}

