/**
 * Shared contract for the showcase projects.
 *
 * Each folder `showcase/<prefix>NN-<slug>/` is self-contained and reproducible. The prefix
 * picks the section: none = the main video types, `s` = style gallery (one clip per visual
 * recipe), `f` = format and finishing variants.
 *   - `showcase.json`  the recipe: the prompt an agent is given, the exact shell commands that
 *                      render the video (run in order, from the project folder), the file they
 *                      produce, and the spec the committed MP4 must meet
 *   - project inputs   brief.json, brand.json, claims.json, plans, cues, footage scripts ...
 *   - `README.md`      generated from showcase.json by render.ts; never edit it by hand
 *
 * render.ts runs exactly the commands listed in the recipe, so the recipe cannot drift from
 * what produced the committed video. Scratch output goes to `<project>/work/` and `runs/`
 * (both gitignored). The deliverables are `showcase/videos/<id>.mp4` and `<id>.jpg`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const SHOWCASE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SHOWCASE_DIR, '..');
export const VIDEOS_DIR = path.join(SHOWCASE_DIR, 'videos');
export const MGVIDEO_BIN = path.join(REPO_ROOT, 'dist/packages/cli/src/bin/mgvideo.js');

/** Programs a recipe command may start. `mgvideo` resolves to the built CLI in this repo. */
export const ALLOWED_PROGRAMS = ['mgvideo', 'ffmpeg', 'node'] as const;

/** Folder names that are showcase projects. */
export const PROJECT_ID = /^[sf]?\d{2}-[a-z0-9-]+$/;

export const SECTIONS = {
  main: { title: 'Video types', blurb: 'One example of each kind of video the skills make.' },
  styles: { title: 'Style gallery', blurb: 'One short clip per visual recipe, rendered by the recipe itself.' },
  formats: { title: 'Formats and finishing', blurb: 'The same films reframed for social formats and run through the finishing commands.' },
} as const;
export type Section = keyof typeof SECTIONS;

export function sectionOf(id: string): Section {
  return id.startsWith('s') ? 'styles' : id.startsWith('f') ? 'formats' : 'main';
}

export const ShowcaseMetaSchema = z.object({
  /** Matches the folder name, e.g. "01-branded-promo", "s03-product-reveal", "f01-reels-9x16". */
  id: z.string().regex(PROJECT_ID),
  title: z.string().min(1),
  /** Video type shown on the site, e.g. "Branded promo". */
  type: z.string().min(1),
  /** Skill that drives this workflow, e.g. "magnifito-promo". */
  skill: z.string().regex(/^magnifito-[a-z-]+$/),
  engine: z.string().min(1),
  /** One or two sentences for the site card. */
  caption: z.string().min(1),
  /** The request a user gives Claude Code (with the plugin installed) to make this video. */
  prompt: z.string().min(1),
  /**
   * Shell commands, run in order with the project folder as working directory.
   * Plain words and single/double quotes only: no pipes, redirects, variables or globs.
   * Each must start with one of ALLOWED_PROGRAMS. Paths are relative; every generated file
   * goes under `work/` or `runs/`, so any other file a command names must be committed
   * (the showcase suite checks this).
   */
  commands: z.array(z.string().min(1)).min(1),
  /**
   * Path of the finished video, relative to the project folder. One `*` per path segment is
   * allowed (e.g. "runs/*\/final_output_*.mp4"); the newest match wins.
   */
  output: z.string().min(1),
  /** Poster frame time in seconds. */
  poster_at: z.number().nonnegative(),
  /** Spec the committed MP4 must meet; the showcase suite checks it with ffprobe. */
  expect: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    duration_seconds: z.number().positive(),
    audio: z.boolean(),
  }),
  /** True when the footage is generated, not filmed; the site and README say so. */
  synthetic_footage: z.boolean().default(false),
  /** Third-party material used and its licence, e.g. "Geist font (OFL-1.1)". */
  credits: z.array(z.string().min(1)).default([]),
});
export type ShowcaseMeta = z.infer<typeof ShowcaseMetaSchema>;

export function listProjects(): string[] {
  return fs
    .readdirSync(SHOWCASE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && PROJECT_ID.test(d.name))
    .map(d => d.name)
    .sort();
}

