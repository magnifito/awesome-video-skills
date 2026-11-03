import type { ScenePlan } from '../../contracts/src/index.js';

export interface VideoChapter {
  title: string;
  startSeconds: number;
  endSeconds: number;
  formattedTime: string; // e.g. "00:05"
}

export interface ChapterReport {
  chapters: VideoChapter[];
  youtubeText: string;
  webVtt: string;
  ffmetadata: string;
  /** YouTube chapter rule violations (first at 00:00, at least 3 chapters, each at least 10 s). */
  youtubeWarnings: string[];
}

export class ChapterGenerator {
  /**
   * Generates video chapter markers from a declarative ScenePlan.
   */
  static generateChapters(scenePlan: ScenePlan): ChapterReport {
    if (!scenePlan || !scenePlan.scenes || scenePlan.scenes.length === 0) {
      throw new Error('Scene plan is required to generate chapters');
    }

    let currentTime = 0;
    const chapters: VideoChapter[] = [];

    scenePlan.scenes.forEach((sc, idx) => {
      if (!Number.isFinite(sc.duration_seconds) || sc.duration_seconds <= 0) {
        throw new Error(`Scene ${sc.scene_id} has invalid duration_seconds: ${sc.duration_seconds}`);
      }
      const start = currentTime;
      const end = start + sc.duration_seconds;
      const title = this.sanitizeTitle(sc.factual_purpose || `Scene ${idx + 1} - ${sc.scene_id}`);
      chapters.push({
        title,
        startSeconds: start,
        endSeconds: end,
        formattedTime: this.formatYoutubeTime(start)
      });
      currentTime = end;
    });

    const youtubeWarnings: string[] = [];
    if (chapters.length < 3) {
      youtubeWarnings.push(`YouTube requires at least 3 chapters; plan has ${chapters.length}.`);
    }
    for (const ch of chapters) {
      if (ch.endSeconds - ch.startSeconds < 10) {
        youtubeWarnings.push(`Chapter "${ch.title}" is ${(ch.endSeconds - ch.startSeconds).toFixed(1)} s; YouTube requires at least 10 s.`);
      }
    }

    // YouTube chapters (first chapter always starts at 00:00 because currentTime starts at 0)
    const youtubeText = chapters
      .map(ch => `${ch.formattedTime} ${ch.title}`)
      .join('\n');

    // WebVTT chapters
    const vttLines: string[] = ['WEBVTT\n'];
    chapters.forEach((ch, idx) => {
      vttLines.push(`${idx + 1}`);
      vttLines.push(`${this.formatVttTime(ch.startSeconds)} --> ${this.formatVttTime(ch.endSeconds)}`);
      // "-->" is the cue timing separator and must not appear in cue text.
      vttLines.push(`${ch.title.replace(/-->/g, '->')}\n`);
    });
    const webVtt = vttLines.join('\n');

    // FFmetadata
    const metaLines: string[] = [';FFMETADATA1\n'];
    chapters.forEach(ch => {
      metaLines.push('[CHAPTER]');
      metaLines.push('TIMEBASE=1/1000');
      metaLines.push(`START=${Math.round(ch.startSeconds * 1000)}`);
      metaLines.push(`END=${Math.round(ch.endSeconds * 1000)}`);
      metaLines.push(`title=${this.escapeFfmetadata(ch.title)}\n`);
    });
    const ffmetadata = metaLines.join('\n');

    return {
      chapters,
      youtubeText,
      webVtt,
      ffmetadata,
      youtubeWarnings
    };
  }

  /** Collapses newlines so a title stays on one line in every output format. */
  private static sanitizeTitle(title: string): string {
    return title.replace(/[\r\n]+/g, ' ').trim();
  }

  /** FFMETADATA requires '=', ';', '#', '\' and newline to be backslash-escaped. */
  private static escapeFfmetadata(value: string): string {
    return value.replace(/([=;#\\\n])/g, '\\$1');
  }

  private static formatYoutubeTime(sec: number): string {
    const total = Math.floor(sec);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return hours > 0 ? `${hours}:${mmss}` : mmss;
  }

  private static formatVttTime(sec: number): string {
    // Integer millisecond math avoids float errors such as 0.3 s -> 299 ms.
    const totalMs = Math.round(sec * 1000);
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);
    const ms = totalMs % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }
}
