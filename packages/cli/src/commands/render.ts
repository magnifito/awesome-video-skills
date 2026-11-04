import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ProjectBrief,
  BrandProfile,
  ClaimsRegister,
  AssetManifest,
  ScenePlan,
  RenderRequest,
  RenderResult,
  RenderSettings
} from '../../../contracts/src/index.js';
import {
  ProjectBriefSchema,
  BrandProfileSchema,
  ClaimsRegisterSchema,
  AssetManifestSchema,
  ScenePlanSchema,
  computeCanonicalRenderHash
} from '../../../contracts/src/index.js';
import { HyperFramesAdapter } from '../../../../adapters/hyperframes/index.js';
import { HtmlSeekableAdapter } from '../../../../adapters/html/index.js';
import { MotionAdapter } from '../../../../adapters/motion/index.js';
import { PolicyChecker } from '../../../media/src/policy.js';
import type { VideoRendererAdapter } from '../../../../adapters/interface.js';
import { runPlan } from './plan.js';
import { findWorkspaceRoot, readApprovedLock, sha256File } from './_shared.js';

export const RENDER_FORMATS = ['16:9', '9:16', '1:1'] as const;
export const RENDER_CODECS = ['mp4', 'webm', 'mov_prores'] as const;

/**
 * Explicit adapter registry. Engines without a renderable adapter throw instead of
 * silently falling back to another renderer, so provenance always names the real engine.
 */
function selectAdapter(engine: ProjectBrief['engine']): VideoRendererAdapter {
  switch (engine) {
    case 'hyperframes':
      return new HyperFramesAdapter();
    case 'html':
      return new HtmlSeekableAdapter();
    case 'motion':
      return new MotionAdapter();
    case 'remotion':
      throw new Error(
        "Engine 'remotion' is a profile-only adapter and cannot render. Set brief.engine to 'hyperframes' or 'html'."
      );
    default:
      throw new Error(`Unknown render engine: ${String(engine)}`);
  }
}

/**
 * Reads the approved upstream source lock for the engine from registry/approved.lock.json:
 * the vendored Barty-Bart motion-graphics baseline for `motion`, HyperFrames otherwise.
 */
function readApprovedSourceLock(engine: ProjectBrief['engine']): string {
  const baseline = engine === 'motion' ? 'barty-motion-graphics' : 'hyperframes';
  const lock = readApprovedLock(findWorkspaceRoot());
  const commit = lock.approved_baselines[baseline]?.approved_commit;
  if (!commit) {
    throw new Error(`No approved ${baseline} baseline in registry/approved.lock.json; cannot stamp render provenance.`);
  }
  return commit;
}

export interface RenderCliOptions {
  format?: '16:9' | '9:16' | '1:1';
  codec?: 'mp4' | 'webm' | 'mov_prores';
  transparent?: boolean;
  force?: boolean;
}

