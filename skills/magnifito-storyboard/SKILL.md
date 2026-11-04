---
name: magnifito-storyboard
description: "Convert client brief and claims register into a timed, claims-linked scene plan with visual recipes."
---

# Magnifito Storyboard & Scene Planner

The `magnifito-storyboard` skill structures the narrative arc of the video, mapping client objectives and factual claims to concrete visual scenes and timing.

## Contract Specification: `scene-plan.json`

Every storyboard translates into `scene-plan.json` conforming to `ScenePlanSchema`:

- `plan_revision`: String identifier (e.g. `rev-1`).
- `renderer`: Target renderer (`hyperframes`, `html`, `remotion`, `motion`).
- `timing_authority`: Clock master (`speech`, `music`, `template`, `manual`).
- `scenes`: Array of scene objects:
  - `scene_id`: Unique identifier (e.g., `scene-01-hook`).
  - `factual_purpose`: High-level explanation of the scene's communication goal.
  - `duration_seconds` & `duration_frames`: Explicit timing.
  - `copy_text`: The exact text to appear on screen or be spoken.
  - `claims_refs`: Array of `claim_id` strings linking this scene to `claims.json`.
  - `asset_refs`: Array of `asset_id` strings from `assets.json`.
  - `visual_recipe`: Chosen style recipe (e.g., `kinetic-typography`, `product-reveal`, `retail-card`). With `renderer: "motion"` only the `motion-*` recipes are valid (see below).
  - `audio_events`: Keyframe-timed cues for voiceover, sound effects, or music.

## Planning for the Motion Engine

When `renderer` is `motion`, every scene uses one of the recipes in `styles/recipes/motion-*.json` (their `engines` field is `["motion"]`), and `copy_text` follows the recipe's convention, with `|` separating segments:

- `motion-kinetic-type` (2.5–6 s): one phrase, up to 24 words.
- `motion-card-morph` (3.4–7 s): `Headline | row | row | …`, up to 4 rows.
- `motion-bars-chart` (2.8–6 s): `Title | Label: value | …`, every value backed by a `claims_refs` entry.
- `motion-logo-reveal` (1.8–5 s): the tagline, with the logo in `asset_refs`. Put it last.

Each clip opens from and closes on the same centred dot, so plan scenes back to back without transition scenes. See `fixtures/motion-demo/scene-plan.json`.

## Narrative Discipline

1. **The 15-Second Launch Promo Formula**:
   - `0.0s - 4.0s`: Hook & Context (state audience problem or question).
   - `4.0s - 10.0s`: Core Factual Advantage (reveal product feature, linked to `claim-1`).
   - `10.0s - 15.0s`: Call to Action & Proof (link to `claim-2`, trial action URL).
2. **Claims Linkage**:
   - Every metric, discount, accreditation, or timeline in `copy_text` must explicitly cite a `claim_id`.
   - Modifying copy invalidates the scene plan and requires re-running validation.

References: `reference/motion-timing.md` (durations, stagger, reading holds, scene order) and `reference/script-and-shot-plan.md` (evidence-linked script and shot plan onto claims, brief and scene plan).

## Stopping Conditions

- Fail immediately if any `claims_refs` identifier is not found in `claims.json`.
- Fail if sum of scene durations does not equal `brief.duration_seconds`.

