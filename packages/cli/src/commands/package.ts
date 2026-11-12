import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  RenderResult,
  RenderRequest,
  ReviewRecord,
  ProjectBrief,
  ClaimsRegister,
  AssetManifest
} from '../../../contracts/src/index.js';
import { ReviewRecordSchema } from '../../../contracts/src/index.js';
import { resolveRunDir, resolveProjectDir, sha256String, signContent } from './_shared.js';
import { runValidate } from './validate.js';
import { CostTracker, CostBreakdown } from '../../../media/src/cost.js';
import { SubtitleGenerator } from '../../../media/src/subtitles.js';
import { DeliverableArchiver } from '../../../media/src/archiver.js';

export interface PackageOutput {
  delivery_dir: string;
  package_hash: string;
  files: string[];
  review_record: ReviewRecord;
  cost_breakdown: CostBreakdown;
  /** True when SHA256SUMS.sig was written (MGVIDEO_SIGNING_KEY set). */
  signed: boolean;
}

export interface PackageOptions {
  /** Path to the human-written review record. Defaults to <project>/review-record.json. */
  reviewRecordPath?: string;
}

/**
 * Assembles a client delivery for a validated run.
 *
 * Packaging never creates an approval. It requires an existing human review record whose
 * decision is "approved", whose final_cut_hash matches the rendered master, whose claims
 * revision matches the current claims register, and whose export checks are all true.
 * The project contracts must also be byte-identical to the inputs the run was rendered from.
 */
