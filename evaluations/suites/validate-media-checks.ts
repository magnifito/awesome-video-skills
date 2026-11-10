import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SuiteContext } from '../run-suites.js';
import { runFfmpeg } from '../../packages/media/src/proc.js';
import { runValidate } from '../../packages/cli/src/commands/validate.js';
import { findDeadStops } from '../../packages/media/src/quality_checks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MGVIDEO = path.join(ROOT, 'packages/cli/src/bin/mgvideo.ts');
const PROMO = path.join(ROOT, 'fixtures', 'promo-bulgarian-15s');
const TSX = import.meta.resolve('tsx');

const sha = (buf: Buffer | string) => crypto.createHash('sha256').update(buf).digest('hex');

function mgvideo(args: string[]): { stdout: string; status: number | null; stderr: string } {
  const res = spawnSync(process.execPath, ['--import', TSX, MGVIDEO, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { stdout: res.stdout ?? '', status: res.status, stderr: res.stderr ?? '' };
}

/** A project copied from the promo fixture whose only run is the given clip (no rendering). */
function projectWithClip(tmp: string, name: string, clip: string, fps: number): string {
  const project = path.join(tmp, name);
  fs.mkdirSync(project);
  for (const f of ['brief.json', 'brand.json', 'claims.json', 'scene-plan.json', 'assets.json']) {
    fs.copyFileSync(path.join(PROMO, f), path.join(project, f));
  }
  const runId = 'run-1800000000000-cccccccc';
  const runDir = path.join(project, 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  const output = path.join(runDir, `final_output_${runId}.mp4`);
  fs.copyFileSync(clip, output);
  fs.writeFileSync(path.join(runDir, 'render-request.json'), JSON.stringify({
    run_id: runId,
    settings: { width: 320, height: 240, fps, target_loudness_lufs: -16, true_peak_ceiling_db: -1 },
    input_hashes: {
      scenes_hash: sha(fs.readFileSync(path.join(project, 'scene-plan.json'), 'utf8')),
      claims_hash: sha(fs.readFileSync(path.join(project, 'claims.json'), 'utf8'))
    }
  }));
  fs.writeFileSync(path.join(runDir, 'render-result.json'),
    JSON.stringify({ run_id: runId, output_files: [{ path: output, hash: sha(fs.readFileSync(output)) }] }));
  return project;
}

/** Encodes a test clip: a lavfi video source plus an audio filtergraph. */
function clip(out: string, video: string, audio: string): string {
  runFfmpeg(['-f', 'lavfi', '-i', video, '-filter_complex', audio, '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-shortest', out]);
  return out;
}

const issue = (r: Awaited<ReturnType<typeof runValidate>>, rule: string) => r.issues.find(i => i.rule === rule);

/** Measured validate checks: loudness, true peak, silence, stills, black, dead stops, flashes, overrides. */
export async function run(t: SuiteContext): Promise<void> {
  // --- dead-stop detector on synthetic levels ---------------------------------------------
  const steady = Array(200).fill(-20);
  t.assert(findDeadStops([...steady, ...Array(100).fill(-80)]).join() === '2', 'a steady bed that drops to silence is a dead stop at the drop');
  const faded = Array.from({ length: 150 }, (_, i) => -20 - (i * 60) / 150);
  t.assert(findDeadStops([...steady, ...faded, ...Array(50).fill(-80)]).length === 0, 'a bed that fades out is not a dead stop');
  t.assert(findDeadStops([...Array(200).fill(-60), ...Array(100).fill(-120)]).length === 0, 'a near-silent bed is below the floor');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-validate-media-'));
  try {
    const moving = 'testsrc2=s=320x240:r=25:d=4';
    // -16 LUFS sine bed, 4 s, fading out at the end.
    const good = clip(path.join(tmp, 'good.mp4'), moving, 'sine=f=330:d=4,loudnorm=I=-16:TP=-2,afade=t=out:st=3:d=1[a]');
    const goodRep = await runValidate('latest', projectWithClip(tmp, 'good', good, 25));
    t.assert(goodRep.passed && goodRep.counts.P2 === 0,
      'a moving picture with a -16 LUFS bed that fades out passes every measured check',
      goodRep.issues.map(i => `${i.severity} ${i.rule}: ${i.says}`).join('; '));
    for (const rule of ['loudness', 'true-peak', 'audio-silent', 'dead-stop', 'freeze', 'black', 'flash']) {
      t.assert(goodRep.items.some(i => i.rule === rule && i.passed), `validate reports a passed ${rule} check`);
    }

    // Quiet mix (about -31 LUFS), cut dead at 3 s, then 1 s of silence.
    const bad = clip(path.join(tmp, 'bad.mp4'), moving,
      'sine=f=330:d=3,volume=0.3[s];anullsrc=r=48000:cl=mono:d=1[z];[s][z]concat=n=2:v=0:a=1[a]');
    const badProject = projectWithClip(tmp, 'bad', bad, 25);
    const badRep = await runValidate('latest', badProject);
    t.assert(!badRep.passed && issue(badRep, 'loudness')?.severity === 'P1', 'a mix far below the target is a P1 loudness issue', issue(badRep, 'loudness')?.says);
    const stop = issue(badRep, 'dead-stop');
    t.assert(stop?.severity === 'P1' && Math.abs((stop.at_s ?? 0) - 3) < 0.1, 'a bed cut without a fade is a P1 dead stop at 3 s', JSON.stringify(stop));

    // validate.json: a deliberate override is applied and shown with its reason.
    fs.writeFileSync(path.join(badProject, 'validate.json'), JSON.stringify({
      rules: { loudness: { severity: 'P3', reason: 'quiet ambience test' }, 'dead-stop': { severity: 'off', reason: 'hard cut is the joke' } }
    }));
    const overridden = await runValidate('latest', badProject);
    t.assert(overridden.passed && issue(overridden, 'loudness')?.severity === 'P3' && !issue(overridden, 'dead-stop'),
      'validate.json lowers loudness to P3 and turns dead-stop off', overridden.issues.map(i => `${i.severity} ${i.rule}`).join(', '));
    t.assert(/quiet ambience test/.test(issue(overridden, 'loudness')?.says ?? ''), 'an override shows its reason in the report');
    fs.writeFileSync(path.join(badProject, 'validate.json'), JSON.stringify({ rules: { loudness: { severity: 'P9' } } }));
    const invalid = mgvideo(['validate', 'latest', '-p', badProject]);
    t.assert(invalid.status === 2 && /validate\.json/.test(invalid.stderr), 'an invalid validate.json stops validate with exit 2', invalid.stderr.slice(-300));

    // A still picture: 8 s of one frame (P1, past 6 s), silent track (P2).
    const still = clip(path.join(tmp, 'still.mp4'), 'color=c=gray:s=320x240:r=25:d=8', 'anullsrc=r=48000:cl=stereo:d=8[a]');
    const stillRep = await runValidate('latest', projectWithClip(tmp, 'still', still, 25));
    t.assert(issue(stillRep, 'freeze')?.severity === 'P1', 'a picture still for 8 s is a P1 freeze');
    t.assert(issue(stillRep, 'audio-silent')?.severity === 'P2' && !issue(stillRep, 'loudness'),
      'a silent track is a P2 audio-silent issue, not a loudness failure');

    // Black spans and a strobe.
    const black = clip(path.join(tmp, 'black.mp4'), 'testsrc2=s=320x240:r=25:d=4,drawbox=c=black:t=fill:enable=between(t\\,1\\,2)',
      'sine=f=330:d=4,loudnorm=I=-16:TP=-2,afade=t=out:st=3:d=1[a]');
    const blackRep = await runValidate('latest', projectWithClip(tmp, 'black', black, 25));
    t.assert(issue(blackRep, 'black')?.severity === 'P2' && Math.abs((issue(blackRep, 'black')?.at_s ?? 0) - 1) < 0.1, 'one second of black is a P2 black issue at 1 s');

    const strobe = clip(path.join(tmp, 'strobe.mp4'), "color=c=white:s=320x240:r=30:d=3,geq=lum='if(mod(N\\,2)\\,235\\,16)':cb=128:cr=128",
      'sine=f=330:d=3,loudnorm=I=-16:TP=-2,afade=t=out:st=2:d=1[a]');
    const strobeRep = await runValidate('latest', projectWithClip(tmp, 'strobe', strobe, 30));
    t.assert(issue(strobeRep, 'flash')?.severity === 'P1' && !strobeRep.passed, 'a 15 Hz full-frame strobe is a P1 flash issue');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
