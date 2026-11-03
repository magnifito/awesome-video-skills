import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ProjectBrief,
  BrandProfile,
  ClaimsRegister,
  AssetManifest,
  ProjectLock
} from '../../../contracts/src/index.js';
import { findWorkspaceRoot, readApprovedLock } from './_shared.js';

export async function runInit(projectDir: string, options: {
  projectId?: string;
  clientId?: string;
  workflow?: ProjectBrief['workflow'];
  language?: string;
  duration?: number;
  /** Overwrite existing project contracts. Without it, init refuses to touch an existing project. */
  force?: boolean;
}): Promise<{ projectDir: string; filesCreated: string[] }> {
  await fs.mkdir(projectDir, { recursive: true });

  const contractFiles = ['brief.json', 'brand.json', 'claims.json', 'assets.json', 'project.lock.json'];
  if (!options.force) {
    const existing: string[] = [];
    for (const f of contractFiles) {
      try {
        await fs.access(path.join(projectDir, f));
        existing.push(f);
      } catch {
        // File does not exist; nothing to protect.
      }
    }
    if (existing.length > 0) {
      throw new Error(
        `Refusing to overwrite existing project files in ${projectDir}: ${existing.join(', ')}. Pass --force to replace them.`
      );
    }
  }

  const projectId = options.projectId || path.basename(projectDir);
  const clientId = options.clientId || 'magnifito-internal';
  const workflow = options.workflow || 'branded-promo';
  const language = options.language || 'bg';
  const duration = options.duration || 15;

  const brief: ProjectBrief = {
    schema_version: '1.0.0',
    project_id: projectId,
    client_id: clientId,
    workflow: workflow,
    objective: 'Launch campaign video highlighting verified service advantages',
    audience: 'Target prospective clients seeking reliable results',
    language: language,
    duration_seconds: duration,
    formats: ['9:16', '16:9'],
    engine: 'hyperframes',
    timing_authority: 'speech',
    campaign_reference_time: '2026-11-02T10:00:00Z',
    budgets: {
      agent_budget_usd: 10.0,
      compute_budget_usd: 5.0,
      media_budget_usd: 0.0,
      max_retries: 3
    }
  };

  const brand: BrandProfile = {
    schema_version: '1.0.0',
    brand_id: clientId,
    name: 'Magnifito Super Video',
    logos: {
      primary: 'assets/logo.svg'
    },
    colors: {
      primary: '#38bdf8',
      background: '#0f172a',
      text_primary: '#f8fafc',
      accent: '#f59e0b'
    },
    fonts: [
      {
        family: '-apple-system, BlinkMacSystemFont, Arial, sans-serif',
        weight: '700',
        rights_evidence: 'System-OFL-Compatible',
        supports_cyrillic: true
      }
    ],
    type_scale: {
      h1: 64,
      h2: 44,
      body: 24,
      caption: 16
    },
    motion_preferences: {
      tempo: 'punchy',
      camera_style: 'subtle_drift',
      border_radius: 12,
      glassmorphism: true
    },
    prohibited_treatments: ['unverified claims', 'neon rainbow transitions']
  };

  const claims: ClaimsRegister = {
    schema_version: '1.0.0',
    revision: 'rev-1',
    claims: [
      {
        claim_id: 'claim-1',
        approved_wording: language === 'bg' ? 'Интензивно практическо обучение' : 'Intensive practical training',
        evidence_source: 'Course Syllabus 2026 v2.1',
        owner: 'Director of Studies',
        locale: language
      },
      {
        claim_id: 'claim-2',
        approved_wording: language === 'bg' ? 'Запишете се за безплатен демо урок' : 'Sign up for a free demo lesson',
        evidence_source: 'Product Offer Register Nov 2026',
        owner: 'Marketing Lead',
        locale: language
      }
    ]
  };

  const assetManifest: AssetManifest = {
    schema_version: '1.0.0',
    assets: [
      {
        asset_id: 'brand-logo',
        content_hash: 'sha256-mock-logo-hash-918237',
        local_path: 'assets/logo.svg',
        source: 'Magnifito Brand Vault',
        rights_evidence: 'Magnifito-Owned-Asset',
        consent_obtained: true,
        permitted: {
          client: clientId,
          channels: ['all'],
          territories: ['worldwide']
        },
        attribution_required: false,
        status: 'approved'
      }
    ]
  };

  const briefContent = JSON.stringify(brief, null, 2);
  const brandContent = JSON.stringify(brand, null, 2);
  const claimsContent = JSON.stringify(claims, null, 2);
  const assetContent = JSON.stringify(assetManifest, null, 2);

  const briefHash = crypto.createHash('sha256').update(briefContent).digest('hex');
  const brandHash = crypto.createHash('sha256').update(brandContent).digest('hex');
  const claimsHash = crypto.createHash('sha256').update(claimsContent).digest('hex');
  const assetsHash = crypto.createHash('sha256').update(assetContent).digest('hex');

  const lock: ProjectLock = {
    schema_version: '1.0.0',
    project_id: projectId,
    created_at: new Date().toISOString(),
    toolkit_version: '0.1.0',
    approved_source_baseline: readApprovedLock(findWorkspaceRoot()).approved_baselines.hyperframes?.approved_commit ?? 'unapproved',
    pinned_renderer: 'hyperframes',
    input_hashes: {
      'brief.json': briefHash,
      'brand.json': brandHash,
      'claims.json': claimsHash,
      'assets.json': assetsHash
    }
  };

  await fs.writeFile(path.join(projectDir, 'brief.json'), briefContent, 'utf-8');
  await fs.writeFile(path.join(projectDir, 'brand.json'), brandContent, 'utf-8');
  await fs.writeFile(path.join(projectDir, 'claims.json'), claimsContent, 'utf-8');
  await fs.writeFile(path.join(projectDir, 'assets.json'), assetContent, 'utf-8');
  await fs.writeFile(path.join(projectDir, 'project.lock.json'), JSON.stringify(lock, null, 2), 'utf-8');

  return {
    projectDir,
    filesCreated: ['brief.json', 'brand.json', 'claims.json', 'assets.json', 'project.lock.json']
  };
}
