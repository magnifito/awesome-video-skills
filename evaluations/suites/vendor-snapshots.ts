import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SuiteContext } from '../run-suites.js';

/** Upstreams that must be vendored as pristine snapshots. */
const VENDORED = ['barty-motion-graphics', 'vxi-motion-tools', 'raea-skills'];

/** Every vendored upstream file must match the SHA-256 recorded in approved.lock.json. */
export async function run(t: SuiteContext): Promise<void> {
  const root = process.cwd();
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'registry/approved.lock.json'), 'utf8')) as {
    approved_baselines: Record<string, { approved_commit: string; vendored_path?: string }>;
    file_hashes: Record<string, string>;
  };
  const upstreams = JSON.parse(fs.readFileSync(path.join(root, 'registry/upstreams.json'), 'utf8')) as {
    repositories: { id: string; approved_commit: string | null }[];
  };

  for (const id of VENDORED) {
    const base = lock.approved_baselines[id];
    t.assert(!!base, `${id}: is an approved baseline`);
    if (!base?.vendored_path) {
      t.assert(false, `${id}: has a vendored_path`);
      continue;
    }
    t.assert(base.vendored_path === `vendor/${id}/${base.approved_commit}`, `${id}: vendored path is keyed by the approved commit`);
    const tracked = upstreams.repositories.find(r => r.id === id);
    t.assert(tracked?.approved_commit === base.approved_commit, `${id}: upstreams.json approves the vendored commit`);

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
    t.assert(listed.length > 0 && listed.length === onDisk.length, `${id}: every vendored file is hashed (${onDisk.length} files)`);
    const bad = listed.filter(p => {
      const full = path.join(root, p);
      return !fs.existsSync(full) || crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') !== lock.file_hashes[p];
    });
    t.assert(bad.length === 0, `${id}: vendored file hashes match the lock`, bad.slice(0, 3).join(', '));
    t.assert(!onDisk.some(p => /mixkit/i.test(p)), `${id}: no Mixkit runtime audio is vendored`);
  }

  // Vendored skills are data. The plugin ships only skills/magnifito-*, so no vendored
  // SKILL.md may sit where Claude Code discovers skills.
  const shipped = fs.readdirSync(path.join(root, 'skills'));
  t.assert(shipped.every(s => s.startsWith('magnifito-')), 'skills/ holds only Magnifito skills', shipped.join(', '));
}
