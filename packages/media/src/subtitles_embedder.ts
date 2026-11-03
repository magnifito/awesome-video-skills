import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg } from './proc.js';

export interface SubtitleTrackConfig {
  file: string;
  language: string; // e.g. "bg", "en", "bul"
  title: string; // e.g. "Bulgarian", "English"
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
      if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(tr.language)) {
        throw new Error(`Invalid subtitle language code: ${JSON.stringify(tr.language)}`);
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

    const args: string[] = ['-i', videoPath];
    tracks.forEach(tr => args.push('-i', tr.file));
    args.push('-map', '0:v', '-map', '0:a?');
    tracks.forEach((_, idx) => args.push('-map', `${idx + 1}:s`));
    args.push('-c:v', 'copy', '-c:a', 'copy', '-c:s', 'mov_text');
    tracks.forEach((tr, idx) => {
      // Argument arrays pass titles verbatim; no shell quoting is involved.
      args.push(`-metadata:s:s:${idx}`, `language=${tr.language}`);
      args.push(`-metadata:s:s:${idx}`, `title=${tr.title}`);
      args.push(`-disposition:s:${idx}`, tr.isDefault ? 'default' : '0');
    });
    args.push(outPath);

    runFfmpeg(args);

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
