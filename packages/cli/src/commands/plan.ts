import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ProjectBrief,
  BrandProfile,
  ClaimsRegister,
  ScenePlan,
  ScenePlanItem
} from '../../../contracts/src/index.js';
import { ProjectBriefSchema, BrandProfileSchema, ClaimsRegisterSchema } from '../../../contracts/src/index.js';
import { PolicyChecker } from '../../../media/src/policy.js';

export async function runPlan(projectDir: string): Promise<ScenePlan> {
  const briefPath = path.join(projectDir, 'brief.json');
  const brandPath = path.join(projectDir, 'brand.json');
  const claimsPath = path.join(projectDir, 'claims.json');

  const brief: ProjectBrief = ProjectBriefSchema.parse(JSON.parse(await fs.readFile(briefPath, 'utf-8')));
  const brand: BrandProfile = BrandProfileSchema.parse(JSON.parse(await fs.readFile(brandPath, 'utf-8')));
  const claims: ClaimsRegister = ClaimsRegisterSchema.parse(JSON.parse(await fs.readFile(claimsPath, 'utf-8')));

  // Formulate scenes linking approved claims
  const scenes: ScenePlanItem[] = [];

  if (brief.duration_seconds <= 15) {
    // 3-scene structure: Hook, Core Claim, Call to Action
    const claim1 = claims.claims[0];
    const claim2 = claims.claims[1] || claims.claims[0];

    scenes.push({
      scene_id: 'scene-01-hook',
      factual_purpose: 'Hook audience and establish brand problem-solving scope',
      duration_seconds: 4.0,
      duration_frames: 120,
      copy_text: brief.language === 'bg' ? 'Търсите истински практически резултати?' : 'Looking for proven practical results?',
      claims_refs: [],
      asset_refs: ['brand-logo'],
      visual_recipe: 'kinetic-typography',
      audio_events: [
        { type: 'music_cue', event_name: 'intro_beat', start_frame: 0, volume: 0.8 }
      ]
    });

    scenes.push({
      scene_id: 'scene-02-core-claim',
      factual_purpose: 'Deliver primary approved educational claim',
      duration_seconds: 6.0,
      duration_frames: 180,
      copy_text: claim1.approved_wording,
      claims_refs: [claim1.claim_id],
      asset_refs: [],
      visual_recipe: 'product-reveal',
      audio_events: [
        { type: 'voiceover', event_name: 'vo_claim_1', start_frame: 10, volume: 1.0 }
      ]
    });

    scenes.push({
      scene_id: 'scene-03-cta',
      factual_purpose: 'Deliver secondary claim and direct trial action',
      duration_seconds: 5.0,
      duration_frames: 150,
      copy_text: claim2.approved_wording,
      claims_refs: [claim2.claim_id],
      asset_refs: ['brand-logo'],
      visual_recipe: 'retail-card',
      audio_events: [
        { type: 'voiceover', event_name: 'vo_claim_2', start_frame: 10, volume: 1.0 },
        { type: 'sfx', event_name: 'cta_chime', start_frame: 40, volume: 0.9 }
      ]
    });
  } else {
    // Standard multi-scene plan
    const sceneDuration = brief.duration_seconds / (claims.claims.length + 1);
    scenes.push({
      scene_id: 'scene-intro',
      factual_purpose: 'Brand introduction',
      duration_seconds: sceneDuration,
      duration_frames: Math.round(sceneDuration * 30),
      copy_text: brand.name,
      claims_refs: [],
      asset_refs: ['brand-logo'],
      visual_recipe: 'kinetic-typography',
      audio_events: []
    });

    for (let i = 0; i < claims.claims.length; i++) {
      const c = claims.claims[i];
      scenes.push({
        scene_id: `scene-claim-${i + 1}`,
        factual_purpose: `Deliver factual claim ${c.claim_id}`,
        duration_seconds: sceneDuration,
        duration_frames: Math.round(sceneDuration * 30),
        copy_text: c.approved_wording,
        claims_refs: [c.claim_id],
        asset_refs: [],
        visual_recipe: 'product-reveal',
        audio_events: []
      });
    }
  }

  // Verify that all referenced claims exist
  const referencedClaims = scenes.flatMap(s => s.claims_refs);
  const violations = PolicyChecker.checkClaims(referencedClaims, claims, brief.language);
  if (violations.length > 0) {
    throw new Error(`Scene plan failed claims policy check: ${violations.map(v => v.message).join('; ')}`);
  }

  const scenePlan: ScenePlan = {
    schema_version: '1.0.0',
    plan_revision: 'rev-1',
    renderer: brief.engine,
    timing_authority: brief.timing_authority,
    scenes
  };

  const scenePlanPath = path.join(projectDir, 'scene-plan.json');
  await fs.writeFile(scenePlanPath, JSON.stringify(scenePlan, null, 2), 'utf-8');
  return scenePlan;
}
