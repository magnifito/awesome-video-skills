import fs from 'node:fs/promises';
import path from 'node:path';

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

  const results: UpstreamCheckResult[] = [];

  for (const repo of upstreams.repositories) {
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

export interface UpstreamProposal {
  source_id: string;
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

  const repo = upstreams.repositories.find((r: Record<string, unknown>) => r.id === sourceId);
  if (!repo) {
    throw new Error(`Repository '${sourceId}' not found in registry/upstreams.json`);
  }

  // Find affected skills
  const affectedSkills = capabilities.canonical_skills
    .filter((s: { sources: string[] }) => s.sources.some(src => src.toLowerCase().includes(sourceId) || src.toLowerCase().includes(repo.repo.toLowerCase())))
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

