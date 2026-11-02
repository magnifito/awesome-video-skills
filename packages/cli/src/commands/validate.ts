import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  RenderResult,
  RenderRequest,
  ClaimsRegister,
  ProjectBrief
} from '../../../contracts/src/index.js';
import { inspectMedia } from '../../../media/src/inspector.js';

export interface ValidationItem {
  check: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  details: string;
}

export interface ValidationReport {
  run_id: string;
  passed: boolean;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  items: ValidationItem[];
  unresolved_review_items: string[];
}

export async function runValidate(runPathOrId: string, projectDir?: string): Promise<ValidationReport> {
  let runDir = runPathOrId;
  if (!path.isAbsolute(runDir) && projectDir) {
    runDir = path.join(projectDir, 'runs', runPathOrId);
  }

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
      check: `File integrity: ${path.basename(file.path)}`,
      passed: fileExists && hashMatches,
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
      check: 'Export Dimensions',
      passed: dimMatch,
      expected: `${renderRequest.settings.width}x${renderRequest.settings.height}`,
      actual: `${probe.width}x${probe.height}`,
      details: dimMatch ? 'Dimensions match render request settings exactly.' : 'Dimensions mismatch.'
    });
    if (!dimMatch) unresolvedReviewItems.push('Video dimensions do not match requested settings.');

    // FPS check
    const fpsMatch = Math.abs(probe.fps - renderRequest.settings.fps) < 1.0;
    items.push({
      check: 'Frame Rate (FPS)',
      passed: fpsMatch,
      expected: renderRequest.settings.fps,
      actual: probe.fps,
      details: fpsMatch ? 'Frame rate conforms to target standard.' : 'Frame rate deviation detected.'
    });
    if (!fpsMatch) unresolvedReviewItems.push('Frame rate deviated from requested framerate.');

    // Audio stream check
    items.push({
      check: 'Audio Stream Presence',
      passed: probe.has_audio,
      expected: true,
      actual: probe.has_audio,
      details: probe.has_audio ? 'Audio stream verified with valid codec.' : 'No audio stream detected.'
    });
    if (!probe.has_audio) unresolvedReviewItems.push('Missing audio track in delivery file.');
  }

  // 3. Factual Claims Check against claims register
  const projDir = projectDir || path.resolve(runDir, '..', '..');
  try {
    const claimsPath = path.join(projDir, 'claims.json');
    const claimsData: ClaimsRegister = JSON.parse(await fs.readFile(claimsPath, 'utf-8'));
    const scenePlanPath = path.join(projDir, 'scene-plan.json');
    const scenePlanData = JSON.parse(await fs.readFile(scenePlanPath, 'utf-8'));

    // Verify all referenced claim wording is preserved exactly
    let claimsIntact = true;
    for (const sc of scenePlanData.scenes) {
      for (const ref of sc.claims_refs) {
        const matchingClaim = claimsData.claims.find(c => c.claim_id === ref);
        if (matchingClaim && !sc.copy_text.includes(matchingClaim.approved_wording)) {
          claimsIntact = false;
          unresolvedReviewItems.push(
            `Factual claim '${ref}' copy mismatch in scene '${sc.scene_id}'. Expected: "${matchingClaim.approved_wording}", Found: "${sc.copy_text}"`
          );
        }
      }
    }

    items.push({
      check: 'Factual Claims Integrity',
      passed: claimsIntact,
      details: claimsIntact
        ? 'All scene copy preserves approved claims wording without unapproved modification.'
        : 'Discrepancy found between approved claims wording and scene copy.'
    });
  } catch (err) {
    items.push({
      check: 'Claims Register Audit',
      passed: false,
      details: `Could not verify claims register: ${(err as Error).message}`
    });
  }

  const passedChecks = items.filter(i => i.passed).length;
  const failedChecks = items.filter(i => !i.passed).length;
  const passed = failedChecks === 0;

  const report: ValidationReport = {
    run_id: renderResult.run_id,
    passed,
    total_checks: items.length,
    passed_checks: passedChecks,
    failed_checks: failedChecks,
    items,
    unresolved_review_items: unresolvedReviewItems
  };

  await fs.writeFile(path.join(runDir, 'validation-report.json'), JSON.stringify(report, null, 2), 'utf-8');
  return report;
}
