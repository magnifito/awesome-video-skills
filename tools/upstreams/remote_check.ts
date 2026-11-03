import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Compares the live HEAD of each tracked upstream branch (via `git ls-remote`) against the
 * observed and approved commits in registry/upstreams.json.
 *
 * Exit codes: 0 = all lookups succeeded (drift is reported as warnings), 1 = a lookup failed.
 */

interface Repo {
  id: string;
  owner: string;
  repo: string;
  tracking_branch: string;
  observed_commit: string;
  approved_commit: string | null;
}

export interface RemoteCheckRow {
  id: string;
  remote_head: string | null;
  observed_commit: string;
  approved_commit: string | null;
  drift: boolean;
  error?: string;
}

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export function lsRemoteHead(owner: string, repo: string, branch: string): string {
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo) || !/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw new Error(`Unsafe repository coordinates: ${owner}/${repo}@${branch}`);
  }
  const out = execFileSync('git', ['ls-remote', `https://github.com/${owner}/${repo}.git`, `refs/heads/${branch}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).toString().trim();
  const sha = out.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error(`No HEAD found for ${owner}/${repo}@${branch}`);
  return sha;
}

export function checkRemotes(workspaceRoot: string): RemoteCheckRow[] {
  const data = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'registry', 'upstreams.json'), 'utf8')) as { repositories: Repo[] };
  return data.repositories.map(r => {
    try {
      const head = lsRemoteHead(r.owner, r.repo, r.tracking_branch);
      return { id: r.id, remote_head: head, observed_commit: r.observed_commit, approved_commit: r.approved_commit, drift: head !== r.observed_commit };
    } catch (err) {
      return { id: r.id, remote_head: null, observed_commit: r.observed_commit, approved_commit: r.approved_commit, drift: false, error: (err as Error).message };
    }
  });
}

if (process.argv[1]?.endsWith('remote_check.ts') || process.argv[1]?.endsWith('remote_check.js')) {
  const rows = checkRemotes(process.cwd());
  const lines = ['| Upstream | Remote HEAD | Observed | Approved | Status |', '| --- | --- | --- | --- | --- |'];
  let failed = false;
  for (const r of rows) {
    const status = r.error ? `error: ${r.error}` : r.drift ? 'new commits' : 'up to date';
    if (r.error) {
      failed = true;
      console.log(`::error title=Upstream lookup failed::${r.id}: ${r.error}`);
    } else if (r.drift) {
      console.log(`::warning title=Upstream drift::${r.id} HEAD ${r.remote_head} differs from observed ${r.observed_commit}`);
    }
    lines.push(`| ${r.id} | ${r.remote_head?.slice(0, 12) ?? '-'} | ${r.observed_commit.slice(0, 12)} | ${r.approved_commit?.slice(0, 12) ?? 'none'} | ${status} |`);
  }
  const summary = lines.join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Upstream check\n\n${summary}\n`);
  process.exit(failed ? 1 : 0);
}
