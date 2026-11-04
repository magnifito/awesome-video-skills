# Evidence-linked script and shot plan

Method distilled from the `evidence-story-script`, `video-shot-planner` and `explainer-motion`
skills in `video-production-skills` (Video Production Skills contributors, MIT), vendored at
`vendor/vxi-motion-tools/2fae287134109449676d9afbfd38318985d75121/skills/video-production-skills/`.
Rewritten onto our contracts: `brief.json`, `claims.json`, `assets.json`, `scene-plan.json`.

## The rule

Every factual line in the film points at a `claim_id`. A number, price, discount, date,
accreditation, comparison or result in `copy_text` needs a `claims_refs` entry. Lines with no
fact in them (the hook question, a plain call to action verb) carry `claims_refs: []`.

What the toolkit enforces at `mgvideo render`:

- the claim exists (`CLAIM_NOT_FOUND`), its `locale` matches `brief.language` and it has not
  passed its `expiry`;
- the scene's `copy_text` contains the claim's `approved_wording` verbatim
  (`CLAIM_WORDING_MODIFIED`).

`mgvideo validate <run>` re-checks the claims against the run and flags any change to
`scene-plan.json` or `claims.json` made after rendering. A fact typed into `copy_text`
without a `claims_refs` entry is **not** caught: finding those is a manual check.

## 1. Start from one question

Write down the one question the viewer wants answered (for a promo: "why should I care, and
what do I do next?"). The first line and the first scene pose it; the last scene answers it.
Put the question in the first scene's `factual_purpose` and the answer in the last one's.
For a company or product, build around goal, obstacle, action, cost and result. A mechanism
explainer can start from the problem; do not invent a protagonist.

## 2. Build the claims register before the script

Sort every statement you might use into one of: established fact, attributed report,
speculation, the client's own analysis. Only established facts with an `evidence_source` and an
`owner` belong in `claims.json`. The class has no field of its own; you may note it in `tags`
(free strings the toolkit does not read).

| Upstream column | Our field |
|---|---|
| claim_id | `claims[].claim_id` |
| specific claim | `approved_wording` (exact on-screen text) |
| source, date, definition | `evidence_source` |
| who stands behind it | `owner` |
| still true until | `expiry` |
| language | `locale` |
| script location | the scenes whose `claims_refs` list it |

- **Qualifiers live in the wording.** Because the render requires the approved wording
  verbatim, "from", "up to", "in development", "reportedly" must be inside `approved_wording`,
  not added around it. Short cuts and titles keep them too.
- **Scope travels with the number.** "180 cases" becomes "180 self-built test cases" if that is
  what the source measured.
- **Missing evidence is a gap, not a guess.** Never supply a figure from memory. If a source is
  missing, leave the claim out and list the gap.

## 3. Write the script

- Each sentence adds one fact, action, constraint or explanation. Cut repeats, empty summaries
  and forced morals.
- Explain jargon through concrete things: products, money, time, people, places.
- No invented quotes, dialogue, reactions or motives. Correlation is not shown as cause.
- Keep the client's position; do not hide a counterpoint the viewer needs to judge the claim.
- Script length is an estimate until the voice is recorded. With `timing_authority: "speech"`,
  scene lengths follow the transcript's word times (`start_ms` / `end_ms`).
  `mgvideo words <captions>` estimates word times from SRT or VTT (about ±0.2 s, no speech
  recognition).

## 4. Turn sentences into scenes

One scene per idea, one attention target per scene. Name what the visual does in
`factual_purpose` as initial state, event, result ("empty calendar fills with booked slots").
A visual that only repeats the narration is a wasted scene.

| Visual purpose | Recipes to consider |
|---|---|
| Hook, key message | `kinetic-typography`, `motion-kinetic-type`, `cinematic-title` |
| Metric, scale | `broll-stat-callout`, `milestone-reveal`, `motion-bars-chart` |
| Comparison | `model-comparison`, `motion-bars-chart` |
| Mechanism, feature list | `motion-card-morph`, `isometric-feature-grid`, `saas-interface-tour` |
| Product as evidence | `product-reveal` |
| Offer | `retail-card` |
| Speaker, identity | `interview-speaker-card`, `broll-lower-third` |
| End card | `motion-logo-reveal`, `brand-title` |

Recipes with a `copy_format` (`mgvideo recipe <id>`) need their `|` fields filled. Scene timing
rules: `motion-timing.md`.

## 5. The shot plan, mapped onto `scene-plan.json`

| Shot-table column | Where it goes |
|---|---|
| shot_id | `scene_id` |
| global start / end | not stored: the running sum of earlier `duration_seconds` |
| voice-over / claim_id | `copy_text` + `claims_refs` |
| visual purpose, state change | `factual_purpose` + `visual_recipe` |
| source material | `asset_refs` (ids in `assets.json`, each with rights, consent and `status`) |
| sound event | `audio_events` (`voiceover`, `sfx` or `music_cue`, scene-local `start_frame`) |
| source in / out, speed | EDL cuts (`EditDecisionListSchema`) for talking-head edits (`source_start_us`, `speed_factor`) |
| gaps, alternatives | no field: keep a gap list in the hand-off notes |

## 6. Keep three clocks apart

- **Global**: position in the final film. Compute boundaries as absolute times, convert each to
  frames (`round(t × 30)`), then take differences for `duration_frames`. Summing rounded
  scene lengths drifts.
- **Scene-local**: `audio_events[].start_frame` counts from the scene's own frame 0 and must be
  below its `duration_frames`.
- **Source**: EDL cuts map source microseconds to output frames as half-open ranges
  `[output_start_frame, output_end_frame)`, ordered and non-overlapping.

## 7. Data and honesty checks (manual)

- Bars, counts and areas come from real values. `motion-bars-chart` scales every bar against the
  largest value, so all bars in one scene share one unit.
- A conclusion appears only after the change that proves it is readable on screen.
- Illustrative visuals (sample UI, example rows) must not look like client data. The toolkit has
  no "schematic" label, so avoid them or say so in the copy.
- Editing must not suggest people were together, reacted or spoke when they did not.
- The opening scene's assets must be available and cleared before the plan is approved.

## Deliverables

1. Script with each factual sentence tagged by `claim_id`.
2. `claims.json` revision the script was written against.
3. `scene-plan.json` whose durations sum to `brief.duration_seconds` (manual check; no
   `mgvideo` command compares them today).
4. Opening-to-payoff note: the question, the scene that poses it, the scene that answers it.
5. Gap list: missing evidence, missing assets, pending permissions, each with an alternative.
