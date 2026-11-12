import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  RenderResult,
  RenderRequest,
  ClaimsRegister
} from '../../../contracts/src/index.js';
import { inspectMedia } from '../../../media/src/inspector.js';
import { LayoutAuditor } from '../../../media/src/layout.js';
import { resolveRunDir, resolveProjectDir, sha256String, findLatestRunDir } from './_shared.js';

/**
 * How bad a failed check is. P0 breaks the delivery (wrong file, wrong facts), P1 must be fixed
 * before delivery, P2 should be fixed, P3 is a note. A report passes when no P0 or P1 check fails.
 */
export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

export const SEVERITIES: readonly Severity[] = ['P0', 'P1', 'P2', 'P3'];

/** Severities that fail a report (and make `mgvideo validate` exit 1). */
export const BLOCKING: readonly Severity[] = ['P0', 'P1'];

export interface ValidationItem {
  /** Stable machine id of the rule, e.g. `file-integrity`. */
  rule: string;
  /** Human label of the check. */
  check: string;
  passed: boolean;
  /** Severity the rule carries when it fails. */
  severity: Severity;
  expected?: unknown;
  actual?: unknown;
  details: string;
  /** Seconds into the video where the problem is, when the rule can say. */
  at_s?: number;
  /** What to do about a failure. */
  fix?: string;
}

/** One failed check, as listed in `issues`. */
export interface ValidationIssue {
  rule: string;
  severity: Severity;
  at_s?: number;
  says: string;
  fix?: string;
}

export interface ValidationReport {
  run_id: string;
  passed: boolean;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  /** Failed checks, most severe first, then by time. */
  issues: ValidationIssue[];
  /** Failure count per severity. */
  counts: Record<Severity, number>;
  items: ValidationItem[];
  unresolved_review_items: string[];
}

/** Ranks failed items into issues: severity first, then time (untimed issues first), then rule. */
export function rankIssues(items: ValidationItem[]): ValidationIssue[] {
  return items
    .filter(i => !i.passed)
    .map(i => ({ rule: i.rule, severity: i.severity, ...(i.at_s !== undefined ? { at_s: i.at_s } : {}), says: i.details, ...(i.fix ? { fix: i.fix } : {}) }))
    .sort((a, b) =>
      SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
      (a.at_s ?? -1) - (b.at_s ?? -1) ||
      a.rule.localeCompare(b.rule));
}

/** Builds the report totals from the items: passes when no blocking (P0/P1) check failed. */
export function summarize(runId: string, items: ValidationItem[], unresolved: string[]): ValidationReport {
  const issues = rankIssues(items);
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 } as Record<Severity, number>;
  for (const i of issues) counts[i.severity]++;
  return {
    run_id: runId,
    passed: issues.every(i => !BLOCKING.includes(i.severity)),
    total_checks: items.length,
    passed_checks: items.length - issues.length,
    failed_checks: issues.length,
    issues,
    counts,
    items,
    unresolved_review_items: unresolved
  };
}

/** Run reference that selects the newest run of the project (the -p directory, else cwd). */
export const LATEST_RUN = 'latest';

