import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probe, requirePositive, type StreamProbe } from './proc.js';

export type TransitionType =
  | 'fade'
  | 'wipeleft'
  | 'wiperight'
  | 'slideup'
  | 'slidedown'
  | 'circlecrop'
  | 'dissolve'
  | 'smoothleft';

const TRANSITIONS: readonly TransitionType[] = [
  'fade', 'wipeleft', 'wiperight', 'slideup', 'slidedown', 'circlecrop', 'dissolve', 'smoothleft',
];

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
   * Stitches N video clips together with FFmpeg's xfade (video) and acrossfade (audio) filters,
   * applying the same transition between every consecutive pair.
   * All clips are normalized to the first clip's frame size and frame rate first, because xfade
   * requires identical resolution, frame rate, pixel format and timebase on both inputs.
   * Clips without audio get generated silence so the audio chain stays aligned; if no clip has
   * audio, the output is video-only.
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
    if (!TRANSITIONS.includes(transition)) {
      throw new Error(`Unsupported transition "${String(transition)}". Supported: ${TRANSITIONS.join(', ')}`);
    }
    const transDur = requirePositive(options.durationSeconds ?? 0.5, 'durationSeconds');

    const infos: StreamProbe[] = clipPaths.map(c => {
      const p = probe(c);
      if (!p.hasVideo) throw new Error(`Clip has no video stream: ${c}`);
      if (p.durationSeconds <= transDur) {
        throw new Error(`Clip ${c} (${p.durationSeconds.toFixed(3)}s) is not longer than the transition (${transDur}s)`);
      }
      return p;
    });

    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    const W = even(infos[0].displayWidth);
    const H = even(infos[0].displayHeight);
    const fps = infos[0].fps > 0 && infos[0].fps <= 240 ? Number(infos[0].fps.toFixed(3)) : 30;
    const anyAudio = infos.some(i => i.hasAudio);

    const outPath = options.outputPath ?? path.join(
      path.dirname(clipPaths[0]),
      `transition-${transition}-${Date.now()}.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const args: string[] = [];
    clipPaths.forEach(c => args.push('-i', c));
    // Silent stand-ins for clips without audio, appended after the real inputs.
    const silenceInputIndex = new Map<number, number>();
    if (anyAudio) {
      infos.forEach((info, i) => {
        if (!info.hasAudio) {
          silenceInputIndex.set(i, clipPaths.length + silenceInputIndex.size);
          args.push('-f', 'lavfi', '-t', info.durationSeconds.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
        }
      });
    }

    const graph: string[] = [];
    infos.forEach((_, i) => {
      graph.push(
        `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps},format=yuv420p,settb=AVTB[v${i}]`
      );
      if (anyAudio) {
        const src = silenceInputIndex.has(i) ? `${silenceInputIndex.get(i)}:a` : `${i}:a`;
        graph.push(`[${src}]aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`);
      }
    });

    // Chain: the running output length L grows by (d_i - T) per transition; each xfade starts at L - T.
    let runningLen = infos[0].durationSeconds;
    let vPrev = 'v0';
    let aPrev = 'a0';
    for (let i = 1; i < infos.length; i++) {
      const offset = runningLen - transDur;
      const vOut = i === infos.length - 1 ? 'vout' : `vx${i}`;
      graph.push(`[${vPrev}][v${i}]xfade=transition=${transition}:duration=${transDur.toFixed(3)}:offset=${offset.toFixed(3)}[${vOut}]`);
      vPrev = vOut;
      if (anyAudio) {
        const aOut = i === infos.length - 1 ? 'aout' : `ax${i}`;
        graph.push(`[${aPrev}][a${i}]acrossfade=d=${transDur.toFixed(3)}[${aOut}]`);
        aPrev = aOut;
      }
      runningLen = runningLen + infos[i].durationSeconds - transDur;
    }

    args.push('-filter_complex', graph.join(';'), '-map', '[vout]');
    if (anyAudio) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', outPath);

    runFfmpeg(args);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate transitioned video at: ${outPath}`);
    }

    return {
      outputPath: outPath,
      transition,
      clipsCount: clipPaths.length,
      totalDurationSeconds: probe(outPath).durationSeconds
    };
  }
}
