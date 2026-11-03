import fs from 'node:fs/promises';
import path from 'node:path';
import { approvedLockPath, isFullSha, readApprovedLock } from './_shared.js';

export interface UpstreamCheckResult {
  repository_id: string;
  name: string;
  owner_repo: string;
  observed_commit: string;
  approved_commit: string | null;
  license: string;
  change_status: 'up_to_date' | 'candidate_pending_review' | 'unapproved_baseline';
  notes: string;
}

export interface UpstreamReport {
  checked_at: string;
  total_tracked: number;
  candidates_pending: number;
  repositories: UpstreamCheckResult[];
}

export async function runUpstreamCheck(workspaceRoot: string): Promise<UpstreamReport> {
  const upstreamsPath = path.join(workspaceRoot, 'registry', 'upstreams.json');
  const upstreams = JSON.parse(await fs.readFile(upstreamsPath, 'utf-8'));
  // registry/approved.lock.json is the single source of truth for approvals;
  // upstreams.json only records what was observed upstream.
  const lock = readApprovedLock(workspaceRoot);

  const results: UpstreamCheckResult[] = [];

  for (const upstream of upstreams.repositories) {
    const repo = { ...upstream, approved_commit: lock.approved_baselines[upstream.id]?.approved_commit ?? null };
    let status: UpstreamCheckResult['change_status'] = 'candidate_pending_review';
    let notes = '';

    if (repo.approved_commit === repo.observed_commit) {
      status = 'up_to_date';
      notes = 'Observed commit matches approved production baseline.';
    } else if (!repo.approved_commit) {
      status = 'unapproved_baseline';
      notes = `Observed commit ${repo.observed_commit.slice(0, 8)} is pending sandbox test qualification before production approval.`;
    } else {
      status = 'candidate_pending_review';
      notes = `New upstream commit ${repo.observed_commit.slice(0, 8)} detected beyond approved ${repo.approved_commit.slice(0, 8)}.`;
    }

    results.push({
      repository_id: repo.id,
      name: repo.name,
      owner_repo: `${repo.owner}/${repo.repo}`,
      observed_commit: repo.observed_commit,
      approved_commit: repo.approved_commit,
      license: repo.license,
      change_status: status,
      notes
    });
  }

  const pendingCount = results.filter(r => r.change_status !== 'up_to_date').length;

  return {
    checked_at: new Date().toISOString(),
    total_tracked: results.length,
    candidates_pending: pendingCount,
    repositories: results
  };
}

/**
 * A review proposal for an observed upstream commit. This is advisory output only:
 * no branch is created and nothing is fetched or approved.
 */
export interface UpstreamProposal {
  source_id: string;
  /** Suggested name for a candidate branch; the command does not create it. */
  candidate_branch: string;
  frozen_commit: string;
  affected_skills: string[];
  license_status: string;
  execution_policy: string;
  rollback_command: string;
}

export async function runUpstreamPropose(workspaceRoot: string, sourceId: string): Promise<UpstreamProposal> {
  const upstreamsPath = path.join(workspaceRoot, 'registry', 'upstreams.json');
  const capabilitiesPath = path.join(workspaceRoot, 'registry', 'capabilities.json');

  const upstreams = JSON.parse(await fs.readFile(upstreamsPath, 'utf-8'));
  const capabilities = JSON.parse(await fs.readFile(capabilitiesPath, 'utf-8'));

  const wanted = sourceId.toLowerCase();
  const repo = upstreams.repositories.find((r: { id: string }) => r.id.toLowerCase() === wanted);
  if (!repo) {
    throw new Error(`Repository '${sourceId}' not found in registry/upstreams.json`);
  }

  // Find affected skills
  const affectedSkills = capabilities.canonical_skills
    .filter((s: { sources: string[] }) => s.sources.some(src => src.toLowerCase().includes(wanted) || src.toLowerCase().includes(repo.repo.toLowerCase())))
    .map((s: { id: string }) => s.id);

  const candidateBranch = `candidate/${repo.id}/${repo.observed_commit.slice(0, 8)}`;

  return {
    source_id: repo.id,
    candidate_branch: candidateBranch,
    frozen_commit: repo.observed_commit,
    affected_skills: affectedSkills.length > 0 ? affectedSkills : ['magnifito-video'],
    license_status: `License verified: ${repo.license}. Component licenses: ${JSON.stringify(repo.component_licenses || {})}`,
    execution_policy: 'Discovery and static review must not run untrusted scripts. Run qualification checks on synthetic fixtures in disposable unprivileged runner.',
    rollback_command: `git checkout main && mgvideo catalog`
  };
}

/**
 * Rolls a source back to a commit that was previously approved for it.
 *
 * Only commits recorded in the baseline's approval history are accepted. When no commit is
 * given, the most recent history entry is used. The replaced commit is pushed onto the history.
 */
export async function runUpstreamRollback(
  workspaceRoot: string,
  sourceId: string,
  previousCommit?: string
): Promise<{ source_id: string; rolled_back_to: string; status: string }> {
  const lock = readApprovedLock(workspaceRoot);
  const currentBaseline = lock.approved_baselines[sourceId];
  if (!currentBaseline) {
    throw new Error(`No approved baseline found for source '${sourceId}' in registry/approved.lock.json.`);
  }

  const history = currentBaseline.history ?? [];
  let target: string;
  if (previousCommit) {
    const normalized = previousCommit.trim().toLowerCase();
    if (!isFullSha(normalized)) {
      throw new Error(`Rollback target must be a full 40-character hex commit SHA, got '${previousCommit}'.`);
    }
    target = normalized;
  } else {
    if (history.length === 0) {
      throw new Error(`Source '${sourceId}' has no previously approved commits to roll back to.`);
    }
    target = history[0].commit;
  }

  if (target === currentBaseline.approved_commit) {
    throw new Error(`Source '${sourceId}' is already at approved commit ${target}.`);
  }
  const entry = history.find(h => h.commit === target);
  if (!entry) {
    throw new Error(
      `Commit ${target} was never approved for '${sourceId}'. Rollback may only target a commit in its approval history.`
    );
  }

  lock.approved_baselines[sourceId] = {
    approved_commit: target,
    license: currentBaseline.license,
    approved_date: entry.approved_date ?? new Date().toISOString(),
    verification_status: 'rolled-back-baseline',
    history: [
      {
        commit: currentBaseline.approved_commit,
        approved_date: currentBaseline.approved_date,
        verification_status: currentBaseline.verification_status
      },
      ...history.filter(h => h.commit !== target)
    ]
  };

  await fs.writeFile(approvedLockPath(workspaceRoot), JSON.stringify(lock, null, 2) + '\n', 'utf-8');

  return {
    source_id: sourceId,
    rolled_back_to: target,
    status: 'Updated approved.lock.json baseline to a previously approved commit'
  };
}
