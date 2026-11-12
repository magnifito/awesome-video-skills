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
export function selectAdapter(engine: ProjectBrief['engine']): VideoRendererAdapter {
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

export interface ProjectInputs {
  brief: ProjectBrief;
  brand: BrandProfile;
  claims: ClaimsRegister;
  assets: AssetManifest;
  scenePlan: ScenePlan;
  /** File contents as read, for input hashes. */
  raw: { brief: string; brand: string; claims: string; assets: string; scenes: string };
}

/** Reads and parses the five project files. Fails when one is missing or invalid. */
export async function readProjectInputs(projectDir: string): Promise<ProjectInputs> {
  const read = (name: string) => fs.readFile(path.join(projectDir, name), 'utf-8');
  const [brief, brand, claims, assets, scenes] = await Promise.all(
    ['brief.json', 'brand.json', 'claims.json', 'assets.json', 'scene-plan.json'].map(read)
  );
  return {
    brief: ProjectBriefSchema.parse(JSON.parse(brief)),
    brand: BrandProfileSchema.parse(JSON.parse(brand)),
    claims: ClaimsRegisterSchema.parse(JSON.parse(claims)),
    assets: AssetManifestSchema.parse(JSON.parse(assets)),
    scenePlan: ScenePlanSchema.parse(JSON.parse(scenes)),
    raw: { brief, brand, claims, assets, scenes },
  };
}

/** Render settings for a delivery format (16:9 1920x1080, 9:16 1080x1920, 1:1 1080x1080). */
export function renderSettingsFor(format: string, options?: RenderCliOptions): RenderSettings {
  const [width, height] = format === '9:16' ? [1080, 1920] : format === '1:1' ? [1080, 1080] : [1920, 1080];
  return {
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
}

export async function runRender(projectDir: string, options?: RenderCliOptions): Promise<RenderResult> {

  try {
    await fs.access(path.join(projectDir, 'scene-plan.json'));
  } catch {
    await runPlan(projectDir);
  }

  const { brief, brand, claims, assets, scenePlan, raw } = await readProjectInputs(projectDir);

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

  const renderSettings = renderSettingsFor(format, options);

  const inputHashes = {
    brief_hash: crypto.createHash('sha256').update(raw.brief).digest('hex'),
    brand_hash: crypto.createHash('sha256').update(raw.brand).digest('hex'),
    claims_hash: crypto.createHash('sha256').update(raw.claims).digest('hex'),
    assets_hash: crypto.createHash('sha256').update(raw.assets).digest('hex'),
    scenes_hash: crypto.createHash('sha256').update(raw.scenes).digest('hex')
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
    ...(renderOutput.textManifestPath
      ? { text_manifest: { path: renderOutput.textManifestPath, hash: sha256File(renderOutput.textManifestPath) } }
      : {}),
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

