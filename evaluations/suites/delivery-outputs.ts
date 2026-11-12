import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SuiteContext } from '../run-suites.js';
import { runFfmpeg } from '../../packages/media/src/proc.js';
import { runValidate, summarize, type ValidationItem } from '../../packages/cli/src/commands/validate.js';
import { runBrandCheck } from '../../packages/cli/src/commands/brand.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MGVIDEO = path.join(ROOT, 'packages/cli/src/bin/mgvideo.ts');
const PROMO = path.join(ROOT, 'fixtures', 'promo-bulgarian-15s');

/** tsx loader as a file URL, so the CLI also runs from a cwd outside the repository. */
const TSX = import.meta.resolve('tsx');

const sha = (buf: Buffer | string) => crypto.createHash('sha256').update(buf).digest('hex');

/** Runs the CLI from source; returns stdout, exit status and stderr. */
function mgvideo(args: string[], cwd = ROOT): { stdout: string; status: number | null; stderr: string } {
  const res = spawnSync(process.execPath, ['--import', TSX, MGVIDEO, ...args], { cwd, encoding: 'utf8' });
  return { stdout: res.stdout ?? '', status: res.status, stderr: res.stderr ?? '' };
}

/**
 * Writes a render run without rendering: a tiny clip plus render-request/render-result manifests
 * bound to the project's scene plan and claims, so validate passes on it.
 */
