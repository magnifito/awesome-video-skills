#!/usr/bin/env node
/**
 * PostToolUse hook: after Claude writes or edits a project file of a HyperFrames or html project,
 * run `mgvideo check --quick` on that project and show Claude any text problem it finds
 * (JSON on stdout: `decision: block` for P0 and P1, context only for P2 and P3).
 * Quiet when the edit is elsewhere, the project is clean, or mgvideo is not installed.
 *
 * MGVIDEO_BIN overrides the command (split on spaces), e.g. "npx tsx packages/cli/src/bin/mgvideo.ts".
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_FILES = new Set(['brief.json', 'brand.json', 'claims.json', 'assets.json', 'scene-plan.json', 'validate.json']);
const MAX_CHARS = 4000;

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

const input = readStdin();
const file = input?.tool_input?.file_path;
if (typeof file !== 'string' || !PROJECT_FILES.has(path.basename(file))) process.exit(0);

const dir = path.dirname(path.resolve(input.cwd ?? '.', file));
let engine;
try {
  engine = JSON.parse(fs.readFileSync(path.join(dir, 'brief.json'), 'utf8')).engine;
} catch {
  process.exit(0);
}
if (!['hyperframes', 'html'].includes(engine) || !fs.existsSync(path.join(dir, 'scene-plan.json'))) process.exit(0);

const [cmd, ...pre] = (process.env.MGVIDEO_BIN || 'mgvideo').split(/\s+/).filter(Boolean);
const run = spawnSync(cmd, [...pre, 'check', dir, '--quick'], { encoding: 'utf8', timeout: 100_000 });
if (run.error) process.exit(0); // mgvideo missing or timed out: say nothing rather than guess.

const out = `${run.stdout ?? ''}${run.status === 2 ? run.stderr ?? '' : ''}`.trim();
if (!out) process.exit(0);
const text = `${out.length > MAX_CHARS ? `${out.slice(0, MAX_CHARS)}\n…` : out}\nRun \`mgvideo check ${dir} --quick\` again after fixing.`;
// A P0 or P1 failure (exit 1) or a check that could not run (exit 2) asks Claude to act;
// P2 and P3 notes are passed along as context only.
const result = run.status === 0
  ? { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }
  : { decision: 'block', reason: text, hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } };
process.stdout.write(JSON.stringify(result));
