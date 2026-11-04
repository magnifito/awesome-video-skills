/**
 * Applies edl.json to the raw take:
 *   1. validates edl.json and transcript.json against the toolkit contracts and the probed
 *      source (the EDL may not reach past the end of work/raw.mp4);
 *   2. trims every kept range to work/cuts/<cut_id>.mp4, frame-exact, with 10 ms audio fades
 *      so the joins do not click;
 *   3. maps every transcript word onto the output timeline with the toolkit's TimelineMapper.
 *      Words inside removed ranges map to null and are dropped; the source timestamps in
 *      transcript.json are never changed. Writes work/edit-transcript.json (output timeline)
 *      and work/captions.srt.
 *
 * Needs the built toolkit (npm run build). Usage (from this folder): node apply-edl.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EditDecisionListSchema, TranscriptSchema } from '../../dist/packages/contracts/src/index.js';
import { TimelineMapper } from '../../dist/packages/media/src/timeline.js';
import { probe } from '../../dist/packages/media/src/proc.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const raw = path.join(WORK, 'raw.mp4');

const edl = EditDecisionListSchema.parse(JSON.parse(fs.readFileSync(path.join(HERE, 'edl.json'), 'utf8')));
const transcript = TranscriptSchema.parse(JSON.parse(fs.readFileSync(path.join(HERE, 'transcript.json'), 'utf8')));
const mapper = new TimelineMapper(edl.output_fps);
const fps = mapper.fps;

const src = probe(raw);
if (edl.source_duration_us > Math.round(src.durationSeconds * 1e6) + 1000) {
  throw new Error(`edl.json source_duration_us (${edl.source_duration_us}) is longer than ${raw} (${src.durationSeconds} s)`);
}

// Output ranges must be contiguous: the concat step joins the cuts back to back.
edl.cuts.forEach((c, i) => {
  const prevEnd = i ? edl.cuts[i - 1].output_end_frame : 0;
  if (c.output_start_frame !== prevEnd) throw new Error(`${c.cut_id}: output_start_frame ${c.output_start_frame} leaves a gap after frame ${prevEnd}`);
  if (c.speed_factor !== 1) throw new Error(`${c.cut_id}: this recipe only applies speed_factor 1`);
  const srcFrames = mapper.usToFrames(c.source_end_us - c.source_start_us);
  if (srcFrames !== c.output_end_frame - c.output_start_frame) {
    throw new Error(`${c.cut_id}: source range is ${srcFrames} frames but the output range is ${c.output_end_frame - c.output_start_frame}`);
  }
});

fs.mkdirSync(path.join(WORK, 'cuts'), { recursive: true });
for (const c of edl.cuts) {
  const start = c.source_start_us / 1e6;
  const frames = c.output_end_frame - c.output_start_frame;
  const dur = mapper.framesToSeconds(frames);
  execFileSync('ffmpeg', [
    // Seek on the input (frame-exact, since the cut is re-encoded) so the audio filter starts at
    // the cut: with an output-side seek the fade-out time would land in the source timeline and
    // silence every cut that starts later than its own length.
    '-y', '-hide_banner', '-loglevel', 'error', '-ss', start.toFixed(6), '-i', raw,
    '-frames:v', String(frames), '-t', dur.toFixed(6),
    '-af', `afade=t=in:d=0.01,afade=t=out:st=${(dur - 0.01).toFixed(4)}:d=0.01`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    path.join(WORK, 'cuts', `${c.cut_id}.mp4`),
  ]);
}

/** A line that now opens a sentence (its lead-in filler was cut) starts with a capital. */
const capitalise = (word, prev) => (!prev || /[.!?]$/.test(prev.word) ? word[0].toUpperCase() + word.slice(1) : word);

// Retime words. A word survives when both its start and its last instant land inside a kept range.
const kept = [];
const removed = [];
for (const w of transcript.words) {
  const a = mapper.mapSourceUsToOutputFrame(Math.round(w.start_ms * 1000), edl.cuts);
  const b = mapper.mapSourceUsToOutputFrame(Math.round(w.end_ms * 1000) - 1, edl.cuts);
  if (a === null || b === null) removed.push(w.word);
  else kept.push({ ...w, word: capitalise(w.word, kept.at(-1)), start_ms: Math.round(mapper.framesToSeconds(a) * 1000), end_ms: Math.round(mapper.framesToSeconds(b + 1) * 1000) });
}
const outFrames = edl.cuts.at(-1).output_end_frame;
fs.writeFileSync(path.join(WORK, 'edit-transcript.json'), JSON.stringify({
  ...transcript, source_audio_hash: `${transcript.source_audio_hash}+edl`, correction_version: 'edl-retimed', words: kept,
}, null, 2) + '\n');

// Caption cues: break on sentence ends, and on commas once a line has 3+ words.
const cues = [];
let cur = [];
for (const w of kept) {
  cur.push(w);
  if (/[.!?]$/.test(w.word) || (/,$/.test(w.word) && cur.length >= 3) || cur.length >= 8) {
    cues.push(cur);
    cur = [];
  }
}
if (cur.length) cues.push(cur);
const ts = ms => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
fs.writeFileSync(path.join(WORK, 'captions.srt'), cues.map((c, i) =>
  `${i + 1}\n${ts(c[0].start_ms)} --> ${ts(c.at(-1).end_ms)}\n${c.map(w => w.word).join(' ')}\n`).join('\n'));

console.log(`EDL: ${edl.cuts.length} kept ranges, ${(edl.source_duration_us / 1e6).toFixed(2)} s -> ${(outFrames / fps).toFixed(2)} s`);
console.log(`Captions: ${kept.length} words kept, ${removed.length} cut (${removed.join(' ')}), ${cues.length} cues -> work/captions.srt`);
