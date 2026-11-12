import { z } from 'zod';
import crypto from 'node:crypto';

/** Accepts any string that parses to a valid date (ISO date or datetime). */
const dateString = (label: string) =>
  z.string().refine(v => !Number.isNaN(new Date(v).getTime()), { message: `${label} must be a valid ISO-8601 date` });

/**
 * 1. Project Brief Contract
 * Essential fields: project_id, client_id, workflow, objective, audience, language, duration, formats, engine, timing_authority, agent/compute/media budgets
 */
export const ProjectBriefSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  project_id: z.string().min(1),
  client_id: z.string().min(1),
  workflow: z.enum([
    'branded-promo',
    'product-demo',
    'talking-head-edit',
    'commerce-variants',
    'multilingual-explainer'
  ]),
  objective: z.string().min(1),
  audience: z.string().min(1),
  language: z.string().min(2).default('en'),
  duration_seconds: z.number().positive(),
  formats: z.array(z.enum(['16:9', '9:16', '1:1'])).min(1),
  engine: z.enum(['hyperframes', 'html', 'remotion', 'motion']).default('hyperframes'),
  timing_authority: z.enum(['speech', 'music', 'template', 'manual']).default('speech'),
  campaign_reference_time: z.string().datetime().optional(),
  budgets: z.object({
    agent_budget_usd: z.number().nonnegative().default(10),
    compute_budget_usd: z.number().nonnegative().default(10),
    media_budget_usd: z.number().nonnegative().default(0), // 0 means zero external paid media calls
    max_retries: z.number().int().nonnegative().default(3)
  })
});

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;

/**
 * 2. Brand Profile Contract
 * Essential fields: logos, colors, font files and rights, type scale, motion preferences, references, prohibited treatments
 */
export const BrandProfileSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  brand_id: z.string().min(1),
  name: z.string().min(1),
  logos: z.object({
    primary: z.string(),
    monochrome: z.string().optional(),
    icon: z.string().optional()
  }),
  colors: z.object({
    primary: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    secondary: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    background: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    text_primary: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    accent: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional()
  }),
  fonts: z.array(z.object({
    family: z.string().min(1),
    weight: z.string().default('400'),
    file_path: z.string().optional(),
    rights_evidence: z.string(), // e.g. "OFL-1.1", "Client-Licensed"
    supports_cyrillic: z.boolean().default(false)
  })).min(1),
  type_scale: z.object({
    h1: z.number().positive(),
    h2: z.number().positive(),
    body: z.number().positive(),
    caption: z.number().positive().optional()
  }),
  motion_preferences: z.object({
    tempo: z.enum(['energetic', 'calm', 'punchy', 'smooth']).default('smooth'),
    camera_style: z.enum(['static', 'subtle_drift', 'dynamic_whip', 'isometric']).default('subtle_drift'),
    border_radius: z.number().nonnegative().default(8),
    glassmorphism: z.boolean().default(false)
  }),
  prohibited_treatments: z.array(z.string()).default([])
});

export type BrandProfile = z.infer<typeof BrandProfileSchema>;

/**
 * 3. Claims Register Contract
 * Essential fields: claim_id, approved wording, evidence source, owner, expiry, locale
 */
export const ClaimItemSchema = z.object({
  claim_id: z.string().min(1),
  approved_wording: z.string().min(1),
  evidence_source: z.string().min(1),
  owner: z.string().min(1),
  expiry: dateString('expiry').optional(),
  locale: z.string().min(2).default('en'),
  tags: z.array(z.string()).optional()
});

export const ClaimsRegisterSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  revision: z.string().min(1).default('rev-1'),
  claims: z.array(ClaimItemSchema)
});

export type ClaimItem = z.infer<typeof ClaimItemSchema>;
export type ClaimsRegister = z.infer<typeof ClaimsRegisterSchema>;

/**
 * 4. Asset Manifest Contract
 * Essential fields: asset_id, content hash, local path, source, rights evidence, consent, permitted, validity, attribution, status
 */
export const AssetManifestItemSchema = z.object({
  asset_id: z.string().min(1),
  content_hash: z.string().min(1),
  local_path: z.string().min(1),
  source: z.string().min(1),
  rights_evidence: z.string().min(1),
  // Fail closed: consent must be stated explicitly for every asset.
  consent_obtained: z.boolean(),
  permitted: z.object({
    client: z.string(),
    channels: z.array(z.string()).default(['all']),
    territories: z.array(z.string()).default(['worldwide'])
  }),
  validity_until: dateString('validity_until').optional(),
  attribution_required: z.boolean().default(false),
  attribution_text: z.string().optional(),
  // Fail closed: an asset without an explicit status is treated as unresolved.
  status: z.enum(['approved', 'restricted', 'expired', 'unresolved']).default('unresolved')
}).superRefine((a, ctx) => {
  if (a.attribution_required && !a.attribution_text) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attribution_text'], message: 'attribution_text is required when attribution_required is true' });
  }
});