export async function runValidate(runPathOrId: string = LATEST_RUN, projectDir?: string): Promise<ValidationReport> {
  const runDir = runPathOrId === LATEST_RUN
    ? findLatestRunDir(projectDir ?? process.cwd())
    : resolveRunDir(runPathOrId, projectDir);

  const resultPath = path.join(runDir, 'render-result.json');
  const requestPath = path.join(runDir, 'render-request.json');

  const renderResult: RenderResult = JSON.parse(await fs.readFile(resultPath, 'utf-8'));
  const renderRequest: RenderRequest = JSON.parse(await fs.readFile(requestPath, 'utf-8'));

  const items: ValidationItem[] = [];
  const unresolvedReviewItems: string[] = [];

  // 1. Output files presence and hashes
  for (const file of renderResult.output_files) {
    let fileExists = false;
    let actualHash = '';
    try {
      const buffer = await fs.readFile(file.path);
      fileExists = true;
      actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
    } catch {}

    const hashMatches = actualHash === file.hash;
    items.push({
      rule: 'file-integrity',
      severity: 'P0',
      check: `File integrity: ${path.basename(file.path)}`,
      passed: fileExists && hashMatches,
      fix: 'Re-render the run; never edit or replace an output file after rendering.',
      expected: file.hash,
      actual: actualHash,
      details: fileExists
        ? (hashMatches ? 'File exists and SHA-256 matches render manifest.' : 'File exists but hash mismatch.')
        : 'File missing from expected output path.'
    });

    if (!fileExists || !hashMatches) {
      unresolvedReviewItems.push(`Output file integrity failure: ${file.path}`);
    }
  }

  // 2. ffprobe export specifications verification
  const primaryFile = renderResult.output_files[0];
  if (primaryFile) {
    const probe = await inspectMedia(primaryFile.path);

    // Dimensions check
    const dimMatch = probe.width === renderRequest.settings.width && probe.height === renderRequest.settings.height;
    items.push({
      rule: 'dimensions',
      severity: 'P0',
      check: 'Export Dimensions',
      passed: dimMatch,
      fix: 'Re-render with the requested --format; check the adapter writes the requested size.',
      expected: `${renderRequest.settings.width}x${renderRequest.settings.height}`,
      actual: `${probe.width}x${probe.height}`,
      details: dimMatch ? 'Dimensions match render request settings exactly.' : 'Dimensions mismatch.'
    });
    if (!dimMatch) unresolvedReviewItems.push('Video dimensions do not match requested settings.');

    // FPS check
    const fpsMatch = Math.abs(probe.fps - renderRequest.settings.fps) < 1.0;
    items.push({
      rule: 'fps',
      severity: 'P1',
      check: 'Frame Rate (FPS)',
      passed: fpsMatch,
      fix: 'Re-render at the requested fps, or conform with `mgvideo framerate`.',
      expected: renderRequest.settings.fps,
      actual: probe.fps,
      details: fpsMatch ? 'Frame rate conforms to target standard.' : 'Frame rate deviation detected.'
    });
    if (!fpsMatch) unresolvedReviewItems.push('Frame rate deviated from requested framerate.');

    // Audio stream check
    items.push({
      rule: 'audio-present',
      severity: 'P1',
      check: 'Audio Stream Presence',
      passed: probe.has_audio,
      fix: 'Add the mix (narration, music or a silent bed) and re-render.',
      expected: true,
      actual: probe.has_audio,
      details: probe.has_audio ? 'Audio stream verified with valid codec.' : 'No audio stream detected.'
    });
    if (!probe.has_audio) unresolvedReviewItems.push('Missing audio track in delivery file.');

    // 2b. Safe Zone Layout Audit for Mobile Formats (9:16)
    if (renderRequest.settings.width === 1080 && renderRequest.settings.height === 1920) {
      const cardWidth = Math.round(1080 * 0.78);
      const cardHeight = Math.round(1920 * 0.42);
      const cardX = Math.round(1080 * 0.08);
      const cardY = Math.round((1920 - cardHeight) / 2);
      const cardRect = { x: cardX, y: cardY, width: cardWidth, height: cardHeight };
      const safeViolations = LayoutAuditor.checkElementInSafeZone('card_bounds', cardRect, 1080, 1920, '9:16');
      items.push({
        rule: 'safe-zone-template',
        severity: 'P1',
        check: 'Mobile Safe Zones (9:16)',
        passed: safeViolations.length === 0,
        fix: 'Move text and key graphics out of the platform UI zones.',
        details: safeViolations.length === 0
          ? 'Layout strictly conforms to mobile safe zone margins (TikTok/Reels).'
          : `Safe margin encroachment: ${safeViolations.map(v => v.reason).join(', ')}`
      });
      if (safeViolations.length > 0) {
        unresolvedReviewItems.push('Layout encroaches mobile safe zone margins.');
      }
    }
  }

  // 3. Factual Claims Check against claims register
  const projDir = resolveProjectDir(runDir, projectDir);
  try {
    const claimsStr = await fs.readFile(path.join(projDir, 'claims.json'), 'utf-8');
    const scenesStr = await fs.readFile(path.join(projDir, 'scene-plan.json'), 'utf-8');

    // The plan and claims being checked must be the exact ones the run was rendered from.
    const scenesMatch = sha256String(scenesStr) === renderRequest.input_hashes.scenes_hash;
    const claimsMatch = sha256String(claimsStr) === renderRequest.input_hashes.claims_hash;
    items.push({
      rule: 'inputs-unchanged',
      severity: 'P0',
      check: 'Rendered Inputs Unchanged',
      passed: scenesMatch && claimsMatch,
      fix: 'Re-render from the current scene-plan.json and claims.json, then validate the new run.',
      details: scenesMatch && claimsMatch
        ? 'scene-plan.json and claims.json match the hashes recorded in render-request.json.'
        : `Inputs changed since render: ${[!scenesMatch && 'scene-plan.json', !claimsMatch && 'claims.json'].filter(Boolean).join(', ')}. Re-render before delivery.`
    });
    if (!scenesMatch) unresolvedReviewItems.push('scene-plan.json changed after rendering; validation does not describe the rendered video.');
    if (!claimsMatch) unresolvedReviewItems.push('claims.json changed after rendering.');

    const claimsData: ClaimsRegister = JSON.parse(claimsStr);
    const scenePlanData = JSON.parse(scenesStr);

    // Every referenced claim must exist, and its approved wording must be preserved exactly
    let claimsIntact = true;
    for (const sc of scenePlanData.scenes) {
      for (const ref of sc.claims_refs ?? []) {
        const matchingClaim = claimsData.claims.find(c => c.claim_id === ref);
        if (!matchingClaim) {
          claimsIntact = false;
          unresolvedReviewItems.push(`Scene '${sc.scene_id}' references unknown claim '${ref}' (not in claims register).`);
        } else if (!sc.copy_text.includes(matchingClaim.approved_wording)) {
          claimsIntact = false;
          unresolvedReviewItems.push(
            `Factual claim '${ref}' copy mismatch in scene '${sc.scene_id}'. Expected: "${matchingClaim.approved_wording}", Found: "${sc.copy_text}"`
          );
        }
      }
    }

    items.push({
      rule: 'claims-integrity',
      severity: 'P0',
      check: 'Factual Claims Integrity',
      passed: claimsIntact,
      fix: 'Use the approved wording from claims.json in the scene copy, or approve the new wording first.',
      details: claimsIntact
        ? 'All scene copy preserves approved claims wording without unapproved modification.'
        : 'Discrepancy found between approved claims wording and scene copy.'
    });
  } catch (err) {
    items.push({
      rule: 'claims-register',
      severity: 'P0',
      check: 'Claims Register Audit',
      passed: false,
      fix: 'Restore claims.json and scene-plan.json in the project directory.',
      details: `Could not verify claims register: ${(err as Error).message}`
    });
    unresolvedReviewItems.push(`Claims register audit failed: ${(err as Error).message}`);
  }

  const report = summarize(renderResult.run_id, items, unresolvedReviewItems);

  await fs.writeFile(path.join(runDir, 'validation-report.json'), JSON.stringify(report, null, 2), 'utf-8');
  return report;
}


