import { loadUpstreams } from './sync_issues.js';
import { parseIssueState } from './sync_report.js';

/**
 * Resolves which upstream an `upstream-update` issue is about, for the agent workflow.
 *
 * The issue body is untrusted: only the `<!-- upstream:<id> -->` marker is read from it, and the
 * id must name a repository in registry/upstreams.json. Owner, repo, branch and base commit come
 * from the registry; the HEAD commit is resolved fresh through the GitHub API, never taken from
 * the body. Prints `key=value` lines for $GITHUB_OUTPUT.
 *
 * Env: ISSUE_BODY, ISSUE_NUMBER, GITHUB_RUN_ID, GITHUB_TOKEN.
 */

const COMMIT_SHA = /^[0-9a-f]{40}$/;

async function main(): Promise<void> {
  const state = parseIssueState(process.env.ISSUE_BODY);
  if (!state) throw new Error('Issue body carries no <!-- upstream:<id> --> marker');
  const upstream = loadUpstreams(process.cwd()).find(u => u.id === state.id);
  if (!upstream) throw new Error(`Upstream '${state.id}' is not tracked in registry/upstreams.json`);

  const issue = process.env.ISSUE_NUMBER ?? '';
  if (!/^\d+$/.test(issue)) throw new Error('ISSUE_NUMBER must be numeric');
  const runId = process.env.GITHUB_RUN_ID ?? 'local';
  if (!/^[A-Za-z0-9]+$/.test(runId)) throw new Error('GITHUB_RUN_ID must be alphanumeric');

  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${upstream.owner}/${upstream.repo}/branches/${encodeURIComponent(upstream.tracking_branch)}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'magnifito-upstream-sync',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HEAD lookup failed: ${res.status}`);
  const head = ((await res.json()) as { commit?: { sha?: string } }).commit?.sha ?? '';
  if (!COMMIT_SHA.test(head)) throw new Error('HEAD lookup returned no valid commit');
  if (head === upstream.base_commit) throw new Error(`${upstream.id} HEAD already equals the ${upstream.base_kind} commit; nothing to adopt`);

  const out = {
    id: upstream.id,
    owner: upstream.owner,
    repo: upstream.repo,
    branch_upstream: upstream.tracking_branch,
    base: upstream.base_commit,
    base_kind: upstream.base_kind,
    head,
    branch: `upstream-sync/${upstream.id}-${head.slice(0, 8)}-${runId}`,
  };
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
