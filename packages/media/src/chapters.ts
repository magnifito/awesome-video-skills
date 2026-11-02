import path from 'node:path';
import fs from 'node:fs';
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
      const start = currentTime;
      const end = start + sc.duration_seconds;
      const minutes = Math.floor(start / 60);
      const seconds = Math.floor(start % 60);
      const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Derive title from factual purpose or scene_id
      const title = sc.factual_purpose || `Scene ${idx + 1} - ${sc.scene_id}`;
      chapters.push({
        title,
        startSeconds: start,
        endSeconds: end,
        formattedTime
      });

      currentTime = end;
    });

    // YouTube chapters format
    const youtubeText = chapters
      .map(ch => `${ch.formattedTime} ${ch.title}`)
      .join('\n');

    // WebVTT chapters format
    const vttLines: string[] = ['WEBVTT\n'];
    chapters.forEach((ch, idx) => {
      const startVtt = this.formatVttTime(ch.startSeconds);
      const endVtt = this.formatVttTime(ch.endSeconds);
      vttLines.push(`${idx + 1}`);
      vttLines.push(`${startVtt} --> ${endVtt}`);
      vttLines.push(`${ch.title}\n`);
    });
    const webVtt = vttLines.join('\n');

    // FFmetadata format
    const metaLines: string[] = [';FFMETADATA1\n'];
    chapters.forEach(ch => {
      const startMs = Math.round(ch.startSeconds * 1000);
      const endMs = Math.round(ch.endSeconds * 1000);
      metaLines.push('[CHAPTER]');
      metaLines.push('TIMEBASE=1/1000');
      metaLines.push(`START=${startMs}`);
      metaLines.push(`END=${endMs}`);
      metaLines.push(`title=${ch.title}\n`);
    });
    const ffmetadata = metaLines.join('\n');

    return {
      chapters,
      youtubeText,
      webVtt,
      ffmetadata
    };
  }

  private static formatVttTime(sec: number): string {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }
}

