// Runs one mgvideo command and saves what it prints to a file. The showcase renderer keeps no
// command output, and `mgvideo chapters` and `mgvideo validate` report on stdout, so this is
// how their reports become "Behind the clip" files. Exits with the command's exit code, after
// saving, so a failed validation is still kept.
// Usage: node save-output.mjs <out.txt> <mgvideo command> [args...]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MGVIDEO = path.resolve(here, '../../dist/packages/cli/src/bin/mgvideo.js');

const [out, ...args] = process.argv.slice(2);
if (!out || !args.length) {
  console.error('Usage: node save-output.mjs <out.txt> <mgvideo command> [args...]');
  process.exit(2);
}
const res = spawnSync(process.execPath, [MGVIDEO, ...args], { encoding: 'utf8' });
const text = `${res.stdout ?? ''}${res.stderr ? `\n${res.stderr}` : ''}`.trim();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `$ mgvideo ${args.join(' ')}\n\n${text}\n`);
console.log(`mgvideo ${args.join(' ')} -> ${out} (exit ${res.status})`);
process.exit(res.status ?? 1);
