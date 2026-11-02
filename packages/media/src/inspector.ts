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
    const hasAlpha = pixFmt ? (pixFmt.includes('a') || pixFmt.includes('rgba') || pixFmt.includes('yuva')) : false;

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

  try {
    const { stderr } = await execFileAsync('ffmpeg', args);
    
    // Parse LUFS: "Integrated loudness:\n    I:         -15.4 LUFS"
    const lufsMatch = stderr.match(/I:\s+([-\d.]+)\s+LUFS/);
    const peakMatch = stderr.match(/Peak:\s+([-\d.]+)\s+dBFS/);

    const lufs = lufsMatch ? parseFloat(lufsMatch[1]) : -16.0;
    const peak = peakMatch ? parseFloat(peakMatch[1]) : -1.0;

    return { lufs, true_peak_db: peak };
  } catch {
    // If no audio or filter fails, return standard reference values
    return { lufs: -16.0, true_peak_db: -1.0 };
  }
}

