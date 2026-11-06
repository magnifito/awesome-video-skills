import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SuiteContext } from '../run-suites.js';
import { probe, runFfmpeg } from '../../packages/media/src/proc.js';
import { AudioWaveformVisualizer } from '../../packages/media/src/waveform.js';
import { ChromaKeyEngine } from '../../packages/media/src/chromakey.js';
import { MaskEngine, parseMaskBox } from '../../packages/media/src/mask.js';
import { HdrConverter, detectDynamicRange, ffmpegMajorVersion } from '../../packages/media/src/hdr.js';

const W = 320;
const H = 240;

/** Decodes the frame at time `t` (or the single image) to raw pixels. */
function decode(file: string, pixFmt: 'rgba' | 'rgb24', t?: number): Buffer {
  return execFileSync('ffmpeg', [
    '-v', 'error', ...(t !== undefined ? ['-ss', String(t)] : []), '-i', file,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', pixFmt, '-',
  ], { maxBuffer: 64 * 1024 * 1024 });
}

function throws(fn: () => unknown, re?: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return re ? re.test(err instanceof Error ? err.message : String(err)) : true;
  }
}

/** Fraction of the image height between the topmost and bottommost drawn (non-transparent) pixel. */
function drawnSpan(png: string, width: number, height: number): number {
  const buf = decode(png, 'rgba');
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (buf[(y * width + x) * 4 + 3] > 0) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        break;
      }
    }
  }
  return bottom < 0 ? 0 : (bottom - top + 1) / height;
}

/** Mean RGB of a rectangle in an rgb24 frame of width W. */
function meanRgb(buf: Buffer, x0: number, y0: number, w: number, h: number): [number, number, number] {
  const sum = [0, 0, 0];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      for (let c = 0; c < 3; c++) sum[c] += buf[(y * W + x) * 3 + c];
    }
  }
  const n = w * h;
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

const near = (a: [number, number, number], b: [number, number, number], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const rgbOf = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** Mean absolute difference between two rgb24 frames over a rectangle. */
function regionDiff(a: Buffer, b: Buffer, x0: number, y0: number, w: number, h: number): number {
  let sum = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * W + x) * 3 + c;
        sum += Math.abs(a[i] - b[i]);
      }
    }
  }
  return sum / (w * h * 3);
}

