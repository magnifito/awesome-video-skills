/**
 * Blind review loop: frame sheets and a blind brief for a reviewer that never sees code or the
 * builder's notes, and a pass decision made in code from the reviewer's rounds.
 *
 * Pass: no P0 or P1 defect, lowest score at least 6, mean at least 7, and the round before also
 * passed. Stop without a pass: 8 rounds, the mean gained under 1 point in each of the last two
 * rounds, or the same defect is reported in three rounds in a row.
 *
 * Until the judge agrees with a person on at least 10 rounds (80 %), its defects are advisory:
 * `mgvideo validate` lists them but they never block delivery.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  JudgeCalibrationSchema,
  ProjectBriefSchema,
  REVIEW_AXES,
  ReviewRoundSchema,
  type JudgeCalibration,
  type ReviewMode,
  type ReviewRound,
} from '../../../contracts/src/index.js';
import { probe, rasterizeSvg } from '../../../media/src/proc.js';
import { findWorkspaceRoot } from './_shared.js';
import type { ValidationItem } from './validate.js';

export const PASS_MIN_SCORE = 6;
export const PASS_MEAN = 7;
export const MAX_ROUNDS = 8;
export const PLATEAU_GAIN = 1;
export const CALIBRATION_MIN_ROUNDS = 10;
export const CALIBRATION_AGREEMENT = 0.8;

export interface SheetTile { tile: number; t: number; sheet: string }

export interface PrepareResult { dir: string; sheets: string[]; tiles: SheetTile[]; briefPath: string }

/**
 * Writes `<dir>/sheet-NN.png` (tiles every `interval` seconds, each labelled with its number and
 * time), `<dir>/tiles.json` and `<dir>/brief.md` (only what a viewer would know: objective,
 * audience, language, formats, mode and its axes).
 */
