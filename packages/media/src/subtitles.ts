import fs from 'node:fs/promises';
import path from 'node:path';
import type { ScenePlan, Transcript } from '../../contracts/src/index.js';

export interface SubtitleCue {
  index: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

export class SubtitleGenerator {
  /**
   * Format milliseconds into SRT timestamp format: HH:MM:SS,mmm
   */
  static formatSrtTimestamp(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) throw new Error(`Subtitle timestamp must be >= 0 ms, got ${ms}`);
    // Round to whole milliseconds first so float input (e.g. 0.3 s * 1000) does not truncate to 299.
    const whole = Math.round(ms);
    const totalSeconds = Math.floor(whole / 1000);
    const millis = whole % 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  /**
   * Format milliseconds into WebVTT timestamp format: HH:MM:SS.mmm
   */
  static formatVttTimestamp(ms: number): string {
    return this.formatSrtTimestamp(ms).replace(',', '.');
  }

  /**
   * Generate cues from ScenePlan copy text and scene durations.
   */
  static cuesFromScenePlan(scenePlan: ScenePlan): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    let accumulatedMs = 0;

    for (let i = 0; i < scenePlan.scenes.length; i++) {
      const scene = scenePlan.scenes[i];
      const durationMs = Math.round(scene.duration_seconds * 1000);
      cues.push({
        index: i + 1,
        start_ms: accumulatedMs,
        end_ms: accumulatedMs + durationMs,
        text: scene.copy_text.trim()
      });
      accumulatedMs += durationMs;
    }

    return cues;
  }

  /**
   * Generate cues from Transcript words, grouping into readable phrases.
   */
  static cuesFromTranscript(transcript: Transcript, wordsPerCue = 6): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    let cueIndex = 1;

    for (let i = 0; i < transcript.words.length; i += wordsPerCue) {
      const chunk = transcript.words.slice(i, i + wordsPerCue);
      if (chunk.length === 0) continue;

      const startMs = chunk[0].start_ms;
      const endMs = chunk[chunk.length - 1].end_ms;
      const text = chunk.map(w => w.word).join(' ');

      cues.push({
        index: cueIndex++,
        start_ms: startMs,
        end_ms: endMs,
        text
      });
    }

    return cues;
  }

  /** Prevents cue text from forging a timing line or ending the cue early. */
  static sanitizeCueText(text: string): string {
    return text
      .replace(/-->/g, '\u2192')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n');
  }

  /**
   * Render SubRip (.srt) string.
   */
  static toSrt(cues: SubtitleCue[]): string {
    return cues
      .map(
        c => `${c.index}\n${this.formatSrtTimestamp(c.start_ms)} --> ${this.formatSrtTimestamp(c.end_ms)}\n${this.sanitizeCueText(c.text)}\n`
      )
      .join('\n');
  }

  /**
   * Render WebVTT (.vtt) string.
   */
  static toVtt(cues: SubtitleCue[]): string {
    const header = 'WEBVTT\n\n';
    const body = cues
      .map(
        c => `${c.index}\n${this.formatVttTimestamp(c.start_ms)} --> ${this.formatVttTimestamp(c.end_ms)}\n${this.sanitizeCueText(c.text)}\n`
      )
      .join('\n');
    return header + body;
  }

  /**
   * Write .srt and .vtt subtitle files into output directory.
   */
  static async exportSubtitles(
    outputDir: string,
    baseName: string,
    cues: SubtitleCue[]
  ): Promise<{ srtPath: string; vttPath: string }> {
    if (!/^[A-Za-z0-9._-]+$/.test(baseName) || baseName.startsWith('.')) {
      throw new Error(`Invalid subtitle base name: ${JSON.stringify(baseName)}`);
    }
    await fs.mkdir(outputDir, { recursive: true });

    const srtPath = path.join(outputDir, `${baseName}.srt`);
    const vttPath = path.join(outputDir, `${baseName}.vtt`);

    await fs.writeFile(srtPath, this.toSrt(cues), 'utf-8');
    await fs.writeFile(vttPath, this.toVtt(cues), 'utf-8');

    return { srtPath, vttPath };
  }
}

