import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { probe, runFfmpeg } from './proc.js';

/** HDR transfer functions as ffprobe names them. */
const HDR_TRANSFERS: Record<string, 'hlg' | 'pq'> = {
  'arib-std-b67': 'hlg',
  smpte2084: 'pq',
};

/**
 * Converts HDR (HLG or PQ, BT.2020) to SDR BT.709, limited range, 8-bit 4:2:0.
 *
 * swscale's colour management (FFmpeg 8 and newer) maps the BT.2408 HDR reference white
 * (HLG 75 % signal, PQ 203 cd/m2) to SDR peak white with the default relative-colorimetric
 * intent, so faces and paper stay at normal SDR brightness and only specular highlights clip.
 * Without it, HDR footage only gets re-tagged and plays back dim and washed out.
 */
export const HDR_TO_SDR_FILTER =
  'scale=out_transfer=bt709:out_primaries=bt709:out_color_matrix=bt709:out_range=tv,format=yuv420p,' +
  'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';

export interface DynamicRange {
  hdr: boolean;
  /** "hlg", "pq", or "sdr" for anything else (including untagged streams). */
  kind: 'hlg' | 'pq' | 'sdr';
  colorTransfer?: string;
  colorPrimaries?: string;
}

export interface SdrOptions {
  outputPath?: string;
  /** x264 CRF for the SDR copy. Default 18 (visually lossless for footage). */
  crf?: number;
}

export interface SdrResult {
  sourceVideo: string;
  outputPath: string;
  source: DynamicRange;
  filterApplied: string;
  outputTransfer?: string;
}

/** Reads the transfer function of the first video stream. */
export function detectDynamicRange(videoPath: string): DynamicRange {
  const raw = probe(videoPath).raw as { streams?: Record<string, unknown>[] };
  const v = raw.streams?.find(s => s.codec_type === 'video');
  if (!v) throw new Error(`No video stream in ${videoPath}`);
  const colorTransfer = v.color_transfer as string | undefined;
  const kind = (colorTransfer && HDR_TRANSFERS[colorTransfer]) || 'sdr';
  return { hdr: kind !== 'sdr', kind, colorTransfer, colorPrimaries: v.color_primaries as string | undefined };
}

/** Major version of the ffmpeg on PATH, or undefined for builds that do not print one (git snapshots). */
export function ffmpegMajorVersion(): number | undefined {
  const out = execFileSync('ffmpeg', ['-hide_banner', '-version']).toString();
  const m = /^ffmpeg version n?(\d+)\./m.exec(out);
  return m ? Number(m[1]) : undefined;
}

export class HdrConverter {
  /**
   * Tone-maps HLG or PQ footage to SDR BT.709 so later commands (reframe, grade, concat...)
   * work on normal-range video. Refuses SDR input rather than re-encoding it for nothing.
   */
  static toSdr(videoPath: string, options: SdrOptions = {}): SdrResult {
    if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
    const source = detectDynamicRange(videoPath);
    if (!source.hdr) {
      throw new Error(`${path.basename(videoPath)} is not HDR (transfer ${source.colorTransfer ?? 'untagged'}); nothing to convert`);
    }
    const major = ffmpegMajorVersion();
    if (major !== undefined && major < 8) {
      throw new Error(`HDR to SDR needs FFmpeg 8 or newer (swscale colour management); found ${major}`);
    }
    const crf = options.crf ?? 18;
    if (!Number.isFinite(crf) || crf < 0 || crf > 51) throw new Error(`crf must be 0-51, got ${crf}`);

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-sdr.mp4`,
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    runFfmpeg([
      '-i', videoPath,
      '-map', '0:v:0', '-map', '0:a?',
      '-vf', HDR_TO_SDR_FILTER,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
      outPath,
    ]);
    if (!fs.existsSync(outPath)) throw new Error(`Failed to write SDR video at: ${outPath}`);

    return {
      sourceVideo: videoPath,
      outputPath: outPath,
      source,
      filterApplied: HDR_TO_SDR_FILTER,
      outputTransfer: detectDynamicRange(outPath).colorTransfer,
    };
  }
}
