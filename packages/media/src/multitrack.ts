import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface AudioTrackInput {
  filePath: string;
  language: string; // ISO 639-2 (e.g. "bul", "eng")
  title: string;
  isDefault?: boolean;
}

export interface MultiTrackOptions {
  outputPath?: string;
}

export interface MultiTrackResult {
  videoPath: string;
  outputPath: string;
  audioTracksCount: number;
  languages: string[];
}

export class MultiTrackAudioMuxer {
  /**
   * Muxes multiple alternate audio tracks with language metadata tags into a single video container.
   */
  static muxTracks(
    videoPath: string,
    audioTracks: AudioTrackInput[],
    options: MultiTrackOptions = {}
  ): MultiTrackResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (!audioTracks || audioTracks.length === 0) {
      throw new Error('At least one audio track must be provided for muxing');
    }

    for (const tr of audioTracks) {
      if (!fs.existsSync(tr.filePath)) {
        throw new Error(`Audio track file not found: ${tr.filePath}`);
      }
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-multitrack.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const inputArgs: string[] = [`-i "${videoPath}"`];
    const mapArgs: string[] = ['-map 0:v:0'];
    const metaArgs: string[] = [];

    audioTracks.forEach((tr, idx) => {
      inputArgs.push(`-i "${tr.filePath}"`);
      mapArgs.push(`-map ${idx + 1}:a:0`);
      metaArgs.push(`-metadata:s:a:${idx} language="${tr.language}"`);
      metaArgs.push(`-metadata:s:a:${idx} title="${tr.title}"`);
      if (tr.isDefault) {
        metaArgs.push(`-disposition:a:${idx} default`);
      }
    });

    const cmd = [
      'ffmpeg -y',
      inputArgs.join(' '),
      mapArgs.join(' '),
      '-c:v copy',
      '-c:a aac -b:a 192k',
      metaArgs.join(' '),
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate multitrack video at: ${outPath}`);
    }

    return {
      videoPath,
      outputPath: outPath,
      audioTracksCount: audioTracks.length,
      languages: audioTracks.map(t => t.language)
    };
  }
}

