import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { SuiteContext } from '../run-suites.js';
import { REVIEW_AXES, type ReviewRound } from '../../packages/contracts/src/index.js';
import { calibrationStatus, judgeItems, judgeRounds, prepareReview } from '../../packages/cli/src/commands/review.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROMO = path.join(ROOT, 'fixtures', 'promo-bulgarian-15s');

function round(n: number, score: number, defects: ReviewRound['defects'] = [], low?: number): ReviewRound {
  const scores = Object.fromEntries(REVIEW_AXES.pitch.map((a, i) => [a, i === 0 && low !== undefined ? low : score]));
  return { schema_version: '1.0.0', round: n, mode: 'pitch', blind_read: 'An ad for a coding school, for adults changing careers.', scores, defects, changed: n > 1 ? 'one thing' : '' };
}
const defect = (tile: number, level: 'P0' | 'P1' | 'P2' | 'P3', wrong = 'headline runs into the logo'): ReviewRound['defects'][0] =>
  ({ tile, where: 'headline', wrong, fix: 'move the logo down', level });

/** Blind review loop: sheets, pass decided in code, advisory until calibrated. */
export async function run(t: SuiteContext): Promise<void> {
  // --- decisions ---------------------------------------------------------------------------
  t.assert(judgeRounds([round(1, 8)]).status === 'continue', 'one passing round is not enough');
  t.assert(judgeRounds([round(1, 8), round(2, 8)]).status === 'pass', 'two passing rounds in a row pass');
  t.assert(judgeRounds([round(1, 8), round(2, 8, [defect(3, 'P1')])]).status === 'continue', 'a P1 defect blocks the round');
  t.assert(judgeRounds([round(1, 8), round(2, 8, [defect(3, 'P2')])]).status === 'pass', 'P2 and P3 defects do not block');
  t.assert(!judgeRounds([round(1, 8, [], 5), round(2, 8, [], 5)]).rounds[1].passes, 'a score under 6 fails the round even with a high mean');
  t.assert(!judgeRounds([round(1, 6.5)]).rounds[0].passes, 'a mean under 7 fails the round');
  const plateau = judgeRounds([round(1, 5), round(2, 5.5), round(3, 5.8)]);
  t.assert(plateau.status === 'stop' && plateau.reason.includes('gained under'), 'under 1 point gained in each of two rounds stops the loop', plateau.reason);
  const stuck = judgeRounds([round(1, 5, [defect(4, 'P2')]), round(2, 6.5, [defect(4, 'P2', 'Headline runs into the logo!')]), round(3, 8, [defect(4, 'P1')])]);
  t.assert(stuck.status === 'stop' && stuck.reason.includes('tile 4'), 'the same defect three rounds running stops the loop', stuck.reason);
  const capped = judgeRounds(Array.from({ length: 8 }, (_, i) => round(i + 1, i % 2 ? 9 : 4)));
  t.assert(capped.status === 'stop' && capped.reason.includes('8 rounds'), 'eight rounds without two passes in a row stop the loop', capped.reason);
  const unscored = judgeRounds([{ ...round(1, 9), scores: { open: 9 } }]);
  t.assert(unscored.rounds[0].problems.some(p => p.startsWith('missing scores')), 'a round must score every axis of its mode');

  // --- calibration -------------------------------------------------------------------------
  const entry = (j: boolean, p: boolean) => ({ run: 'r', round: 1, judge_pass: j, person_pass: p, recorded_at: '2026-11-12T00:00:00Z', note: '' });
  t.assert(!calibrationStatus({ schema_version: '1.0.0', entries: Array.from({ length: 9 }, () => entry(true, true)) }).calibrated, 'nine agreeing rounds are not enough');
  t.assert(calibrationStatus({ schema_version: '1.0.0', entries: [...Array.from({ length: 8 }, () => entry(true, true)), entry(true, false), entry(false, false)] }).calibrated,
    'ten rounds at 90 % agreement calibrate the judge');
  t.assert(!calibrationStatus({ schema_version: '1.0.0', entries: [...Array.from({ length: 7 }, () => entry(true, true)), ...Array.from({ length: 3 }, () => entry(true, false))] }).calibrated,
    '70 % agreement does not');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-review-'));
  const savedEnv = process.env.MGVIDEO_JUDGE_CALIBRATION;
  try {
    // --- sheets and blind brief ------------------------------------------------------------
    const video = path.join(tmp, 'clip.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=3', '-pix_fmt', 'yuv420p', video]);
    const prep = prepareReview(video, PROMO, path.join(tmp, 'run', 'review'));
    t.assert(prep.sheets.length === 1 && fs.existsSync(prep.sheets[0]) && prep.tiles.length === 6 && prep.tiles[5].t === 2.5,
      'a 3 s clip gives one sheet of six tiles, 0.5 s apart', JSON.stringify(prep.tiles.map(x => x.t)));
    const brief = fs.readFileSync(prep.briefPath, 'utf8');
    const plan = JSON.parse(fs.readFileSync(path.join(PROMO, 'scene-plan.json'), 'utf8'));
    t.assert(brief.includes('Mode: pitch') && brief.includes(REVIEW_AXES.pitch.join(', ')) && !plan.scenes.some((s: { copy_text: string }) => brief.includes(s.copy_text)),
      'the blind brief names the mode and axes but not the scene copy');

    // --- validate items: advisory until calibrated --------------------------------------------
    const runDir = path.join(tmp, 'run');
    fs.writeFileSync(path.join(runDir, 'review', 'round-01.json'), JSON.stringify(round(1, 8, [defect(2, 'P1')])));
    process.env.MGVIDEO_JUDGE_CALIBRATION = path.join(tmp, 'none.json');
    const advisory = judgeItems(runDir);
    const d = advisory.find(i => i.rule === 'judge');
    t.assert(!!d && d.severity === 'P2' && d.details.startsWith('[advisory]') && d.details.includes('judged P1'), 'uncalibrated, a P1 judge defect is reported as advisory P2', JSON.stringify(d));
    t.assert(advisory.find(i => i.rule === 'judge-decision')?.severity === 'P3', 'uncalibrated, the decision is a P3 note');

    const cal = path.join(tmp, 'cal.json');
    fs.writeFileSync(cal, JSON.stringify({ entries: Array.from({ length: 10 }, () => entry(true, true)) }));
    process.env.MGVIDEO_JUDGE_CALIBRATION = cal;
    const binding = judgeItems(runDir);
    t.assert(binding.find(i => i.rule === 'judge')?.severity === 'P1' && binding.find(i => i.rule === 'judge-decision')?.severity === 'P1',
      'calibrated, judge defects keep their level and the decision can block');
    t.assert(judgeItems(path.join(tmp, 'no-run')).length === 0, 'a run without review rounds gets no judge items');

    const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'evaluations', 'judge-calibration.json'), 'utf8'));
    t.assert(Array.isArray(committed.entries), 'evaluations/judge-calibration.json holds the calibration record');
  } finally {
    if (savedEnv === undefined) delete process.env.MGVIDEO_JUDGE_CALIBRATION;
    else process.env.MGVIDEO_JUDGE_CALIBRATION = savedEnv;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
