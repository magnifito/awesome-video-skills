import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SuiteContext } from '../run-suites.js';
import {
  BrollPlanSchema, brollOverlaps, checkBrollAgainstSource, defaultBrollFile, parseFps, resolveBrollArea,
} from '../../packages/contracts/src/index.js';
import { buildComposeArgs, composeBroll, loadBrollPlan, resolveBrollPlan, type ResolvedBrollPlan } from '../../packages/media/src/broll.js';
import { captionTimestamp, captionTranscript, captionWordsText, parseCaptionWords } from '../../packages/media/src/caption_words.js';
import { probe, runFfmpeg } from '../../packages/media/src/proc.js';
import { motionAvailability } from '../../packages/motion/src/capture.js';
import { brollSheetTimes, renderBroll, videoContactSheet } from '../../packages/motion/src/broll.js';

const W = 640;
const H = 360;
const FPS = 24;
const DURATION = 4;

function throws(fn: () => unknown, re?: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return re ? re.test(err instanceof Error ? err.message : String(err)) : true;
  }
}

const clip = (over: Record<string, unknown> = {}) => ({
  id: 'a', title: 'A', in: 0.5, out: 2.5, kind: 'full', recipe: 'motion-kinetic-type', scene: { copy: 'Hello' }, ...over,
});
const plan = (clips: unknown[], over: Record<string, unknown> = {}) => ({ video: 'source.mp4', clips, ...over });
const valid = (p: unknown) => BrollPlanSchema.safeParse(p).success;

/** Decodes the frame at time `t` to RGB24. */
function frameAt(file: string, t: number): Buffer {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ss', t.toFixed(3), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
}

/** Mean absolute RGB difference inside a rectangle. */
function meanDiff(a: Buffer, b: Buffer, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3;
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      n += 3;
    }
  }
  return sum / n;
}

