import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SuiteContext } from '../run-suites.js';
import { ffmpegStderr, runFfmpeg, runTool } from '../../packages/media/src/proc.js';
import { VideoSpeedEngine } from '../../packages/media/src/speed.js';
import { AudioCompressor, type CompressorPreset } from '../../packages/media/src/compressor.js';
import { NoiseGateEngine } from '../../packages/media/src/noise_gate.js';

const FPS = 30;

/** Container and per-stream durations in seconds. */
function durations(file: string): { format: number; video: number; audio: number } {
  const out = JSON.parse(runTool('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])) as {
    format: { duration: string };
    streams: { codec_type: string; duration?: string }[];
  };
  const of = (type: string) => parseFloat(out.streams.find(s => s.codec_type === type)?.duration ?? 'NaN');
  return { format: parseFloat(out.format.duration), video: of('video'), audio: of('audio') };
}

/** EBU R128 integrated loudness in LUFS. */
function lufs(file: string): number {
  const err = ffmpegStderr(['-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-']);
  const m = /I:\s+(-?[\d.]+)\s+LUFS/.exec(err.slice(err.lastIndexOf('Summary:')));
  return m ? parseFloat(m[1]) : NaN;
}

/** RMS level in dBFS of the window [start, end) seconds. */
function rmsDb(file: string, start: number, end: number): number {
  const err = ffmpegStderr(['-nostats', '-i', file, '-af', `atrim=${start}:${end},astats=metadata=0`, '-f', 'null', '-']);
  const m = /RMS level dB:\s+(-?[\d.]+|-inf)/.exec(err);
  return m ? (m[1] === '-inf' ? -Infinity : parseFloat(m[1])) : NaN;
}

/**
 * Speech-like bursts (band-limited pink noise, on for 1.4 s of every 2 s, about -20 dBFS RMS)
 * over continuous white hiss at about -40 dBFS RMS. `gainDb` shifts the whole take.
 */
function makeSpeech(file: string, seconds: number, gainDb: number, hiss: boolean): void {
  const speech = `[0]highpass=f=150,lowpass=f=4000,volume=14dB,volume='0.6+0.4*sin(2*PI*4*t)':eval=frame,volume='if(lt(mod(t,2),1.4),1,0)':eval=frame`;
  runFfmpeg([
    '-f', 'lavfi', '-i', `anoisesrc=c=pink:a=0.25:d=${seconds}:r=48000:s=1`,
    '-f', 'lavfi', '-i', `anoisesrc=c=white:a=0.017:d=${seconds}:r=48000:s=2`,
    '-filter_complex', hiss
      ? `${speech}[s];[s][1]amix=inputs=2:normalize=0,volume=${gainDb}dB`
      : `${speech},volume=${gainDb}dB`,
    '-ac', '1', '-c:a', 'pcm_s16le', file,
  ]);
}

export async function run(t: SuiteContext): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-timing-audio-'));
  try {
    // --- speed: output duration is source / factor within half a frame ------------------------
    const src = path.join(tmp, 'src.mp4');
    runFfmpeg([
      '-f', 'lavfi', '-i', `testsrc2=s=320x240:r=${FPS}:d=12`,
      '-f', 'lavfi', '-i', 'sine=f=440:d=12:sample_rate=48000',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src,
    ]);
    const half = 0.5 / FPS;
    for (const factor of [1.5, 2, 0.5]) {
      const res = VideoSpeedEngine.changeSpeed(src, factor, { outputPath: path.join(tmp, `speed-${factor}.mp4`) });
      const d = durations(res.outputPath);
      const want = 12 / factor;
      t.assert(Math.abs(d.format - want) <= half && Math.abs(d.video - want) <= half && Math.abs(d.audio - want) <= half,
        `speed ${factor}x of 12 s lasts ${want} s (container, video and audio within half a frame)`,
        `format ${d.format}, video ${d.video}, audio ${d.audio}`);
    }
    const silent = path.join(tmp, 'silent.mp4');
    runFfmpeg(['-f', 'lavfi', '-i', `testsrc2=s=320x240:r=${FPS}:d=6`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silent]);
    const silentRes = durations(VideoSpeedEngine.changeSpeed(silent, 2, { outputPath: path.join(tmp, 'silent-2x.mp4') }).outputPath);
    t.assert(Math.abs(silentRes.format - 3) <= half, '2x of a 6 s clip without audio lasts 3 s', `format ${silentRes.format}`);

    // --- compress-audio: every preset keeps the input integrated loudness ------------------------
    const presets: CompressorPreset[] = ['broadcast-master', 'vocal-leveler', 'punchy-bass'];
    for (const [label, gain] of [['normal speech', 0], ['hot speech', 12], ['quiet speech', -12]] as const) {
      const input = path.join(tmp, `comp-${gain}.wav`);
      makeSpeech(input, 10, gain, false);
      const inLufs = lufs(input);
      for (const preset of presets) {
        const res = AudioCompressor.compress(input, { preset, outputPath: path.join(tmp, `comp-${gain}-${preset}.wav`) });
        const outLufs = lufs(res.outputPath);
        t.assert(Math.abs(outLufs - inLufs) <= 1.5, `${preset} keeps the loudness of ${label} (${inLufs} LUFS)`, `out ${outLufs} LUFS, makeup ${res.makeupGainDb} dB`);
      }
    }
    const fixed = AudioCompressor.compress(path.join(tmp, 'comp-12.wav'), { preset: 'vocal-leveler', makeupGainDb: 0, outputPath: path.join(tmp, 'fixed.wav') });
    t.assert(!fixed.makeupAuto && fixed.makeupGainDb === 0 && lufs(fixed.outputPath) < lufs(path.join(tmp, 'comp-12.wav')) - 3,
      'an explicit makeup gain disables loudness matching (vocal-leveler with 0 dB is quieter)');

    // --- noise-gate: default settings pull pause hiss down without touching speech ---------------
    const noisy = path.join(tmp, 'noisy.wav');
    makeSpeech(noisy, 8, 0, true);
    const gated = NoiseGateEngine.applyGate(noisy, { outputPath: path.join(tmp, 'gated.wav') });
    const pauseIn = rmsDb(noisy, 1.6, 1.9);
    const pauseOut = rmsDb(gated.outputPath, 1.6, 1.9);
    t.log(`pause hiss ${pauseIn.toFixed(1)} -> ${pauseOut.toFixed(1)} dBFS RMS`);
    t.assert(pauseIn > -42 && pauseIn < -38, 'test hiss sits at about -40 dBFS RMS', `${pauseIn}`);
    t.assert(pauseIn - pauseOut >= 10, 'default gate reduces pause hiss by at least 10 dB', `${pauseIn} -> ${pauseOut}`);
    const speechIn = rmsDb(noisy, 2, 3.4);
    const speechOut = rmsDb(gated.outputPath, 2, 3.4);
    t.assert(Math.abs(speechIn - speechOut) <= 0.5, 'default gate leaves speech level unchanged (within 0.5 dB)', `${speechIn} -> ${speechOut}`);
    const onsetIn = rmsDb(noisy, 2, 2.06);
    const onsetOut = rmsDb(gated.outputPath, 2, 2.06);
    t.assert(Math.abs(onsetIn - onsetOut) <= 1, 'default gate keeps the first 60 ms of a phrase (within 1 dB)', `${onsetIn} -> ${onsetOut}`);
    t.assert(gated.filterApplied.includes('threshold=-35dB') && gated.filterApplied.includes('detection=peak'), 'gate filter uses the dB threshold with peak detection');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