/** Human-readable report, as printed by `mgvideo validate`. */
export function formatValidationReport(report: ValidationReport): string {
  const counted = SEVERITIES.filter(s => report.counts[s] > 0).map(s => `${report.counts[s]} ${s}`).join(', ');
  const lines = [
    `🔎 Validation Report for Run: ${report.run_id}`,
    `Overall Result: ${report.passed ? 'PASSED ✅' : 'FAILED ❌'} (${report.passed_checks}/${report.total_checks} checks passed${counted ? `; ${counted}` : ''})`,
    ''
  ];
  for (const is of report.issues) {
    const at = is.at_s !== undefined ? ` at ${is.at_s.toFixed(2)} s` : '';
    lines.push(` ${is.severity} ${is.rule}${at}: ${is.says}`);
    if (is.fix) lines.push(`    fix: ${is.fix}`);
  }
  if (report.issues.length > 0) lines.push('');
  for (const it of report.items.filter(i => i.passed)) {
    lines.push(` ok ${it.rule.padEnd(20)} ${it.check}: ${it.details}`);
  }
  if (report.unresolved_review_items.length > 0) {
    lines.push('', 'Unresolved Review Items:');
    for (const un of report.unresolved_review_items) {
      lines.push(` • ⚠️ ${un}`);
    }
  }
  return lines.join('\n');
}