export function prepareReview(video: string, projectDir: string, dir: string, opts: { interval?: number; mode?: ReviewMode } = {}): PrepareResult {
  const interval = opts.interval ?? 0.5;
  const cols = 6, rows = 4;
  const info = probe(video);
  const duration = info.durationSeconds;
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^sheet-\d+\.png$/.test(f)) fs.rmSync(path.join(dir, f));
  const pad = 4;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `fps=1/${interval},scale=480:-2,tile=${cols}x${rows}:padding=${pad}:color=white`,
    '-fps_mode', 'passthrough', path.join(dir, 'sheet-%02d.png')]);
  const sheets = fs.readdirSync(dir).filter(f => /^sheet-\d+\.png$/.test(f)).sort();
  const count = Math.max(1, Math.floor(duration / interval + 1e-6));
  const tiles: SheetTile[] = Array.from({ length: count }, (_, i) => ({
    tile: i + 1, t: Math.round(i * interval * 1000) / 1000, sheet: sheets[Math.floor(i / (cols * rows))] ?? sheets[sheets.length - 1],
  }));
  // Number and time on every tile, drawn as an SVG overlay (ffmpeg builds without drawtext exist).
  sheets.forEach((sheet, si) => {
    const file = path.join(dir, sheet);
    const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' })
      .trim().split(',').map(Number);
    const tw = (W - (cols - 1) * pad) / cols;
    const th = (H - (rows - 1) * pad) / rows;
    const fs_ = Math.max(14, Math.round(th / 14));
    const labels = tiles.filter(x => x.sheet === sheet).map((x, k) => {
      const c = k % cols, r = Math.floor(k / cols);
      const text = `#${x.tile}  ${x.t.toFixed(1)} s`;
      const lx = c * (tw + pad) + 6, ly = r * (th + pad) + 6;
      return `<rect x="${lx}" y="${ly}" width="${Math.round(text.length * fs_ * 0.62 + 12)}" height="${fs_ + 10}" rx="4" fill="#000" fill-opacity="0.7"/>` +
        `<text x="${lx + 6}" y="${ly + fs_ + 2}" font-family="Helvetica, Arial, sans-serif" font-size="${fs_}" font-weight="bold" fill="#fff">${text}</text>`;
    });
    if (labels.length === 0) return;
    const svg = path.join(dir, `.labels-${si}.svg`);
    const png = path.join(dir, `.labels-${si}.png`);
    fs.writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${labels.join('')}</svg>`);
    try {
      rasterizeSvg(svg, png, W, H);
      const out = path.join(dir, `.sheet-${si}.png`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-i', png, '-filter_complex', 'overlay=0:0', '-frames:v', '1', '-update', '1', out]);
      fs.renameSync(out, file);
    } finally {
      fs.rmSync(svg, { force: true });
      fs.rmSync(png, { force: true });
    }
  });
  fs.writeFileSync(path.join(dir, 'tiles.json'), JSON.stringify({ interval_s: interval, tiles }, null, 2));

  const brief = ProjectBriefSchema.parse(JSON.parse(fs.readFileSync(path.join(projectDir, 'brief.json'), 'utf8')));
  const mode = opts.mode ?? modeFor(brief.workflow);
  const briefPath = path.join(dir, 'brief.md');
  fs.writeFileSync(briefPath, [
    '# Blind review brief',
    '',
    `- Objective: ${brief.objective}`,
    `- Audience: ${brief.audience}`,
    `- Language: ${brief.language}`,
    `- Length: ${duration.toFixed(1)} s, formats ${brief.formats.join(', ')}`,
    `- Mode: ${mode}`,
    `- Axes (score each 0-10): ${REVIEW_AXES[mode].join(', ')}`,
    '',
    `The sheets show one tile every ${interval} s, numbered in the top-left corner with its time.`,
    'Sound is not on the sheets; do not score it.',
    '',
  ].join('\n'));
  return { dir, sheets: sheets.map(s => path.join(dir, s)), tiles, briefPath };
}

/** Default review mode for a workflow. */
export function modeFor(workflow: string): ReviewMode {
  if (workflow === 'product-demo' || workflow === 'multilingual-explainer') return 'explain';
  if (workflow === 'talking-head-edit') return 'story';
  return 'pitch';
}

export interface RoundCheck { round: number; mean: number; min: number; blocking: number; passes: boolean; problems: string[] }

export interface JudgeDecision {
  status: 'pass' | 'continue' | 'stop';
  reason: string;
  rounds: RoundCheck[];
  /** Defects of the latest round. */
  latest: ReviewRound | null;
}

const defectKey = (d: ReviewRound['defects'][0]) => `${d.tile}|${d.wrong.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;

/** Scores one round against its mode's axes. */
export function checkRound(r: ReviewRound): RoundCheck {
  const axes = REVIEW_AXES[r.mode];
  const problems: string[] = [];
  const missing = axes.filter(a => r.scores[a] === undefined);
  if (missing.length) problems.push(`missing scores: ${missing.join(', ')}`);
  const values = axes.map(a => r.scores[a] ?? 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const blocking = r.defects.filter(d => d.level === 'P0' || d.level === 'P1').length;
  if (blocking) problems.push(`${blocking} blocking defect(s)`);
  if (min < PASS_MIN_SCORE) problems.push(`lowest score ${min} < ${PASS_MIN_SCORE}`);
  if (mean < PASS_MEAN) problems.push(`mean ${mean.toFixed(2)} < ${PASS_MEAN}`);
  return { round: r.round, mean: Math.round(mean * 100) / 100, min, blocking, passes: problems.length === 0, problems };
}

/** The decision over all rounds so far, in round order. */
export function judgeRounds(rounds: ReviewRound[]): JudgeDecision {
  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  const checks = sorted.map(checkRound);
  const latest = sorted[sorted.length - 1] ?? null;
  if (!latest) return { status: 'continue', reason: 'no rounds yet', rounds: checks, latest };
  const n = checks.length;
  if (n >= 2 && checks[n - 1].passes && checks[n - 2].passes) {
    return { status: 'pass', reason: `rounds ${checks[n - 2].round} and ${checks[n - 1].round} both pass`, rounds: checks, latest };
  }
  if (n >= MAX_ROUNDS) return { status: 'stop', reason: `${MAX_ROUNDS} rounds without two passing in a row`, rounds: checks, latest };
  if (n >= 3 && checks[n - 1].mean - checks[n - 2].mean < PLATEAU_GAIN && checks[n - 2].mean - checks[n - 3].mean < PLATEAU_GAIN && !checks[n - 1].passes) {
    return { status: 'stop', reason: `mean gained under ${PLATEAU_GAIN} point in each of the last two rounds`, rounds: checks, latest };
  }
  if (n >= 3) {
    const keys = sorted.slice(-3).map(r => new Set(r.defects.map(defectKey)));
    const stuck = [...keys[2]].filter(k => keys[0].has(k) && keys[1].has(k));
    if (stuck.length) return { status: 'stop', reason: `the same defect in three rounds in a row (tile ${stuck[0].split('|')[0]})`, rounds: checks, latest };
  }
  return {
    status: 'continue',
    reason: checks[n - 1].passes ? 'this round passes; one more passing round is needed' : checks[n - 1].problems.join('; '),
    rounds: checks, latest,
  };
}

/** Reads `round-*.json` from a review directory, validated. */
export function readRounds(dir: string): ReviewRound[] {
  return fs.readdirSync(dir).filter(f => /^round-\d+\.json$/.test(f)).sort()
    .map(f => {
      try {
        return ReviewRoundSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      } catch (err) {
        throw new Error(`${f}: ${(err as Error).message.split('\n').slice(0, 4).join(' ')}`);
      }
    });
}

export interface CalibrationStatus { rounds: number; agreement: number; calibrated: boolean }

export function calibrationStatus(c: JudgeCalibration): CalibrationStatus {
  const n = c.entries.length;
  const agree = c.entries.filter(e => e.judge_pass === e.person_pass).length;
  const agreement = n ? agree / n : 0;
  return { rounds: n, agreement: Math.round(agreement * 1000) / 1000, calibrated: n >= CALIBRATION_MIN_ROUNDS && agreement >= CALIBRATION_AGREEMENT };
}

/** Calibration record at `file`, or an empty one. */
export function readCalibration(file: string): JudgeCalibration {
  if (!fs.existsSync(file)) return JudgeCalibrationSchema.parse({});
  return JudgeCalibrationSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** The toolkit's calibration record (`MGVIDEO_JUDGE_CALIBRATION` overrides the path). */
export function calibrationPath(): string {
  return process.env.MGVIDEO_JUDGE_CALIBRATION || path.join(findWorkspaceRoot(), 'evaluations', 'judge-calibration.json');
}

/**
 * Validate items from `<run>/review/round-*.json`: the latest round's defects and the loop's
 * decision. Uncalibrated, defects are capped at P2 and the decision at P3, so they never block.
 */
export function judgeItems(runDir: string): ValidationItem[] {
  const dir = path.join(runDir, 'review');
  if (!fs.existsSync(dir)) return [];
  let rounds: ReviewRound[];
  try {
    rounds = readRounds(dir);
  } catch (err) {
    return [{ rule: 'judge', severity: 'P2', check: 'Blind review', passed: false, fix: 'Fix the round file so it matches ReviewRoundSchema.', details: `Unreadable review round: ${(err as Error).message}` }];
  }
  if (rounds.length === 0) return [];
  let calibrated = false;
  try {
    calibrated = calibrationStatus(readCalibration(calibrationPath())).calibrated;
  } catch { /* no workspace or unreadable record: advisory */ }
  const decision = judgeRounds(rounds);
  const tag = calibrated ? '' : '[advisory] ';
  const cap = (level: ValidationItem['severity']): ValidationItem['severity'] => (calibrated || level === 'P2' || level === 'P3' ? level : 'P2');
  const items: ValidationItem[] = (decision.latest?.defects ?? []).map(d => ({
    rule: 'judge', severity: cap(d.level), check: 'Blind review', passed: false, fix: d.fix,
    details: `${tag}round ${decision.latest!.round}, tile ${d.tile} (${d.where}): ${d.wrong}${!calibrated && cap(d.level) !== d.level ? ` (judged ${d.level})` : ''}`,
  }));
  const last = decision.rounds[decision.rounds.length - 1];
  items.push({
    rule: 'judge-decision', severity: calibrated ? 'P1' : 'P3', check: 'Blind review decision', passed: decision.status === 'pass',
    fix: decision.status === 'stop' ? 'The loop stopped without a pass: ask a person to review.' : 'Change one thing, prepare the sheets again and run another blind round.',
    details: `${tag}${decision.status}: ${decision.reason} (round ${last.round}: mean ${last.mean}, lowest ${last.min}).`,
  });
  return items;
}