export const AssetManifestSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  assets: z.array(AssetManifestItemSchema)
});

export type AssetManifestItem = z.infer<typeof AssetManifestItemSchema>;
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

/**
 * 5. Transcript Contract
 * Essential fields: original word times, speaker, language, confidence, correction version, source audio hash
 */
export const TranscriptWordSchema = z.object({
  word: z.string(),
  start_ms: z.number().nonnegative(),
  end_ms: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).default(1.0),
  speaker: z.string().default('Speaker 1')
}).refine(w => w.end_ms >= w.start_ms, { message: 'end_ms must be >= start_ms', path: ['end_ms'] });

export const TranscriptSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  source_audio_hash: z.string().min(1),
  language: z.string().default('en'),
  correction_version: z.string().default('v1'),
  words: z.array(TranscriptWordSchema)
});

export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

/**
 * 6. Edit Decision List (EDL) Contract
 * Essential fields: original source ranges, output ranges, speed changes, and reasons for cuts
 * Dual timeline preservation: integer microseconds / integer frames
 */
export const CutItemSchema = z.object({
  cut_id: z.string().min(1),
  source_start_us: z.number().int().nonnegative(), // microseconds in source timeline
  source_end_us: z.number().int().nonnegative(),
  output_start_frame: z.number().int().nonnegative(), // half-open [start, end)
  output_end_frame: z.number().int().nonnegative(),
  speed_factor: z.number().positive().default(1.0),
  reason: z.string().default('pacing')
}).superRefine((c, ctx) => {
  if (c.source_end_us <= c.source_start_us) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source_end_us'], message: 'source_end_us must be greater than source_start_us' });
  }
  if (c.output_end_frame <= c.output_start_frame) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['output_end_frame'], message: 'output_end_frame must be greater than output_start_frame' });
  }
});

export const EditDecisionListSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  timing_authority: z.enum(['speech', 'music', 'template', 'manual']).default('speech'),
  source_media_hash: z.string().min(1),
  source_duration_us: z.number().int().positive(),
  output_fps: z.object({
    numerator: z.number().int().positive(),
    denominator: z.number().int().positive()
  }).default({ numerator: 30, denominator: 1 }),
  cuts: z.array(CutItemSchema)
}).superRefine((edl, ctx) => {
  const ids = new Set<string>();
  edl.cuts.forEach((c, i) => {
    if (ids.has(c.cut_id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cuts', i, 'cut_id'], message: `Duplicate cut_id ${c.cut_id}` });
    }
    ids.add(c.cut_id);
    if (c.source_end_us > edl.source_duration_us) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cuts', i, 'source_end_us'], message: 'Cut extends beyond source_duration_us' });
    }
    const prev = edl.cuts[i - 1];
    if (prev && c.output_start_frame < prev.output_end_frame) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cuts', i, 'output_start_frame'], message: 'Output ranges must be ordered and non-overlapping' });
    }
  });
});

export type CutItem = z.infer<typeof CutItemSchema>;
export type EditDecisionList = z.infer<typeof EditDecisionListSchema>;

/**
 * 7. Scene Plan Contract
 * Essential fields: scene_id, factual purpose, duration, copy, asset references, visual recipe, audio events
 */
export const ScenePlanItemSchema = z.object({
  scene_id: z.string().min(1),
  factual_purpose: z.string().min(1),
  duration_frames: z.number().int().positive(),
  duration_seconds: z.number().positive(),
  copy_text: z.string(),
  claims_refs: z.array(z.string()).default([]),
  asset_refs: z.array(z.string()).default([]),
  visual_recipe: z.string().default('kinetic-typography'),
  audio_events: z.array(z.object({
    type: z.enum(['voiceover', 'sfx', 'music_cue']),
    event_name: z.string(),
    start_frame: z.number().int().nonnegative(),
    volume: z.number().min(0).max(1).default(1.0)
  })).default([])
}).superRefine((s, ctx) => {
  // duration_frames / duration_seconds must imply a plausible frame rate (1..240 fps).
  const fps = s.duration_frames / s.duration_seconds;
  if (fps < 1 || fps > 240) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration_frames'], message: `duration_frames and duration_seconds imply ${fps.toFixed(2)} fps` });
  }
  s.audio_events.forEach((e, i) => {
    if (e.start_frame >= s.duration_frames) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['audio_events', i, 'start_frame'], message: 'Audio event starts after scene end' });
    }
  });
});

