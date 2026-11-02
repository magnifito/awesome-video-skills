import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface SubtitleTrackConfig {
  file: string;
  language: string; // e.g. "bg", "en"
  title: string;    // e.g. "Bulgarian", "English"
  isDefault?: boolean;
}

export interface EmbedSubtitlesOptions {
  outputPath?: string;
}

export interface EmbedSubtitlesResult {
  videoPath: string;
  outputPath: string;
  tracksCount: number;
  languages: string[];
}

export class SubtitleEmbedder {
  /**
   * Embeds one or more timed subtitle tracks (SRT or VTT) into an MP4 container using standard mov_text.
   * Performs lossless stream copying without re-encoding video or audio.
   */
  static embed(
    videoPath: string,
    tracks: SubtitleTrackConfig[],
    options: EmbedSubtitlesOptions = {}
  ): EmbedSubtitlesResult {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (!tracks || tracks.length === 0) {
      throw new Error('At least one subtitle track must be provided for embedding');
    }

    for (const tr of tracks) {
      if (!fs.existsSync(tr.file)) {
        throw new Error(`Subtitle track file not found: ${tr.file}`);
      }
    }

    const outPath = options.outputPath ?? path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}-subbed.mp4`
    );

    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const inputArgs: string[] = [`-i "${videoPath}"`];
    const mapArgs: string[] = ['-map 0:v', '-map 0:a?'];
    const metaArgs: string[] = [];

    tracks.forEach((tr, idx) => {
      inputArgs.push(`-i "${tr.file}"`);
      mapArgs.push(`-map ${idx + 1}:s`);
      metaArgs.push(`-metadata:s:s:${idx} language="${tr.language}"`);
      metaArgs.push(`-metadata:s:s:${idx} title="${tr.title}"`);
      if (tr.isDefault) {
        metaArgs.push(`-disposition:s:${idx} default`);
      }
    });

    const cmd = [
      'ffmpeg -y',
      inputArgs.join(' '),
      mapArgs.join(' '),
      '-c:v copy -c:a copy -c:s mov_text',
      metaArgs.join(' '),
      `"${outPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outPath)) {
      throw new Error(`Failed to generate subbed video at: ${outPath}`);
    }

    return {
      videoPath,
      outputPath: outPath,
      tracksCount: tracks.length,
      languages: tracks.map(t => t.language)
    };
  }
}