export async function runRender(projectDir: string, options?: RenderCliOptions): Promise<RenderResult> {

  const briefPath = path.join(projectDir, 'brief.json');
  const brandPath = path.join(projectDir, 'brand.json');
  const claimsPath = path.join(projectDir, 'claims.json');
  const assetsPath = path.join(projectDir, 'assets.json');
  let scenePlanPath = path.join(projectDir, 'scene-plan.json');

  try {
    await fs.access(scenePlanPath);
  } catch {
    await runPlan(projectDir);
  }

  const briefStr = await fs.readFile(briefPath, 'utf-8');
  const brandStr = await fs.readFile(brandPath, 'utf-8');
  const claimsStr = await fs.readFile(claimsPath, 'utf-8');
  const assetsStr = await fs.readFile(assetsPath, 'utf-8');
  const scenesStr = await fs.readFile(scenePlanPath, 'utf-8');

  const brief: ProjectBrief = ProjectBriefSchema.parse(JSON.parse(briefStr));
  const brand: BrandProfile = BrandProfileSchema.parse(JSON.parse(brandStr));
  const claims: ClaimsRegister = ClaimsRegisterSchema.parse(JSON.parse(claimsStr));
  const assets: AssetManifest = AssetManifestSchema.parse(JSON.parse(assetsStr));
  const scenePlan: ScenePlan = ScenePlanSchema.parse(JSON.parse(scenesStr));

  // Policy Checks: Assets & Claims
  const assetViolations = PolicyChecker.checkAssets(assets, brief.client_id);
  if (assetViolations.length > 0) {
    throw new Error(`Asset policy violations: ${assetViolations.map(v => v.message).join('; ')}`);
  }
  const referencedClaims = [...new Set(scenePlan.scenes.flatMap(sc => sc.claims_refs ?? []))];
  const claimViolations = PolicyChecker.checkClaims(referencedClaims, claims, brief.language);
  // Approved wording must appear verbatim in every scene that references a claim.
  for (const sc of scenePlan.scenes) {
    for (const ref of sc.claims_refs ?? []) {
      const claim = claims.claims.find(c => c.claim_id === ref);
      if (claim && !sc.copy_text.includes(claim.approved_wording)) {
        claimViolations.push({
          code: 'CLAIM_WORDING_MODIFIED',
          category: 'claims',
          message: `Scene '${sc.scene_id}' does not contain the approved wording of claim '${ref}'`,
          item_id: ref
        });
      }
    }
  }
  if (claimViolations.length > 0) {
    throw new Error(`Claim policy violations: ${claimViolations.map(v => v.message).join('; ')}`);
  }

  // Validate requested format and codec
  const format = options?.format || brief.formats[0];
  if (!(RENDER_FORMATS as readonly string[]).includes(format)) {
    throw new Error(`Unsupported format '${format}'. Allowed: ${RENDER_FORMATS.join(', ')}`);
  }
  if (options?.codec && !(RENDER_CODECS as readonly string[]).includes(options.codec)) {
    throw new Error(`Unsupported codec '${options.codec}'. Allowed: ${RENDER_CODECS.join(', ')}`);
  }

  // Resolve the adapter before doing any work so unsupported engines fail fast
  const adapter = selectAdapter(brief.engine);

  // Determine dimensions
  let width = 1920;
  let height = 1080;
  if (format === '9:16') {
    width = 1080;
    height = 1920;
  } else if (format === '1:1') {
    width = 1080;
    height = 1080;
  }

  const renderSettings: RenderSettings = {
    width,
    height,
    fps: 30,
    format: options?.codec || (options?.transparent ? 'mov_prores' : 'mp4'),
    transparent: Boolean(options?.transparent || options?.codec === 'mov_prores'),
    audio_sample_rate: 48000,
    audio_channels: 2,
    target_loudness_lufs: -16.0,
    true_peak_ceiling_db: -1.0
  };

  const inputHashes = {
    brief_hash: crypto.createHash('sha256').update(briefStr).digest('hex'),
    brand_hash: crypto.createHash('sha256').update(brandStr).digest('hex'),
    claims_hash: crypto.createHash('sha256').update(claimsStr).digest('hex'),
    assets_hash: crypto.createHash('sha256').update(assetsStr).digest('hex'),
    scenes_hash: crypto.createHash('sha256').update(scenesStr).digest('hex')
  };

  const toolkitVersion = '0.1.0';
  const approvedSourceLock = readApprovedSourceLock(brief.engine);
  const requestHash = computeCanonicalRenderHash(
    toolkitVersion,
    approvedSourceLock,
    brief.engine,
    inputHashes,
    renderSettings
  );

  const runsDir = path.join(projectDir, 'runs');
  const cacheDir = path.join(runsDir, 'cache', requestHash);

  // Check cache unless force is requested
  if (!options?.force) {
    try {
      const cachedResultPath = path.join(cacheDir, 'render-result.json');
      const cachedData = JSON.parse(await fs.readFile(cachedResultPath, 'utf-8'));
      // Reuse the cache only when the cached output still exists and matches its recorded hash
      const cachedFile = cachedData.output_files?.[0];
      if (cachedFile?.path && cachedFile.hash && sha256File(cachedFile.path) === cachedFile.hash) {
        return {
          ...cachedData,
          status: 'cached'
        };
      }
    } catch {}
  }

  const runId = `run-${Date.now()}-${requestHash.slice(0, 8)}`;
  const runDir = path.join(runsDir, runId);
  await fs.mkdir(runDir, { recursive: true });

  const renderRequest: RenderRequest = {
    schema_version: '1.0.0',
    toolkit_version: toolkitVersion,
    approved_source_lock: approvedSourceLock,
    adapter: brief.engine,
    input_hashes: inputHashes,
    settings: renderSettings,
    request_hash: requestHash
  };

  await fs.writeFile(path.join(runDir, 'render-request.json'), JSON.stringify(renderRequest, null, 2), 'utf-8');

  const validation = await adapter.validate({
    projectDir,
    brief,
    brand,
    claims,
    assets,
    scenePlan
  });

  if (!validation.valid) {
    throw new Error(`Renderer adapter validation failed: ${validation.errors.join('; ')}`);
  }

  const startTime = new Date().toISOString();
  const renderOutput = await adapter.renderVideo(
    { projectDir, brief, brand, claims, assets, scenePlan },
    { settings: renderSettings, outputDir: runDir, runId, requestHash }
  );
  const completedTime = new Date().toISOString();

  const renderResult: RenderResult = {
    schema_version: '1.0.0',
    run_id: runId,
    request_hash: requestHash,
    status: 'success',
    started_at: startTime,
    completed_at: completedTime,
    output_files: [
      {
        format: renderOutput.format,
        path: renderOutput.outputPath,
        hash: renderOutput.outputHash,
        size_bytes: renderOutput.fileSizeBytes
      }
    ],
    measurements: renderOutput.measurements,
    logs: renderOutput.logs,
    // Pre-render adapter and policy validation; post-render checks are recorded by `mgvideo validate`.
    validation_results: {
      passed: validation.valid,
      failures: validation.errors
    }
  };

  await fs.writeFile(path.join(runDir, 'render-result.json'), JSON.stringify(renderResult, null, 2), 'utf-8');

  // Populate cache
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(path.join(cacheDir, 'render-result.json'), JSON.stringify(renderResult, null, 2), 'utf-8');

  return renderResult;
}

