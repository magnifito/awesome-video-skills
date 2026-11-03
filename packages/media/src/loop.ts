import { runFfmpeg, probe } from './proc.js';
import path from 'node:path';
import fs from 'node:fs';

export interface LoopOptions {
  loops?: number; // default 1 ping-pong cycle
  outputPath?: string;
  /** reverse buffers the whole clip in memory; longer inputs are rejected. Default 60 s. */
  maxInputSeconds?: number;
}

export interface LoopResult {
  sourceVideo: string;
  outputPath: string;
  loopMode: 'ping-pong';
  originalDurationSeconds: number;
  loopDurationSeconds: number;
  loops: number;
  /** The loop is video-only; true when the source had an audio track that was not carried over. */
  audioDropped: boolean;
}

export class VideoLoopEngine {
  /**
   * Creates a seamless ping-pong loop (forward + reverse) ideal for social reels and hero web backgrounds.
   */
  static createPingPongLoop(videoPath: string, options: LoopOptions = {}): LoopResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const loops = Math.floor(options.loops ?? 1);
    if (!(loops >= 1)) throw new Error(`loops must be an integer >= 1, got ${options.loops}`);
    const info = probe(videoPath);
    if (!info.hasVideo) throw new Error(`No video stream in ${videoPath}`);
    const origDuration = info.durationSeconds;
    const maxInput = options.maxInputSeconds ?? 60;
    if (origDuration > maxInput) {
      throw new Error(`Input is ${origDuration.toFixed(1)} s; ping-pong loops buffer the whole clip in memory (limit ${maxInput} s)`);
    }
    const fps = info.fps > 0 ? info.fps : 30;
    const frameCount = Math.max(2, Math.round(origDuration * fps));

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-loop-pingpong.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Split stream: forward and reverse, then concatenate
    // The reversed leg drops its first frame (duplicate of the last forward frame) and its last
    // frame (duplicate of the first forward frame of the next cycle), so the seam does not stutter.
    const reverseLeg = frameCount > 2
      ? `reverse,trim=start_frame=1:end_frame=${frameCount - 1},setpts=PTS-STARTPTS`
      : 'reverse';
    const cycleFrames = frameCount + Math.max(0, frameCount - 2);
    const repeat = loops > 1 ? `,loop=loop=${loops - 1}:size=${cycleFrames}:start=0,setpts=N/(${fps}*TB)` : '';
    const filter = `[0:v]fps=${fps},split=2[fwd][rev_in];[rev_in]${reverseLeg}[rev];[fwd][rev]concat=n=2:v=1:a=0${repeat}[outv]`;

    runFfmpeg([
      '-i',
      videoPath,
      '-filter_complex',
      filter,
      '-map',
      '[outv]',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      outPath
    ]);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate ping-pong loop at: ${outPath}`);
    }

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      loopMode: 'ping-pong',
      originalDurationSeconds: origDuration,
      loopDurationSeconds: probe(outPath).durationSeconds,
      loops,
      audioDropped: info.hasAudio
    };
  }
}

