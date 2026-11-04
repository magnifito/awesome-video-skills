import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SuiteContext } from '../run-suites.js';
import { probe, runFfmpeg } from '../../packages/media/src/proc.js';
import { sfxEnvStatus } from '../../packages/media/src/sfx_env.js';
import {
  alignMusicToCuts, buildSfxMixArgs, loadSfxLibrary, parseSfxCues, placeSfx, rejectReason,
  runSfxPass, selectSfx, seededRng, vendoredSfxManifestPath,
} from '../../packages/media/src/sfx_pass.js';

/** Phase 3 sound pass: cue parsing, deterministic CC0 selection, Mixkit rejection, ffmpeg mix, librosa path. */
export async function run(t: SuiteContext): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-sfx-'));
  try {
    const manifest = vendoredSfxManifestPath();
    const lib = loadSfxLibrary(manifest);

    // Manifest and licences
    t.assert(lib.sounds.length >= 100, `library loads the bundled CC0 sounds (${lib.sounds.length})`);
    t.assert(lib.sounds.every(s => /CC0/.test(s.license) && fs.existsSync(s.absPath)), 'every accepted sound is CC0 and on disk');
    t.assert(lib.sounds.every(s => !/mixkit/i.test(`${s.id} ${s.sourceUrl ?? ''} ${s.license}`)), 'no Mixkit entry is accepted');
    const runtimeRejected = lib.rejected.filter(r => /runtime URL/.test(r.reason));
    t.assert(runtimeRejected.length >= 40, `runtime (Mixkit) manifest entries are rejected (${runtimeRejected.length})`);
    t.assert(!lib.kit.typing, 'default-kit typing (Mixkit runtime) is rejected');
    t.assert(!!lib.kit.whoosh && lib.kit.whoosh.id === 'kit/whoosh.ogg', 'CC0 default-kit whoosh is kept');
    t.assert(
      rejectReason({ file: 'x.mp3', category: 'pop', license: 'Mixkit SFX Free License', runtime_url: 'https://assets.mixkit.co/x.mp3' }, lib.baseDir) !== null &&
      rejectReason({ file: '../../../../etc/passwd.ogg', category: 'pop', license: 'CC0 1.0' }, lib.baseDir) !== null &&
      rejectReason({ file: 'pop/x.ogg', category: 'pop', license: 'CC-BY 4.0' }, lib.baseDir) !== null,
      'runtime URLs, path escapes and non-CC0 licences are rejected',
    );

    // Cue parsing
    const cues = parseSfxCues({ cues: [
      { t: 0.5, type: 'scene_cut', desc: 'cut' },
      { t: 1.0, type: 'appear' },
      { t: 1.4, type: 'appear' },
      { t: 1.8, type: 'typing', dur: 0.8 },
      { t: 2.0, type: 'build_up', dur: 0.5 },
      { t: 2.5, type: 'reveal' },
      { t: 3.0, category: 'ding', snap: true },
    ] }, lib, 4);
    t.assert(cues.length === 7 && cues[0].category === 'whoosh' && cues[3].category === 'typing' && cues[6].category === 'ding', 'cues map types to manifest categories');
    const bad = (v: unknown, dur?: number) => { try { parseSfxCues(v, lib, dur); return ''; } catch (e) { return (e as Error).message; } };
    t.assert(/past the end/.test(bad([{ t: 9, type: 'appear' }], 4)), 'cue past the video end is rejected');
    t.assert(/unknown type/.test(bad([{ t: 1, type: 'kazoo' }])), 'unknown cue type is rejected');
    t.assert(/"t" must be/.test(bad([{ t: -1, type: 'appear' }])) && /"dur"/.test(bad([{ t: 1, type: 'typing', dur: 0 }])), 'bad t and dur are rejected');
    t.assert(/empty/.test(bad([])) && /JSON array/.test(bad({ nope: 1 })), 'empty and malformed cue lists are rejected');

    // Deterministic selection
    const ids = (seed: number) => selectSfx(cues, lib, seed).map(s => s.sound.id).join('|');
    t.assert(ids(7) === ids(7), 'selection is deterministic for a seed');
    const many = parseSfxCues(Array.from({ length: 12 }, (_, i) => ({ t: i * 0.1, type: 'appear' })), lib);
    const a = selectSfx(many, lib, 1).map(s => s.sound.id).join('|');
    const b = selectSfx(many, lib, 2).map(s => s.sound.id).join('|');
    t.assert(a !== b, 'different seeds vary the takes');
    const sel = selectSfx(many, lib, 1);
    t.assert(sel[0].via === 'kit' && sel[0].sound.id === 'kit/pop.ogg', 'first cue of a category uses the default kit');
    t.assert(sel.every((s, i) => i === 0 || s.sound.id !== sel[i - 1].sound.id), 'repeats never play the same file twice in a row');
    t.assert(selectSfx(cues, lib, 7).every(s => /CC0/.test(s.sound.license)), 'every selected sound is CC0');
    const rngA = seededRng(42);
    const rngB = seededRng(42);
    t.assert([0, 1, 2, 3].every(() => rngA() === rngB()), 'seeded RNG is reproducible');
    let urlSwap = '';
    try { selectSfx(cues, lib, 7, { '0': 'https://assets.mixkit.co/active_storage/sfx/1489/1489-preview.mp3' }); } catch (e) { urlSwap = (e as Error).message; }
    t.assert(/runtime downloads are not allowed/.test(urlSwap), 'a URL swap (Mixkit runtime) is refused');
    const swapped = selectSfx(cues, lib, 7, { '1': 'ding/fs-634690-lil-pip.ogg' });
    t.assert(swapped[1].via === 'swap' && swapped[1].sound.id === 'ding/fs-634690-lil-pip.ogg', 'a bundled swap from an alternative category is honoured');

    // Beat alignment and snapping (pure)
    const grid = Array.from({ length: 40 }, (_, i) => 0.13 + i * 0.5);
    const al = alignMusicToCuts([0.5, 2.5], grid, 0.5, 20, 4);
    t.assert(Math.abs(al.startS - 0.13) < 0.006 && al.residuals.every(r => r.errorS < 0.006), `music start search lands cuts on beats (start ${al.startS.toFixed(3)}s)`);
    const vgrid = grid.map(g => g - al.startS);
    const placed = placeSfx(selectSfx(cues, lib, 7), 30, new Map(), vgrid);
    const ding = placed[6];
    t.assert(Math.abs(ding.t - 3.0) < 1e-6 && (ding.beatErrorS ?? 1) < 1e-6, 'snap cue on a beat stays on it with zero error');
    const offBeat = placeSfx(selectSfx(parseSfxCues([{ t: 3.07, category: 'ding', snap: true }], lib), lib, 7), 30, new Map(), vgrid)[0];
    t.assert(Math.abs(offBeat.t - 3.0) < 1e-9 && offBeat.snappedFromS === 3.07, 'snap cue within the window moves to the nearest beat');
    t.assert(Math.abs(placed[0].startS - (0.5 - 2 / 30)) < 1e-9 && placed[0].gainDb === -4, 'scene_cut starts 2 frames early at -4 dB');
    t.assert(placed[3].loop && placed[3].playS === 0.8, 'typing loops and trims to dur');

    // Mix args never embed paths in the filter graph
    const plan = buildSfxMixArgs({ video: '/x/in;rm -rf.mp4', videoHasAudio: false, durationS: 4, placements: placed, outWav: '/x/o.wav' });
    t.assert(!plan.filter.includes('/x/') && plan.args.includes('/x/in;rm -rf.mp4'), 'file paths go in as arguments, not in the filter graph');

    // ffmpeg mix on a generated silent clip (no Python needed without music)
    const video = path.join(tmp, 'silent.mp4');
    runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
    const noVenv = { ...process.env, XDG_CACHE_HOME: path.join(tmp, 'empty-cache') };
    const res = runSfxPass({ video, cues: cues.map(c => ({ t: c.t, type: c.type, category: c.category, dur: c.dur })), outDir: path.join(tmp, 'out'), seed: 7, proof: false, env: noVenv });
    const outProbe = probe(res.outputVideo);
    t.assert(outProbe.hasAudio && outProbe.hasVideo, 'sound pass output has video and audio');
    t.assert(Math.abs(outProbe.durationSeconds - 4) < 0.1, `output duration matches the video (${outProbe.durationSeconds.toFixed(3)}s)`);
    t.assert(res.final.lufs > -40, `mix is audible (${res.final.lufs.toFixed(1)} LUFS)`);
    t.assert(res.final.truePeakDbfs < -4 + 0.5, `true peak near or below -4 dBFS (${res.final.truePeakDbfs.toFixed(1)})`);
    const credits = fs.readFileSync(res.credits, 'utf8');
    t.assert(/CC0/.test(credits) && !/mixkit/i.test(credits) && /No music/.test(credits), 'CREDITS.txt lists CC0 sounds only');
    t.assert(fs.existsSync(res.reportHtml) && fs.existsSync(res.reportJson), 'report.html and report.json are written');

    let musicErr = '';
    try {
      runSfxPass({ video, cues: [{ t: 1, type: 'appear' }], outDir: path.join(tmp, 'out2'), music: video, proof: false, env: noVenv });
    } catch (e) { musicErr = (e as Error).message; }
    t.assert(/mgvideo setup sfx/.test(musicErr), 'music without the venv fails closed and names `mgvideo setup sfx`');

    // librosa path, only when the venv exists
    const st = sfxEnvStatus();
    if (!st.ready) {
      t.skip(`librosa beat-grid path: sound-pass venv not set up (${st.reason}); run \`mgvideo setup sfx\``);
      return;
    }
    const music = path.join(tmp, 'beat.wav');
    // 120 BPM: 55 Hz kick on every beat, a quiet 880 Hz blip on the off-beat.
    runFfmpeg(['-f', 'lavfi', '-i', 'aevalsrc=0.8*sin(2*PI*55*t)*exp(-15*mod(t\\,0.5))+0.15*sin(2*PI*880*t)*exp(-40*mod(t+0.25\\,0.5)):s=48000:d=12', '-ac', '2', music]);
    const withMusic = runSfxPass({
      video, cues: cues.map(c => ({ t: c.t, type: c.type, category: c.category, dur: c.dur, snap: c.snap })), outDir: path.join(tmp, 'out-music'),
      music, musicSource: 'generated test beat', musicLicense: 'CC0 (generated)', seed: 7, proof: true,
    });
    const mus = withMusic.report.music as { tempo_bpm: number; beat_period_s: number; cut_to_beat_errors: Array<{ errorS: number }> };
    t.assert(Math.abs(mus.beat_period_s - 0.5) < 0.03, `librosa finds the 120 BPM grid (period ${mus.beat_period_s}s, ${mus.tempo_bpm} BPM)`);
    t.assert(mus.cut_to_beat_errors.every(r => r.errorS < 0.05), `hard cuts land within 50 ms of a beat (${mus.cut_to_beat_errors.map(r => (r.errorS * 1000).toFixed(0)).join(', ')} ms)`);
    t.assert(probe(withMusic.outputVideo).hasAudio, 'music pass output has audio');
    t.assert(Math.abs(withMusic.final.lufs + 16) <= 1, `music pass lands near -16 LUFS (${withMusic.final.lufs.toFixed(1)})`);
    t.assert(fs.existsSync(path.join(tmp, 'out-music', 'checks', 'cue-00-wave.png')), 'proof waveforms are written');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
