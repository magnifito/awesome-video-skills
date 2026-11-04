/**
 * B-roll plan loading and compositing.
 *
 * `composeBroll` is a TypeScript port of upstream Barty-Bart/motion-graphics
 * `skills/motion-broll/scripts/composite.py` (MIT): every clip is laid over the source video
 * at its in/out points, a clip shorter than its slot holds its last frame (tpad clone),
 * transparent `.mov` clips composite with alpha, the original audio is kept (re-encoded to
 * AAC so any source muxes into MP4) and the result is H.264 with faststart.
 *
 * ffmpeg always receives an argument array; the filter graph contains only numbers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import {
  BrollPlanSchema, checkBrollAgainstSource, defaultBrollFile, parseFps, resolveBrollArea,
  type BrollClip, type BrollPlan, type BrollRect
} from '../../contracts/src/index.js';
import { probe, runFfmpeg, safeJoin } from './proc.js';

export interface BrollSource {
  path: string;
  width: number;
  height: number;
  /** Frame rate as a number (e.g. 29.97002997). */
  fps: number;
  /** Frame rate as ffprobe reports it (e.g. "30000/1001"), for exact ffmpeg arguments. */
  fpsRational: string;
  duration: number;
  hasAudio: boolean;
}

export interface ResolvedBrollClip {
  clip: BrollClip;
  /** Absolute rendered clip path (inside the plan directory). */
  file: string;
  /** Absolute fragment path when the clip is hand-written. */
  fragment: string | null;
  /** Absolute logo path for motion-logo-reveal. */
  logo: string | null;
  /** Panel safe area in source pixels; null for full clips. */
  area: BrollRect | null;
}

export interface ResolvedBrollPlan {
  planPath: string;
  planDir: string;
  plan: BrollPlan;
  source: BrollSource;
  /** Absolute brand.json path, or null for the upstream default look. */
  brand: string | null;
  clips: ResolvedBrollClip[];
}