export const ScenePlanSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  plan_revision: z.string().default('rev-1'),
  renderer: z.enum(['hyperframes', 'html', 'remotion', 'motion']).default('hyperframes'),
  timing_authority: z.enum(['speech', 'music', 'template', 'manual']).default('speech'),
  scenes: z.array(ScenePlanItemSchema).min(1)
}).superRefine((plan, ctx) => {
  const ids = new Set<string>();
  plan.scenes.forEach((s, i) => {
    if (ids.has(s.scene_id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes', i, 'scene_id'], message: `Duplicate scene_id ${s.scene_id}` });
    }
    ids.add(s.scene_id);
  });
  // All scenes must share one frame rate.
  const rates = plan.scenes.map(s => s.duration_frames / s.duration_seconds);
  const r0 = rates[0];
  rates.forEach((r, i) => {
    if (Math.abs(r - r0) > 0.5) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes', i, 'duration_frames'], message: 'Scenes use inconsistent frame rates' });
    }
  });
});

/** Frame rate implied by a scene plan (rounded to nearest integer). */
export function scenePlanFps(plan: ScenePlan): number {
  const s = plan.scenes[0];
  return Math.round(s.duration_frames / s.duration_seconds);
}

/**
 * Cross-contract checks that a single schema cannot express. Returns a list of problems (empty = consistent).
 */
export function checkPlanAgainstBrief(plan: ScenePlan, brief: ProjectBrief, toleranceSeconds = 0.5): string[] {
  const problems: string[] = [];
  const total = plan.scenes.reduce((acc, s) => acc + s.duration_seconds, 0);
  if (Math.abs(total - brief.duration_seconds) > toleranceSeconds) {
    problems.push(`Scene durations sum to ${total.toFixed(2)}s but brief requires ${brief.duration_seconds}s`);
  }
  if (plan.renderer !== brief.engine) {
    problems.push(`Scene plan renderer '${plan.renderer}' does not match brief engine '${brief.engine}'`);
  }
  return problems;
}

export type ScenePlanItem = z.infer<typeof ScenePlanItemSchema>;
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

/**
 * 8. Render Request Contract
 * Essential fields: toolkit version, approved source lock, adapter, dependencies, environment, input hashes, settings, request hash
 */
export const RenderSettingsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive().default(30),
  format: z.enum(['mp4', 'webm', 'mov_prores']).default('mp4'),
  transparent: z.boolean().default(false),
  audio_sample_rate: z.number().int().default(48000),
  audio_channels: z.number().int().default(2),
  target_loudness_lufs: z.number().default(-16),
  true_peak_ceiling_db: z.number().default(-1.0)
}).superRefine((s, ctx) => {
  if (s.transparent && s.format === 'mp4') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transparent'], message: 'mp4 (H.264) cannot carry alpha; use webm or mov_prores for transparent output' });
  }
  if (s.width % 2 !== 0 || s.height % 2 !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: 'width and height must be even for 4:2:0 encoders' });
  }
});

export const RenderRequestSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  toolkit_version: z.string().min(1),
  approved_source_lock: z.string().min(1),
  adapter: z.enum(['hyperframes', 'html', 'remotion', 'motion']).default('hyperframes'),
  input_hashes: z.object({
    brief_hash: z.string(),
    brand_hash: z.string(),
    claims_hash: z.string(),
    assets_hash: z.string(),
    scenes_hash: z.string(),
    edl_hash: z.string().optional()
  }),
  settings: RenderSettingsSchema,
  request_hash: z.string() // Canonical SHA-256 computed exclusively from canonical inputs
});

export type RenderSettings = z.infer<typeof RenderSettingsSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;

/**
 * Helper to compute the canonical render request hash.
 * As strictly specified in Section 7:
 * "Compute the render cache key from canonical render-request inputs only;
 * exclude run_id, operational timestamps, outputs, and review state."
 */
