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
import { PolicyChecker } from '../../../media/src/policy.js';
import { runPlan } from './plan.js';

export async function runRender(projectDir: string, options?: {
  format?: '16:9' | '9:16' | '1:1';
  force?: boolean;
}): Promise<RenderResult> {
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

  // Determine dimensions
  const format = options?.format || brief.formats[0];
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
    format: 'mp4',
    transparent: false,
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
  const approvedSourceLock = '5c5794287bd0dc2c94f238ca89f4752ecaa045a2';
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
      // Verify cached output file actually exists
      if (cachedData.output_files?.[0]?.path) {
        await fs.access(cachedData.output_files[0].path);
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

  // Select adapter
  const adapter = brief.engine === 'html' ? new HtmlSeekableAdapter() : new HyperFramesAdapter();

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
    validation_results: {
      passed: true,
      failures: []
    }
  };

  await fs.writeFile(path.join(runDir, 'render-result.json'), JSON.stringify(renderResult, null, 2), 'utf-8');

  // Populate cache
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(path.join(cacheDir, 'render-result.json'), JSON.stringify(renderResult, null, 2), 'utf-8');

  return renderResult;
}
