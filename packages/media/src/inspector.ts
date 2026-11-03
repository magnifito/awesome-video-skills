import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Measurements } from '../../contracts/src/index.js';

const execFileAsync = promisify(execFile);

export interface MediaProbeResult {
  width: number;
  height: number;
  duration_seconds: number;
  fps: number;
  video_codec?: string;
  audio_codec?: string;
  has_audio: boolean;
  has_alpha: boolean;
  pixel_format?: string;
  bitrate_kbps?: number;
}

/**
 * Inspects video/audio file using ffprobe.
 */
export async function inspectMedia(filePath: string): Promise<MediaProbeResult> {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ];

  try {
    const { stdout } = await execFileAsync('ffprobe', args);
    const probe = JSON.parse(stdout);

    const videoStream = probe.streams?.find((s: Record<string, unknown>) => s.codec_type === 'video');
    const audioStream = probe.streams?.find((s: Record<string, unknown>) => s.codec_type === 'audio');

    let fps = 30.0;
    if (videoStream?.r_frame_rate) {
      const parts = (videoStream.r_frame_rate as string).split('/');
      if (parts.length === 2 && Number(parts[1]) > 0) {
        fps = Number(parts[0]) / Number(parts[1]);
      } else if (!isNaN(Number(videoStream.r_frame_rate))) {
        fps = Number(videoStream.r_frame_rate);
      }
    }

    const duration = parseFloat(probe.format?.duration || videoStream?.duration || '0');
    const width = videoStream?.width ? parseInt(videoStream.width, 10) : 0;
    const height = videoStream?.height ? parseInt(videoStream.height, 10) : 0;
    const pixFmt = videoStream?.pix_fmt as string | undefined;

    // Alpha channels: yuva420p, rgba, yuva444p, argb, bgra, etc.
    const hasAlpha = pixFmt ? /^(yuva|rgba|bgra|argb|abgr|gbrap|ya\d|ayuv|vuya)/.test(pixFmt) : false;

    return {
      width,
      height,
      duration_seconds: duration,
      fps: Math.round(fps * 100) / 100,
      video_codec: videoStream?.codec_name,
      audio_codec: audioStream?.codec_name,
      has_audio: Boolean(audioStream),
      has_alpha: hasAlpha,
      pixel_format: pixFmt,
      bitrate_kbps: probe.format?.bit_rate ? Math.round(parseInt(probe.format.bit_rate, 10) / 1000) : undefined
    };
  } catch (error) {
    throw new Error(`Failed to probe media at ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * Measures loudness (integrated LUFS and true peak dB) using ffmpeg ebur128 filter.
 */
export async function measureAudioLoudness(filePath: string): Promise<{ lufs: number; true_peak_db: number }> {
  const args = [
    '-i', filePath,
    '-filter_complex', 'ebur128=peak=true',
    '-f', 'null',
    '-'
  ];

  let stderr: string;
  try {
    ({ stderr } = await execFileAsync('ffmpeg', args, { maxBuffer: 256 * 1024 * 1024 }));
  } catch (error) {
    // No audio stream, unreadable file, etc. Never report target values as if measured.
    throw new Error(`Failed to measure loudness of ${filePath}: ${(error as Error).message.slice(-500)}`);
  }

  // ebur128 logs one "I: ... LUFS" line per frame; only the final summary block is authoritative.
  const summaryIdx = stderr.lastIndexOf('Summary:');
  const summary = summaryIdx >= 0 ? stderr.slice(summaryIdx) : '';
  const lufsMatch = summary.match(/Integrated loudness:\s*I:\s+(-?[\d.]+|-inf)\s+LUFS/);
  const peakMatch = summary.match(/True peak:\s*Peak:\s+(-?[\d.]+|-inf)\s+dBFS/);
  if (!lufsMatch || !peakMatch) {
    throw new Error(`Failed to measure loudness of ${filePath}: ebur128 summary not found`);
  }
  const toNum = (v: string): number => (v === '-inf' ? -Infinity : parseFloat(v));
  return { lufs: toNum(lufsMatch[1]), true_peak_db: toNum(peakMatch[1]) };
}

export interface VideoQualityMetrics {
  ssim_all: number;
  ssim_y: number;
  ssim_u: number;
  ssim_v: number;
  psnr_average: number | 'inf';
}

/**
 * Computes objective video quality metrics (SSIM and PSNR) comparing a candidate video against reference video.
 */
export async function measureVideoQuality(
  candidatePath: string,
  referencePath: string
): Promise<VideoQualityMetrics> {
  const args = [
    '-i', candidatePath,
    '-i', referencePath,
    '-filter_complex', '[0:v][1:v]ssim;[0:v][1:v]psnr',
    '-f', 'null',
    '-'
  ];

  try {
    const { stderr } = await execFileAsync('ffmpeg', args, { maxBuffer: 256 * 1024 * 1024 });

    // Parse SSIM: SSIM Y:1.000000 (...) U:... V:... All:1.000000 (...)
    const ssimMatch = stderr.match(/SSIM\s+Y:([\d.]+)\s+\([^)]+\)\s+U:([\d.]+)\s+\([^)]+\)\s+V:([\d.]+)\s+\([^)]+\)\s+All:([\d.]+)/);
    // Parse PSNR: PSNR y:... u:... v:... average:(inf|[\d.]+)
    const psnrMatch = stderr.match(/PSNR[^\n]*average:(inf|[\d.]+)/);
    if (!ssimMatch || !psnrMatch) {
      // A failed comparison must never look like a perfect match.
      throw new Error('ssim/psnr summary not found in ffmpeg output');
    }
    const ssim_y = parseFloat(ssimMatch[1]);
    const ssim_u = parseFloat(ssimMatch[2]);
    const ssim_v = parseFloat(ssimMatch[3]);
    const ssim_all = parseFloat(ssimMatch[4]);
    const psnr_average: number | 'inf' = psnrMatch[1] === 'inf' ? 'inf' : parseFloat(psnrMatch[1]);

    return {
      ssim_all,
      ssim_y,
      ssim_u,
      ssim_v,
      psnr_average
    };
  } catch (error) {
    throw new Error(`Failed to calculate video quality: ${(error as Error).message}`);
  }
}


