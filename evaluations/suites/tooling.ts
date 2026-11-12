import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SuiteContext } from '../run-suites.js';
import { lintSkills } from '../../tools/packaging/skill_lint.js';
import { currentCliHelp, SNAPSHOT_PATH, snapshotCommands } from '../../tools/packaging/cli_snapshot.js';
import { assertOnline, helperNetworkEnv, isOffline } from '../../packages/media/src/offline.js';
import { findGeneration, generationKey, ledgerSpend, readLedger, recordGeneration } from '../../packages/media/src/ledger.js';
import { NotificationDispatcher } from '../../packages/media/src/notifications.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const throws = (fn: () => unknown, re: RegExp) => { try { fn(); return false; } catch (e) { return re.test((e as Error).message); } };

/** Skill lint, CLI help snapshot, coverage ladder, offline switch and generation ledger. */
export async function run(t: SuiteContext): Promise<void> {
  // --- CLI help snapshot ------------------------------------------------------------------
  const saved = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
  const now = currentCliHelp();
  t.assert(saved === now, 'tools/packaging/cli-help.snapshot.txt matches the CLI (run npm run cli:snapshot after a CLI change)');
  const cmds = snapshotCommands(now).map(c => c.join(' '));
  t.assert(cmds.includes('mgvideo review judge') && cmds.includes('mgvideo check'), 'the snapshot lists every command and subcommand', String(cmds.length));

  // --- skill lint ---------------------------------------------------------------------------
  const real = lintSkills(path.join(ROOT, 'skills'), saved, JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
  t.assert(real.errors.length === 0, 'the ten skills pass the skill lint', real.errors.join('; '));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-tooling-'));
  try {
    const skill = (name: string, fm: string, body: string) => {
      fs.mkdirSync(path.join(tmp, 'skills', name, 'reference'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'skills', name, 'SKILL.md'), `---\n${fm}\n---\n${body}\n`);
    };
    skill('good-one', 'name: good-one\ndescription: "Does one thing."\nmetadata:\n  tested-against: "0.1.0"', 'Run `mgvideo review judge latest` then `mgvideo check . --quick`.');
    skill('Bad_Name', 'name: other\ndescription: ""', 'Run mgvideo frobnicate now, then mgvideo review explode. Always use #ff0000 for the best result.');
    fs.writeFileSync(path.join(tmp, 'skills', 'good-one', 'reference', 'x.md'), 'Colour `#123456` in code is fine. A fair hex #ABCDEF here is not.\nThe best #abc opinion-ok: brand sheet.\n');
    const lint = lintSkills(path.join(tmp, 'skills'), saved, '0.1.0');
    const has = (re: RegExp) => lint.errors.some(e => re.test(e));
    t.assert(has(/Bad_Name\/SKILL\.md: name "other" does not match/) && has(/description is missing/) && has(/tested-against is missing/),
      'lint: name must match the folder, description and tested-against are required', lint.errors.join('; '));
    t.assert(has(/`mgvideo frobnicate` is not a mgvideo command/) && has(/`mgvideo review explode` is not a subcommand/),
      'lint: unknown mgvideo commands and subcommands are errors');
    t.assert(!lint.errors.some(e => e.includes('good-one')), 'lint: real commands and a matching frontmatter pass', lint.errors.filter(e => e.includes('good-one')).join('; '));
    t.assert(lint.warnings.some(w => w.includes('Bad_Name') && w.includes('"Always use"')) && lint.warnings.some(w => w.includes('x.md:1') && w.includes('hex')),
      'opinion guard warns on "always use" and on hex colours outside code', lint.warnings.join('; '));
    t.assert(!lint.warnings.some(w => w.includes('x.md') && w.includes('the best')) && lint.warnings.filter(w => w.includes('x.md')).length === 1,
      'opinion-ok exempts a line; colours in code spans are not flagged');
    t.assert(lintSkills(path.join(tmp, 'skills'), saved, '0.2.0').errors.some(e => e.includes('good-one') && e.includes('tested against mgvideo 0.1.0')),
      'a skill tested against an older toolkit version must be re-checked');

    // --- coverage ladder ------------------------------------------------------------------------
    const caps = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', 'capabilities.json'), 'utf8'));
    t.assert(caps.canonical_skills.every((s: { coverage?: { level: string; evidence: string } }) => /^D[0-4]$/.test(s.coverage?.level ?? '') && !!s.coverage?.evidence) && Object.keys(caps.coverage_levels).length === 5,
      'every canonical skill has a coverage level D0-D4 with evidence');

    // --- offline switch -------------------------------------------------------------------------
    const off = { ...process.env, MGVIDEO_OFFLINE: '1' };
    t.assert(isOffline(off) && !isOffline({ ...process.env, MGVIDEO_OFFLINE: '' }), 'MGVIDEO_OFFLINE=1 turns the offline switch on');
    t.assert(throws(() => assertOnline('git ls-remote x/y', off), /MGVIDEO_OFFLINE=1: git ls-remote x\/y needs the network/), 'offline, a network use is refused with its name');
    t.assert(helperNetworkEnv(off).HF_HUB_OFFLINE === '1' && helperNetworkEnv({}).HF_HUB_OFFLINE === undefined, 'offline, Python helpers load models from the cache only');
    const prev = process.env.MGVIDEO_OFFLINE;
    process.env.MGVIDEO_OFFLINE = '1';
    let refused = false;
    try {
      await NotificationDispatcher.send({ event: 'render.completed', project_id: 'p', message: 'm', timestamp: new Date().toISOString() } as never, 'https://example.invalid/hook');
    } catch (e) {
      refused = /MGVIDEO_OFFLINE/.test((e as Error).message);
    } finally {
      if (prev === undefined) delete process.env.MGVIDEO_OFFLINE; else process.env.MGVIDEO_OFFLINE = prev;
    }
    t.assert(refused, 'offline, a webhook is refused before any request');

    // --- generation ledger ----------------------------------------------------------------------
    const project = path.join(tmp, 'project');
    fs.mkdirSync(path.join(project, 'audio'), { recursive: true });
    const req = { kind: 'voice', model: 'qwen3-tts-1.7b', prompt: 'Здравейте!', seed: 7, params: { speed: 1, voice: 'mira' } };
    t.assert(generationKey(req) === generationKey({ ...req, params: { voice: 'mira', speed: 1 } }) && generationKey(req) !== generationKey({ ...req, seed: 8 }),
      'the key ignores parameter order and changes with the seed');
    t.assert(findGeneration(project, req) === null, 'nothing is found before anything is recorded');
    fs.writeFileSync(path.join(project, 'audio', 'hello.wav'), 'RIFF....');
    recordGeneration(project, req, path.join(project, 'audio', 'hello.wav'), 12);
    recordGeneration(project, { ...req, kind: 'image', model: 'local', prompt: 'logo' }, path.join(project, 'audio', 'hello.wav'), 0);
    const hit = findGeneration(project, { ...req, params: { voice: 'mira', speed: 1 } });
    t.assert(hit?.path === path.join(project, 'audio', 'hello.wav') && hit.file === 'audio/hello.wav', 'the same request finds the recorded file');
    const spend = ledgerSpend(readLedger(project));
    t.assert(spend.total_cents === 12 && spend.by_kind.voice === 12 && spend.count === 2, 'spend adds up per kind');
    fs.writeFileSync(path.join(project, 'audio', 'hello.wav'), 'edited');
    t.assert(findGeneration(project, req) === null, 'an edited output is not reused');
    t.assert(throws(() => recordGeneration(project, req, path.join(tmp, 'outside.wav'), 0), /inside the project/), 'outputs must live inside the project');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