export function loadMeta(id: string): ShowcaseMeta {
  const file = path.join(SHOWCASE_DIR, id, 'showcase.json');
  const meta = ShowcaseMetaSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (meta.id !== id) throw new Error(`${file}: id "${meta.id}" does not match folder "${id}"`);
  for (const cmd of meta.commands) splitCommand(cmd);
  return meta;
}

/** Splits a recipe command into argv. Supports quotes; rejects every shell feature. */
export function splitCommand(cmd: string): string[] {
  const args: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) args.push(cur);
      cur = '';
      has = false;
    } else if ('|&;<>$`*?(){}\\'.includes(ch)) {
      throw new Error(`Recipe command uses a shell feature (${ch}); split it into plain steps: ${cmd}`);
    } else {
      cur += ch;
    }
  }
  if (quote) throw new Error(`Unclosed quote in recipe command: ${cmd}`);
  if (has || cur) args.push(cur);
  if (!args.length || !(ALLOWED_PROGRAMS as readonly string[]).includes(args[0])) {
    throw new Error(`Recipe command must start with one of ${ALLOWED_PROGRAMS.join(', ')}: ${cmd}`);
  }
  return args;
}

/** Runs one recipe command from `cwd`. Throws with the tail of its output on failure. */
export function runCommand(cmd: string, cwd: string): void {
  const [program, ...rest] = splitCommand(cmd);
  const [bin, args] =
    program === 'mgvideo' ? [process.execPath, [MGVIDEO_BIN, ...rest]]
      : program === 'node' ? [process.execPath, rest]
        : ['ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...rest]];
  try {
    execFileSync(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const tail = `${String(e.stdout ?? '').slice(-1500)}\n${String(e.stderr ?? e.message ?? '').slice(-1500)}`.trim();
    throw new Error(`Command failed: ${cmd}\n${tail}`);
  }
}

/** Resolves `output` (one `*` per segment allowed) to the newest matching file. */
export function resolveOutput(dir: string, pattern: string): string {
  let candidates = [path.resolve(dir)];
  for (const seg of pattern.split('/')) {
    if (!seg.includes('*')) {
      candidates = candidates.map(c => path.join(c, seg)).filter(c => fs.existsSync(c));
      continue;
    }
    const re = new RegExp(`^${seg.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    candidates = candidates.flatMap(c =>
      fs.existsSync(c) && fs.statSync(c).isDirectory()
        ? fs.readdirSync(c).filter(n => re.test(n)).map(n => path.join(c, n))
        : [],
    );
  }
  const files = candidates.filter(c => fs.statSync(c).isFile());
  if (!files.length) throw new Error(`No file matches output "${pattern}" in ${dir}`);
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

/** The per-project README, generated from the recipe so the two cannot disagree. */
export function renderReadme(meta: ShowcaseMeta): string {
  const lines = [
    `<!-- Generated by showcase/render.ts from showcase.json. Do not edit by hand. -->`,
    `# ${meta.title}`,
    '',
    meta.caption,
    '',
    `- Type: ${meta.type}`,
    `- Skill: \`${meta.skill}\``,
    `- Engine: \`${meta.engine}\``,
    `- Output: ${meta.expect.width}x${meta.expect.height}, ${meta.expect.duration_seconds} s, ${meta.expect.audio ? 'with audio' : 'silent'}`,
    `- Video: [\`../videos/${meta.id}.mp4\`](../videos/${meta.id}.mp4)`,
  ];
  if (meta.synthetic_footage) lines.push('- Footage: synthetic, generated by the commands below. No camera footage is used.');
  lines.push(
    '',
    '## Recreate it with Claude Code',
    '',
    'Install the plugin (see the repository README), open this folder, and give Claude this prompt:',
    '',
    ...meta.prompt.split('\n').map(l => `> ${l}`),
    '',
    '## Recreate it by hand',
    '',
    'From the repository root, one command renders this example exactly as committed:',
    '',
    '```sh',
    `npm run showcase -- ${meta.id}`,
    '```',
    '',
    `Or run the steps yourself from \`showcase/${meta.id}/\` (after \`npm run build && npm link\`):`,
    '',
    '```sh',
    ...meta.commands,
    '```',
    '',
    `The finished file is \`${meta.output}\`. The config files in this folder are the inputs.`,
  );
  if (meta.credits.length) lines.push('', '## Credits', '', ...meta.credits.map(c => `- ${c}`));
  return `${lines.join('\n')}\n`;
}