export async function runPackage(
  runPathOrId: string,
  projectDir?: string,
  options: PackageOptions = {}
): Promise<PackageOutput> {
  const runDir = resolveRunDir(runPathOrId, projectDir);
  const projDir = resolveProjectDir(runDir, projectDir);

  // 1. Run validation first
  const validation = await runValidate(runDir, projDir);
  if (!validation.passed) {
    throw new Error(
      `Cannot package delivery: run validation failed with ${validation.counts.P0 + validation.counts.P1} blocking issue(s) (P0/P1): ${validation.unresolved_review_items.join('; ')}`
    );
  }

  const renderResult: RenderResult = JSON.parse(await fs.readFile(path.join(runDir, 'render-result.json'), 'utf-8'));
  const renderRequest: RenderRequest = JSON.parse(await fs.readFile(path.join(runDir, 'render-request.json'), 'utf-8'));
  const primaryOutput = renderResult.output_files[0];
  if (!primaryOutput) throw new Error('Cannot package delivery: run has no output files.');

  const briefPath = path.join(projDir, 'brief.json');
  const brandPath = path.join(projDir, 'brand.json');
  const claimsPath = path.join(projDir, 'claims.json');
  const assetsPath = path.join(projDir, 'assets.json');
  const scenePlanPath = path.join(projDir, 'scene-plan.json');

  const briefStr = await fs.readFile(briefPath, 'utf-8');
  const brandStr = await fs.readFile(brandPath, 'utf-8');
  const claimsStr = await fs.readFile(claimsPath, 'utf-8');
  const assetsStr = await fs.readFile(assetsPath, 'utf-8');
  const scenesStr = await fs.readFile(scenePlanPath, 'utf-8');

  // 2. The delivered contracts must be exactly the ones the video was rendered from.
  const currentHashes: Record<string, string> = {
    brief_hash: sha256String(briefStr),
    brand_hash: sha256String(brandStr),
    claims_hash: sha256String(claimsStr),
    assets_hash: sha256String(assetsStr),
    scenes_hash: sha256String(scenesStr)
  };
  const mismatched = Object.entries(currentHashes)
    .filter(([k, v]) => (renderRequest.input_hashes as Record<string, string | undefined>)[k] !== v)
    .map(([k]) => k.replace(/_hash$/, ''));
  if (mismatched.length > 0) {
    throw new Error(
      `Cannot package delivery: project inputs changed after rendering (${mismatched.join(', ')}). Re-render before packaging.`
    );
  }

  const brief: ProjectBrief = JSON.parse(briefStr);
  const claims: ClaimsRegister = JSON.parse(claimsStr);
  const assets: AssetManifest = JSON.parse(assetsStr);

  // 3. Require an existing human approval bound to this exact cut.
  const reviewPath = options.reviewRecordPath
    ? path.resolve(process.cwd(), options.reviewRecordPath)
    : path.join(projDir, 'review-record.json');
  let reviewRaw: unknown;
  try {
    reviewRaw = JSON.parse(await fs.readFile(reviewPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Cannot package delivery: no readable human review record at ${reviewPath} (${(err as Error).message}). ` +
        'A reviewer must write and approve review-record.json for this run first.'
    );
  }
  const parsedReview = ReviewRecordSchema.safeParse(reviewRaw);
  if (!parsedReview.success) {
    throw new Error(`Cannot package delivery: invalid review record: ${parsedReview.error.message}`);
  }
  const reviewRecord: ReviewRecord = parsedReview.data;
  const reviewProblems: string[] = [];
  if (reviewRecord.decision !== 'approved') {
    reviewProblems.push(`decision is "${reviewRecord.decision}"`);
  }
  if (reviewRecord.approval_scope.final_cut_hash !== primaryOutput.hash) {
    reviewProblems.push(
      `final_cut_hash ${reviewRecord.approval_scope.final_cut_hash} does not match rendered output ${primaryOutput.hash}`
    );
  }
  if (reviewRecord.approval_scope.copy_claims_revision !== claims.revision) {
    reviewProblems.push(
      `approved claims revision ${reviewRecord.approval_scope.copy_claims_revision} does not match current revision ${claims.revision}`
    );
  }
  const falseChecks = Object.entries(reviewRecord.export_checks).filter(([, v]) => v !== true).map(([k]) => k);
  if (falseChecks.length > 0) {
    reviewProblems.push(`export checks not confirmed: ${falseChecks.join(', ')}`);
  }
  if (reviewProblems.length > 0) {
    throw new Error(`Cannot package delivery: review record does not approve this cut: ${reviewProblems.join('; ')}`);
  }

  const deliveryDir = path.join(projDir, 'delivery', renderResult.run_id);
  await fs.mkdir(deliveryDir, { recursive: true });

  const deliveredFiles: string[] = [];

  // Copy primary video file
  const videoDest = path.join(deliveryDir, `${brief.project_id}_${brief.language}_final.${primaryOutput.format}`);
  await fs.copyFile(primaryOutput.path, videoDest);
  deliveredFiles.push(path.basename(videoDest));

  // Copy the exact rendered contracts for client provenance (hash-checked above)
  await fs.writeFile(path.join(deliveryDir, 'brief.json'), briefStr, 'utf-8');
  await fs.writeFile(path.join(deliveryDir, 'brand.json'), brandStr, 'utf-8');
  await fs.writeFile(path.join(deliveryDir, 'claims.json'), claimsStr, 'utf-8');
  deliveredFiles.push('brief.json', 'brand.json', 'claims.json');

  // Export subtitles (.srt and .vtt)
  try {
    const scenePlanData = JSON.parse(scenesStr);
    const cues = SubtitleGenerator.cuesFromScenePlan(scenePlanData);
    const subBaseName = `${brief.project_id}_${brief.language}_captions`;
    const { srtPath, vttPath } = await SubtitleGenerator.exportSubtitles(deliveryDir, subBaseName, cues);
    deliveredFiles.push(path.basename(srtPath), path.basename(vttPath));
  } catch (err) {
    throw new Error(`Cannot package delivery: subtitle export failed: ${(err as Error).message}`);
  }

  // Build notices and attribution
  const notices = [
    `Magnifito Video Production Delivery - ${brief.project_id}`,
    `Client: ${brief.client_id}`,
    `Produced: ${new Date().toISOString()}`,
    `Toolkit: Magnifito Super Video v${renderRequest.toolkit_version} (Baseline ${renderRequest.approved_source_lock})`,
    '',
    'Asset Provenance & Rights:',
    ...assets.assets.map(a => ` - ${a.asset_id}: Status [${a.status}], Source: [${a.source}], Evidence: [${a.rights_evidence}]`),
    '',
    'Factual Claims Registry:',
    ...claims.claims.map(c => ` - [${c.claim_id}] "${c.approved_wording}" (Owner: ${c.owner}, Evidence: ${c.evidence_source})`),
    '',
    'Attribution Notice: Produced by Magnifito Media Production Engine.'
  ].join('\n');

  await fs.writeFile(path.join(deliveryDir, 'NOTICES.txt'), notices, 'utf-8');
  deliveredFiles.push('NOTICES.txt');

  // Calculate production costs
  const costBreakdown = CostTracker.calculateRunCost(brief, renderResult, false);
  await fs.writeFile(path.join(deliveryDir, 'cost-report.json'), JSON.stringify(costBreakdown, null, 2), 'utf-8');
  deliveredFiles.push('cost-report.json');

  // Automated validation evidence, kept separate from the human approval
  await fs.writeFile(path.join(deliveryDir, 'validation-report.json'), JSON.stringify(validation, null, 2), 'utf-8');
  deliveredFiles.push('validation-report.json');

  // Human review record, copied verbatim
  await fs.writeFile(path.join(deliveryDir, 'review-record.json'), JSON.stringify(reviewRecord, null, 2), 'utf-8');
  deliveredFiles.push('review-record.json');

  // Compute overall package hash
  const packageManifest = {
    project_id: brief.project_id,
    run_id: renderResult.run_id,
    request_hash: renderRequest.request_hash,
    input_hashes: renderRequest.input_hashes,
    files: deliveredFiles,
    review_record: reviewRecord,
    cost_breakdown: costBreakdown
  };
  const packageHash = crypto.createHash('sha256').update(JSON.stringify(packageManifest)).digest('hex');

  await fs.writeFile(path.join(deliveryDir, 'delivery-manifest.json'), JSON.stringify({
    ...packageManifest,
    package_hash: packageHash
  }, null, 2), 'utf-8');
  deliveredFiles.push('delivery-manifest.json');

  // Remove a stale signature from a previous packaging of this run before regenerating checksums
  await fs.rm(path.join(deliveryDir, 'SHA256SUMS.sig'), { force: true });

  // Checksums manifest for all deliverables
  DeliverableArchiver.generateChecksumManifest(deliveryDir);
  deliveredFiles.push('SHA256SUMS.txt');

  // Detached HMAC signature over the checksum manifest, when a signing key is configured
  const signature = signContent(await fs.readFile(path.join(deliveryDir, 'SHA256SUMS.txt')));
  if (signature) {
    await fs.writeFile(path.join(deliveryDir, 'SHA256SUMS.sig'), signature + '\n', 'utf-8');
    deliveredFiles.push('SHA256SUMS.sig');
  }

  return {
    delivery_dir: deliveryDir,
    package_hash: packageHash,
    files: deliveredFiles,
    review_record: reviewRecord,
    cost_breakdown: costBreakdown,
    signed: signature !== null
  };
}