export async function run(t: SuiteContext): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-picture-fixes-'));
  try {
    // --- waveform: a quiet sine fills the height ------------------------------------------
    const quiet = path.join(tmp, 'quiet.wav');
    // lavfi sine peaks at 1/8 full scale; volume 0.1 puts it near -38 dBFS.
    runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=2,volume=0.1', quiet]);
    const wfW = 400;
    const wfH = 200;
    const normal = AudioWaveformVisualizer.generateWaveform(quiet, { width: wfW, height: wfH, outputPath: path.join(tmp, 'wave.png') });
    const span = drawnSpan(normal.outputPath, wfW, wfH);
    t.assert(span >= 0.9, 'waveform of a quiet sine fills at least 90% of the height', `span ${span.toFixed(2)}, gain ${normal.gainDb} dB`);
    t.assert(normal.gainDb > 30, 'quiet input is lifted by its peak gain', `gain ${normal.gainDb} dB`);
    const raw = AudioWaveformVisualizer.generateWaveform(quiet, { width: wfW, height: wfH, normalize: false, outputPath: path.join(tmp, 'wave-raw.png') });
    const rawSpan = drawnSpan(raw.outputPath, wfW, wfH);
    t.assert(raw.gainDb === 0 && rawSpan < 0.2, 'normalize:false draws at the recorded level', `span ${rawSpan.toFixed(2)}`);
    const sqrt = AudioWaveformVisualizer.generateWaveform(quiet, { width: wfW, height: wfH, scale: 'sqrt', outputPath: path.join(tmp, 'wave-sqrt.png') });
    t.assert(drawnSpan(sqrt.outputPath, wfW, wfH) >= 0.9, 'scale=sqrt also fills the height');
    const stereo = path.join(tmp, 'stereo.wav');
    runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=1,volume=0.1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1,volume=0.05', '-filter_complex', '[0:a][1:a]amerge=inputs=2', stereo]);
    const split = AudioWaveformVisualizer.generateWaveform(stereo, { width: wfW, height: wfH, splitChannels: true, outputPath: path.join(tmp, 'wave-split.png') });
    t.assert(drawnSpan(split.outputPath, wfW, wfH) >= 0.8, 'splitChannels draws both channels across the height');
    t.assert(throws(() => AudioWaveformVisualizer.generateWaveform(quiet, { scale: 'bogus' as never }), /scale/), 'unknown scale is rejected');

    // --- chromakey: dark browns survive, green goes -------------------------------------------
    // Green wall with an uneven darker band, a dark brown shirt, near-black hair and a grey patch.
    const GREEN = 0x22b33a;
    const DARK_GREEN = 0x1a8a2c;
    const BROWN = 0x3c2418;
    const HAIR = 0x1e1612;
    const GREY = 0x4a4a4a;
    const BG = 0xff00ff;
    const hex = (n: number) => `0x${n.toString(16).padStart(6, '0')}`;
    const fg = path.join(tmp, 'greenscreen.mp4');
    runFfmpeg([
      '-f', 'lavfi', '-i', `color=c=${hex(GREEN)}:s=${W}x${H}:r=10:d=1`,
      '-vf', [
        `drawbox=x=0:y=200:w=${W}:h=40:color=${hex(DARK_GREEN)}:t=fill`,
        `drawbox=x=40:y=60:w=60:h=60:color=${hex(BROWN)}:t=fill`,
        `drawbox=x=130:y=60:w=60:h=60:color=${hex(HAIR)}:t=fill`,
        `drawbox=x=220:y=60:w=60:h=60:color=${hex(GREY)}:t=fill`,
      ].join(','),
      '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', fg,
    ]);
    for (const keyColor of [undefined, '0x22B33A']) {
      const label = keyColor ? `key ${keyColor}` : 'default key';
      const res = ChromaKeyEngine.composite(fg, { keyColor, backgroundColor: hex(BG), outputPath: path.join(tmp, `keyed-${keyColor ?? 'default'}.mp4`) });
      const frame = decode(res.outputPath, 'rgb24', 0.5);
      t.assert(near(meanRgb(frame, 55, 75, 30, 30), rgbOf(BROWN), 14), `chromakey (${label}) keeps the dark brown patch opaque`, JSON.stringify(meanRgb(frame, 55, 75, 30, 30)));
      t.assert(near(meanRgb(frame, 145, 75, 30, 30), rgbOf(HAIR), 14), `chromakey (${label}) keeps near-black hair opaque`, JSON.stringify(meanRgb(frame, 145, 75, 30, 30)));
      t.assert(near(meanRgb(frame, 235, 75, 30, 30), rgbOf(GREY), 14), `chromakey (${label}) keeps the grey patch opaque`, JSON.stringify(meanRgb(frame, 235, 75, 30, 30)));
      t.assert(near(meanRgb(frame, 10, 10, 20, 20), rgbOf(BG), 14), `chromakey (${label}) removes the green wall`, JSON.stringify(meanRgb(frame, 10, 10, 20, 20)));
      t.assert(near(meanRgb(frame, 10, 210, 20, 20), rgbOf(BG), 14), `chromakey (${label}) removes the darker green band`, JSON.stringify(meanRgb(frame, 10, 210, 20, 20)));
    }
    t.assert(throws(() => ChromaKeyEngine.composite(fg, { keyColor: '0x808080', outputPath: path.join(tmp, 'x.mp4') }), /chroma/), 'a grey key colour is rejected');

    // --- mask: timed boxes ------------------------------------------------------------------
    const parsed = parseMaskBox('10,20,30,40,1.5,3');
    t.assert(parsed.x === 10 && parsed.height === 40 && parsed.start === 1.5 && parsed.end === 3, 'box spec with a time window parses');
    const open = parseMaskBox('10,20,30,40,,3');
    t.assert(open.start === undefined && open.end === 3, 'box spec with an open start parses');
    t.assert(parseMaskBox('1,2,3,4').start === undefined, 'four-number box spec still parses');
    t.assert(['1,2,3', '1,2,3,4,5', 'a,2,3,4', '1,2,3,4,x,2'].every(s => throws(() => parseMaskBox(s))), 'malformed box specs are rejected');

    const src = path.join(tmp, 'detail.mp4');
    runFfmpeg(['-f', 'lavfi', '-i', `testsrc=s=${W}x${H}:r=10:d=4`, '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', src]);
    t.assert(throws(() => MaskEngine.applyRedactions(src, [{ x: 0, y: 0, width: 10, height: 10, start: 3, end: 2 }], { outputPath: path.join(tmp, 'bad.mp4') }), /after its start/), 'a box ending before it starts is rejected');
    const A = { x: 20, y: 20, width: 100, height: 80 };
    const B = { x: 180, y: 130, width: 100, height: 80 };
    const masked = MaskEngine.applyRedactions(src, [
      { ...A, start: 0, end: 2 },
      { ...B, start: 2, end: 4 },
    ], { outputPath: path.join(tmp, 'masked.mp4') });
    t.assert(masked.boxes.length === 2 && masked.box.x === A.x, 'result reports every box and keeps the first as box');
    for (const [time, aOn] of [[1, true], [3, false]] as const) {
      const orig = decode(src, 'rgb24', time);
      const out = decode(masked.outputPath, 'rgb24', time);
      const dA = regionDiff(orig, out, A.x, A.y, A.width, A.height);
      const dB = regionDiff(orig, out, B.x, B.y, B.width, B.height);
      const [on, off] = aOn ? [dA, dB] : [dB, dA];
      t.assert(on > 20 && off < 6, `at ${time} s only region ${aOn ? 'A' : 'B'} is blurred`, `A ${dA.toFixed(1)}, B ${dB.toFixed(1)}`);
    }
    // Single untimed box keeps working through the old entry point.
    const single = MaskEngine.applyRedaction(src, { ...A, mode: 'solid' }, { outputPath: path.join(tmp, 'single.mp4') });
    const solid = decode(single.outputPath, 'rgb24', 3);
    t.assert(near(meanRgb(solid, A.x + 10, A.y + 10, 60, 50), [0, 0, 0], 8), 'single solid box blacks out its region for the whole clip');

    // --- sdr: HLG footage tone-maps to SDR at the BT.2408 reference white ----------------
    const major = ffmpegMajorVersion();
    if (major !== undefined && major < 8) {
      t.skip(`mgvideo sdr needs FFmpeg 8 or newer, found ${major}`);
    } else {
      // Left half at HLG 75 % (reference white), right half at 38 %, 10-bit BT.2020 HLG, with sound.
      const hdrTags = (trc: string) => `setparams=color_primaries=bt2020:color_trc=${trc}:colorspace=bt2020nc:range=tv`;
      const patches = `color=c=gray:s=${W}x${H}:d=1,format=yuv420p10le,geq=lum='64+876*if(lt(X,${W / 2}),0.75,0.38)':cb=512:cr=512`;
      const hlg = path.join(tmp, 'hlg.mkv');
      runFfmpeg(['-f', 'lavfi', '-i', `${patches},${hdrTags('arib-std-b67')}`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
        '-c:v', 'ffv1', '-c:a', 'pcm_s16le', '-shortest', hlg]);
      const pq = path.join(tmp, 'pq.mkv');
      runFfmpeg(['-f', 'lavfi', '-i', `${patches},${hdrTags('smpte2084')}`, '-frames:v', '1', '-c:v', 'ffv1', pq]);
      t.assert(detectDynamicRange(hlg).kind === 'hlg' && detectDynamicRange(pq).kind === 'pq', 'HLG and PQ streams are detected as HDR');
      const sdr = HdrConverter.toSdr(hlg, { outputPath: path.join(tmp, 'hlg-sdr.mp4') });
      const px = decode(sdr.outputPath, 'rgb24', 0.5);
      const white = meanRgb(px, 20, 20, 100, 100);
      const mid = meanRgb(px, W / 2 + 20, 20, 100, 100);
      t.assert(white.every(c => c >= 245), 'HLG reference white becomes SDR white', `rgb ${white.map(c => c.toFixed(0)).join(',')}`);
      t.assert(mid.every(c => c > 90 && c < 130), 'a darker HLG level keeps its place below white', `rgb ${mid.map(c => c.toFixed(0)).join(',')}`);
      t.assert(sdr.outputTransfer === 'bt709' && !detectDynamicRange(sdr.outputPath).hdr, 'the SDR copy is tagged BT.709');
      t.assert(probe(sdr.outputPath).hasAudio, 'the SDR copy keeps the sound');
      t.assert(throws(() => HdrConverter.toSdr(sdr.outputPath), /not HDR/), 'SDR input is refused instead of re-encoded');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
