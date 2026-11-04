/**
 * `mgvideo broll …`: transparent and full-frame motion B-roll on footage.
 *
 *   broll words <captions.srt|vtt>    caption cues -> estimated word times (Transcript JSON)
 *   broll check <plan.json>           validate the plan against its directory and source
 *   broll render <plan.json>          render every clip at the source size and fps
 *   broll compose <plan.json> <out>   lay the clips over the source (port of composite.py)
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBrollPlan, composeBroll, type ResolvedBrollPlan } from '../../../media/src/broll.js';
import { captionTranscript, captionWordsText, parseCaptionWords, sha256Hex } from '../../../media/src/caption_words.js';
import { motionAvailability } from '../../../motion/src/capture.js';
import { brollSheetTimes, renderBroll, videoContactSheet } from '../../../motion/src/broll.js';

function describe(r: ResolvedBrollPlan): string[] {
  const s = r.source;
  const lines = [`Source: ${path.relative(r.planDir, s.path)} ${s.width}x${s.height} @ ${s.fpsRational} fps, ${s.duration.toFixed(2)}s, audio: ${s.hasAudio ? 'yes' : 'no'}`];
  for (const c of r.clips) {
    const what = c.clip.recipe ?? `fragment ${c.clip.fragment}`;
    const area = c.area ? ` area ${Math.round(c.area.x)},${Math.round(c.area.y)} ${Math.round(c.area.w)}x${Math.round(c.area.h)}` : '';
    lines.push(`  ${c.clip.id} ${c.clip.in.toFixed(2)}-${c.clip.out.toFixed(2)}s ${c.clip.kind.padEnd(5)} ${what}${area} -> ${path.relative(r.planDir, c.file)}`);
  }
  return lines;
}

export function runBrollCheck(planPath: string): void {
  const r = loadBrollPlan(planPath);
  console.log(`\nB-roll plan OK: ${r.clips.length} clip(s)`);
  for (const l of describe(r)) console.log(l);
  console.log('');
}

export async function runBrollRender(planPath: string, opts: { only?: string; pages?: string }): Promise<void> {
  const r = loadBrollPlan(planPath);
  const avail = motionAvailability();
  if (!avail.ok) throw new Error(`Motion engine unavailable: ${avail.errors.join(' ')}`);
  for (const l of describe(r)) console.log(l);
  const only = opts.only ? opts.only.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const pagesDir = opts.pages ?? 'dist';
  const res = await renderBroll(r, { only, pagesDir, log: m => console.log(`  ${m}`) });
  console.log(`\nRendered ${res.length} clip(s). Pages for preview: ${path.join(r.planDir, pagesDir)}\n`);
}

export function runBrollCompose(planPath: string, outPath: string, opts: { sheet?: string }): void {
  const r = loadBrollPlan(planPath);
  const res = composeBroll(r, outPath);
  console.log(`\nComposed ${res.clips} clip(s): ${res.outputPath}`);
  console.log(`Duration: ${res.duration.toFixed(2)}s (source ${r.source.duration.toFixed(2)}s), audio: ${res.hasAudio ? 'kept (AAC)' : 'none in source'}`);
  if (opts.sheet) {
    const times = brollSheetTimes(r);
    videoContactSheet(res.outputPath, times, path.resolve(opts.sheet));
    console.log(`Contact sheet: ${path.resolve(opts.sheet)} (t = ${times.join(', ')})`);
  }
  console.log('The composite is a review preview: place the clips in your editor for the final cut.\n');
}

export function runBrollWords(captionsPath: string, opts: { out?: string; txt?: string; video?: string; language?: string }): void {
  const text = fs.readFileSync(captionsPath, 'utf8');
  const words = parseCaptionWords(text);
  const hash = opts.video ? `sha256:${sha256Hex(fs.readFileSync(opts.video))}` : `captions-sha256:${sha256Hex(text)}`;
  const transcript = captionTranscript(words, hash, opts.language ?? 'en');
  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, JSON.stringify(transcript, null, 2) + '\n', 'utf8');
  }
  if (opts.txt) {
    fs.mkdirSync(path.dirname(path.resolve(opts.txt)), { recursive: true });
    fs.writeFileSync(opts.txt, captionWordsText(words), 'utf8');
  }
  if (!opts.out && !opts.txt) process.stdout.write(captionWordsText(words));
  else console.log(`\n${words.length} words estimated from ${new Set(words.map(w => w.cue)).size} cues (about ±0.2 s).${opts.out ? `\nTranscript: ${opts.out}` : ''}${opts.txt ? `\nWords: ${opts.txt}` : ''}\n`);
}
