import fs from 'node:fs';
import path from 'node:path';
import { readApprovedLock } from './lock.js';
import {
  ISSUE_LABEL, decideAction, findTrackingIssue, issueTitle, parseIssueState, renderCloseComment,
  renderIssueBody, renderUpdateComment, type ChangedFile, type FileStatus, type UpstreamCommit, type UpstreamDelta,
} from './sync_report.js';
import { assertOnline } from '../../packages/media/src/offline.js';

/**
 * Nightly upstream sync. For every upstream in registry/upstreams.json whose remote HEAD on the
 * tracking branch differs from the approved commit (or the observed commit when nothing is
 * approved), reads the commit range and changed files through the GitHub REST API and keeps one
 * open `upstream-update` issue per upstream: created, updated with a comment listing only the new
 * commits, or closed when HEAD is back at the base commit.
 *
 * Never clones and never runs upstream code: only JSON from api.github.com is read.
 *
 * Usage: tsx tools/upstreams/sync_issues.ts [--dry-run] [--repo owner/name] [--only <id>]
 * Env:   GITHUB_TOKEN (or GH_TOKEN) for rate limits and issue writes; GITHUB_REPOSITORY as default --repo.
 */

interface RegistryRepo {
  id: string;
  name: string;
  owner: string;
  repo: string;
  tracking_branch: string;
  observed_commit: string;
  license: string;
}

const API = 'https://api.github.com';
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const SAFE_BRANCH = /^[A-Za-z0-9._/-]+$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

class GitHub {
  constructor(private readonly token: string | undefined) {}

  async request<T>(method: string, route: string, body?: unknown): Promise<T> {
    assertOnline(`GitHub API ${method} ${route}`);
    const res = await fetch(`${API}${route}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'magnifito-upstream-sync',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`${method} ${route} -> ${res.status} ${text.slice(0, 200)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
}

interface CompareResponse {
  status: string;
  ahead_by: number;
  commits: Array<{ sha: string; commit: { message: string; author: { name: string; date: string } | null }; author: { login: string } | null }>;
  files?: Array<{ filename: string; status: FileStatus; additions: number; deletions: number; previous_filename?: string }>;
}

interface Issue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  pull_request?: unknown;
}

function parseArgs(argv: string[]): { dryRun: boolean; repo: string; only?: string } {
  let dryRun = false;
  let repo = process.env.GITHUB_REPOSITORY ?? 'magnifito/awesome-video-skills';
  let only: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--repo') repo = argv[++i] ?? '';
    else if (a === '--only') only = argv[++i];
    else throw new Error(`Unknown argument ${a}`);
  }
  const [o, r] = repo.split('/');
  if (!o || !r || !SAFE_NAME.test(o) || !SAFE_NAME.test(r)) throw new Error(`Invalid --repo ${JSON.stringify(repo)}`);
  return { dryRun, repo, only };
}

/** Reads the registry and resolves the base commit per upstream (approved lock wins). */
export function loadUpstreams(workspaceRoot: string): Array<RegistryRepo & { base_commit: string; base_kind: 'approved' | 'observed' }> {
  const data = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'registry', 'upstreams.json'), 'utf8')) as { repositories: RegistryRepo[] };
  const lock = readApprovedLock(workspaceRoot);
  return data.repositories.map(r => {
    if (!SAFE_NAME.test(r.owner) || !SAFE_NAME.test(r.repo) || !SAFE_BRANCH.test(r.tracking_branch)) {
      throw new Error(`Unsafe repository coordinates for ${r.id}`);
    }
    const approved = lock.approved_baselines[r.id]?.approved_commit ?? null;
    return { ...r, base_commit: approved ?? r.observed_commit, base_kind: approved ? 'approved' as const : 'observed' as const };
  });
}

async function fetchDelta(gh: GitHub, u: ReturnType<typeof loadUpstreams>[number]): Promise<UpstreamDelta> {
  const branch = await gh.request<{ commit: { sha: string } }>('GET', `/repos/${u.owner}/${u.repo}/branches/${encodeURIComponent(u.tracking_branch)}`);
  const head = branch.commit.sha;
  if (!COMMIT_SHA.test(head)) throw new Error(`No valid HEAD for ${u.owner}/${u.repo}@${u.tracking_branch}`);
  const base: Omit<UpstreamDelta, 'compare_status' | 'ahead_by' | 'commits' | 'files' | 'files_truncated'> = {
    id: u.id, name: u.name, owner: u.owner, repo: u.repo, branch: u.tracking_branch, license: u.license,
    base_commit: u.base_commit, base_kind: u.base_kind, head_commit: head,
  };
  if (head === u.base_commit) return { ...base, compare_status: 'identical', ahead_by: 0, commits: [], files: [], files_truncated: false };

  const cmp = await gh.request<CompareResponse>('GET', `/repos/${u.owner}/${u.repo}/compare/${u.base_commit}...${head}?per_page=250`);
  const commits: UpstreamCommit[] = cmp.commits.map(c => ({
    sha: c.sha,
    date: c.commit.author?.date ?? '',
    author: c.author?.login ?? c.commit.author?.name ?? 'unknown',
    message: c.commit.message,
  }));
  const rawFiles = cmp.files ?? [];
  const files: ChangedFile[] = rawFiles.map(f => ({
    path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions,
    ...(f.previous_filename ? { previous_path: f.previous_filename } : {}),
  }));
  return { ...base, compare_status: cmp.status, ahead_by: cmp.ahead_by, commits, files, files_truncated: rawFiles.length >= 300 };
}

