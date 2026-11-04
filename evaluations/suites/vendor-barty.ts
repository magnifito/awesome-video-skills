import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SuiteContext } from '../run-suites.js';

/** Vendored upstream files must match the SHA-256 recorded in approved.lock.json. */
export async function run(t: SuiteContext): Promise<void> {
  const root = process.cwd();
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'registry/approved.lock.json'), 'utf8')) as {
    approved_baselines: Record<string, { approved_commit: string; vendored_path?: string }>;
    file_hashes: Record<string, string>;
  };
  const base = lock.approved_baselines['barty-motion-graphics'];
  t.assert(!!base, 'barty-motion-graphics is an approved baseline');
  if (!base?.vendored_path) return;
  t.assert(base.vendored_path.endsWith(base.approved_commit), 'vendored path is keyed by the approved commit');

  const listed = Object.keys(lock.file_hashes).filter(p => p.startsWith(base.vendored_path + '/'));
  const onDisk: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else onDisk.push(path.relative(root, p));
    }
  };
  walk(path.join(root, base.vendored_path));
  t.assert(listed.length > 0 && listed.length === onDisk.length, `every vendored file is hashed (${onDisk.length} files)`);
  const bad = listed.filter(p => {
    const full = path.join(root, p);
    return !fs.existsSync(full) || crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') !== lock.file_hashes[p];
  });
  t.assert(bad.length === 0, 'vendored file hashes match the lock', bad.slice(0, 3).join(', '));
  t.assert(!onDisk.some(p => /mixkit/i.test(p)), 'no Mixkit runtime audio is vendored');
}
