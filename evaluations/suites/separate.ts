import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SuiteContext } from '../run-suites.js';
import { probe, runFfmpeg, runTool, type StreamProbe } from '../../packages/media/src/proc.js';
import {
  assertConstantFrameRate, buildAlphaCutout, buildGreenPreview, estimateSeconds, mgvideoCacheDir,
  parseFrameNumber, parsePoint, planSeparation, readSeparateMarker, separateVenvDir, separateVideo,
  validateFrameRange, validatePoints, type ComposeInput,
} from '../../packages/media/src/separate.js';

const W = 320;
const H = 240;
const FPS = 30;
/** Circle centre x for frame n of the synthetic clip; y is fixed at H/2, radius 40. */
const cx = (n: number) => 60 + n * 6;

function throws(fn: () => unknown, re?: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return re ? re.test(err instanceof Error ? err.message : String(err)) : true;
  }
}

/** Decodes one frame of a file to raw pixels (`rgba` or `gray`). */
function decodeFrame(file: string, pixFmt: 'rgba' | 'gray', frameIndex = 0, decoder?: string): Buffer {
  return execFileSync('ffmpeg', [
    '-v', 'error', ...(decoder ? ['-c:v', decoder] : []), '-i', file,
    '-vf', `select=eq(n\\,${frameIndex})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', pixFmt, '-',
  ], { maxBuffer: 64 * 1024 * 1024 });
}

const px = (buf: Buffer, x: number, y: number, ch: number, channels: number) => buf[(y * W + x) * channels + ch];

function frameCount(file: string): number {
  return parseInt(runTool('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]).trim(), 10);
}

/** Pure parsing and validation, plus ffmpeg preview/cut-out composition from synthetic masks. */
export async function run(t: SuiteContext): Promise<void> {
  // --- point parsing ---------------------------------------------------------------------
  const p = parsePoint('10,20');
  t.assert(p.x === 10 && p.y === 20 && p.label === 1, 'point without label defaults to subject (1)');
  t.assert(parsePoint(' 5.5 , 7 ,0').label === 0, 'point with label 0 parses (whitespace tolerated)');
  t.assert(['a,b', '1', '1,2,3', '1,2,1,1', '-1,5', '1,-5', '', '1e3,2'].every(s => throws(() => parsePoint(s))), 'malformed points are rejected');

  // --- point validation ------------------------------------------------------------------
  t.assert(!throws(() => validatePoints([{ x: 0, y: 0, label: 1 }, { x: W - 1, y: H - 1, label: 0 }], W, H)), 'points on the frame edge are accepted');
  t.assert(throws(() => validatePoints([{ x: W, y: 10, label: 1 }], W, H), /outside/), 'point at x == width is rejected');
  t.assert(throws(() => validatePoints([{ x: 10, y: 10, label: 0 }], W, H), /label 1/), 'exclude-only points are rejected');
  t.assert(throws(() => validatePoints([], W, H)), 'empty point list is rejected');

  // --- frame range -----------------------------------------------------------------------
  const r = validateFrameRange(undefined, undefined, 30);
  t.assert(r.start === 0 && r.end === 29, 'frame range defaults to the whole clip');
  t.assert(throws(() => validateFrameRange(10, 5, 30)), 'start after end is rejected');
  t.assert(throws(() => validateFrameRange(0, 30, 30), /past the last frame/), 'end past the last frame is rejected');
  t.assert(throws(() => validateFrameRange(1.5, 5, 30)), 'non-integer start is rejected');
  t.assert(throws(() => parseFrameNumber('1.5', '--start')) && parseFrameNumber('12', '--end') === 12 && parseFrameNumber(undefined, '--end') === undefined, 'CLI frame numbers parse strictly');
  t.assert(estimateSeconds('cpu', 30) === 150, 'CPU estimate is ~5 s/frame');

  // --- constant frame rate ---------------------------------------------------------------
  const fake = (rr: string, avg: string) => ({ raw: { streams: [{ codec_type: 'video', r_frame_rate: rr, avg_frame_rate: avg }] } }) as unknown as StreamProbe;
  t.assert(assertConstantFrameRate(fake('30/1', '30/1'), 'x') === 30, 'CFR clip reports its frame rate');
  t.assert(throws(() => assertConstantFrameRate(fake('60/1', '27/1'), 'x'), /variable frame rate/), 'VFR-looking clip is rejected with a conversion hint');

  // --- cache location ----------------------------------------------------------------------
  t.assert(mgvideoCacheDir({ XDG_CACHE_HOME: '/tmp/xdg' }) === path.join('/tmp/xdg', 'mgvideo'), 'cache dir respects XDG_CACHE_HOME');
  t.assert(separateVenvDir({ XDG_CACHE_HOME: '/tmp/xdg' }).endsWith(path.join('mgvideo', 'venvs', 'separate')), 'venv lives under the user cache');
  t.assert(!separateVenvDir().startsWith(process.cwd()), 'venv is outside the repository');

  // --- synthetic clip + moving-circle masks ------------------------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-separate-'));
  try {
    const clip = path.join(tmp, 'clip.mp4');
    runFfmpeg([
      '-f', 'lavfi', '-i', `color=c=gray:s=${W}x${H}:r=${FPS}:d=1`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip,
    ]);
    const masksDir = path.join(tmp, 'masks');
    fs.mkdirSync(masksDir);
    runFfmpeg([
      '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=1,format=gray`,
      '-vf', `geq=lum='if(lt(hypot(X-(60+N*6),Y-${H / 2}),40),255,0)'`,
      '-start_number', '0', path.join(masksDir, '%05d.png'),
    ]);
    t.assert(fs.readdirSync(masksDir).length === FPS, `synthetic mask sequence written (${FPS} masks)`);

    const plan = planSeparation(clip, [{ x: cx(5), y: H / 2, label: 1 }], 5, 24);
    t.assert(plan.fps === FPS && plan.totalFrames === FPS && plan.frames === 20 && plan.hasAudio, 'planSeparation probes fps, frame count and audio', JSON.stringify({ fps: plan.fps, total: plan.totalFrames }));
    t.assert(throws(() => planSeparation(clip, [{ x: 400, y: 10, label: 1 }], 0, 5), /outside/), 'planSeparation rejects a point outside the frame');

    const compose: ComposeInput = { video: clip, masksDir, start: 5, end: 24, fps: FPS, width: W, height: H, hasAudio: true };
    const expectDur = 20 / FPS;

    const preview = buildGreenPreview(compose, path.join(tmp, 'preview.mp4'));
    const pv = probe(preview);
    t.assert(frameCount(preview) === 20 && Math.abs(pv.durationSeconds - expectDur) < 0.1 && pv.hasAudio, 'preview has 20 frames, ~0.67 s and audio', `dur=${pv.durationSeconds}`);
    const pf = decodeFrame(preview, 'rgba', 0);
    const inG = px(pf, cx(5), H / 2, 1, 4) - px(pf, cx(5), H / 2, 0, 4);
    const outG = px(pf, W - 10, 10, 1, 4) - px(pf, W - 10, 10, 0, 4);
    t.assert(inG > 40 && Math.abs(outG) < 15, 'preview tints the subject green and leaves the background', `inside g-r=${inG}, outside g-r=${outG}`);

    const mov = buildAlphaCutout(compose, path.join(tmp, 'cutout.mov'), 'mov');
    const mp = probe(mov);
    t.assert(String(mp.pixFmt).startsWith('yuva') && Math.abs(mp.durationSeconds - expectDur) < 0.1, 'ProRes 4444 cut-out carries alpha and has the right duration', `${mp.pixFmt} ${mp.durationSeconds}`);
    const mf = decodeFrame(mov, 'rgba', 0);
    t.assert(px(mf, cx(5), H / 2, 3, 4) > 240 && px(mf, 5, 5, 3, 4) < 10, 'cut-out alpha is opaque on the subject and clear elsewhere');
    const mfLast = decodeFrame(mov, 'rgba', 19);
    t.assert(px(mfLast, cx(24), H / 2, 3, 4) > 240 && px(mfLast, cx(5), H / 2, 3, 4) < 10, 'cut-out alpha follows the moving mask');

    const webm = buildAlphaCutout(compose, path.join(tmp, 'cutout.webm'), 'webm');
    const wv = (probe(webm).raw.streams as Record<string, unknown>[]).find(s => s.codec_type === 'video') as { tags?: Record<string, string> };
    const alphaTag = Object.entries(wv.tags ?? {}).some(([k, v]) => k.toLowerCase() === 'alpha_mode' && v === '1');
    const wf = decodeFrame(webm, 'rgba', 0, 'libvpx-vp9');
    t.assert(alphaTag && px(wf, cx(5), H / 2, 3, 4) > 200 && px(wf, 5, 5, 3, 4) < 30, 'VP9 WebM cut-out carries alpha (alpha_mode=1)');
    t.assert(frameCount(webm) === 20, 'WebM cut-out has 20 frames');

    // --- real SAM 2.1 path (opt-in) --------------------------------------------------------
    if (process.env.MGVIDEO_TEST_SEPARATE !== '1') {
      t.skip('SAM 2.1 separation not run: set MGVIDEO_TEST_SEPARATE=1 (after `mgvideo setup separate`) to run it');
      return;
    }
    if (!readSeparateMarker()) {
      t.skip(`SAM 2.1 separation not run: venv missing at ${separateVenvDir()} (run \`mgvideo setup separate\`)`);
      return;
    }
    // A bright disc moving over a dark, textured background, ~1 s at low resolution.
    const subjectClip = path.join(tmp, 'subject.mp4');
    runFfmpeg([
      '-f', 'lavfi', '-i', `color=c=0x203040:s=${W}x${H}:r=${FPS}:d=1,format=rgb24`,
      '-vf', `geq=r='if(lt(hypot(X-(60+N*6),Y-${H / 2}),40),240,32+16*mod(floor(X/20)+floor(Y/20),2))':g='if(lt(hypot(X-(60+N*6),Y-${H / 2}),40),200,48)':b='if(lt(hypot(X-(60+N*6),Y-${H / 2}),40),40,64)'`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', subjectClip,
    ]);
    const out = path.join(tmp, 'sam');
    const res = separateVideo({
      video: subjectClip, points: [{ x: cx(0), y: H / 2, label: 1 }, { x: 10, y: 10, label: 0 }],
      start: 0, end: FPS - 1, model: 'tiny', outDir: out, formats: ['mov'], chunk: 16,
      log: m => t.log(m),
    });
    const h = res.helper as { device?: string; model?: string; frames?: number; timings?: Record<string, number> };
    t.log(`SAM summary: ${JSON.stringify({ device: h.device, model: h.model, frames: h.frames, timings: h.timings })}`);
    t.assert(fs.readdirSync(res.masksDir).filter(f => f.endsWith('.png')).length === FPS, 'SAM wrote one mask per frame');
    let hits = 0;
    for (const n of [0, 15, FPS - 1]) {
      const m = decodeFrame(path.join(res.masksDir, `${String(n).padStart(5, '0')}.png`), 'gray');
      const mw = m.length / H;
      const at = (x: number, y: number) => m[Math.round((y * mw) / W) * mw + Math.round((x * mw) / W)];
      if (at(cx(n), H / 2) > 127 && at(5, 5) < 128 && at(W - 5, H - 5) < 128) hits++;
    }
    t.assert(hits === 3, 'SAM masks track the moving disc (frames 0, 15, 29)', `${hits}/3`);
    t.assert(fs.existsSync(res.preview) && res.cutouts.every(c => fs.existsSync(c)), 'SAM run produced preview and cut-out');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
