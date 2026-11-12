/**
 * Captions from recognised words, and checks of captions and on-screen names against them.
 *
 * - Grouping: a cue ends after 3 words, after sentence or clause punctuation, or before a pause
 *   longer than 8 frames; it stays up 8 frames past its last word (never into the next cue).
 * - Drift: a cue that appears more than 0.15 s after, or 0.25 s before, its first spoken word.
 * - Names: a brand or product name the narration says should be on screen while it is said.
 */
import type { TextManifest, TranscriptWord } from '../../contracts/src/index.js';

export interface CaptionCue {
  index: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

export const CUE_MAX_WORDS = 3;
export const CUE_GAP_FRAMES = 8;
export const CUE_HOLD_FRAMES = 8;
/** A cue may lag its first word by this much, in seconds. */
export const DRIFT_LATE_S = 0.15;
/** A cue may lead its first word by this much, in seconds. */
export const DRIFT_EARLY_S = 0.25;

const BREAK_AFTER = /[.,!?;:…]["»”')\]]*$/u;

/** Groups recognised words into short caption cues (see module notes for the rule). */
export function groupCaptionWords(words: TranscriptWord[], fps = 30): CaptionCue[] {
  const gapMs = (CUE_GAP_FRAMES / fps) * 1000;
  const holdMs = (CUE_HOLD_FRAMES / fps) * 1000;
  const groups: TranscriptWord[][] = [];
  let cur: TranscriptWord[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (!next || cur.length >= CUE_MAX_WORDS || BREAK_AFTER.test(w.word) || next.start_ms - w.end_ms > gapMs) {
      groups.push(cur);
      cur = [];
    }
  });
  return groups.map((g, i) => {
    const next = groups[i + 1];
    const end = g[g.length - 1].end_ms + holdMs;
    return {
      index: i + 1,
      start_ms: g[0].start_ms,
      end_ms: Math.round(next ? Math.min(end, next[0].start_ms) : end),
      text: g.map(w => w.word).join(' '),
    };
  });
}

/** Lower case, letters and digits only; for matching caption and spoken words. */
export function normWord(w: string): string {
  return w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export interface CueDrift {
  cue: CaptionCue;
  /** Cue start minus first-word start, in seconds (positive: the cue is late). */
  drift_s: number;
  word_start_ms: number;
}

/**
 * Matches each cue's first word to the spoken words, in order, and returns the cues whose start
 * is off by more than the drift limits, plus how many cues could be matched at all.
 */
export function captionDrift(cues: CaptionCue[], words: TranscriptWord[]): { drifting: CueDrift[]; matched: number } {
  const norm = words.map(w => normWord(w.word));
  const drifting: CueDrift[] = [];
  let matched = 0;
  let from = 0;
  for (const cue of cues) {
    const first = cue.text.split(/\s+/).map(normWord).find(Boolean);
    if (!first) continue;
    // The nearest occurrence within 2 s of the cue, not before the previous match.
    let best = -1;
    for (let i = from; i < words.length; i++) {
      if (words[i].start_ms > cue.start_ms + 2000) break;
      if (norm[i] !== first || words[i].start_ms < cue.start_ms - 2000) continue;
      if (best < 0 || Math.abs(words[i].start_ms - cue.start_ms) < Math.abs(words[best].start_ms - cue.start_ms)) best = i;
    }
    if (best < 0) continue;
    matched++;
    from = best + 1;
    const drift = (cue.start_ms - words[best].start_ms) / 1000;
    if (drift > DRIFT_LATE_S || drift < -DRIFT_EARLY_S) drifting.push({ cue, drift_s: Math.round(drift * 1000) / 1000, word_start_ms: words[best].start_ms });
  }
  return { drifting, matched };
}

export interface SpokenName {
  name: string;
  start_ms: number;
  end_ms: number;
  /** True when a text containing the name is at least 30 % opaque while it is said. */
  onScreen: boolean;
}

/** Every time the narration says one of `names`, and whether the name is on screen then. */
export function spokenNames(names: string[], words: TranscriptWord[], manifest: TextManifest): SpokenName[] {
  const norm = words.map(w => normWord(w.word));
  const out: SpokenName[] = [];
  for (const name of [...new Set(names.map(n => n.trim()).filter(Boolean))]) {
    const parts = name.split(/\s+/).map(normWord).filter(Boolean);
    if (parts.length === 0) continue;
    const key = parts.join(' ');
    const shown = manifest.texts.filter(t => ` ${t.text.split(/\s+/).map(normWord).filter(Boolean).join(' ')} `.includes(` ${key} `));
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (!parts.every((p, k) => norm[i + k] === p)) continue;
      const start = words[i].start_ms;
      const end = words[i + parts.length - 1].end_ms;
      const onScreen = shown.some(t => t.samples.some(s => s.opacity >= 0.3 && s.t * 1000 >= start - 100 && s.t * 1000 <= end + 100));
      out.push({ name, start_ms: start, end_ms: end, onScreen });
    }
  }
  return out.sort((a, b) => a.start_ms - b.start_ms);
}
