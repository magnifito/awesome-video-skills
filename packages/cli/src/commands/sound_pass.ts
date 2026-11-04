import fs from 'node:fs';
import path from 'node:path';
import { setupSfxEnv } from '../../../media/src/sfx_env.js';
import { runSfxPass, type SfxSwaps } from '../../../media/src/sfx_pass.js';

/** `mgvideo setup sfx`: creates the managed librosa venv in the user cache. */
export function runSetupSfx(opts: { python?: string; force?: boolean }): void {
  const res = setupSfxEnv({ python: opts.python, force: opts.force, log: l => console.log(l) });
  console.log(res.installed ? '\n✅ Sound-pass environment installed.' : '\n✅ Sound-pass environment already set up (nothing to do).');
  console.log(`Venv: ${res.venvDir}`);
  console.log(`Python: ${res.pythonVersion}`);
  console.log(`Pinned: ${res.requirements.join(', ')}\n`);
}

export interface SfxPassCliOptions {
  cues: string;
  out: string;
  music?: string;
  musicDb?: string;
  musicSource?: string;
  musicLicense?: string;
  useCase?: string;
  seed?: string;
  swaps?: string;
  snapWindow?: string;
  proof?: boolean;
}

function num(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number, got ${JSON.stringify(value)}`);
  return n;
}

/** `mgvideo sfx <video> --cues cues.json --out dir`: the measured sound pass. */
export function runSfxPassCommand(video: string, opts: SfxPassCliOptions): void {
  const seed = num(opts.seed, '--seed');
  if (seed !== undefined && !Number.isInteger(seed)) throw new Error('--seed must be an integer');
  let swaps: SfxSwaps | undefined;
  if (opts.swaps) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(opts.swaps), 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.values(raw).some(v => typeof v !== 'string')) {
      throw new Error('--swaps must be a JSON object of cue index -> sound file id or "auto"');
    }
    swaps = raw as SfxSwaps;
  }
  const res = runSfxPass({
    video,
    cues: opts.cues,
    outDir: opts.out,
    music: opts.music,
    musicDb: num(opts.musicDb, '--music-db'),
    musicSource: opts.musicSource,
    musicLicense: opts.musicLicense,
    useCase: opts.useCase,
    seed,
    swaps,
    snapWindowS: num(opts.snapWindow, '--snap-window'),
    proof: opts.proof,
  });
  console.log('\n🔊 Sound pass complete');
  for (const l of res.log) console.log(`  ${l}`);
  console.log('\nCheck these with headphones:');
  for (const l of res.report.check_with_headphones as string[]) console.log(`  - ${l}`);
  console.log(`\nVideo:   ${res.outputVideo}`);
  console.log(`Report:  ${res.reportHtml}`);
  console.log(`JSON:    ${res.reportJson}`);
  console.log(`Credits: ${res.credits}\n`);
}
