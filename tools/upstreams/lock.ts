import fs from 'node:fs';
import path from 'node:path';

export interface ApprovedBaseline {
  approved_commit: string;
  license: string;
  approved_date: string;
  verification_status: string;
}

export interface ApprovedLock {
  lockfile_version: string;
  generated_at: string;
  approved_baselines: Record<string, ApprovedBaseline>;
  /** Pinned snapshot manifest hashes keyed by "<sourceId>/<commitSha>". */
  file_hashes: Record<string, string>;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;

/** Reads and validates registry/approved.lock.json. Throws on a malformed lock. */
export function readApprovedLock(workspaceRoot: string): ApprovedLock {
  const lockPath = path.join(workspaceRoot, 'registry', 'approved.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<ApprovedLock>;
  if (!lock.approved_baselines || typeof lock.approved_baselines !== 'object') {
    throw new Error('approved.lock.json is missing approved_baselines');
  }
  for (const [id, b] of Object.entries(lock.approved_baselines)) {
    if (!COMMIT_SHA.test(b.approved_commit)) {
      throw new Error(`approved.lock.json: baseline '${id}' has invalid commit ${JSON.stringify(b.approved_commit)}`);
    }
  }
  return { lockfile_version: '1.0.0', generated_at: '', file_hashes: {}, ...lock } as ApprovedLock;
}

/** Returns the approved commit for a source, or throws if the source has no approved baseline. */
export function getApprovedCommit(workspaceRoot: string, sourceId: string): string {
  const baseline = readApprovedLock(workspaceRoot).approved_baselines[sourceId];
  if (!baseline) throw new Error(`No approved baseline for upstream '${sourceId}' in registry/approved.lock.json`);
  return baseline.approved_commit;
}

/**
 * Checks that registry/upstreams.json and registry/approved.lock.json agree on every approved commit.
 * Returns a list of mismatches (empty = consistent).
 */
export function checkRegistryConsistency(workspaceRoot: string): string[] {
  const lock = readApprovedLock(workspaceRoot);
  const upstreams = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'registry', 'upstreams.json'), 'utf8')) as {
    repositories: Array<{ id: string; approved_commit: string | null }>;
  };
  const problems: string[] = [];
  for (const repo of upstreams.repositories) {
    const locked = lock.approved_baselines[repo.id]?.approved_commit ?? null;
    if ((repo.approved_commit ?? null) !== locked) {
      problems.push(`${repo.id}: upstreams.json approved_commit=${repo.approved_commit ?? 'null'} but approved.lock.json=${locked ?? 'none'}`);
    }
  }
  for (const id of Object.keys(lock.approved_baselines)) {
    if (!upstreams.repositories.some(r => r.id === id)) problems.push(`${id}: approved in lock but not tracked in upstreams.json`);
  }
  return problems;
}

if (process.argv[1]?.endsWith('lock.ts') || process.argv[1]?.endsWith('lock.js')) {
  const problems = checkRegistryConsistency(process.cwd());
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
  console.log('✓ registry/upstreams.json and registry/approved.lock.json are consistent');
}