async function ensureLabel(gh: GitHub, repo: string, name: string, color: string, description: string, dryRun: boolean): Promise<void> {
  try {
    await gh.request('GET', `/repos/${repo}/labels/${encodeURIComponent(name)}`);
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
    if (dryRun) {
      console.log(`[dry-run] would create label '${name}'`);
      return;
    }
    await gh.request('POST', `/repos/${repo}/labels`, { name, color, description });
    console.log(`created label '${name}'`);
  }
}

async function listTrackingIssues(gh: GitHub, repo: string): Promise<Issue[]> {
  const all: Issue[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh.request<Issue[]>('GET', `/repos/${repo}/issues?state=open&labels=${ISSUE_LABEL}&per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
  if (!token && !args.dryRun) throw new Error('GITHUB_TOKEN is required unless --dry-run is given');
  const gh = new GitHub(token);
  const now = new Date().toISOString();

  await ensureLabel(gh, args.repo, ISSUE_LABEL, '0e8a16', 'New upstream commits to review and adopt', args.dryRun);

  let issues: Issue[] = [];
  try {
    issues = await listTrackingIssues(gh, args.repo);
  } catch (err) {
    if (!args.dryRun) throw err;
    console.log(`[dry-run] could not list issues (${(err as Error).message}); assuming none are open`);
  }

  const upstreams = loadUpstreams(process.cwd()).filter(u => !args.only || u.id === args.only);
  const summary = ['| Upstream | Base | Remote HEAD | Ahead | Action |', '| --- | --- | --- | --- | --- |'];
  let failed = false;

  for (const u of upstreams) {
    let delta: UpstreamDelta;
    try {
      delta = await fetchDelta(gh, u);
    } catch (err) {
      failed = true;
      console.log(`::error title=Upstream lookup failed::${u.id}: ${(err as Error).message}`);
      summary.push(`| ${u.id} | ${u.base_commit.slice(0, 12)} | - | - | lookup failed |`);
      continue;
    }

    const existing = findTrackingIssue(issues, u.id);
    const action = decideAction(delta, existing);
    const prefix = args.dryRun ? '[dry-run] ' : '';
    let label: string = action.kind;

    if (action.kind === 'create') {
      const title = issueTitle(delta);
      const body = renderIssueBody(delta, now);
      console.log(`\n${prefix}CREATE issue for ${u.id}: ${title}\n${'-'.repeat(80)}\n${body}\n${'-'.repeat(80)}`);
      if (!args.dryRun) {
        const created = await gh.request<Issue>('POST', `/repos/${args.repo}/issues`, { title, body, labels: [ISSUE_LABEL] });
        label = `created #${created.number}`;
      }
    } else if (action.kind === 'update' && existing) {
      const title = issueTitle(delta);
      const body = renderIssueBody(delta, now);
      const comment = renderUpdateComment(delta, action.newCommits, parseIssueState(existing.body)?.head ?? null);
      console.log(`\n${prefix}UPDATE #${existing.number} for ${u.id}: ${title}\n${prefix}comment:\n${comment}`);
      if (!args.dryRun) {
        await gh.request('PATCH', `/repos/${args.repo}/issues/${existing.number}`, { title, body });
        await gh.request('POST', `/repos/${args.repo}/issues/${existing.number}/comments`, { body: comment });
      }
      label = `updated #${existing.number} (+${action.newCommits.length})`;
    } else if (action.kind === 'close' && existing) {
      console.log(`\n${prefix}CLOSE #${existing.number} for ${u.id}: HEAD equals base`);
      if (!args.dryRun) {
        await gh.request('POST', `/repos/${args.repo}/issues/${existing.number}/comments`, { body: renderCloseComment(delta) });
        await gh.request('PATCH', `/repos/${args.repo}/issues/${existing.number}`, { state: 'closed', state_reason: 'completed' });
      }
      label = `closed #${existing.number}`;
    } else if (action.kind === 'none') {
      label = action.reason;
    }
    summary.push(`| ${u.id} | ${u.base_commit.slice(0, 12)} (${u.base_kind}) | ${delta.head_commit.slice(0, 12)} | ${delta.ahead_by} | ${prefix}${label} |`);
  }

  const table = summary.join('\n');
  console.log(`\n${table}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Upstream sync\n\n${table}\n`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('sync_issues.ts') || process.argv[1]?.endsWith('sync_issues.js')) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
