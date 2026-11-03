---
title: Magnifito Super Video Contracts Specification
kind: reference
status: reference
updated: 2026-11-03
---
# Magnifito Super Video Contracts Specification

The Magnifito Super Video platform enforces strict schema-first contracts built using [Zod](https://github.com/colinhacks/zod). Every production run requires validated contracts before rendering, preventing corrupt parameters or unauthorized state mutations.

---

## Contract Inventory

| Contract Schema | TypeScript Interface | File Location | Purpose |
|---|---|---|---|
| `ProjectBriefSchema` | `ProjectBrief` | `packages/contracts/src/brief.ts` | High-level project specifications, aspect ratios, locale, and budgets. |
| `BrandProfileSchema` | `BrandProfile` | `packages/contracts/src/brand.ts` | Visual identity, color palette, typography, logos, and voice attributes. |
| `ClaimsRegisterSchema` | `ClaimsRegister` | `packages/contracts/src/claims.ts` | Fact-checking register binding marketing copy to validated evidence. |
| `AssetManifestSchema` | `AssetManifest` | `packages/contracts/src/assets.ts` | Visual, audio, and font files with license records and SHA-256 hashes. |
| `TranscriptSchema` | `Transcript` | `packages/contracts/src/transcript.ts` | Word-level speech timing transcripts for synchronizing animation. |
| `EditDecisionListSchema` | `EditDecisionList` | `packages/contracts/src/edl.ts` | Timeline edit decisions mapping source timestamps to output frames. |
| `ScenePlanSchema` | `ScenePlan` | `packages/contracts/src/scene_plan.ts` | Compiled visual scenes, layer hierarchies, motion, and claim links. |
| `RenderRequestSchema` | `RenderRequest` | `packages/contracts/src/render_request.ts` | Frozen rendering parameters used to generate deterministic outputs. |
| `RenderResultSchema` | `RenderResult` | `packages/contracts/src/render_result.ts` | Measured render outcomes, stream specs, duration, and file hashes. |
| `ReviewRecordSchema` | `ReviewRecord` | `packages/contracts/src/review_record.ts` | Three-role sign-off audit trail (creative, legal, technical). |
| `ProjectLockSchema` | `ProjectLock` | `packages/contracts/src/project_lock.ts` | Cryptographic lockfile pinning input hashes and upstream baselines. |

---

## 1. `ProjectBrief`

Defines deliverables, target aspect ratios, languages, timing authority, and zero-spend budgets.

```typescript
export interface ProjectBrief {
  schema_version: '1.0.0';
  project_id: string;
  client_id: string;
  workflow: 'branded-promo' | 'product-demo' | 'talking-head' | 'commerce-batch' | 'explainer';
  objective: string;
  audience: string;
  language: 'bg' | 'en' | 'de' | 'fr' | 'es';
  duration_seconds: number;
  formats: Array<'9:16' | '16:9' | '1:1' | '4:5'>;
  engine: 'hyperframes' | 'remotion' | 'html-seekable' | 'motion-canvas';
  timing_authority: 'speech' | 'music' | 'code' | 'fixed';
  budgets: {
    agent_budget_usd: number;
    compute_budget_usd: number;
    media_budget_usd: number; // MUST be 0.0 for sovereign offline zero-spend compliance
    max_retries: number;
  };
}
```

### Constraints & Invariants
- `media_budget_usd` must strictly equal `0.0`. Any attempted paid API call throws `MEDIA_BUDGET_ZERO_VIOLATION`.
- `duration_seconds` must be between `1` and `3600`.
- At least one format must be specified in `formats`.

---

## 2. `BrandProfile`

Preserves visual identity rules across rendering pipelines.

```typescript
export interface BrandProfile {
  schema_version: '1.0.0';
  brand_id: string;
  name: string;
  colors: {
    primary: string; // Hex format #RRGGBB
    secondary: string;
    background: string;
    text: string;
    accent?: string;
  };
  fonts: Array<{
    family: string;
    source: 'google' | 'local' | 'system';
    weights: number[];
  }>;
  logos: {
    primary: string;
    icon?: string;
    monochrome?: string;
  };
  tone_of_voice: string[];
}
```

---

## 3. `ClaimsRegister`

Ensures every statement in video copy is substantiated by documented evidence.

```typescript
export interface ClaimItem {
  id: string; // e.g. "claim-speed-01"
  statement: string;
  statement_bg?: string; // Localized variant
  evidence: string; // URL, test report, or legal filing
  status: 'verified' | 'pending' | 'rejected';
}

export interface ClaimsRegister {
  schema_version: '1.0.0';
  project_id: string;
  claims: ClaimItem[];
}
```

### Invalidation Gate
When `claims.json` is modified after scene planning, the validation engine flags copy discrepancies as unresolved review items, preventing deliverable packaging until re-verified.

---

## 4. `ScenePlan`

The core timeline representation consumed by the rendering adapters.

```typescript
export interface SceneItem {
  id: string;
  name: string;
  duration_frames: number;
  layers: Array<{
    type: 'text' | 'image' | 'video' | 'shape';
    content: string;
    claim_id?: string;
    style?: Record<string, string | number>;
  }>;
}

export interface ScenePlan {
  schema_version: '1.0.0';
  project_id: string;
  fps: number; // 24, 25, 30, or 60
  width: number;
  height: number;
  scenes: SceneItem[];
}
```

---

## 5. `ReviewRecord`

Implements three-role governance for enterprise client handoff.

```typescript
export interface ReviewSignOff {
  role: 'creative' | 'legal' | 'technical';
  reviewer: string;
  status: 'approved' | 'rejected' | 'changes_requested';
  signed_at: string; // ISO 8601
  notes?: string;
}

export interface ReviewRecord {
  schema_version: '1.0.0';
  run_id: string;
  project_id: string;
  decision: 'approved' | 'rejected' | 'pending';
  sign_offs: ReviewSignOff[];
  checksum_manifest: string; // SHA-256 of SHA256SUMS.txt
}
```

---

## 6. Deterministic Request Hashing

Render determinism is enforced through deterministic request hashing:
1. Inputs (`brief.json`, `brand.json`, `claims.json`, `scene-plan.json`) are canonicalized (keys sorted, whitespace stripped).
2. A single SHA-256 digest is calculated over the canonical payload.
3. If an existing run with an identical request hash and matching output file exists, the render engine returns status `cached` without re-rendering.

---

## 7. Contract Migration Engine

When encountering legacy contracts lacking schema version `1.0.0`:
```bash
mgvideo migrate <projectDir>
```
The migration engine:
- Sets `schema_version = "1.0.0"`.
- Injects zero-spend media defaults (`media_budget_usd: 0.0`).
- Validates migrated structures against active Zod schemas.

