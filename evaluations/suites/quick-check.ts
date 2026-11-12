import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { SuiteContext } from '../run-suites.js';
import { runQuickCheck, formatQuickCheck } from '../../packages/cli/src/commands/check.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROMO = path.join(ROOT, 'fixtures', 'promo-bulgarian-15s');
const HOOK = path.join(ROOT, 'hooks', 'quick-check.mjs');
const MGVIDEO = `${path.join(ROOT, 'node_modules', '.bin', 'tsx')} ${path.join(ROOT, 'packages', 'cli', 'src', 'bin', 'mgvideo.ts')}`;

interface HookOut { status: number | null; stdout: string; decision?: string; text: string }

function hook(input: unknown): HookOut {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, MGVIDEO_BIN: MGVIDEO }, timeout: 120_000,
  });
  let out: { decision?: string; reason?: string; hookSpecificOutput?: { additionalContext?: string } } = {};
  try { out = r.stdout ? JSON.parse(r.stdout) : {}; } catch { /* left empty: asserted below */ }
  return { status: r.status, stdout: r.stdout, decision: out.decision, text: out.hookSpecificOutput?.additionalContext ?? '' };
}

/** `mgvideo check --quick` and the plugin hook that runs it after edits. */
export async function run(t: SuiteContext): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
  const post = manifest.hooks?.PostToolUse?.[0];
  t.assert(post?.matcher?.includes('Write') && post?.matcher?.includes('Edit') && post.hooks?.[0]?.command?.includes('${CLAUDE_PLUGIN_ROOT}/hooks/quick-check.mjs'),
    'hooks/hooks.json runs quick-check.mjs from the plugin root after Write and Edit');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-quick-check-'));
  try {
    const project = path.join(tmp, 'promo');
    fs.cpSync(PROMO, project, { recursive: true, filter: src => !src.includes(`${path.sep}runs`) });

    const clean = await runQuickCheck(project);
    t.assert(clean.passed && clean.issues.length === 0 && clean.texts > 0, 'the promo fixture checks clean without a render',
      clean.issues.map(i => `${i.rule}: ${i.says}`).join('; '));
    t.assert(formatQuickCheck(clean, project) === '', 'a clean check prints nothing');
    t.assert(!fs.existsSync(path.join(project, 'runs')), 'a quick check writes no run');

    const quiet = hook({ tool_name: 'Edit', tool_input: { file_path: path.join(project, 'scene-plan.json') } });
    t.assert(quiet.status === 0 && quiet.stdout === '', 'the hook is silent after an edit that leaves the project clean', quiet.stdout);
    const elsewhere = hook({ tool_name: 'Write', tool_input: { file_path: path.join(project, 'notes.md') } });
    t.assert(elsewhere.status === 0, 'the hook ignores files that are not project files');

    const plan = JSON.parse(fs.readFileSync(path.join(project, 'scene-plan.json'), 'utf8'));
    plan.scenes[0].copy_text = 'Свръхдългадумакоятонеможедасепренесеинаистинанеможе';
    fs.writeFileSync(path.join(project, 'scene-plan.json'), JSON.stringify(plan, null, 2));

    const broken = await runQuickCheck(project);
    t.assert(!broken.passed && broken.issues.some(i => i.rule === 'text-clipped' && i.severity === 'P0'),
      'an unbreakable long word is P0 text-clipped before any render', broken.issues.map(i => i.rule).join(','));

    const loud = hook({ tool_name: 'Edit', tool_input: { file_path: path.join(project, 'scene-plan.json') } });
    t.assert(loud.status === 0 && loud.decision === 'block' && loud.text.includes('P0 text-clipped'), 'the hook blocks with the clipped text for Claude to fix', loud.stdout.slice(0, 300));

    fs.writeFileSync(path.join(project, 'scene-plan.json'), '{ "scenes": [');
    const halfWritten = hook({ tool_name: 'Write', tool_input: { file_path: path.join(project, 'scene-plan.json') } });
    t.assert(halfWritten.decision === 'block' && halfWritten.text.includes('Check failed'), 'an unreadable scene plan is reported, not ignored');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