/** Formats zod issues as `path: message` lines. */
function zodProblems(err: ZodError): string[] {
  return err.issues.map(i => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`);
}

/** Probes the source footage for the fields the plan is checked against. */
export function probeBrollSource(file: string): BrollSource {
  const p = probe(file);
  if (!p.hasVideo) throw new Error(`B-roll source has no video stream: ${file}`);
  const v = ((p.raw.streams as Record<string, unknown>[] | undefined) ?? []).find(s => s.codec_type === 'video');
  const rate = String(v?.r_frame_rate ?? '');
  const fpsRational = /^\d+\/\d+$/.test(rate) && rate !== '0/0' ? rate : String(p.fps);
  return {
    path: file,
    width: p.displayWidth,
    height: p.displayHeight,
    fps: parseFps(fpsRational),
    fpsRational,
    duration: p.durationSeconds,
    hasAudio: p.hasAudio
  };
}

/**
 * Parses and validates a plan object against its directory and source video. Every path is
 * resolved with safeJoin, so a plan cannot read or write outside its own directory. Throws
 * one error listing every problem.
 */
export function resolveBrollPlan(raw: unknown, planPath: string): ResolvedBrollPlan {
  const planDir = path.dirname(path.resolve(planPath));
  let plan: BrollPlan;
  try {
    plan = BrollPlanSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) throw new Error(`Invalid B-roll plan ${planPath}:\n  - ${zodProblems(err).join('\n  - ')}`);
    throw err;
  }
  const problems: string[] = [];
  const join = (rel: string, label: string): string | null => {
    try {
      return safeJoin(planDir, rel);
    } catch {
      problems.push(`${label}: path escapes the plan directory: ${rel}`);
      return null;
    }
  };
  const video = join(plan.video, 'video');
  const brand = plan.brand ? join(plan.brand, 'brand') : null;
  if (brand && !fs.existsSync(brand)) problems.push(`brand: file not found: ${plan.brand}`);
  let source: BrollSource | null = null;
  if (video) {
    if (!fs.existsSync(video)) problems.push(`video: file not found: ${plan.video}`);
    else source = probeBrollSource(video);
  }
  const clips: ResolvedBrollClip[] = [];
  const outputs = new Map<string, string>();
  for (const clip of plan.clips) {
    const fileRel = clip.file ?? defaultBrollFile(clip);
    const file = join(fileRel, `clip ${clip.id} file`);
    const fragment = clip.fragment ? join(clip.fragment, `clip ${clip.id} fragment`) : null;
    if (fragment && !fs.existsSync(fragment)) problems.push(`clip ${clip.id}: fragment not found: ${clip.fragment}`);
    const logo = clip.scene?.logo ? join(clip.scene.logo, `clip ${clip.id} scene.logo`) : null;
    if (logo && !fs.existsSync(logo)) problems.push(`clip ${clip.id}: logo not found: ${clip.scene?.logo}`);
    if (file && video && file === video) problems.push(`clip ${clip.id}: file would overwrite the source video`);
    if (file) {
      const other = outputs.get(file);
      if (other) problems.push(`clips ${other} and ${clip.id} write the same file ${fileRel}`);
      outputs.set(file, clip.id);
    }
    const area = clip.kind === 'panel' && source ? resolveBrollArea(clip.area, source.width, source.height) : null;
    clips.push({ clip, file: file ?? '', fragment, logo, area });
  }
  if (source) problems.push(...checkBrollAgainstSource(plan, source));
  if (problems.length) throw new Error(`Invalid B-roll plan ${planPath}:\n  - ${problems.join('\n  - ')}`);
  return { planPath: path.resolve(planPath), planDir, plan, source: source!, brand, clips };
}

/** Reads, parses and validates plan.json. */
export function loadBrollPlan(planPath: string): ResolvedBrollPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read B-roll plan ${planPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return resolveBrollPlan(raw, planPath);
}

const sec = (n: number) => n.toFixed(3);

/** ffmpeg arguments for the composite (exported for tests). Clips are layered in plan order. */
export function buildComposeArgs(r: ResolvedBrollPlan, outPath: string): string[] {
  const args = ['-loglevel', 'error', '-i', r.source.path];
  const fc: string[] = [];
  let last = '0:v';
  r.clips.forEach((c, idx) => {
    const i = idx + 1;
    const { in: tin, out: tout } = c.clip;
    args.push('-i', c.file);
    fc.push(`[${i}:v]format=yuva444p,tpad=stop_mode=clone:stop_duration=${sec(tout - tin)},setpts=PTS-STARTPTS+${sec(tin)}/TB[c${i}]`);
    fc.push(`[${last}][c${i}]overlay=enable='between(t,${sec(tin)},${sec(tout)})':eof_action=pass[v${i}]`);
    last = `v${i}`;
  });
  fc.push(`[${last}]format=yuv420p[v]`);
  args.push(
    '-filter_complex', fc.join(';'),
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', '-shortest',
    outPath
  );
  return args;
}

export interface ComposeResult {
  outputPath: string;
  duration: number;
  hasAudio: boolean;
  clips: number;
}

/**
 * Checks that every rendered clip exists and matches the source (size, fps, alpha for
 * panels). Returns problems (empty = ready to compose).
 */
export function checkRenderedClips(r: ResolvedBrollPlan): string[] {
  const problems: string[] = [];
  for (const c of r.clips) {
    const rel = path.relative(r.planDir, c.file);
    if (!fs.existsSync(c.file)) {
      problems.push(`clip ${c.clip.id}: ${rel} not found (run \`mgvideo broll render\` first)`);
      continue;
    }
    const p = probe(c.file);
    if (p.displayWidth !== r.source.width || p.displayHeight !== r.source.height) {
      problems.push(`clip ${c.clip.id}: ${rel} is ${p.displayWidth}x${p.displayHeight}, the source is ${r.source.width}x${r.source.height}`);
    }
    if (Math.abs(p.fps - r.source.fps) > 0.01) {
      problems.push(`clip ${c.clip.id}: ${rel} is ${p.fps.toFixed(3)} fps, the source is ${r.source.fps.toFixed(3)} fps`);
    }
    if (c.clip.kind === 'panel' && !/^(yuva|rgba|bgra|argb|abgr|gbrap|ya)/.test(p.pixFmt ?? '')) {
      problems.push(`clip ${c.clip.id}: panel clip ${rel} has no alpha channel (pix_fmt ${p.pixFmt ?? 'unknown'})`);
    }
  }
  return problems;
}

/** Composites the rendered clips over the source video into `outPath` (.mp4). */
export function composeBroll(r: ResolvedBrollPlan, outPath: string): ComposeResult {
  if (path.extname(outPath).toLowerCase() !== '.mp4') throw new Error(`B-roll compose writes H.264 MP4; got ${outPath}`);
  const out = path.resolve(outPath);
  if (out === r.source.path || r.clips.some(c => c.file === out)) throw new Error(`B-roll compose: refusing to overwrite an input (${outPath})`);
  const problems = checkRenderedClips(r);
  if (problems.length) throw new Error(`Cannot compose ${r.planPath}:\n  - ${problems.join('\n  - ')}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  runFfmpeg(buildComposeArgs(r, out));
  const p = probe(out);
  return { outputPath: out, duration: p.durationSeconds, hasAudio: p.hasAudio, clips: r.clips.length };
}
