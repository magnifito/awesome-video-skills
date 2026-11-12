/**
 * Cut footage by transcript lines: keep the lines listed in a text file, in that order, and
 * write an Edit Decision List with source microseconds and output frames.
 *
 * - Each kept line is found word for word in the transcript (normalised: case and punctuation
 *   ignored), searching forward from the previous match first. When there is no exact match, the
 *   window of the same length that shares the most words in order is used if it shares at least
 *   70 % of them, and the cut reason says so.
 * - Padding: before a clip min(0.6 x the pause before it, 0.12 s); after it min(0.7 x the pause
 *   after it, 0.22 s); after the last clip 0.35 s (both within the source).
 * - A clip edge within 0.25 s of a shot change moves to one frame inside the new shot (start) or
 *   one frame before the change (end), so no clip opens or closes on a few frames of another shot.
 *   An edge never moves into the spoken words.
 * - Clips that touch or overlap after padding are merged.
 */
import { spawnSync } from 'node:child_process';
import type { EditDecisionList, TranscriptWord } from '../../contracts/src/index.js';
import { EditDecisionListSchema } from '../../contracts/src/index.js';
import { normWord } from './captions.js';

export const FUZZY_MIN_SHARE = 0.7;
const PAD_BEFORE_S = 0.12;
const PAD_AFTER_S = 0.22;
const PAD_LAST_S = 0.35;
const SHOT_SNAP_S = 0.25;

export interface LineMatch {
  line: number;
  text: string;
  /** First and last transcript word indexes, inclusive. */
  from: number;
  to: number;
  /** Share of the line's words found in order: 1 for an exact match. */
  share: number;
}

export interface CutPlanInput {
  words: TranscriptWord[];
  /** Kept lines, in output order. Blank lines and lines starting with # are skipped. */
  lines: string[];
  sourceHash: string;
  sourceDurationS: number;
  /** Shot changes in the source, in seconds. */
  shotChanges?: number[];
  fps?: { numerator: number; denominator: number };
}

export interface CutPlan {
  edl: EditDecisionList;
  matches: LineMatch[];
  /** Lines that could not be found (below 70 % of their words). */
  missing: { line: number; text: string; best: number }[];
  notes: string[];
}

/** Longest common subsequence length of two token lists. */
function lcs(a: string[], b: string[]): number {
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = up;
    }
  }
  return prev[b.length];
}

/** Finds a kept line in the transcript: exact (forward first, then anywhere), else best fuzzy window. */
export function matchLine(tokens: string[], norm: string[], after: number): { from: number; share: number } | { from: -1; share: number } {
  const n = tokens.length;
  const exactAt = (i: number) => tokens.every((t, k) => norm[i + k] === t);
  for (const start of [after, 0]) {
    for (let i = start; i + n <= norm.length; i++) if (exactAt(i)) return { from: i, share: 1 };
  }
  let best = -1;
  let bestShare = 0;
  for (let i = 0; i + n <= norm.length; i++) {
    const share = lcs(tokens, norm.slice(i, i + n)) / n;
    // Ties go to the window at or after the previous match, then the earliest.
    if (share > bestShare || (share === bestShare && best < after && i >= after)) {
      best = i;
      bestShare = share;
    }
  }
  return bestShare >= FUZZY_MIN_SHARE ? { from: best, share: bestShare } : { from: -1, share: bestShare };
}