export function computeCanonicalRenderHash(
  toolkitVersion: string,
  approvedSourceLock: string,
  adapter: string,
  inputHashes: RenderRequest['input_hashes'],
  settings: RenderSettings
): string {
  const canonicalPayload = {
    toolkitVersion,
    approvedSourceLock,
    adapter,
    inputHashes: Object.keys(inputHashes).sort().reduce((acc, k) => {
      acc[k] = (inputHashes as Record<string, unknown>)[k];
      return acc;
    }, {} as Record<string, unknown>),
    settings
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
}

/**
 * 9. Render Result Contract
 * Essential fields: run_id, request hash, status, output paths/hashes, measurements, logs, validation results
 */
export const OutputFileSchema = z.object({
  format: z.string(),
  path: z.string(),
  hash: z.string(),
  size_bytes: z.number().int().nonnegative()
});

export const MeasurementsSchema = z.object({
  duration_seconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  has_audio: z.boolean(),
  has_alpha: z.boolean().default(false),
  pixel_format: z.string().optional(),
  video_codec: z.string().optional(),
  audio_codec: z.string().optional(),
  measured_loudness_lufs: z.number().optional(),
  measured_true_peak_db: z.number().optional()
});

export const RenderResultSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  run_id: z.string().min(1),
  request_hash: z.string().min(1),
  status: z.enum(['success', 'failed', 'cached']),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime(),
  output_files: z.array(OutputFileSchema),
  measurements: MeasurementsSchema,
  logs: z.array(z.string()).default([]),
  validation_results: z.object({
    passed: z.boolean(),
    failures: z.array(z.string()).default([])
  })
});

export type OutputFile = z.infer<typeof OutputFileSchema>;
export type Measurements = z.infer<typeof MeasurementsSchema>;
export type RenderResult = z.infer<typeof RenderResultSchema>;

/**
 * 10. Review Record Contract
 * Essential fields: reviewer, timestamp, decision, approval scope, exact approved revision/hash, export checks
 */
export const ReviewRecordSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  reviewer: z.string().min(1),
  // Reviewer roles must be named by the humans who reviewed; never defaulted.
  roles: z.object({
    technical_maintainer: z.string().min(1),
    producer: z.string().min(1),
    account_owner: z.string().min(1)
  }),
  timestamp: z.string().datetime(),
  decision: z.enum(['approved', 'changes_requested', 'rejected']),
  approval_scope: z.object({
    copy_claims_revision: z.string(),
    design_styleframe_revision: z.string(),
    final_cut_hash: z.string()
  }),
  export_checks: z.object({
    factual_accuracy_verified: z.boolean(),
    visual_layout_clean: z.boolean(),
    audio_sync_and_loudness_verified: z.boolean(),
    rights_cleared: z.boolean()
  }),
  cost_summary: z.object({
    total_cost_usd: z.number().nonnegative(),
    within_budget: z.boolean()
  }).optional(),
  notes: z.string().optional()
}).superRefine((r, ctx) => {
  // An approval is only valid when every export check passed.
  if (r.decision === 'approved') {
    for (const [k, v] of Object.entries(r.export_checks)) {
      if (!v) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['export_checks', k], message: `Cannot approve while ${k} is false` });
      }
    }
    if (r.cost_summary && !r.cost_summary.within_budget) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cost_summary', 'within_budget'], message: 'Cannot approve an over-budget run' });
    }
  }
});

export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;

/**
 * 11. Project Lockfile Contract
 */
export const ProjectLockSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  project_id: z.string().min(1),
  created_at: z.string().datetime(),
  toolkit_version: z.string().min(1),
  approved_source_baseline: z.string(),
  pinned_renderer: z.string(),
  input_hashes: z.record(z.string())
});

export type ProjectLock = z.infer<typeof ProjectLockSchema>;

/**
 * 12. Validate Config Contract (optional `<project>/validate.json`)
 * Per-project targets and deliberate overrides for `mgvideo validate`. Every rule override needs a
 * reason, and the report shows it next to the check it changed.
 */
export const ValidateRuleOverrideSchema = z.object({
  severity: z.enum(['P0', 'P1', 'P2', 'P3', 'off']),
  reason: z.string().min(3)
});

export const ValidateConfigSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  /** Integrated loudness target in LUFS; default: the render request's target_loudness_lufs. */
  loudness_lufs: z.number().min(-40).max(-5).optional(),
  /** Allowed distance from the target, in LU. */
  loudness_tolerance_lu: z.number().positive().max(6).default(1),
  /** Highest allowed true peak in dBTP; default: the render request's true_peak_ceiling_db. */
  true_peak_max_db: z.number().max(0).optional(),
  /** Shortest still picture reported, in seconds. */
  freeze_min_s: z.number().positive().default(3),
  /** A still this long (or half the video) is P1 instead of P2, in seconds. */
  freeze_blocking_s: z.number().positive().default(6),
  /** Shortest black span reported, in seconds. */
  black_min_s: z.number().positive().default(0.5),
  /** Per-rule severity changes, keyed by rule id. */
  rules: z.record(ValidateRuleOverrideSchema).default({})
});

export type ValidateConfig = z.infer<typeof ValidateConfigSchema>;

export * from './migrate.js';

export * from './broll.js';
