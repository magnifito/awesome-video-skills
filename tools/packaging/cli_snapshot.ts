/**
 * Writes (or with --check, compares) tools/packaging/cli-help.snapshot.txt: the help text of every
 * mgvideo command. Commit it with any CLI change so the change is reviewable as a diff.
 *
 * Usage: tsx tools/packaging/cli_snapshot.ts [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SNAPSHOT_PATH = path.join(ROOT, 'tools', 'packaging', 'cli-help.snapshot.txt');

/** Current help of every command, from the CLI source. */
export function currentCliHelp(): string {
  const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx');
  return execFileSync(tsx, [path.join(ROOT, 'packages', 'cli', 'src', 'bin', 'mgvideo.ts')], {
    env: { ...process.env, MGVIDEO_HELP_SNAPSHOT: '1' }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
}

/** Command paths (`mgvideo review judge`) listed in a snapshot. */
export function snapshotCommands(snapshot: string): string[][] {
  return [...snapshot.matchAll(/^## (mgvideo(?: [^\n]+)?)$/gm)].map(m => m[1].split(' '));
}

if (process.argv[1]?.endsWith('cli_snapshot.ts')) {
  const now = currentCliHelp();
  if (process.argv.includes('--check')) {
    const saved = fs.existsSync(SNAPSHOT_PATH) ? fs.readFileSync(SNAPSHOT_PATH, 'utf8') : '';
    if (saved !== now) {
      console.error('cli-help.snapshot.txt is out of date: run `npm run cli:snapshot` and commit the result.');
      process.exit(1);
    }
    console.log('cli-help.snapshot.txt is current.');
  } else {
    fs.writeFileSync(SNAPSHOT_PATH, now);
    console.log(`Wrote ${path.relative(ROOT, SNAPSHOT_PATH)} (${snapshotCommands(now).length} commands).`);
  }
}