export function planCutByLines(input: CutPlanInput): CutPlan {
  const fps = input.fps ?? { numerator: 30, denominator: 1 };
  const frame = fps.denominator / fps.numerator;
  const words = input.words;
  const norm = words.map(w => normWord(w.word));
  const shots = [...(input.shotChanges ?? [])].sort((a, b) => a - b);
  const notes: string[] = [];
  const matches: LineMatch[] = [];
  const missing: CutPlan['missing'] = [];

  let after = 0;
  input.lines.forEach((raw, idx) => {
    const text = raw.trim();
    if (!text || text.startsWith('#')) return;
    const tokens = text.split(/\s+/).map(normWord).filter(Boolean);
    if (tokens.length === 0) return;
    const m = matchLine(tokens, norm, after);
    if (m.from < 0) {
      missing.push({ line: idx + 1, text, best: Math.round(m.share * 100) / 100 });
      return;
    }
    const to = m.from + tokens.length - 1;
    matches.push({ line: idx + 1, text, from: m.from, to, share: Math.round(m.share * 100) / 100 });
    if (m.share < 1) notes.push(`line ${idx + 1}: no exact match; used the closest passage (${Math.round(m.share * 100)}% of words)`);
    after = to + 1;
  });

  // Source ranges with padding and shot snapping.
  type Clip = { start: number; end: number; reasons: string[] };
  const clips: Clip[] = matches.map((m, k) => {
    const first = words[m.from];
    const last = words[m.to];
    const wStart = first.start_ms / 1000;
    const wEnd = last.end_ms / 1000;
    const gapBefore = m.from > 0 ? wStart - words[m.from - 1].end_ms / 1000 : wStart;
    const gapAfter = m.to < words.length - 1 ? words[m.to + 1].start_ms / 1000 - wEnd : input.sourceDurationS - wEnd;
    let start = wStart - Math.min(0.6 * Math.max(0, gapBefore), PAD_BEFORE_S);
    let end = k === matches.length - 1
      ? wEnd + Math.min(PAD_LAST_S, Math.max(0, input.sourceDurationS - wEnd))
      : wEnd + Math.min(0.7 * Math.max(0, gapAfter), PAD_AFTER_S);
    for (const s of shots) {
      if (Math.abs(start - s) <= SHOT_SNAP_S && s + frame <= wStart) start = Math.max(start, s + frame);
      if (Math.abs(end - s) <= SHOT_SNAP_S && s - frame >= wEnd) end = Math.min(end, s - frame);
    }
    start = Math.max(0, start);
    end = Math.min(input.sourceDurationS, end);
    const reason = `line ${m.line}: ${m.text}${m.share < 1 ? ` (closest passage, ${Math.round(m.share * 100)}% of words)` : ''}`;
    return { start, end, reasons: [reason] };
  });

  // Merge clips that touch or overlap in source order when consecutive.
  const merged: Clip[] = [];
  for (const c of clips) {
    const prev = merged[merged.length - 1];
    if (prev && c.start <= prev.end && c.end >= prev.start && c.start >= prev.start) {
      prev.end = Math.max(prev.end, c.end);
      prev.reasons.push(...c.reasons);
      notes.push(`${c.reasons[0].split(':')[0]} joins the previous clip (they touch in the source)`);
    } else {
      merged.push({ ...c, reasons: [...c.reasons] });
    }
  }

  let outFrame = 0;
  const cuts = merged.map((c, i) => {
    const frames = Math.max(1, Math.round((c.end - c.start) / frame));
    const cut = {
      cut_id: `cut-${String(i + 1).padStart(2, '0')}`,
      source_start_us: Math.round(c.start * 1e6),
      source_end_us: Math.round(c.end * 1e6),
      output_start_frame: outFrame,
      output_end_frame: outFrame + frames,
      speed_factor: 1,
      reason: c.reasons.join(' | '),
    };
    outFrame += frames;
    return cut;
  });

  const edl = EditDecisionListSchema.parse({
    timing_authority: 'speech',
    source_media_hash: input.sourceHash,
    source_duration_us: Math.round(input.sourceDurationS * 1e6),
    output_fps: fps,
    cuts,
  });
  return { edl, matches, missing, notes };
}

/** Shot changes in a video (ffmpeg scene score above `threshold`), in seconds. */
export function detectShotChanges(file: string, threshold = 0.3): number[] {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-filter:v', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw new Error(`ffmpeg failed to start: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`shot detection failed: ${(res.stderr ?? '').trim().split('\n').pop()}`);
  return [...(res.stderr ?? '').matchAll(/pts_time:([\d.]+)/g)].map(m => Number(m[1]));
}
