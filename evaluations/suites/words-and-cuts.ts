import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { SuiteContext } from '../run-suites.js';
import type { TextManifest, TranscriptWord } from '../../packages/contracts/src/index.js';
import { captionDrift, groupCaptionWords, spokenNames } from '../../packages/media/src/captions.js';
import { detectShotChanges, planCutByLines } from '../../packages/media/src/cut_lines.js';
import { SubtitleGenerator } from '../../packages/media/src/subtitles.js';
import { readTranscribeMarker, transcribe } from '../../packages/media/src/transcribe.js';
import { runRender } from '../../packages/cli/src/commands/render.js';
import { runValidate } from '../../packages/cli/src/commands/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROMO = path.join(ROOT, 'fixtures', 'promo-bulgarian-15s');

/** Words from "text@start-end" specs, times in seconds. */
function words(spec: string): TranscriptWord[] {
  return spec.trim().split(/\s+/).map(s => {
    const [word, times] = s.split('@');
    const [a, b] = times.split('-').map(Number);
    return { word, start_ms: Math.round(a * 1000), end_ms: Math.round(b * 1000), confidence: 1, speaker: 'Speaker 1' };
  });
}

/** Speech recognition, caption cues and checks, and cutting footage by transcript lines. */
export async function run(t: SuiteContext): Promise<void> {
  // --- caption grouping ------------------------------------------------------------------
  const w = words('One@0-0.3 two@0.3-0.6 three@0.6-0.9 four@0.9-1.2 five.@1.2-1.5 six@1.5-1.8 seven@2.5-2.8');
  const cues = groupCaptionWords(w, 30);
  t.assert(cues.map(c => c.text).join(' | ') === 'One two three | four five. | six | seven',
    'cues break after 3 words, after punctuation and before a pause over 8 frames', cues.map(c => c.text).join(' | '));
  t.assert(cues[0].end_ms === 900 && cues[2].end_ms === Math.round(1800 + 8000 / 30),
    'a cue holds 8 frames past its last word, but never into the next cue', cues.map(c => c.end_ms).join(','));
  t.assert(SubtitleGenerator.cuesFromTranscript({ schema_version: '1.0.0', source_audio_hash: 'x', language: 'en', correction_version: 'v1', words: w }).length === 4,
    'SubtitleGenerator.cuesFromTranscript uses the same grouping');

  // --- caption drift ---------------------------------------------------------------------
  const spoken = words('Hello@1-1.4 there@1.4-1.8 friend@2-2.5 again@4-4.4');
  const drift = captionDrift([
    { index: 1, start_ms: 1100, end_ms: 1800, text: 'Hello there' }, // 0.10 s late: fine
    { index: 2, start_ms: 2300, end_ms: 2600, text: 'friend' }, // 0.30 s late
    { index: 3, start_ms: 3700, end_ms: 4400, text: 'again' }, // 0.30 s early
  ], spoken);
  t.assert(drift.matched === 3 && drift.drifting.map(d => d.cue.index).join(',') === '2,3',
    'a cue 0.3 s late or early drifts; 0.1 s late does not', JSON.stringify(drift.drifting.map(d => [d.cue.index, d.drift_s])));
  t.assert(captionDrift([{ index: 1, start_ms: 3800, end_ms: 4000, text: 'again' }], spoken).drifting.length === 0, 'a cue 0.2 s early is inside the limit');

  // --- names on screen -------------------------------------------------------------------
  const shownAt = (from: number, to: number) => Array.from({ length: 60 }, (_, i) => ({ t: i / 10, x: 100, y: 100, w: 400, h: 80, opacity: i / 10 >= from && i / 10 < to ? 1 : 0 }));
  const manifest: TextManifest = {
    schema_version: '1.0.0', width: 1080, height: 1920, sample_step_s: 0.1,
    texts: [{ id: 'a#0', scene_id: 'a', text: 'Try Sofia Code Academy', words: 4, font_size: 72, bold: true, color: '#ffffff', is_copy: true, narrated: true, samples: shownAt(0, 2) }],
  };
  const names = spokenNames(['Sofia Code Academy'], words('At@0-0.2 Sofia@0.5-0.8 Code@0.8-1 Academy@1-1.5 and@3-3.2 sofia@3.4-3.6 code@3.6-3.8 academy.@3.8-4.3'), manifest);
  t.assert(names.length === 2 && names[0].onScreen && !names[1].onScreen,
    'a spoken name counts as shown only while a text with it is visible', JSON.stringify(names));

  // --- cut by lines ----------------------------------------------------------------------
  const take = words(
    'So@0.5-0.7 um@0.8-1.0 we@2.0-2.2 build@2.2-2.5 websites@2.5-3.0 for@3.0-3.2 people@3.2-3.6 ' +
    'and@4.5-4.7 also@4.7-5.0 apps@5.0-5.4 thanks@8.0-8.3 for@8.3-8.5 watching@8.5-9.0');
  const plan = planCutByLines({
    words: take,
    lines: ['# comment', 'Thanks for watching!', '', 'We build websites for people.'],
    sourceHash: 'abc', sourceDurationS: 10,
  });
  t.assert(plan.missing.length === 0 && plan.edl.cuts.length === 2 && plan.edl.cuts[0].reason.startsWith('line 2: Thanks'),
    'kept lines are found word for word and cut in the order of the file', plan.edl.cuts.map(c => c.reason).join(' | '));
  const [c1, c2] = plan.edl.cuts;
  // "Thanks..." opens the output: pause 2.6 s before (pad 0.12 s), 1.0 s of source after (pad 0.22 s).
  t.assert(c1.source_start_us === 7_880_000 && c1.source_end_us === 9_220_000, 'pads: min(0.6 x pause, 0.12 s) before, min(0.7 x pause, 0.22 s) after', `${c1.source_start_us}-${c1.source_end_us}`);
  // "We build..." closes the output, so it keeps 0.35 s after its last word.
  t.assert(c2.source_start_us === 1_880_000 && c2.source_end_us === 3_950_000, 'the last clip of the output keeps 0.35 s after its last word', `${c2.source_start_us}-${c2.source_end_us}`);
  t.assert(c1.output_start_frame === 0 && c2.output_start_frame === c1.output_end_frame, 'output frames are contiguous');

  const tight = planCutByLines({ words: words('a@0-0.2 b@0.25-0.5 c@0.55-0.8'), lines: ['b'], sourceHash: 'x', sourceDurationS: 1 });
  t.assert(tight.edl.cuts[0].source_start_us === 220_000, 'a short pause gives a short pad (0.6 x 0.05 s)', String(tight.edl.cuts[0].source_start_us));

  const fuzzy = planCutByLines({ words: take, lines: ['we build great websites for people'], sourceHash: 'x', sourceDurationS: 10 });
  t.assert(fuzzy.missing.length === 0 && fuzzy.notes.some(n => n.includes('closest passage')) && fuzzy.edl.cuts[0].reason.includes('% of words'),
    'a line with one wrong word uses the closest passage (>= 70 %) and says so', fuzzy.notes.join('; '));
  const lost = planCutByLines({ words: take, lines: ['completely different sentence here'], sourceHash: 'x', sourceDurationS: 10 });
  t.assert(lost.missing.length === 1 && lost.edl.cuts.length === 0, 'a line below 70 % is reported as not found');

  const snapped = planCutByLines({ words: take, lines: ['we build websites for people'], sourceHash: 'x', sourceDurationS: 10, shotChanges: [1.95, 3.9] });
  const s = snapped.edl.cuts[0];
  t.assert(s.source_start_us === Math.round((1.95 + 1 / 30) * 1e6) && s.source_end_us === Math.round((3.9 - 1 / 30) * 1e6),
    'a clip edge near a shot change moves one frame inside the new shot / before the change', `${s.source_start_us}-${s.source_end_us}`);
  const merged = planCutByLines({ words: take, lines: ['we build websites', 'for people'], sourceHash: 'x', sourceDurationS: 10 });
  t.assert(merged.edl.cuts.length === 1 && merged.edl.cuts[0].reason.includes('line 1') && merged.edl.cuts[0].reason.includes('line 2'),
    'consecutive lines that touch in the source become one clip');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-words-'));
  try {
    const clip = path.join(tmp, 'shots.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=1',
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', clip]);
    const shots = detectShotChanges(clip);
    t.assert(shots.length === 1 && Math.abs(shots[0] - 1) < 0.05, 'shot detection finds the cut from red to blue at 1 s', shots.join(','));

    // --- validate: caption drift and spoken names from <run>/transcript.json ---------------
    const project = path.join(tmp, 'promo');
    fs.cpSync(PROMO, project, { recursive: true, filter: src => !src.includes(`${path.sep}runs`) });
    const result = await runRender(project, { force: true });
    const runDir = path.dirname(result.output_files[0].path);
    const before = await runValidate('latest', project);
    t.assert(!before.items.some(i => i.rule === 'caption-drift' || i.rule === 'name-on-screen'), 'a run without a transcript gets no speech items');

    const said = words('Станете@4.5-5.0 програмист@5.0-5.6 в@6.0-6.1 Sofia@6.2-6.6 Code@6.6-6.9 Academy@6.9-7.4');
    fs.writeFileSync(path.join(runDir, 'transcript.json'), JSON.stringify({ source_audio_hash: result.output_files[0].hash, language: 'bg', words: said }));
    fs.writeFileSync(path.join(runDir, 'captions.srt'), '1\n00:00:05,000 --> 00:00:06,000\nСтанете програмист\n\n2\n00:00:06,050 --> 00:00:07,500\nв Sofia Code Academy\n');
    const report = await runValidate('latest', project);
    const late = report.issues.find(i => i.rule === 'caption-drift');
    t.assert(!!late && late.severity === 'P1' && late.at_s === 5, 'a cue 0.5 s after its word is P1 caption-drift', report.issues.map(i => `${i.rule}@${i.at_s}`).join(','));
    t.assert(report.issues.filter(i => i.rule === 'caption-drift').length === 1, 'a cue 0.05 s after its word is not flagged');
    const name = report.issues.find(i => i.rule === 'name-on-screen');
    t.assert(!!name && name.severity === 'P2' && Math.abs((name.at_s ?? 0) - 6.2) < 0.01, 'the brand said at 6.2 s with no text showing it is P2 name-on-screen', JSON.stringify(name));

    fs.writeFileSync(path.join(runDir, 'transcript.json'), JSON.stringify({ source_audio_hash: 'other-file', language: 'bg', words: said }));
    const stale = await runValidate('latest', project);
    t.assert(stale.issues.some(i => i.rule === 'speech-transcript' && i.severity === 'P1'), 'a transcript of another file is P1 speech-transcript');

    // --- local speech recognition (needs `mgvideo setup transcribe`) ------------------------
    if (!readTranscribeMarker()) {
      t.skip('speech recognition not set up (mgvideo setup transcribe)');
    } else {
      const video = path.join(ROOT, 'showcase', 'videos', '03-talking-head-edit.mp4');
      const tr = transcribe(video, { language: 'en', log: () => {} });
      const text = tr.words.map(x => x.word).join(' ');
      t.assert(tr.words.length > 30 && /Sofia/.test(text) && tr.words.every((x, i) => i === 0 || x.start_ms >= tr.words[i - 1].start_ms),
        'faster-whisper transcribes the talking-head showcase with ordered word times', text.slice(0, 120));
      t.assert(tr.correction_version.startsWith('asr:faster-whisper:') && tr.source_audio_hash.length === 64, 'the transcript names its model and hashes its source');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
