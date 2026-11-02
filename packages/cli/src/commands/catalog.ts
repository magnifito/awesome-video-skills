import fs from 'node:fs/promises';
import path from 'node:path';

export async function runCatalog(workspaceRoot: string): Promise<Record<string, unknown>> {
  const upstreamsPath = path.join(workspaceRoot, 'registry', 'upstreams.json');
  const capabilitiesPath = path.join(workspaceRoot, 'registry', 'capabilities.json');
  const approvedPath = path.join(workspaceRoot, 'registry', 'approved.lock.json');
  const provenancePath = path.join(workspaceRoot, 'registry', 'provenance.json');

  const upstreams = JSON.parse(await fs.readFile(upstreamsPath, 'utf-8'));
  const capabilities = JSON.parse(await fs.readFile(capabilitiesPath, 'utf-8'));
  const approved = JSON.parse(await fs.readFile(approvedPath, 'utf-8'));
  const provenance = JSON.parse(await fs.readFile(provenancePath, 'utf-8'));

  return {
    tracked_upstreams_count: upstreams.repositories.length,
    repositories: upstreams.repositories.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      observed_commit: (r.observed_commit as string).slice(0, 10),
      approved_commit: r.approved_commit ? (r.approved_commit as string).slice(0, 10) : 'UNSET (Candidate)',
      license: r.license,
      skills_count: r.skills_count,
      decision: r.magnifito_decision
    })),
    canonical_skills: capabilities.canonical_skills,
    adapters: capabilities.adapters,
    approved_baselines: approved.approved_baselines,
    provenance_records_count: provenance.entries.length
  };
}
