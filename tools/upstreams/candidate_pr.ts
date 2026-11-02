import path from 'node:path';
import fs from 'node:fs/promises';
import { runUpstreamPropose } from '../../packages/cli/src/commands/upstream.js';
import { classifyFileChange, ClassifiedFileChange } from './diff_classifier.js';

export interface CandidatePrPayload {
  title: string;
  source_id: string;
  head_branch: string;
  base_branch: string;
  body_markdown: string;
}

export class CandidatePrGenerator {
  static async generatePrPayload(
    workspaceRoot: string,
    sourceId: string,
    changedFiles: Array<{ path: string; changeType: 'added' | 'modified' | 'deleted' | 'renamed' }>
  ): Promise<CandidatePrPayload> {
    const proposal = await runUpstreamPropose(workspaceRoot, sourceId);

    const classifications: ClassifiedFileChange[] = changedFiles.map(f =>
      classifyFileChange(f.path, f.changeType)
    );

    const hasDependencyChanges = classifications.some(c => c.category === 'Dependency or runtime');
    const hasLicenseChanges = classifications.some(c => c.category === 'License or notice');

    const body = [
      `## Upstream Candidate Review: \`${sourceId}\``,
      '',
      `**Candidate Commit SHA**: \`${proposal.frozen_commit}\``,
      `**Target Candidate Branch**: \`${proposal.candidate_branch}\``,
      `**Affected Canonical Skills**: ${proposal.affected_skills.map(s => `\`${s}\``).join(', ')}`,
      '',
      '### Security & Execution Boundary',
      '> [!IMPORTANT]',
      '> Untrusted candidate code MUST NOT execute with elevated permissions or access client secrets.',
      `> Policy: ${proposal.execution_policy}`,
      '',
      '### Classified Source Changes',
      '| File Path | Change Category | Required Evidence | Default Disposition |',
      '| :--- | :--- | :--- | :--- |',
      ...classifications.map(
        c => `| \`${c.path}\` | **${c.category}** | ${c.required_evidence} | ${c.default_disposition} |`
      ),
      '',
      '### Qualification Checklist',
      `- [ ] Static inspection of modified prompt/instruction files completed`,
      `- [ ] ${hasLicenseChanges ? '⚠️ **License terms re-classified and approved by maintainer**' : 'No license changes detected'}`,
      `- [ ] ${hasDependencyChanges ? '⚠️ **Sandbox rebuild verified in isolated disposable container**' : 'No runtime manifest changes'}`,
      `- [ ] Synthetic fixture renders match reference baselines without drift`,
      '',
      '### Rollback Instructions',
      'If regression is detected after qualification:',
      '```bash',
      `mgvideo upstream rollback ${sourceId}`,
      '```'
    ].join('\n');

    return {
      title: `upstream(${sourceId}): candidate review for ${proposal.frozen_commit.slice(0, 8)}`,
      source_id: sourceId,
      head_branch: proposal.candidate_branch,
      base_branch: 'main',
      body_markdown: body
    };
  }
}