function writeFakeRun(projectDir: string, runId: string, clip: string): void {
  const runDir = path.join(projectDir, 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  const output = path.join(runDir, `final_output_${runId}.mp4`);
  fs.copyFileSync(clip, output);
  const request = {
    run_id: runId,
    settings: { width: 320, height: 240, fps: 25 },
    input_hashes: {
      scenes_hash: sha(fs.readFileSync(path.join(projectDir, 'scene-plan.json'), 'utf8')),
      claims_hash: sha(fs.readFileSync(path.join(projectDir, 'claims.json'), 'utf8'))
    }
  };
  const result = { run_id: runId, output_files: [{ path: output, hash: sha(fs.readFileSync(output)) }] };
  fs.writeFileSync(path.join(runDir, 'render-request.json'), JSON.stringify(request));
  fs.writeFileSync(path.join(runDir, 'render-result.json'), JSON.stringify(result));
}

/** `--out` files for validate, chapters and brand check; `validate latest`; brand check pass/fail. */
export async function run(t: SuiteContext): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-delivery-'));
  try {
    // --- project copy with two runs; the newer one (by run-<epochMs> name) must win ---------
    const project = path.join(tmp, 'promo');
    fs.mkdirSync(project);
    for (const f of ['brief.json', 'brand.json', 'claims.json', 'scene-plan.json', 'assets.json']) {
      fs.copyFileSync(path.join(PROMO, f), path.join(project, f));
    }
    const clip = path.join(tmp, 'clip.mp4');
    // A -16 LUFS tone that fades out, so the measured validate checks pass too.
    runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=s=320x240:r=25:d=1', '-f', 'lavfi', '-i', 'sine=d=1',
      '-af', 'loudnorm=I=-16:TP=-2,afade=t=out:st=0.85:d=0.15', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]);
    const older = 'run-1700000000000-aaaaaaaa';
    const newer = 'run-1800000000000-bbbbbbbb';
    writeFakeRun(project, newer, clip);
    writeFakeRun(project, older, clip);
    // Touch the older run last: the name, not the mtime, decides which run is newest.
    fs.utimesSync(path.join(project, 'runs', older), new Date(), new Date());

    const latest = await runValidate('latest', project);
    t.assert(latest.run_id === newer, 'validate "latest" resolves the newest run by its run-<epochMs> name', latest.run_id);
    t.assert(latest.passed, 'validate passes on the synthetic run', latest.issues.map(i => `${i.severity} ${i.rule}: ${i.says}`).join('; '));
    const byDefault = await runValidate(undefined, project);
    t.assert(byDefault.run_id === newer, 'validate with no run id defaults to the newest run');
    let emptyErr = '';
    try {
      fs.mkdirSync(path.join(tmp, 'empty'));
      await runValidate('latest', path.join(tmp, 'empty'));
    } catch (err) {
      emptyErr = (err as Error).message;
    }
    t.assert(/No rendered run/.test(emptyErr), 'validate "latest" without runs fails with a clear message', emptyErr);

    // --- validate --out: file equals stdout -------------------------------------------------
    const validateTxt = path.join(tmp, 'out', 'validate.txt');
    const v = mgvideo(['validate', 'latest', '-p', project, '--out', validateTxt]);
    t.assert(v.status === 0, 'mgvideo validate latest -p exits 0 on a passing run', v.stderr.slice(-400));
    t.assert(fs.existsSync(validateTxt), 'validate --out writes the report file (parent directory created)');
    const vFile = fs.existsSync(validateTxt) ? fs.readFileSync(validateTxt, 'utf8') : '';
    t.assert(vFile.trim() === v.stdout.trim() && vFile.includes(newer), 'validate --out file equals stdout and names the newest run');

    const reportJson = path.join(tmp, 'out', 'validation-report.json');
    const vj = mgvideo(['validate', '-p', project, '--json', '--out', reportJson]);
    const jFile = fs.existsSync(reportJson) ? fs.readFileSync(reportJson, 'utf8') : '';
    t.assert(vj.status === 0 && jFile.trim() === vj.stdout.trim(), 'validate --json --out file equals stdout');
    t.assert(jFile !== '' && JSON.parse(jFile).run_id === newer, 'validate --json report (no run id given) is for the newest run');

    // Without -p, "latest" looks in the current directory.
    const vc = mgvideo(['validate', '--json'], project);
    t.assert(vc.status === 0 && JSON.parse(vc.stdout).run_id === newer, 'validate with no run and no -p uses the cwd project');

    // --- ranked report: every check carries a rule id and a severity ------------------------
    t.assert(latest.items.every(i => /^[a-z0-9-]+$/.test(i.rule) && /^P[0-3]$/.test(i.severity)),
      'every validate check has a rule id and a P0-P3 severity');
    t.assert(latest.issues.length === 0 && latest.counts.P0 === 0 && latest.counts.P1 === 0, 'a passing run has no issues');
    t.assert(/ ok file-integrity /.test(v.stdout), 'the text report lists passed checks as ok lines', v.stdout.slice(0, 400));

    const item = (rule: string, severity: ValidationItem['severity'], passed: boolean, at_s?: number): ValidationItem =>
      ({ rule, severity, passed, check: rule, details: `${rule} says`, ...(at_s !== undefined ? { at_s } : {}), fix: `${rule} fix` });
    const advisory = summarize('r', [item('a', 'P2', false), item('b', 'P3', false), item('c', 'P0', true)], []);
    t.assert(advisory.passed && advisory.failed_checks === 2 && advisory.counts.P2 === 1,
      'P2 and P3 failures are reported but do not fail the report');
    const ranked = summarize('r', [item('late', 'P2', false, 9), item('early', 'P2', false, 1), item('blocker', 'P1', false), item('worst', 'P0', false, 5)], []);
    t.assert(!ranked.passed, 'a P1 or P0 failure fails the report');
    t.assert(ranked.issues.map(i => i.rule).join(',') === 'worst,blocker,early,late',
      'issues are ranked by severity, then by time', ranked.issues.map(i => i.rule).join(','));
    t.assert(ranked.issues[0].says === 'worst says' && ranked.issues[0].fix === 'worst fix' && ranked.issues[0].at_s === 5,
      'an issue carries what it says, the fix and the time');

    // A changed claims register is a P0 failure: exit 1, ranked first in the text report.
    const changed = path.join(tmp, 'changed');
    fs.cpSync(project, changed, { recursive: true });
    fs.appendFileSync(path.join(changed, 'claims.json'), '\n');
    const vf = mgvideo(['validate', 'latest', '-p', changed]);
    t.assert(vf.status === 1 && /\n P0 inputs-unchanged: /.test(vf.stdout) && /fix: Re-render/.test(vf.stdout),
      'validate exits 1 and ranks a changed input as P0 with a fix', vf.stdout.slice(0, 600));
    const vfj = mgvideo(['validate', 'latest', '-p', changed, '--json']);
    const fj = vfj.status === 1 ? JSON.parse(vfj.stdout) : null;
    t.assert(fj?.issues?.[0]?.rule === 'inputs-unchanged' && fj?.issues?.[0]?.severity === 'P0' && fj?.counts?.P0 >= 1,
      'validate --json lists the ranked issues with counts');
    // Validation that cannot run at all exits 2, not 1.
    const v2 = mgvideo(['validate', 'latest', '-p', path.join(tmp, 'empty')]);
    t.assert(v2.status === 2, 'validate exits 2 when there is no run to validate', `status ${v2.status}`);

    // --- chapters --out: file holds the printed chapter text --------------------------------
    const chaptersTxt = path.join(tmp, 'out', 'chapters.txt');
    const ch = mgvideo(['chapters', project, '--out', chaptersTxt]);
    const chFile = fs.existsSync(chaptersTxt) ? fs.readFileSync(chaptersTxt, 'utf8') : '';
    t.assert(ch.status === 0 && chFile.startsWith('00:00 '), 'chapters --out writes YouTube chapters starting at 00:00', chFile.slice(0, 80));
    t.assert(chFile.trim() !== '' && ch.stdout.includes(chFile.trim()), 'chapters --out file equals the chapter text printed on stdout');
    const vttFile = path.join(tmp, 'out', 'chapters.vtt');
    const chv = mgvideo(['chapters', project, '--format', 'vtt', '--out', vttFile]);
    const vtt = fs.existsSync(vttFile) ? fs.readFileSync(vttFile, 'utf8') : '';
    t.assert(chv.status === 0 && vtt.startsWith('WEBVTT') && chv.stdout.includes(vtt.trim()), 'chapters --format vtt prints and writes WebVTT');

    // --- brand check ------------------------------------------------------------------------
    const good = path.join(ROOT, 'showcase', 'v02-brand-swap', 'magnifito');
    const goodRep = runBrandCheck(good);
    t.assert(goodRep.passed, 'brand check passes the Magnifito brand (TTF font, licence, Cyrillic)',
      goodRep.checks.filter(c => !c.passed).map(c => c.check).join('; '));
    t.assert(goodRep.warnings.length > 0 && goodRep.passed, 'a low-contrast accent is a warning and does not fail the check');

    const brandJson = path.join(tmp, 'out', 'brand-check.json');
    const bc = mgvideo(['brand', 'check', path.join(good, 'brand.json'), '--json', '--out', brandJson]);
    const bFile = fs.existsSync(brandJson) ? fs.readFileSync(brandJson, 'utf8') : '';
    t.assert(bc.status === 0 && bFile.trim() === bc.stdout.trim() && JSON.parse(bFile).passed === true,
      'mgvideo brand check --json --out exits 0 and the file equals stdout', bc.stderr.slice(-400));

    const lowDir = path.join(tmp, 'low');
    fs.cpSync(good, lowDir, { recursive: true, filter: src => !/^(runs|work)(\/|\\|$)/.test(path.relative(good, src)) });
    const lowBrand = JSON.parse(fs.readFileSync(path.join(lowDir, 'brand.json'), 'utf8'));
    lowBrand.colors.text_primary = '#cfc6b8'; // light grey on the cream background
    fs.writeFileSync(path.join(lowDir, 'brand.json'), JSON.stringify(lowBrand, null, 2));
    const lowRep = runBrandCheck(lowDir);
    t.assert(!lowRep.passed && lowRep.checks.some(c => c.check.startsWith('Contrast: text_primary on background') && !c.passed),
      'brand check fails a brand whose text colour has low contrast');
    const lowTxt = path.join(tmp, 'out', 'brand-low.txt');
    const bl = mgvideo(['brand', 'check', lowDir, '--out', lowTxt]);
    const lFile = fs.existsSync(lowTxt) ? fs.readFileSync(lowTxt, 'utf8') : '';
    t.assert(bl.status === 1 && lFile.includes('FAILED') && lFile.trim() === bl.stdout.trim(),
      'mgvideo brand check exits 1 on failure and still writes the --out report');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