export async function run(t: SuiteContext): Promise<void> {
  // --- contract ----------------------------------------------------------------------------
  t.assert(valid(plan([clip()])), 'a minimal full-clip plan parses');
  t.assert(!valid(plan([clip({ in: 2, out: 2 })])) && !valid(plan([clip({ in: 3, out: 2 })])), 'in must be before out');
  t.assert(!valid(plan([clip(), clip({ id: 'b', in: 2.0, out: 3.0 })])), 'overlapping clips are rejected');
  t.assert(valid(plan([clip(), clip({ id: 'b', in: 2.5, out: 3.5 })])), 'touching clips (out == next in) are allowed');
  t.assert(brollOverlaps([{ id: 'x', in: 3, out: 4 }, { id: 'y', in: 0, out: 3.5 }]).length === 1, 'overlap check sorts clips by in-point');
  t.assert(!valid(plan([clip(), clip({ in: 3, out: 4 })])), 'duplicate clip ids are rejected');
  t.assert(!valid(plan([clip({ fragment: 'clips/a.html' })])) && !valid(plan([clip({ recipe: undefined })])), 'exactly one of recipe or fragment is required');
  t.assert(!valid(plan([clip({ kind: 'panel', recipe: 'motion-kinetic-type' })])), 'panel clips only accept panel-aware recipes');
  t.assert(valid(plan([clip({ kind: 'panel', recipe: 'motion-bars-chart', scene: { copy: 'x: 1' } })])), 'bars-chart panel parses');
  t.assert(!valid(plan([clip({ kind: 'panel', recipe: 'motion-bars-chart', file: 'out/a.mp4' })])), 'panel clips must be written to .mov');
  t.assert(!valid(plan([clip({ file: 'out/a.mov' })])), 'full clips must be written to .mp4');
  t.assert(!valid(plan([clip({ recipe: 'motion-card-morph', in: 0, out: 2 })])), 'card-morph below its minimum duration is rejected');
  t.assert(!valid(plan([clip({ id: '../x' })])), 'clip ids are restricted to safe characters');
  t.assert(Math.abs(parseFps('30000/1001') - 29.97) < 0.001 && parseFps(25) === 25 && throws(() => parseFps('0/1')), 'fps parses numbers and rationals');
  t.assert(defaultBrollFile({ id: '02', in: 6.75, kind: 'panel' }) === 'out/02_0m06s75.mov' && defaultBrollFile({ id: 'x', in: 72.3, kind: 'full' }) === 'out/x_1m12s30.mp4',
    'default clip file is named by its timeline in-point');
  const right = resolveBrollArea(undefined, 1920, 1080);
  const left = resolveBrollArea('left', 1920, 1080);
  t.assert(right.x >= 960 && right.x + right.w <= 1920 - 90 && left.x + left.w <= 960, 'area presets keep the panel on one half, inside title-safe margins', JSON.stringify({ right, left }));
  const parsed = BrollPlanSchema.parse(plan([clip({ out: 4.2 })], { fps: '30' }));
  const srcProblems = checkBrollAgainstSource(parsed, { duration: 4, fps: 24, width: W, height: H });
  t.assert(srcProblems.some(p => /past the end/.test(p)) && srcProblems.some(p => /fps/.test(p)), 'out past the source end and fps mismatch are reported', srcProblems.join(' | '));
  const area = BrollPlanSchema.parse(plan([clip({ kind: 'panel', recipe: 'motion-bars-chart', area: { x: 400, y: 0, w: 300, h: 100 } })]));
  t.assert(checkBrollAgainstSource(area, { duration: 4, fps: 24, width: W, height: H }).some(p => /does not fit/.test(p)), 'a panel area outside the frame is reported');

  // --- caption words (port of words.py) ------------------------------------------------------
  t.assert(captionTimestamp('00:01:02,500') === 62.5 && captionTimestamp('01:02.250') === 62.25 && throws(() => captionTimestamp('1:x')), 'SRT and VTT timestamps parse');
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello world\n\n2\n00:00:03,000 --> 00:00:04,000\n<i>Next</i> line\n';
  const words = parseCaptionWords(srt);
  t.assert(words.length === 4 && words[0].start === 1 && Math.abs(words[1].start - (1 + 6 / 12)) < 1e-9 && words[2].word === 'Next', 'SRT cues spread words by characters and strip tags', JSON.stringify(words));
  t.assert(words[0].end === words[1].start && words[1].end === 2, 'word ends are the next start or the cue end');
  t.assert(captionWordsText(words) === '1.00:Hello 1.50:world\n3.00:Next 3.50:line\n', 'words.txt matches the upstream format', JSON.stringify(captionWordsText(words)));
  const vtt = 'WEBVTT\n\nNOTE skip me\n\n00:00.500 --> 00:01.500 align:start\nHi there\n';
  t.assert(parseCaptionWords(vtt).length === 2, 'VTT header, NOTE blocks and cue settings are handled');
  t.assert(throws(() => parseCaptionWords('no cues here'), /No caption cues/), 'text without cues is rejected');
  const tr = captionTranscript(words, 'captions-sha256:x');
  t.assert(tr.words.length === 4 && tr.words[0].start_ms === 1000 && tr.words[0].confidence === 0.5, 'caption words convert to a Transcript contract');

  // --- plan resolution against a real source (paths, bounds) ---------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-broll-'));
  try {
    const src = path.join(tmp, 'source.mp4');
    runFfmpeg([
      '-loglevel', 'error',
      '-f', 'lavfi', '-i', `testsrc=s=${W}x${H}:r=${FPS}:d=${DURATION}`,
      '-f', 'lavfi', '-i', `sine=f=440:sample_rate=48000:d=${DURATION}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', String(FPS), '-c:a', 'aac', '-shortest', src,
    ]);
    const planPath = path.join(tmp, 'plan.json');
    const resolve = (p: unknown) => resolveBrollPlan(p, planPath);
    t.assert(throws(() => resolve(plan([clip()], { video: '../source.mp4' })), /escapes the plan directory/), 'a video path outside the plan directory is rejected');
    t.assert(throws(() => resolve(plan([clip({ file: '../../evil.mp4' })])), /escapes/), 'a clip file outside the plan directory is rejected');
    t.assert(throws(() => resolve(plan([clip({ file: '/tmp/evil.mp4' })])), /escapes/), 'an absolute clip file is rejected');
    t.assert(throws(() => resolve(plan([clip({ recipe: undefined, fragment: '../frag.html' })])), /escapes/), 'a fragment outside the plan directory is rejected');
    t.assert(throws(() => resolve(plan([clip()], { brand: '../../brand.json' })), /escapes/), 'a brand file outside the plan directory is rejected');
    t.assert(throws(() => resolve(plan([clip({ in: 3.5, out: 4.5 })])), /past the end/), 'a clip past the end of the probed source is rejected');
    t.assert(throws(() => resolve(plan([clip({ file: 'source.mp4' })])), /overwrite the source/), 'a clip cannot overwrite the source');
    t.assert(throws(() => resolve(plan([clip()], { video: 'missing.mp4' })), /not found/), 'a missing source is reported');
    const ok = resolve(plan([clip()]));
    t.assert(ok.source.width === W && ok.source.fps === FPS && ok.source.hasAudio && Math.abs(ok.source.duration - DURATION) < 0.1, 'source is probed for size, fps, duration and audio');
    const args = buildComposeArgs(ok, path.join(tmp, 'x.mp4'));
    const fc = args[args.indexOf('-filter_complex') + 1];
    t.assert(/tpad=stop_mode=clone/.test(fc) && /overlay=enable='between\(t,0\.500,2\.500\)'/.test(fc) && args.includes('0:a?') && args.includes('+faststart') && args.includes('aac'),
      'compose args hold the last frame, gate the overlay on in/out, keep audio as AAC and use faststart', fc);
    t.assert(throws(() => composeBroll(ok, path.join(tmp, 'x.mp4')), /run `mgvideo broll render` first/), 'compose refuses to run before clips are rendered');

    // --- end to end: render a panel and a full clip, compose, check pixels ------------------
    const avail = motionAvailability();
    if (!avail.ok) {
      t.skip(`B-roll render/compose end-to-end: ${avail.errors.join('; ')}`);
      return;
    }
    const e2e = {
      title: 'Suite', video: 'source.mp4', fps: FPS,
      clips: [
        { id: 'panel', title: 'Bars panel', in: 0.4, out: 2.2, kind: 'panel', recipe: 'motion-bars-chart', scene: { copy: 'Render time | Before: 40 min | After: 12 min' } },
        { id: 'full', title: 'Full type', in: 2.6, out: 3.6, kind: 'full', recipe: 'motion-kinetic-type', scene: { copy: 'Ship it' } },
      ],
    };
    fs.writeFileSync(planPath, JSON.stringify(e2e));
    const r = loadBrollPlan(planPath);
    const t0 = Date.now();
    const rendered = await renderBroll(r);
    t.log(`rendered ${rendered.length} clips in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const panelInfo = probe(r.clips[0].file);
    const fullInfo = probe(r.clips[1].file);
    t.assert(panelInfo.width === W && panelInfo.height === H && /^yuva/.test(panelInfo.pixFmt ?? '') && r.clips[0].file.endsWith('.mov'),
      'panel clip is ProRes 4444 with alpha at the source size', `${panelInfo.width}x${panelInfo.height} ${panelInfo.pixFmt}`);
    t.assert(fullInfo.width === W && Math.abs(fullInfo.fps - FPS) < 0.01 && fullInfo.pixFmt === 'yuv420p', 'full clip is opaque H.264 at the source size and fps', `${fullInfo.pixFmt} ${fullInfo.fps}`);

    const out = path.join(tmp, 'composed.mp4');
    const res = composeBroll(r, out);
    t.assert(Math.abs(res.duration - DURATION) < 0.1, 'composite keeps the source duration', `${res.duration}s`);
    t.assert(res.hasAudio && probe(out).audioChannels >= 1, 'composite keeps the source audio');

    const a = r.clips[0].area!;
    const ax0 = Math.round(a.x);
    const ay0 = Math.round(a.y);
    const ax1 = Math.round(a.x + a.w);
    const ay1 = Math.round(a.y + a.h);
    const diffAt = (time: number) => {
      const c = frameAt(out, time);
      const s = frameAt(src, time);
      return { panel: meanDiff(c, s, ax0, ay0, ax1, ay1), speaker: meanDiff(c, s, 0, 0, ax0 - 8, H), whole: meanDiff(c, s, 0, 0, W, H) };
    };
    const before = diffAt(0.2);
    const during = diffAt(1.8);
    const full = diffAt(3.1);
    const after = diffAt(3.85);
    t.log(`mean |composite - source|: before ${before.whole.toFixed(2)}, panel window ${during.panel.toFixed(2)} (speaker side ${during.speaker.toFixed(2)}), full ${full.whole.toFixed(2)}, after ${after.whole.toFixed(2)}`);
    t.assert(during.panel > 20, 'the panel is composited inside its safe area during its window', during.panel.toFixed(2));
    t.assert(during.speaker < 4, 'the speaker side is untouched while the panel is up', during.speaker.toFixed(2));
    t.assert(before.whole < 4 && after.whole < 4, 'the source is untouched outside every clip window', `${before.whole.toFixed(2)} / ${after.whole.toFixed(2)}`);
    t.assert(full.whole > 40 && full.speaker > 40, 'the full clip replaces the whole frame during its window', full.whole.toFixed(2));

    // A longer slot than the rendered clip holds the clip's last frame (tpad clone).
    const held = { ...e2e, clips: [{ ...e2e.clips[0], out: 3.4, file: path.relative(tmp, r.clips[0].file) }] };
    const heldPlan = resolveBrollPlan(held, planPath) as ResolvedBrollPlan;
    const heldOut = path.join(tmp, 'held.mp4');
    composeBroll(heldPlan, heldOut);
    // Pixels where the panel's last frame is fully opaque: the held card body.
    const alpha = execFileSync('ffmpeg', ['-v', 'error', '-sseof', '-0.2', '-i', r.clips[0].file, '-vf', 'alphaextract,format=gray', '-update', '1', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 16 * 1024 * 1024 });
    const opaque: number[] = [];
    for (let i = 0; i < W * H; i++) if (alpha[i] >= 250) opaque.push(i);
    const h1 = frameAt(heldOut, 2.5);
    const h2 = frameAt(heldOut, 3.2);
    const opaqueDiff = (x: Buffer, y: Buffer) => opaque.reduce((acc, i) => acc + Math.abs(x[i * 3] - y[i * 3]) + Math.abs(x[i * 3 + 1] - y[i * 3 + 1]) + Math.abs(x[i * 3 + 2] - y[i * 3 + 2]), 0) / Math.max(1, opaque.length * 3);
    const panelHeld = opaqueDiff(h2, frameAt(src, 3.2));
    t.assert(opaque.length > 1000 && panelHeld > 20, 'past the end of a short clip its last frame stays on screen until out', `${opaque.length} px, diff ${panelHeld.toFixed(2)}`);
    t.assert(opaqueDiff(h1, h2) < 3, 'the held panel is a still frame', opaqueDiff(h1, h2).toFixed(2));
    t.assert(meanDiff(frameAt(heldOut, 3.6), frameAt(src, 3.6), 0, 0, W, H) < 4, 'the held panel disappears at its out point');

    const sheet = path.join(tmp, 'sheet.png');
    videoContactSheet(out, brollSheetTimes(r), sheet);
    t.assert(fs.existsSync(sheet) && fs.statSync(sheet).size > 1000, 'contact sheet of the composite is written');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
