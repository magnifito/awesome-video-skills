/**
 * SRT/VTT -> estimated word timestamps. TypeScript port of upstream Barty-Bart/motion-graphics
 * `skills/motion-broll/scripts/words.py` (MIT).
 *
 * Each cue's time span is spread across its words by character count (about +-0.2 s
 * accuracy). There is no speech recognition here: the toolkit has no transcription engine,
 * so word times are only as good as the caption cues.
 */
import crypto from 'node:crypto';
import { TranscriptSchema, type Transcript } from '../../contracts/src/index.js';

export interface CaptionWord {
  /** Estimated start in seconds. */
  start: number;
  /** End in seconds: the next word's start, or the cue end for the last word of a cue. */
  end: number;
  word: string;
  /** 0-based cue index the word came from. */
  cue: number;
}

/** SRT `hh:mm:ss,mmm` or VTT `[hh:]mm:ss.mmm` to seconds. */
export function captionTimestamp(x: string): number {
  const parts = x.trim().replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+(?:\.\d+)?$/.test(p))) {
    throw new Error(`Invalid caption timestamp: ${JSON.stringify(x)}`);
  }
  return parts.reverse().reduce((acc, v, i) => acc + Number(v) * 60 ** i, 0);
}

/** Parses SRT or VTT text into words with estimated times. Throws when no cue is found. */
export function parseCaptionWords(text: string): CaptionWord[] {
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  const out: CaptionWord[] = [];
  let cue = 0;
  for (const blk of blocks) {
    const lines = blk.trim().split('\n');
    // SRT has an index line first; VTT may not.
    const i = lines.slice(0, 2).findIndex(l => l.includes('-->'));
    if (i < 0) continue; // WEBVTT header, NOTE/STYLE blocks
    // VTT cue settings may follow the end time; keep only the first token on each side.
    const [a, b] = lines[i].split('-->').map(x => captionTimestamp(x.trim().split(/\s+/)[0]));
    if (!(b >= a)) throw new Error(`Caption cue ends before it starts: ${lines[i]}`);
    // Strip <i>, <c>, <00:00:01.500> tags.
    const words = lines.slice(i + 1).join(' ').replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const n = words.reduce((acc, w) => acc + w.length + 1, 0);
    let c = 0;
    const start = out.length;
    for (const w of words) {
      out.push({ start: a + ((b - a) * c) / n, end: b, word: w, cue });
      c += w.length + 1;
    }
    for (let k = start; k < out.length - 1; k++) out[k].end = out[k + 1].start;
    cue++;
  }
  if (!cue) throw new Error('No caption cues found (expected SRT or VTT)');
  return out;
}

/** Upstream words.txt format: one line per cue, `start:word` pairs with 2 decimals. */
export function captionWordsText(words: CaptionWord[]): string {
  const lines: string[] = [];
  for (const w of words) {
    const entry = `${w.start.toFixed(2)}:${w.word}`;
    if (lines.length === w.cue) lines.push(entry);
    else lines[w.cue] += ' ' + entry;
  }
  return lines.join('\n') + '\n';
}

/**
 * Builds a Transcript contract from caption words. `sourceHash` identifies what the times
 * came from (the video when given, otherwise the caption file). Confidence is 0.5: times are
 * estimates spread across each cue, not recognised from the audio.
 */
export function captionTranscript(words: CaptionWord[], sourceHash: string, language = 'en'): Transcript {
  return TranscriptSchema.parse({
    source_audio_hash: sourceHash,
    language,
    correction_version: 'captions-estimate',
    words: words.map(w => ({
      word: w.word,
      start_ms: Math.round(w.start * 1000),
      end_ms: Math.round(w.end * 1000),
      confidence: 0.5
    }))
  });
}

export function sha256Hex(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
